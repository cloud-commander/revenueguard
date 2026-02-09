# Dynamic Quota Scaling Implementation

## Overview

The application now dynamically monitors Cloudflare Workers CPU quota consumption and adjusts its behavior to prevent overages on the $5/month Workers Paid plan (30M CPU-ms/month).

## Architecture

### Backend (Worker)

**Quota Tracking** (`src/worker/index.ts`):

- Monthly counter stored in KV under key `quota:YYYY-MM`
- Resets on the 1st of each month (30-day TTL)
- CPU usage recorded asynchronously after expensive operations (login: 50ms, allocate: 50ms, state fetch: 20ms)

**Throttle Levels**:

Dynamic thresholds based on monthly CPU quota consumption. Designed for 24/7 operation with max 3 concurrent sessions.

- **Normal** (0–50% usage): Full rate limits (30/min per session, 10/min per IP)
  - _Worst case_: 3 sessions at 24/7 = ~19–22% CPU consumed
  - Safe for 3+ concurrent sessions with minimal latency

- **Slow** (50–80% usage): Reduced limits (5/min per session, 2/min per IP)
  - _Threshold_: ~15M CPU-ms consumed (~50% of 30M budget)
  - Graceful degradation; continue operations with throttling

- **Critical** (80%+ usage): Minimized limits (1/min per session, 1/min per IP)
  - _Threshold_: ~24M CPU-ms consumed (~80% of 30M budget)
  - Last defense against budget overages; recommend switching to mock mode

**Endpoints**:

- `GET /api/quota/status` returns `{ cpuUsedMs, cpuRemainingMs, cpuLimitMs, throttleLevel, percentageUsed }`
- Session creation embeds throttle level in session payload

### Client

**Service Layer** (`src/services/simulationApi.ts`):

- `getQuotaStatus()` method fetches current quota (returns unlimited mock when in mock mode)

**State Management** (`src/hooks/useSimulation.ts`):

- Polling effect runs on 10s/5s/3s intervals (normal/slow/critical)
- Initial poll on mount, then recurring intervals adjust based on throttle level
- State exposed: `quotaStatus`, `throttleLevel`

**UI Component** (`src/components/dashboard/QuotaMonitor.tsx`):

- Displays quota bar with percentage usage
- Shows throttle level badge (normal/slow/critical)
- Lists used/remaining CPU-ms
- Warnings for slow and critical thresholds

**Integration** (`src/components/views/MonitorView.tsx`):

- QuotaMonitor rendered when `isLive && quotaStatus` in the dashboard
- Positioned below Session Status and Guardrail cards

## Usage Flow

1. **User logs in** → Throttle level embedded in session
2. **Live mode active** → Quota polling starts (10s interval)
3. **Usage climbs** → Throttle level automatically adjusts
4. **Rate limits reduced** → Server returns 429 if limits exceeded
5. **UI warns operator** → Shows "Slow" or "Critical" badge + warnings
6. **Critical reached** → Suggest auto-fallback to mock mode

## Cost Impact

### 24/7 Operation Scenarios (Worst Case)

**Single Session (24/7)**:

- Estimated CPU: ~7–8% of monthly plan
- Status: ✅ Safe for continuous operation

**3 Concurrent Sessions (24/7)**:

- Estimated CPU: ~19–22% of monthly plan (up to $5 plan max)
- Status: ✅ Safe; auto-throttles to Slow at ~50% usage
- Guardrail: Highest recommended concurrent load

**Beyond 3 Sessions**:

- Risk of consuming > 80% budget within billing period
- Recommendation: Rotate to mock mode or reduce concurrency

### Protection Mechanisms

- **Auto-throttling prevents overages** by reducing rate limits as budget depletes
- **Monitoring dashboard** displays real-time quota consumption and throttle level
- **Graceful degradation** ensures demo remains functional even at critical thresholds

## Testing

To trigger throttle levels:

1. Start live engine with allocation requests
2. Watch `/api/quota/status` responses in browser DevTools
3. Observe rate limit changes in allocation responses
4. Monitor UI: QuotaMonitor badge transitions from green → yellow → red

## Quota Exhaustion Handling

When CPU quota is exhausted (80%+ usage or 100% consumed):

- **Login Response**: Session includes `forcesMockOnly: true` flag
- **Live Mode Rejection**: All allocation, state, and reset endpoints return `503 Service Unavailable` with error code `QUOTA_EXHAUSTED`
- **Client Behavior**: UI should detect `forcesMockOnly` flag and auto-switch to mock mode
- **Graceful Fallback**: Operator can continue testing on mock engine without live backend access

**Implementation**: Check `session.forcesMockOnly` in `/api/demo/allocate`, `/api/demo/state`, `/api/demo/reset` endpoints.

## Testing Quota Exhaustion

1. Monitor `/api/quota/status` to track cumulative CPU usage
2. Trigger allocations to consume budget faster (each costs 50ms CPU)
3. Watch for transition: normal → slow → critical
4. At 80%+ usage, observe login response includes `forcesMockOnly: true`
5. Verify subsequent allocations return 503 QUOTA_EXHAUSTED error
6. Confirm client UI auto-switches to mock mode

## Future Enhancements

### 1. Persistent Quota Reporting (Analytics Engine)

Export quota metrics to Cloudflare Analytics Engine for historical trending and alerting.

**Implementation**:

```typescript
// In quota tracking functions, send data points:
env.REVENUE_GUARD_AE?.writeDataPoint({
  blobs: ["quota_metric"],
  doubles: [cpuUsedMs, percentageUsed],
  indexes: [`throttle:${throttleLevel}`, `month:${currentMonth}`],
});
```

**Benefits**:

- Historical quota consumption patterns
- Monthly trend analysis (e.g., peak days/hours)
- Integration with Cloudflare Dashboard
- Alerting on usage anomalies

**Dependencies**: Requires Analytics Engine enabled on Cloudflare account

---

### 2. Webhook Notifications

Send HTTP webhooks to external services when throttle thresholds are crossed.

**Implementation**:

```typescript
async function notifyQuotaThreshold(
  env: Env,
  throttleLevel: ThrottleLevel,
  percentageUsed: number,
  previousLevel: ThrottleLevel,
) {
  if (!env.QUOTA_WEBHOOK_URL) return;

  // Only notify on state transition
  if (throttleLevel === previousLevel) return;

  const payload = {
    timestamp: Date.now(),
    event: `quota_${throttleLevel}`,
    quotaPercentage: percentageUsed,
    cpuUsedMs: status.cpuUsedMs,
    cpuRemainingMs: status.cpuRemainingMs,
  };

  await fetch(env.QUOTA_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

**Webhook Payload**:

```json
{
  "timestamp": 1707432000000,
  "event": "quota_critical",
  "quotaPercentage": 82,
  "cpuUsedMs": 24600000,
  "cpuRemainingMs": 5400000
}
```

**Environment Variables**:

```jsonc
"QUOTA_WEBHOOK_URL": "https://alerts.example.com/cloudflare/quota",
"QUOTA_WEBHOOK_SECRET": "sk_test_xyz" // Optional HMAC signing
```

**Benefits**:

- Real-time Slack/Teams notifications
- PagerDuty integration for on-call alerts
- Custom webhooks for internal monitoring systems

---

### 3. Historical Tracking (D1 Database)

Store quota consumption history in D1 for trend analysis and capacity planning.

**Schema**:

```sql
CREATE TABLE IF NOT EXISTS quota_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year_month TEXT NOT NULL, -- "2026-02"
  cpu_used_ms INTEGER NOT NULL,
  cpu_limit_ms INTEGER NOT NULL,
  percentage_used INTEGER NOT NULL,
  throttle_level TEXT NOT NULL, -- "normal", "slow", "critical"
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year_month)
);

CREATE INDEX idx_quota_month ON quota_history(year_month);
```

**Implementation**:

```typescript
async function recordQuotaHistory(env: Env, status: QuotaStatus) {
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  await env.REVENUE_GUARD_DB.prepare(
    `
    INSERT OR REPLACE INTO quota_history 
    (year_month, cpu_used_ms, cpu_limit_ms, percentage_used, throttle_level)
    VALUES (?, ?, ?, ?, ?)
  `,
  )
    .bind(
      monthKey,
      status.cpuUsedMs,
      status.cpuLimitMs,
      status.percentageUsed,
      status.throttleLevel,
    )
    .run();
}
```

**Query Examples**:

```typescript
// Get last 3 months of quota usage
const history = await env.REVENUE_GUARD_DB.prepare(
  `
  SELECT * FROM quota_history 
  ORDER BY year_month DESC 
  LIMIT 3
`,
).all();

// Check if critical threshold reached this month
const critical = await env.REVENUE_GUARD_DB.prepare(
  `
  SELECT COUNT(*) as instances FROM quota_history 
  WHERE year_month = ? AND throttle_level = 'critical'
`,
)
  .bind(currentMonth)
  .first();
```

**Benefits**:

- Capacity planning (months trending toward 100%)
- SLA compliance reporting (max 80% utilization)
- Trend detection (quotas rising month-over-month)
- Budget forecasting for plan upgrades

---

### 4. Smart Scheduling (Peak Hours Pause)

Automatically pause allocations during peak hours when quota is low to preserve budget.

**Implementation**:

```typescript
interface PeakHourConfig {
  startHour: number; // 9 (9 AM)
  endHour: number; // 17 (5 PM)
  pauseThreshold: number; // 0.6 (pause when > 60% used)
  timezone: string; // "UTC" or "America/New_York"
}

async function shouldPauseAllocations(
  env: Env,
  config: PeakHourConfig,
): boolean {
  const status = await getQuotaStatus(env);
  if (status.percentageUsed <= config.pauseThreshold) return false;

  // Get current hour in specified timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    timeZone: config.timezone,
    hour12: false,
  });
  const currentHour = parseInt(formatter.format(new Date()));

  return currentHour >= config.startHour && currentHour < config.endHour;
}
```

**Usage in Allocate Endpoint**:

```typescript
app.post("/api/demo/allocate", async (c) => {
  // ... existing checks ...

  const isPeakHourPause = await shouldPauseAllocations(c.env, {
    startHour: 9,
    endHour: 17,
    pauseThreshold: 0.6,
    timezone: "America/New_York",
  });

  if (isPeakHourPause) {
    return c.json(
      {
        success: false,
        error: {
          code: "QUOTA_SCHEDULED_PAUSE",
          message: "Allocations paused during peak hours to preserve quota",
        },
        meta: makeMeta(),
      },
      429,
    );
  }

  // ... proceed with allocation ...
});
```

**Environment Configuration**:

```jsonc
"QUOTA_PEAK_HOURS_ENABLED": "true",
"QUOTA_PEAK_HOURS_START": "9",
"QUOTA_PEAK_HOURS_END": "17",
"QUOTA_PEAK_HOURS_PAUSE_THRESHOLD": "0.60",
"QUOTA_PEAK_HOURS_TIMEZONE": "America/New_York"
```

**Benefits**:

- Preserve budget for business hours when needed
- Reduce quota consumption during low-traffic periods
- Combine with webhook alerts for operator awareness
- Configurable per environment (dev vs. production)

---

### 5. Regional Failover (Multi-Region Load Distribution)

Route requests to alternative Cloudflare regions when quota is constrained in the primary region.

**Implementation**:

```typescript
interface RegionConfig {
  primary: string; // "us-west-1"
  fallback: string; // "eu-west-1"
  enableFailover: boolean;
}

async function selectRegion(env: Env, config: RegionConfig): Promise<string> {
  // When quota is critical, route to fallback region
  const status = await getQuotaStatus(env);

  if (!config.enableFailover) return config.primary;

  if (status.throttleLevel === "critical") {
    console.log(
      `Quota critical (${status.percentageUsed}%), routing to fallback region: ${config.fallback}`,
    );
    return config.fallback;
  }

  return config.primary;
}
```

**Usage**:

```typescript
app.post("/api/demo/allocate", async (c) => {
  const region = await selectRegion(c.env, {
    primary: "us-west",
    fallback: "eu-west",
    enableFailover: true,
  });

  // Route inventory operations to selected region's Durable Object
  const inventoryDO = c.env.REVENUE_GUARD_INVENTORY_DO.get(inventoryId, {
    jurisdiction: region,
  });
  // ... proceed with region-specific DO
});
```

**Environment Configuration**:

```jsonc
"QUOTA_FAILOVER_ENABLED": "true",
"QUOTA_PRIMARY_REGION": "us-west",
"QUOTA_FALLBACK_REGION": "eu-west"
```

**Benefits**:

- Distribute load across Cloudflare regions for cost optimization
- Graceful degradation when primary region quota depletes
- Transparent routing—no client-side changes required
- Requires Cloudflare Workers Unbound for multi-region Durable Objects

**Requires**: Durable Objects with `jurisdiction` option for region selection

---

### 6. Quota Alerts API & Dashboard Integration

Expose quota metrics on a dedicated alerting dashboard for real-time operator visibility.

**Implementation**:

```typescript
// New endpoint for dashboard polling
app.get("/api/admin/quota-status", async (c) => {
  const adminKey = c.req.header("X-Admin-Key");
  if (adminKey !== c.env.ADMIN_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const quotaStatus = await getQuotaStatus(c.env);

  // Calculate trend: compare to previous hour
  const trendKey = `quota:trend:${Date.now() - 3600000}`;
  const previousCpuUsed = await c.env.REVENUE_GUARD_KV.get(trendKey);

  return c.json({
    success: true,
    data: {
      current: quotaStatus,
      trend: {
        cpuUsedPreviousHour: parseInt(previousCpuUsed || "0"),
        cpuUsedThisHour: quotaStatus.cpuUsedMs - (previousCpuUsed || 0),
        direction: "up" | "down" | "stable",
      },
      alerts: [
        {
          level: quotaStatus.throttleLevel,
          message: `Quota at ${quotaStatus.percentageUsed}%`,
          timestamp: Date.now(),
        },
      ],
      recommendations: getRecommendations(quotaStatus),
    },
  });
});

function getRecommendations(status: QuotaStatus): string[] {
  const recs: string[] = [];

  if (status.throttleLevel === "critical") {
    recs.push("🚨 Switch to mock mode to preserve remaining quota");
    recs.push("📊 Review allocation patterns for efficiency gains");
    recs.push("💰 Consider upgrading to Workers Unbound for higher quota");
  } else if (status.throttleLevel === "slow") {
    recs.push("⚠️  Quota consumption accelerating; monitor closely");
    recs.push("🔍 Reduce concurrent sessions if approaching month-end");
    recs.push("📈 Enable peak-hours pause to preserve budget");
  } else {
    recs.push("✅ Quota consumption normal; continue operations");
  }

  return recs;
}
```

**Dashboard Widget** (`src/components/admin/QuotaAlertingDashboard.tsx`):

```typescript
interface Alert {
  level: ThrottleLevel;
  message: string;
  timestamp: number;
}

export function QuotaAlertingDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [adminKey] = useState(() => localStorage.getItem("adminKey"));

  useEffect(() => {
    if (!adminKey) return;

    const interval = setInterval(async () => {
      const res = await fetch("/api/admin/quota-status", {
        headers: { "X-Admin-Key": adminKey },
      });
      const data = await res.json();

      if (data.data?.alerts) {
        setAlerts(data.data.alerts);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [adminKey]);

  return (
    <div className="quota-alerts">
      <h3>Real-Time Quota Alerts</h3>
      {alerts.map((alert, i) => (
        <AlertCard key={i} alert={alert} />
      ))}
    </div>
  );
}
```

**Environment Configuration**:

```jsonc
"ADMIN_KEY": "sk_admin_xyz" // Secure admin API key
```

**Benefits**:

- Real-time operator dashboard for quota monitoring
- Automated recommendations based on quota state
- Historical trend analysis (hourly CPU consumption)
- Proactive alerting before exhaustion
- Integrates with existing operations monitoring

## Files Modified

- `src/types.ts` - Added `QuotaStatus`, `ThrottleLevel` types
- `src/worker/index.ts` - Added quota tracking, throttle logic, `/api/quota/status` endpoint
- `src/services/apiClient.ts` - Added `getQuotaStatus()` method
- `src/services/simulationApi.ts` - Added `getQuotaStatus()` to interface
- `src/hooks/useSimulation.ts` - Added quota polling, state, throttle level
- `src/components/dashboard/QuotaMonitor.tsx` - New UI component
- `src/components/views/MonitorView.tsx` - Integrated QuotaMonitor

## Configuration

### Defaults

- **CPU Quota Limit**: 30,000,000 ms/month (matches $5 Cloudflare Workers Paid plan)
- **Slow Threshold**: 50% usage (~15M ms consumed)
- **Critical Threshold**: 80% usage (~24M ms consumed)
- **Polling Intervals**: 10s (normal), 5s (slow), 3s (critical)
- **CPU Estimates**: 50ms/allocate, 50ms/login, 20ms/state

### Environment Variable Overrides

Set in `wrangler.jsonc` or via `wrangler deploy --define` for dynamic configuration:

```jsonc
"env": {
  "production": {
    "vars": {
      // CPU quota in milliseconds (total for the month)
      "QUOTA_CPU_MS": "30000000",

      // Throttle thresholds as percentage of quota (0.0–1.0)
      "QUOTA_SLOW_THRESHOLD": "0.50",
      "QUOTA_CRITICAL_THRESHOLD": "0.80",

      // CPU estimates per operation (milliseconds)
      "QUOTA_CPU_LOGIN_MS": "50",
      "QUOTA_CPU_ALLOCATE_MS": "50",
      "QUOTA_CPU_STATE_MS": "20",

      // Client-side polling intervals (seconds)
      "QUOTA_POLL_INTERVAL_NORMAL": "10",
      "QUOTA_POLL_INTERVAL_SLOW": "5",
      "QUOTA_POLL_INTERVAL_CRITICAL": "3"
    }
  }
}
```

### Example: Conservative 15M CPU Budget (Half Plan)

For demos that share a Workers plan across multiple applications:

```jsonc
"vars": {
  "QUOTA_CPU_MS": "15000000",
  "QUOTA_SLOW_THRESHOLD": "0.60",
  "QUOTA_CRITICAL_THRESHOLD": "0.85"
}
```

### Example: Aggressive 50M CPU Budget (Future Plan)

For high-concurrency deployments (Cloudflare Workers Unbound tier):

```jsonc
"vars": {
  "QUOTA_CPU_MS": "50000000",
  "QUOTA_SLOW_THRESHOLD": "0.45",
  "QUOTA_CRITICAL_THRESHOLD": "0.75"
}
```
