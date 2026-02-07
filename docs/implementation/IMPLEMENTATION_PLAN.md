# Revenue Guard: Phased Implementation Plan

**Version**: 1.0  
**Date**: February 5, 2026  
**Target Launch**: February 28, 2026 (4 weeks)

**Status Snapshot (2026-02-06)**:

- Completed: UI mock, guardrail messaging, spec envelope in client + mock API, apiClient live/mock toggle.
- Pending: Live Worker (auth/login, auth/me, demo/allocate/reset), KV sessions, Durable Object, WAF/rate limits, UI wiring to live + Turnstile, observability.

---

## Executive Summary

This plan prioritizes **UI/UX validation with mock data BEFORE building the backend**, reducing the risk of discovering UX issues after infrastructure is deployed. It addresses all critical gaps from the architecture review.

**Near-term remediation (while in mock UI phase):**

- Add a mock/live toggle (default mock) with clear labeling; disable live until backend ready.
- Gate operator controls behind Access (planned) and add client idle auto-stop (done) plus placeholder server kill-switch copy.
- Stub API client for live DO+D1 slice; add guardrail banners (0.1% hard-locked, alert/auto-stop) and demo-script notes to trip alert once.
- Document observability plan: metrics/logs for latency, success, oversell, billed counter, alert/stop events; Logpush/Analytics Engine target.

**Phasing**:

- **Phase 0 (Week 1)**: UI mockups + Interactive frontend + ROI/Loss Prevention Tickers
- **Phase 1 (Week 2)**: Backend core + rate limiting + D1/DO logic
- **Phase 2 (Week 3)**: Observability Transparency (Debugger View) + Logging + Alerting
- **Phase 3 (Week 4)**: Security hardening, testing, launch

---

## Phase 0: UI Validation & Mock Frontend (Week 1)

### Objective

Validate the educational UI works with realistic data flows **before writing backend code**.

### Deliverables

#### 0.1 Frontend Scaffold + Component Library

**Owner**: Frontend  
**Timeline**: Mon-Tue

- [x] Initialize Vite + React + TypeScript
- [x] Install shadcn/ui, Tailwind, Framer Motion
- [x] Create component library:
  - `<InventoryGrid>` — 24 SKUs, live unit counter
  - `<AllocationPanel>` — safe/unsafe mode selector
  - `<SimulationControls>` — trigger 125 concurrent requests
  - `<ResultsDisplay>` — safe (100 allocated) vs eventual (125 allocated) comparison
  - `<HelpCard>` — expandable tooltips, educational content
  - `<WebSocketIndicator>` — connection status
  - `<LatencyChart>` — p50/p95/p99 visualization
- [x] Apply "Neon Velocity" design system (neon borders, glitch effects)

#### 0.2 Mock API Service

**Owner**: Frontend  
**Timeline**: Wed

Create `src/services/mockApi.ts` that returns **hardcoded responses** for all endpoints:

```typescript
// Mock responses simulate both paths
export const mockApi = {
  // Safe path: always returns exactly 100 allocated
  allocateSafe: async (skuId: string, userId: string) => {
    await delay(Math.random() * 200 + 100); // Simulate latency
    return {
      success: true,
      availableUnits: Math.max(0, 100 - mockState[skuId].allocated),
      totalAllocated: mockState[skuId].allocated,
    };
  },

  // Eventual Consistency path: allows overallocation
  allocateEventual: async (skuId: string, userId: string) => {
    await delay(Math.random() * 300 + 200); // Intentional slower
    mockState[skuId].overallocated++;
    return {
      success: mockState[skuId].overallocated <= 125,
      availableUnits: Math.max(0, 100 - mockState[skuId].overallocated),
      totalAllocated: mockState[skuId].overallocated,
    };
  },

  // Simulation: spawn 125 concurrent requests
  startFlashSale: async (mode: "safe" | "eventual", count: number) => {
    return Promise.allSettled(
      Array.from({ length: count }, (_, i) =>
        mode === "safe"
          ? mockApi.allocateSafe("sku-001", `user-${i}`)
          : mockApi.allocateEventual("sku-001", `user-${i}`),
      ),
    );
  },

  reset: async () => {
    mockState = initMockState();
  },
};
```

#### 0.3 Interactive Walkthrough

**Owner**: Frontend  
**Timeline**: Thu-Fri

Build **6-step guided demo** with mock data:

1. **Intro** — Explain the problem (race conditions)
2. **Safe Mode** — Run simulation, show exactly 100 allocated ✓
3. **Eventual Consistency Mode** — Run simulation, show 125 allocated (overflow)
4. **Metrics** — Display latency, request timeline
5. **Code Comparison** — Show side-by-side DO vs SQL logic
6. **ROI Realism** — Dynamic ticker showing "Potential Loss Prevented" ($) based on avoiding oversell refunds.

**Success Criteria**:

- Walkthrough completes without developer intervention
- All UI states render correctly (loading, success, error)
- Tooltips are visible and readable
- Animation performance is smooth (60 FPS)
- Mobile responsive (test on 320px viewport)

#### 0.4 Accessibility Audit

**Owner**: Frontend/QA  
**Timeline**: Fri

- [ ] **Keyboard Navigation**: Tab through all interactive elements, Enter/Space to trigger
- [ ] **Color Contrast**: WCAG AAA (7:1 ratio minimum) — use axe DevTools
- [ ] **Screen Reader**: Test with VoiceOver (Mac) or NVDA (Windows)
- [ ] **Reduced Motion**: Verify `prefers-reduced-motion` disables animations
- [ ] **Focus Indicators**: 4px neon outline visible on all focusable elements

**Deliverable**: Accessibility report + fixes applied

---

## Phase 1: Backend Core Infrastructure (Week 2)

### Objective

Build the backend with rate limiting, D1, and Durable Objects. **Frontend stays on mock API during week 2, switches to real API in week 3.**

### Deliverables

#### 1.1 Worker Setup + Rate Limiting (CRITICAL FIX #1)

**Owner**: Backend  
**Timeline**: Mon-Tue

**Security Requirement**: Implement Turnstile token validation to prevent bot attacks.

**Rate Limiting Rules** (implement in Worker middleware check):

```typescript
// src/middleware/rateLimit.ts
const RateLimits = {
  "/api/allocate": { requests: 200, window: 60 }, // 200/min per IP
  "/api/reset": { requests: 1, window: 60 }, // 1/min per IP (CRITICAL)
  "/api/simulate-rush": { requests: 10, window: 60 }, // 10/min
  "/api/state": { requests: 1000, window: 60 }, // 1000/min (allow polling)
};

export async function rateLimitMiddleware(
  request: Request,
  key: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const endpoint = new URL(request.url).pathname;
  const limit = RateLimits[endpoint];

  if (!limit) return { allowed: true }; // No limit defined

  const rateLimitKey = `${ip}:${endpoint}`;
  const current = await KV.get(rateLimitKey); // Requires KV binding
  const count = current ? parseInt(current) + 1 : 1;

  if (count > limit.requests) {
    return { allowed: false, retryAfter: limit.window };
  }

  await KV.put(rateLimitKey, count.toString(), { expirationTtl: limit.window });
  return { allowed: true };
}
```

**Deliverable**: Rate limiting middleware tested locally with `wrangler dev`

#### 1.2 D1 Database + Schema (CRITICAL FIX #5: Database Safety)

**Owner**: Database  
**Timeline**: Tue-Wed

**Setup**:

```bash
wrangler d1 create revenue-guard-db
# Copy database_id to wrangler.jsonc
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql
```

**Migration: `migrations/0001_create_schema.sql`** (add UNIQUE constraint):

```sql
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  allocated_units INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sku_id) REFERENCES inventory(id),
  UNIQUE(sku_id, user_id) -- PREVENT DUPLICATES (important for safe mode)
);

INSERT OR IGNORE INTO inventory (id, total_stock) VALUES
  ('sku-001', 100),
  ('sku-002', 100),
  ('sku-003', 100),
  ('sku-004', 100),
  ('sku-005', 100);
```

**Deliverable**: D1 accessible via `wrangler d1 execute revenue-guard-db --local`

#### 1.3 Durable Objects Implementation

**Owner**: Backend  
**Timeline**: Wed-Thu

**File: `src/durable/InventoryDO.ts`**

```typescript
export class InventoryDO {
  state: {
    id: string;
    totalStock: number;
    allocations: Set<string>;
    lastActivity: number;
  };
  ctx: DurableObjectState;
  sessions: WebSocket[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.state = {
      id: ctx.id.name || "unknown",
      totalStock: 100,
      allocations: new Set(),
      lastActivity: Date.now(),
    };
  }

  async fetch(request: Request): Promise<Response> {
    // Initialize from storage
    if (this.state.allocations.size === 0) {
      const stored = await this.ctx.storage.get("state");
      if (stored) {
        this.state.allocations = new Set(stored.allocations);
      }
    }

    const url = new URL(request.url);

    if (request.method === "POST") {
      const { userId } = await request.json();
      return this.handleAllocation(userId);
    }

    if (request.method === "DELETE") {
      return this.handleReset();
    }

    if (url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }

    return new Response("Not found", { status: 404 });
  }

  async handleAllocation(userId: string): Promise<Response> {
    this.state.lastActivity = Date.now();

    // Atomic check (implicit via single-threaded DO)
    if (this.state.allocations.size >= this.state.totalStock) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "OUT_OF_STOCK",
          availableUnits: 0,
        }),
        { status: 409 },
      );
    }

    if (this.state.allocations.has(userId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "ALREADY_ALLOCATED",
          availableUnits: this.state.totalStock - this.state.allocations.size,
        }),
        { status: 409 },
      );
    }

    // Update in-memory state
    this.state.allocations.add(userId);

    // Persist to storage
    try {
      await this.ctx.storage.put("state", {
        id: this.state.id,
        allocations: Array.from(this.state.allocations),
      });
    } catch (err) {
      this.state.allocations.delete(userId); // Rollback
      throw err;
    }

    // Broadcast to WebSockets
    this.broadcast({
      type: "UPDATE",
      skuId: this.state.id,
      allocatedUnits: this.state.allocations.size,
      availableUnits: this.state.totalStock - this.state.allocations.size,
    });

    return new Response(
      JSON.stringify({
        success: true,
        availableUnits: this.state.totalStock - this.state.allocations.size,
        allocatedUnits: this.state.allocations.size,
      }),
    );
  }

  async handleReset(): Promise<Response> {
    this.state.allocations.clear();
    await this.ctx.storage.delete("state");
    this.broadcast({ type: "RESET", skuId: this.state.id });
    return new Response(JSON.stringify({ success: true }));
  }

  handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.sessions.push(server);

    // Send current state
    server.send(
      JSON.stringify({
        type: "UPDATE",
        skuId: this.state.id,
        allocatedUnits: this.state.allocations.size,
        availableUnits: this.state.totalStock - this.state.allocations.size,
      }),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws: WebSocket): void {
    this.sessions = this.sessions.filter((s) => s !== ws);
  }

  broadcast(msg: any): void {
    const json = JSON.stringify(msg);
    this.sessions.forEach((ws) => {
      try {
        ws.send(json);
      } catch (err) {
        console.error("WebSocket send failed:", err);
      }
    });
  }
}
```

**Deliverable**: DO routes work locally, state persists across requests

#### 1.5 High-Scale Architecture (Sharding)

**Owner**: Backend
**Timeline**: Fri (Prototype)

- [ ] Implement `getShardId(skuId)` logic (1 SKU -> 10 DO shards).
- [ ] Update Worker router to map SKU -> Shard ID.
- [ ] Goal: Prove architecture scales linearly to >10,000 RPS.

#### 1.6 Worker Router + Endpoints

**Owner**: Backend  
**Timeline**: Thu

**File: `src/index.ts`**

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Rate limiting middleware (CRITICAL)
    const rateCheck = await rateLimitMiddleware(request, env);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Retry-After": rateCheck.retryAfter?.toString() || "60" },
      });
    }

    // Routes
    if (url.pathname === "/api/allocate") {
      return handleAllocation(request, env);
    }
    if (url.pathname === "/api/reset") {
      return handleReset(request, env);
    }
    if (url.pathname === "/api/simulate-rush") {
      return handleFlashSale(request, env);
    }
    if (url.pathname === "/api/state") {
      return handleState(request, env);
    }
    if (url.pathname === "/api/ws") {
      return handleWebSocket(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleAllocation(request: Request, env: Env): Promise<Response> {
  const { skuId, userId, mode } = await request.json();

  if (mode === "safe") {
    // Route to Durable Object
    const id = env.INVENTORY.idFromName(skuId);
    const stub = env.INVENTORY.get(id);
    return stub.fetch(
      new Request("https://fake/allocation", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    );
  } else {
    // Eventual Consistency path (D1 with intentional race)
    return handleEventualConsistencyAllocation(env, skuId, userId);
  }
}

async function handleEventualConsistencyAllocation(
  env: Env,
  skuId: string,
  userId: string,
): Promise<Response> {
  const RACE_DELAY = parseInt(env.RACE_DELAY_MS || "200");

  // Step 1: Read
  const { results } = await env.REVENUE_DB.prepare(
    "SELECT allocated_units FROM inventory WHERE id = ?",
  )
    .bind(skuId)
    .all();

  if (results.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "INVALID_SKU" }),
      { status: 400 },
    );
  }

  // Step 2: Delay (forces race window)
  await new Promise((resolve) => setTimeout(resolve, RACE_DELAY));

  // Step 3: Check (but don't enforce atomically)
  if (results[0].allocated_units >= 100) {
    return new Response(
      JSON.stringify({ success: false, error: "OUT_OF_STOCK" }),
      {
        status: 409,
      },
    );
  }

  // Step 4: Write (vulnerable to race)
  try {
    await env.REVENUE_DB.batch([
      env.REVENUE_DB.prepare(
        "UPDATE inventory SET allocated_units = allocated_units + 1 WHERE id = ?",
      ).bind(skuId),
      env.REVENUE_DB.prepare(
        "INSERT INTO allocations (sku_id, user_id) VALUES (?, ?)",
      ).bind(skuId, userId),
    ]);
  } catch (err) {
    // Duplicate allocation attempt (due to no UNIQUE constraint on unsafe path)
    return new Response(
      JSON.stringify({ success: false, error: "DUPLICATE" }),
      { status: 409 },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      availableUnits: Math.max(0, 100 - (results[0].allocated_units + 1)),
    }),
  );
}

async function handleReset(request: Request, env: Env): Promise<Response> {
  // D1 reset
  await env.REVENUE_DB.batch([
    env.REVENUE_DB.prepare("UPDATE inventory SET allocated_units = 0"),
    env.REVENUE_DB.prepare("DELETE FROM allocations"),
  ]);

  // DO reset (delete all instances)
  for (const skuId of ["sku-001", "sku-002", "sku-003", "sku-004", "sku-005"]) {
    const id = env.INVENTORY.idFromName(skuId);
    const stub = env.INVENTORY.get(id);
    await stub.fetch(new Request("https://fake/reset", { method: "DELETE" }));
  }

  return new Response(JSON.stringify({ success: true }));
}

async function handleFlashSale(request: Request, env: Env): Promise<Response> {
  const { skuId, mode, count } = await request.json();
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) =>
      handleAllocation(
        new Request("https://fake", {
          method: "POST",
          body: JSON.stringify({
            skuId,
            userId: `sim-${Date.now()}-${i}`,
            mode,
          }),
        }),
        env,
      ),
    ),
  );

  return new Response(
    JSON.stringify({
      results: results.map((r) =>
        r.status === "fulfilled" ? "success" : "failed",
      ),
    }),
  );
}
```

**Deliverable**: All endpoints functional, tested with `wrangler dev`

#### 1.5 Type Safety + Testing

**Owner**: Backend  
**Timeline**: Fri

- [ ] TypeScript strict mode enabled
- [ ] Unit tests for rateLimit middleware
- [ ] Unit tests for rateLimit middleware
- [ ] Unit tests for allocation logic (safe vs eventual paths)
- [ ] Integration test: spawn 125 concurrent requests, verify safe=100 vs eventual=125+
- [ ] Run `wrangler dev` and manually test all endpoints

**Success Criteria**:

- All unit tests pass
- TypeScript with zero `any` types
- Local integration test shows expected race condition

---

## Phase 2: Advanced Reliability & Protection (Week 3)

### Objective

Build production-grade reliability patterns (Sharding, Hibernation) and security guardrails (Turnstile, Zero-Cost logic). Enable real backend connection with session isolation.

### Deliverables

#### 2.1 Structured Logging (CRITICAL FIX #4: Monitoring Strategy)

**Owner**: Backend  
**Timeline**: Mon-Tue

**File: `src/utils/logger.ts`**

```typescript
export interface LogEntry {
  timestamp: string;
  requestId: string;
  level: "INFO" | "WARN" | "ERROR";
  component: string;
  message: string;
  metadata?: Record<string, any>;
}

// Ensure "Revenue Protected" metric is calculable from logs
// Log over-allocation events with { "loss_prevented": 50 } metadata

export async function log(env: Env, entry: LogEntry): Promise<void> {
  const json = JSON.stringify(entry);

  // Console output (visible in wrangler tail)
  console.log(json);

  // Optional: Send to external logging service (Cloudflare Logpush, Datadog, etc.)
  // For now, just console logs are sufficient
}

// Usage in Worker:
const requestId = crypto.randomUUID();
await log(env, {
  timestamp: new Date().toISOString(),
  requestId,
  level: "INFO",
  component: "InventoryDO",
  message: "Allocation confirmed",
  metadata: {
    skuId: "sku-001",
    userId: "user-123",
    allocatedUnits: 15,
    availableUnits: 85,
  },
});
```

**Deliverable**: All endpoints emit structured logs visible in `wrangler tail`

#### 2.2 Observability Transparency (Debugger View)

**Owner**: Frontend/Backend  
**Timeline**: Tue-Wed

- [ ] Add a **Telemetry/Debugger Tab** to the cockpit.
- [ ] Show real-time DO state transitions (e.g., `Set(userId) -> Persist -> Broadcast`).
- [ ] Implement a "Log Stream" component that mimics `wrangler tail` for simulated requests.
- [ ] Add "Infrastructure Health" badges (Durable Object uptime, D1 partition status).

#### 2.3 Metrics & ROI Analytics

**Owner**: Backend  
**Timeline**: Wed

**Create: `docs/MONITORING.md`**

````markdown
## Alert Thresholds

| Metric                | Threshold         | Action                    |
| --------------------- | ----------------- | ------------------------- |
| Error Rate            | > 1% for 2 min    | Page SRE immediately      |
| Error Rate            | > 5% for 1 min    | Page SRE + VP Engineering |
| D1 Quota Usage        | > 80%             | Slack #incidents          |
| DO Instance Restarts  | > 5/day           | Slack #incidents          |
| WebSocket Disconnects | > 10% of sessions | Slack #incidents          |
| Latency p99           | > 1000ms          | Slack #incidents          |

## Manual Monitoring

```bash
# Watch logs in real-time
wrangler tail --follow

# Check metrics
curl http://localhost:8787/metrics
```
````

````

**Deliverable**: Monitoring documentation created

#### 2.4 Frontend: Switch to Real API
**Owner**: Frontend
**Timeline**: Thu-Fri

- [ ] Update `src/services/api.ts` to use real endpoints (remove mock)
- [ ] Update `src/config.ts` to use real API base URL
- [ ] Test all endpoints with real backend
- [ ] Add error handling for failed requests
- [ ] Update Accessibility audit if needed

**Success Criteria**:
- Frontend connects to `wrangler dev` Worker
- Safe mode shows exactly 100 allocated
- Eventual Consistency mode shows 125+ allocated
- WebSocket real-time updates work

#### 2.5 Cost Controls (CRITICAL FIX #8: Runaway Costs)
**Owner**: Backend/Frontend
**Timeline**: Wed-Thu

- [ ] Apply billing scale-down to ~0.01% of simulated requests counted as billable; remainder stays mock/non-billing.
- [ ] Enforce operator-only alert at ~5% of included Workers budget and auto-stop at ~10% to prevent bill shock.
- [ ] Add optional idle/auto-stop timer for unattended demos.
- [ ] Surface banners/tooltips indicating when thresholds are tripped; ensure restart requires acknowledgement.
- [ ] Enable live DO+D1 path for at least one SKU; cap live traffic to 0.01% billed and clearly label "live" vs "simulated" in the UI.
- [ ] Stub mock/live toggle in UI (default mock) and disable live until backend endpoint is ready.
- [ ] Prepare Worker-side guardrail logic (0.1% scale, alert/auto-stop, rate limits) and metrics/logging schema even if endpoint is not yet deployed.

**Success Criteria**:
- 0.01% billed fraction active by default and hard-locked (not operator-adjustable).
- Alert and auto-stop trip at configured thresholds in simulation; logs capture threshold events.
- Live DO+D1 path exercised for one SKU, with live traffic limited to the 0.01% billed slice and clearly labeled versus simulated traffic in the UI.
- Mock/live toggle present; live remains disabled until backend is deployed; observability schema defined for alert/stop and cost counters.

---

## Phase 3: Security & Hardening (Week 4)

### Objective
Formalize security, create operational runbooks, complete testing.

### Deliverables

#### 3.1 Threat Model Matrix (CRITICAL FIX #2)
**Owner**: Security
**Timeline**: Mon

**Create: `docs/SECURITY.md`**

```markdown
# Security & Threat Modeling

## Threat Model Matrix

| Threat ID | Threat | Attack Vector | Probability | Impact | Severity | Mitigation | Status |
|-----------|--------|----------------|-------------|--------|----------|-----------|--------|
| **T1** | DoS via reset spam | Call `/api/reset` 1000x/sec | Medium | High | 🔴 CRITICAL | Rate-limit: 1/min per IP | ✅ Implemented |
| **T2** | Duplicate allocations | Forge userID | Low | Medium | 🟠 HIGH | UUID validation + dedup in DO | ✅ Implemented |
| **T3** | WebSocket hijacking | MITM intercepts upgrade | Low | Medium | 🟠 HIGH | WSS enforcement (HTTPS only) | ✅ Protected |
| **T4** | API enumeration | Brute-force classIDs | Medium | Low | 🟡 MEDIUM | No mitigation (open demo) | ⚠️ Acceptable |
| **T5** | SQL injection | `"; DROP TABLE;--"` | Very Low | Critical | 🔴 CRITICAL | Parameterized queries | ✅ Protected |
| **T6** | Race condition in DO | Concurrent storage.put | Very Low | Critical | 🔴 CRITICAL | DO serialization prevents | ✅ Protected |

## Encryption Strategy

**HTTPS/TLS**: ✅ All traffic encrypted (TLS 1.3 via Cloudflare)
**Storage at Rest**: ✅ DO storage encrypted with CF default key
**Database**: ✅ D1 encrypted at rest
**API Keys**: N/A (no external APIs), future: use CF Secrets

## Compliance

**Current Demo**:
- No PII collected (UUIDs only)
- No GDPR/CCPA requirements

**If Productized**:
- Add user authentication
- Implement audit logging
- Document data retention policy
- Annual security audit
````

**Deliverable**: Formal threat model matrix document

#### 3.2 Operational Runbook (CRITICAL FIX #3)

**Owner**: Operations  
**Timeline**: Tue

**Create: `docs/RUNBOOK.md`**

````markdown
# Operational Runbook

## Issue: Durable Object Instance Crashes

**Symptom**: Users can't allocate, logs show "durable_object_error"

**Diagnosis**:

1. Check recent logs: `wrangler tail --follow`
2. Identify crashed DO instance ID
3. Check CF dashboard for DO status

**Resolution**:

1. Auto-restart by CF (30s, automatic)
2. If persists >5 times: Manually delete instance
   ```bash
   # Delete all DO instances
   for sku in sku-001 sku-002 sku-003 sku-004 sku-005; do
     ID=$(wrangler d1 id-from-name $sku)
     wrangler do delete $ID --force
   done
   ```
````

3. Reset state: `POST /api/reset`

**Escalation**: Page SRE if >5 crashes/day

## Issue: D1 Quota Exceeded

**Symptom**: Error "database quota exceeded"

**Diagnosis**:

```bash
wrangler d1 info revenue-guard-db
# Check operations used vs limit
```

**Resolution**:

1. Cleanup old data: `wrangler d1 execute --remote --file=cleanup.sql`
2. Compact database: `VACUUM;`
3. Upgrade plan if persistent

**Prevention**: Monitor quota hourly, alert at 80%

## Issue: Rate Limiting Too Strict

**Symptom**: Users getting 429 Too Many Requests

**Diagnosis**:

1. Check metrics: `GET /metrics`
2. Review rate limit config in Worker

**Resolution**:

1. Check if attacker scenario (single IP doing thousands of requests)
2. If legitimate: adjust rate limit thresholds in Worker code
3. If attacker: rely on Cloudflare's DDoS protection

## Issue: WebSocket Connections Dropping

**Symptom**: Users see "Connection lost" message

**Diagnosis**:

1. Check DevTools Network tab for connection errors
2. Check browser console for JavaScript errors
3. Check server logs for WebSocket errors

**Resolution**:

1. Client auto-reconnects (should be transparent)
2. If persists: Clear browser cache, hard refresh (Ctrl+Shift+R)
3. Check for network timeouts (might be ISP issue)

## Issue: Performance Degradation

**Symptom**: Latency p99 > 1000ms

**Diagnosis**:

```bash
wrangler tail --follow | grep latency
curl http://localhost:8787/metrics
```

**Resolution**:

1. Check if hitting DO throughput limit (1000 req/s per instance)
2. Check if D1 query times are high
3. Check frontend for slow JavaScript

**Escalation**: Review architecture bottlenecks

````

**Deliverable**: Operational runbook created

#### 3.3 Security Review & Sign-Off
**Owner**: Security
**Timeline**: Wed

- [ ] Internal security team reviews threat model
- [ ] Verify rate limiting is effective (manual test: spam requests)
- [ ] Verify SQL injection protection (test with malicious payloads)
- [ ] Verify WebSocket uses WSS (not WS)
- [ ] Security sign-off document created

**Deliverable**: Security sign-off email from security lead

#### 3.4 Load Testing (CRITICAL FIX #7: Validate performance)
**Owner**: QA
**Timeline**: Thu

**Test Plan: `tests/load.test.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('Concurrent 125 requests - Safe Mode', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.selectOption('[data-testid=mode-select]', 'safe');

  const startTime = Date.now();
  await page.click('[data-testid=simulate-button]');

  await page.waitForSelector('[data-testid=results-display]');
  const endTime = Date.now();

  const results = await page.locator('[data-testid=safe-result]').textContent();
  expect(results).toContain('100'); // Exactly 100 allocated

  const latency = endTime - startTime;
  expect(latency).toBeLessThan(5000); // Complete within 5 seconds
});

test('Concurrent 25 requests - Unsafe Mode', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.selectOption('[data-testid=mode-select]', 'unsafe');

  await page.click('[data-testid=simulate-button]');
  await page.waitForSelector('[data-testid=results-display]');

  const results = await page.locator('[data-testid=unsafe-result]').textContent();
  expect(results).toContain('125'); // 125+ allocated (overflow)
});
````

**Load test with 100 concurrent users**:

```bash
# Use Artillery or k6 for load testing
npm install -g artillery

# Create artillery-load.yml
cat > artillery-load.yml << EOF
config:
  target: 'http://localhost:8787'
  phases:
    - duration: 60
      arrivalRate: 10
      name: 'Ramp up'

scenarios:
  - name: 'Booking Flow'
    flow:
      - post:
          url: '/api/allocate'
          json:
            skuId: 'sku-001'
            userId: '{{ $randomString(8) }}'
            mode: 'safe'
      - think: 5
EOF

artillery run artillery-load.yml
```

**Deliverable**: Load test report showing p50/p95/p99 latencies

#### 3.5 UAT & Launch Readiness (CRITICAL FIX #10: Launch checklist)

**Owner**: Product  
**Timeline**: Fri

**Pre-Launch Checklist**:

- [ ] **Code**: All tests passing, TypeScript strict mode
- [ ] **Frontend**: Accessibility audit complete, mobile responsive
- [ ] **Backend**: All endpoints functional, rate limiting active
- [ ] **Security**: Threat model reviewed, security sign-off obtained
- [ ] **Operations**: Runbook created, monitoring alerts configured
- [ ] **Performance**: Load test shows p99 < 1s
- [ ] **Documentation**: All docs updated (README, API spec, runbook)
- [ ] **Deployment**: CI/CD pipeline tested (dry-run to production)

**Deliverable**: Go/No-Go decision document

---

## Risk Mitigation by Phase

| Critical Gap                | Phase Addressed | Mitigation                                                              |
| --------------------------- | --------------- | ----------------------------------------------------------------------- |
| No rate limiting (DoS)      | 1.1             | Implement rate limits in Worker middleware                              |
| No security formalization   | 3.1             | Threat model matrix created                                             |
| No operational runbook      | 3.2             | Runbook document created with incident procedures                       |
| No monitoring/alerting      | 2.1-2.3         | Structured logging + metrics + alert thresholds                         |
| Architectural bottleneck    | 1.1-1.4         | Document DO throughput limits (1000 req/s per instance)                 |
| DB migration safety unclear | 1.2             | UNIQUE constraints added, migration versioning documented               |
| No load testing             | 3.4             | Load test validates performance at 100 concurrent users                 |
| Missing dependencies        | Throughout      | Cross-team coordination throughout (Frontend → Backend → Observability) |

---

## Timeline Summary

```
WEEK 1 (Feb 5-9): UI Validation
├─ Mon-Tue: Frontend scaffold + components
├─ Wed: Mock API service
├─ Thu-Fri: Interactive walkthrough + A11y audit
└─ GATE: UI walkthrough approved by product

WEEK 2 (Feb 12-16): Backend Core
├─ Mon-Tue: Rate limiting middleware
├─ Tue-Wed: D1 setup + migrations
├─ Wed-Thu: Durable Objects implementation
├─ Thu: Worker router + endpoints
├─ Fri: Integration testing
└─ GATE: All backend endpoints functional

WEEK 3 (Feb 19-23): Observability
├─ Mon-Tue: Structured logging
├─ Tue-Wed: Metrics collection
├─ Wed: Alerting rules documentation
├─ Thu-Fri: Frontend → real API switch + testing
└─ GATE: Real backend connected, monitoring active

WEEK 4 (Feb 26-28): Security & Launch
├─ Mon: Threat model formalization
├─ Tue: Operational runbook
├─ Wed: Security review + sign-off
├─ Thu: Load testing
├─ Fri: UAT + launch readiness
└─ GATE: Go-live approval
```

---

## Success Criteria by Phase

### Phase 0 ✅

- [ ] UI renders without developer intervention
- [ ] All interactive elements respond to keyboard + mouse
- [ ] Accessibility audit passes (WCAG 2.1 AA)
- [ ] Mobile responsive (tested on 320px)

### Phase 1 ✅

- [ ] Worker deploys successfully locally
- [ ] Rate limiting rejects requests over limit (429 status)
- [ ] Safe mode: exactly 100 allocated in all tests
- [ ] Unsafe mode: 125+ allocated in all tests
- [ ] D1 schema matches spec
- [ ] DO state persists across requests

### Phase 2 ✅

- [ ] Structured logs appear in `wrangler tail`
- [ ] GET `/metrics` endpoint returns valid JSON
- [ ] Frontend connects to real API (no 404 errors)
- [ ] WebSocket real-time updates work (test with browser DevTools)
- [ ] Cost controls active: 0.01% billed fraction enabled by default; alert at ~5% and auto-stop at ~10% of included Workers budget validated in simulation

### Phase 3 ✅

- [ ] Threat model covers all 6 threat vectors
- [ ] Runbook has procedures for all 5 common issues
- [ ] Security team signs off on threat mitigations
- [ ] Load test shows p99 latency < 1s at 100 concurrent users
- [ ] Pre-launch checklist 100% complete

---

## Dependencies & Blockers

| Dependency                                    | Owner    | Timeline       | Blocker? |
| --------------------------------------------- | -------- | -------------- | -------- |
| Cloudflare account + API token                | DevOps   | Before Phase 1 | YES      |
| D1 database creation                          | DevOps   | Week 2 start   | YES      |
| Security team review                          | Security | Phase 3        | YES      |
| Product sign-off on UI                        | Product  | Phase 0 end    | YES      |
| Frontend/Backend communication (API contract) | Both     | Phase 1 start  | YES      |

---

## Rollback Plan

**If Phase 0 shows UI issues**:

- Iterate on mockup (no backend work lost)
- Max delay: 3 days

**If Phase 1 shows backend problems**:

- Revert Worker code: `git revert <commit>`
- Redeploy: `wrangler deploy` (5 min)
- Max downtime: 10 minutes

**If Phase 3 shows security issues**:

- Not launch until resolved
- Estimated fix: 1-2 days

---

**Created**: February 5, 2026  
**Next Review**: Phase 0 complete (end of Week 1)  
**Approval**: [Product Lead signature required]
