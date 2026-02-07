# Operational Runbook

**Version**: 1.0  
**Created**: February 5, 2026  
**Audience**: On-call engineers, SREs

---

## Quick Reference: Common Issues

| Issue              | Symptom                                              | Diagnosis                      | Resolution                                              | RTO    |
| ------------------ | ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------- | ------ |
| **DO Crash**       | Users can't allocate, `durable_object_error` in logs | Check `wrangler tail`          | Auto-restart (30s), if persists > 5x delete instance    | 1 min  |
| **D1 Quota**       | `database quota exceeded` error                      | Run `wrangler d1 info`         | Run cleanup queries, delete old data                    | 5 min  |
| **Rate Limit Hit** | `429 Too Many Requests`                              | Check metrics, single IP?      | Is attacker (leave) or legitimate (adjust limits)       | 2 min  |
| **WebSocket Drop** | Users disconnected, "Connection lost"                | Check DevTools Network tab     | Auto-reconnect (should be transparent)                  | 30 sec |
| **Latency Spike**  | p99 latency > 1000ms                                 | Check `wrangler tail --filter` | Likely hitting DO throughput limit, check request count | 10 min |

---

## Issue: Durable Object Instance Crashes Repeatedly

### Symptoms

- Users see "Error allocating unit" in UI
- Logs contain `durable_object_error: <instance_id>`
- Allocation requests to specific SKU fail
- Other classes continue to work

### Diagnosis

**Step 1: Identify which DO crashed**

```bash
wrangler tail --follow | grep durable_object_error
# Example output:
# 2026-02-15 10:23:45 durable_object_error: InventoryDO [sku-001] TypeError: undefined is not an object
```

**Step 2: Check recent changes**

```bash
git log --oneline -5
# Did a recent commit touch InventoryDO.ts or DO logic?
```

**Step 3: Check storage state**

```bash
# Is the DO stuck with corrupted state?
wrangler d1 execute revenue-guard-db --remote --sql "SELECT * FROM inventory WHERE id = 'sku-001';"
```

### Root Causes

| Cause                                   | Likelihood | Evidence                                      |
| --------------------------------------- | ---------- | --------------------------------------------- |
| Memory leak in DO                       | Medium     | Logs show increasing memory usage, then crash |
| Infinite loop in event handler          | Low        | Logs show no activity for 10+ seconds         |
| Storage corruption                      | Low        | `this.ctx.storage.get()` returns invalid JSON |
| Broadcasting to closed WebSocket        | High       | Logs show `WebSocket is closed` errors        |
| Unhandled exception in allocation logic | Medium     | Stack trace in logs points to specific line   |

### Resolution

#### Path A: Auto-Restart (Most Common)

```bash
# Cloudflare auto-restarts DO after crash
# Just wait 30 seconds for instance to come back up

# Monitor:
wrangler tail --follow --filter "phone-16-pro" # Watch for recovery

# Test:
curl -X POST http://localhost:8787/api/allocate \
  -H "Content-Type: application/json" \
  -d '{
    "skuId": "sku-001",
    "userId": "test-user",
    "mode": "safe"
  }'
# Should return 200 if recovered
```

**Timing**: 30 seconds  
**Success Rate**: 95% (for transient issues)

#### Path B: Delete Instance (if persists > 5 crashes/day)

```bash
# Force delete all DO instances (resets state)
for sku in sku-001 sku-002 sku-003 sku-004 sku-005; do
  ID=$(wrangler d1 id-from-name $sku)
  # Note: wrangler d1 doesn't have id-from-name command
  # Instead, use curl to trigger deletion via API

  # Alternative: Just call DELETE /api/reset to clear state
  curl -X POST http://localhost:8787/api/reset
done
```

**Timing**: 5 minutes  
**Side Effect**: All allocations cleared (acceptable for demo)

#### Path C: Investigate Root Cause

```bash
# 1. Check if code has memory leak
grep -n "push\|append\|concat" src/durable/InventoryDO.ts
# Look for unbounded array growth

# 2. Check if WebSocket cleanup is happening
grep -A 5 "webSocketClose" src/durable/InventoryDO.ts
# Ensure closed connections are removed from this.sessions

# 3. Look at recent error in logs
wrangler tail --follow --filter "ERROR" | head -20

# 4. If found, fix code and redeploy
git diff src/durable/InventoryDO.ts
git add .
wrangler deploy
```

**Timing**: 15-30 minutes (depends on root cause)

### Prevention

**Monitoring Alerts** (Phase 3):

```
IF crash_count > 5 per day
THEN page SRE@company.com

IF crash_count > 20 per day
THEN page VP_Engineering@company.com
```

**Automated Checks**:

```bash
# In CI/CD pipeline, before deploy:
npm run test:do-stability # 1-minute stress test
# Should complete without crashes
```

---

## Issue: D1 Database Quota Exceeded

### Symptoms

- Allocation requests return: `{"error": "database quota exceeded"}`
- POST `/api/reset` fails with same error
- Allocations table is growing unbounded

### Diagnosis

**Step 1: Check current quota usage**

```bash
wrangler d1 info revenue-guard-db --remote
# Output:
# Database: revenue-guard-db
# Total Rows: 5,234
# Quota: 10,000,000 rows
# Usage: 0.05%
```

**If usage > 80%**: Alert and escalate

**Step 2: Identify what's consuming space**

```bash
# Count allocations by SKU
wrangler d1 execute revenue-guard-db --remote --sql "
  SELECT sku_id, COUNT(*) as count
  FROM allocations
  GROUP BY sku_id
  ORDER BY count DESC;
"

# Check how old allocations are
wrangler d1 execute revenue-guard-db --remote --sql "
  SELECT
    COUNT(*) as total_allocations,
    MIN(datetime(created_at, 'unixepoch')) as oldest_allocation,
    MAX(datetime(created_at, 'unixepoch')) as newest_allocation
  FROM allocations;
"
```

### Root Causes

| Cause                                       | Likelihood | Evidence                                   |
| ------------------------------------------- | ---------- | ------------------------------------------ |
| Demo running 24/7 without cleanup           | High       | Thousands of old allocations from days ago |
| No auto-reset after idle                    | Medium     | State never resets, allocations accumulate |
| Bug in allocation logic creating duplicates | Low        | Same user_id appears multiple times        |

### Resolution

#### Path A: Clean Old Data

```bash
# Delete allocations older than 24 hours
wrangler d1 execute revenue-guard-db --remote --sql "
  DELETE FROM allocations
  WHERE created_at < (unixepoch() - 86400);
"

# Verify deletion
wrangler d1 execute revenue-guard-db --remote --sql "SELECT COUNT(*) FROM allocations;"
```

**Timing**: 1 minute  
**Data Loss**: Acceptable (demo data is ephemeral)  
**Expected Result**: Usage should drop to < 50%

#### Path B: Compact Database

```bash
# Run VACUUM to reclaim space
wrangler d1 execute revenue-guard-db --remote --sql "VACUUM;"

# This may take 2-5 minutes
```

**Timing**: 5 minutes  
**Side Effect**: Temporary locks database  
**Expected Result**: Usage drops further

#### Path C: Reset Entire Demo

```bash
# Nuclear option: clear all state
wrangler d1 execute revenue-guard-db --remote --sql "
  DELETE FROM allocations;
  UPDATE inventory SET allocated_units = 0;
"

# Verify
wrangler d1 execute revenue-guard-db --remote --sql "SELECT COUNT(*) FROM allocations;"
# Should return 0
```

**Timing**: 1 minute  
**Data Loss**: All allocations deleted  
**Side Effect**: UI will show "0 allocated" in all SKUs

### Prevention

**Implement Cleanup Job** (Phase 2):

```typescript
// Run every 6 hours
export async function cleanupOldAllocations(env: Env) {
  const ONE_DAY_AGO = Date.now() - 86400 * 1000;

  await env.REVENUE_DB.prepare("DELETE FROM allocations WHERE created_at < ?")
    .bind(Math.floor(ONE_DAY_AGO / 1000))
    .run();

  // Log cleanup result
  console.log("Cleanup completed");
}
```

**Monitoring Alerts** (Phase 3):

```
IF quota_usage > 80%
THEN alert(Slack, '#incidents')

IF quota_usage > 95%
THEN page SRE immediately
```

---

## Issue: Rate Limiting Too Strict (Users Getting 429)

### Symptoms

- User repeatedly gets: `{"error": "Rate limit exceeded"}`
- Error happens on `/api/reset` (1 req/min limit)
- Legitimate user trying to reset for second time

### Diagnosis

**Step 1: Is this attacker or legitimate?**

```bash
# Check IP
curl -X GET http://localhost:8787/api/metrics \
  | jq '.recentIPs | sort_by(.requestCount) | reverse'

# If single IP with 100+ requests in 1 minute: likely attacker
# If scattered IPs with 5-10 requests total: likely legitimate demo
```

**Step 2: What's the actual rate of legitimate requests?**

```bash
# Get 1-minute window of requests
wrangler tail --follow --filter "rate_limit" | grep "429" | wc -l

# If < 5 per minute: rate limit is too strict
# If > 50 per minute: attacker is active
```

### Root Causes

| Cause                                | Likelihood | Response                             |
| ------------------------------------ | ---------- | ------------------------------------ |
| Attacker DoS                         | Medium     | Leave rate limit, rely on it working |
| Legitimate user clicking reset twice | Low        | Adjust rate limit threshold          |
| Load testing tool                    | Low        | Block IP, ask team to stop           |

### Resolution

#### Path A: If Attacker (Do Nothing)

```
Rate limiting is WORKING as intended.
Attacker hitting the 429 rate limit = good.
No action needed. Monitor and move on.
```

#### Path B: If Legitimate User Frustrated

```bash
# Check what their actual usage is
wrangler tail --follow --filter "192.168.1.50" \
  | head -100 \
  | wc -l
# If < 10 requests: they're light users

# Option 1: Explain the rate limit ("1 reset per minute to prevent abuse")
# Option 2: Whitelist their IP
# Option 3: Increase rate limit (see below)
```

**Whitelist IP** (temporary):

```typescript
const WHITELIST_IPS = ["192.168.1.50"];
const ip = request.headers.get("CF-Connecting-IP");
if (WHITELIST_IPS.includes(ip)) {
  return { allowed: true }; // Skip rate limiting
}
```

**Increase Rate Limit** (if needed):

```typescript
const RateLimits = {
  "/api/reset": { requests: 5, window: 60 }, // Changed from 1 to 5
};
```

### Prevention

**Document Rate Limits in UI**:

```
Show message when 429 received:
"You're making requests too quickly.
Please wait 60 seconds before trying again."
```

**Provide Safe Defaults**:

```
Don't auto-spam requests from frontend.
Add 1-second delay between user clicks.
```

---

## Issue: WebSocket Connections Dropping Unexpectedly

### Symptoms

- Users see: "Connection lost. Reconnecting..."
- WebSocket disconnect happens after ~5 minutes of inactivity
- Reconnection is automatic (user sees flicker, then recovers)

### Diagnosis

**Step 1: Is this expected behavior?**

```
DO Hibernation API automatically closes idle connections after ~5 minutes.
This is NORMAL and EXPECTED.
```

**Step 2: Is reconnection working?**

```bash
# Open browser DevTools → Network tab → WS filter
# Look for multiple ws:// connections opening/closing

# If see: ws:// connects, closes after 5 min, reconnects ✓ GOOD
# If see: ws:// connects, never closes, but user sees "Connection lost" ✗ BAD
```

**Step 3: Are there JavaScript errors?**

```bash
# Open browser console (F12 → Console)
# Look for red errors like:
# "WebSocket is closed: code 1000"
# "Failed to reconnect: Network error"

# No errors = client reconnect is working ✓
```

### Root Causes

| Cause                       | Likelihood | Evidence                                      |
| --------------------------- | ---------- | --------------------------------------------- |
| DO hibernation (expected)   | High       | WebSocket closes after 5 min, reconnects work |
| Network timeout (ISP issue) | Medium     | Multiple disconnects in quick succession      |
| Browser crash               | Low        | Connection closes, never reconnects           |
| Server-side broadcast error | Low        | Logs show `WebSocket.send()` failures         |

### Resolution

#### Path A: Expected Hibernation Behavior (No Action)

```
Revenue Guard uses DO Hibernation API for cost savings.
This is WORKING AS DESIGNED.

Users will see brief "reconnecting..." message every 5 minutes.
This is acceptable for a demo.

Monitoring shows this is expected:
  wrangler tail --filter "hibernation" | grep "reconnect"
```

#### Path B: Improve User Experience

Add visual indicator in UI:

```tsx
// src/components/WebSocketStatus.tsx
export function WebSocketStatus({ isConnected }) {
  return isConnected ? (
    <div className="text-green-500">● Connected</div>
  ) : (
    <div className="text-yellow-500">⟳ Reconnecting...</div>
  );
}
```

#### Path C: Real Network Issues (Rare)

```bash
# Check for network errors in logs
wrangler tail --filter "WebSocket" --filter "error"

# If you see:
# "WebSocketPair creation failed"
# "ctx.acceptWebSocket() returned error"
# Then there's a server-side issue
```

**If server-side issue**:

1. Check DO logs for crashes
2. Check D1 for quota exceeded (slows everything down)
3. Restart DO instance
4. Escalate to engineering

### Prevention

**Document in UI**:

```
"Demo shows real-time updates via WebSocket.
Connections may reconnect periodically (normal behavior)."
```

**Auto-Reconnect with Backoff**:

```typescript
// Already implemented in frontend:
const reconnect = async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      ws = new WebSocket(wsUrl);
      return; // Success
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await sleep(delay);
    }
  }
  // After 5 attempts, show error to user
  showError("Failed to connect. Please refresh the page.");
};
```

---

## Issue: Latency Spike (p99 > 1000ms)

### Symptoms

## Issue: Latency Spike (p99 > 1000ms)

### Symptoms

- Allocation takes 5+ seconds to complete

- Users see spinning loader for prolonged time
- Performance is inconsistent (sometimes fast, sometimes slow)

### Diagnosis

**Step 1: Check metrics**

```bash
curl http://localhost:8787/metrics

# Response:
{
  "requestCount": 1250,
  "errorRate": 0.2,
  "p50Latency": 150,
  "p95Latency": 450,
  "p99Latency": 2100  # <-- HIGH!
}
```

**Step 2: Check request volume**

```bash
wrangler tail --follow | grep "latency_ms:" | tail -20

# If see:
# latency_ms: 200
# latency_ms: 180
# latency_ms: 5400  # <-- SPIKE!
# latency_ms: 190

# Then spikes are intermittent, not sustained
```

**Step 3: Which endpoint is slow?**

```bash
wrangler tail --follow | grep "latency_ms" | grep "POST /api/allocate"

# If mostly /api/allocate is slow: allocation logic bottleneck
# If mostly /api/simulate-rush: concurrent request handling
# If all endpoints slow: infrastructure issue
```

### Root Causes

| Cause                               | Likelihood | Evidence                                    | Fix Time                  |
| ----------------------------------- | ---------- | ------------------------------------------- | ------------------------- |
| DO hitting 1000 req/s limit         | High       | All requests to same SKU slow down          | 5 min (shard)             |
| D1 query slow (no index)            | Medium     | Only SELECT queries slow, INSERTs fast      | 10 min (add index)        |
| Network latency (ISP)               | Low        | All requests slow equally                   | N/A (not your problem)    |
| Memory leak in DO                   | Medium     | Latency increases over time                 | 20 min (fix + redeploy)   |
| High volume of WebSocket broadcasts | Low        | Latency spikes when many connections active | 10 min (batch broadcasts) |

### Resolution

#### Path A: DO Throughput Bottleneck

```
Check if hitting limit: 1000 concurrent requests per DO instance
Current config: 5 DO instances × 1000 req/s = 5000 req/s total

If > 5000 req/s:
  → Shard DO instances differently
  → Or cache popular queries in KV
```

#### Path B: D1 Query Slow

```bash
# Add index to speed up lookups
wrangler d1 execute revenue-guard-db --remote --sql "
  CREATE INDEX idx_allocations_sku_id ON allocations(sku_id);
  CREATE INDEX idx_inventory_id ON inventory(id);
"

# Test query latency after index:
time wrangler d1 execute revenue-guard-db --remote --sql "
  SELECT COUNT(*) FROM allocations WHERE sku_id = 'sku-001';
"
```

#### Path C: Memory Leak in DO

```bash
# Check DO memory usage over time
wrangler tail --follow --filter "DO memory" | head -50

# If memory increasing: likely leak
# Solution: Restart DO

curl -X POST http://localhost:8787/api/reset

# Monitor memory after restart
wrangler tail --follow --filter "DO memory"
```

**If memory still increasing**:

1. Check if WebSocket connections growing unbounded
2. Check if broadcast array growing
3. Fix: Remove closed WebSocket from `this.sessions` array

```typescript
webSocketClose(ws: WebSocket) {
  this.sessions = this.sessions.filter(s => s !== ws); // Remove from array
}
```

#### Path D: Batch WebSocket Broadcasts

```typescript
// Instead of broadcasting on every allocation:
broadcast(msg: any) {
  // Send after 100ms delay (batch multiple updates)
  setTimeout(() => {
    this.sessions.forEach(ws => ws.send(JSON.stringify(msg)));
  }, 100);
}
```

### Prevention

**Set SLO Targets** (Phase 2):

```
P50 Latency: < 200ms
P95 Latency: < 500ms
P99 Latency: < 1000ms

If p99 > 1000ms for 5 minutes → alert SRE
```

**Load Testing Before Launch** (Phase 3):

```bash
# Test with 100 concurrent users
npm run test:load

# Verify p99 < 1000ms
```

---

## Escalation & Communication

### On-Call Escalation Path

```
Symptom detected
  ↓
1. Check runbook (above)
  ↓
2. If manual fix works → Document fix
  ↓
3. If manual fix fails → Page SRE
  ↓
4. If SRE can't fix → Page VP Engineering
  ↓
5. If critical data loss → Page CEO (only if data loss confirmed)
```

### Slack Channel for Incidents

```
#incidents          → Alert for any issue
#incidents-postmortem → After incident is resolved
```

### Status Page Communication

If demo is unavailable for > 30 minutes:

```
1. Update internal status page: "Revenue Guard demo is down, ETA 1 hour"
2. Notify sales team: "Demo unavailable, use recorded video instead"
3. After resolution: Post summary of root cause and fix
```

---

## Post-Incident Checklist

After any incident > 5 minutes downtime:

- [ ] **Root cause identified**: Document in Slack
- [ ] **Fix applied and verified**: Confirm demo is working
- [ ] **Bug filed**: `wrangler-revenue-guard/issues/new` with root cause
- [ ] **Monitoring added**: Alert configured to catch this issue next time
- [ ] **Runbook updated**: Add to this document if new issue type
- [ ] **Team notification**: Email engineering list with summary

**Example**:

```
INCIDENT SUMMARY
================

Date: 2026-02-15, 10:23-10:28 UTC
Duration: 5 minutes
Impact: Demo unavailable

Root Cause:
  - Durable Object for sku-001 crashed due to memory leak in broadcast loop
  - WebSocket handlers not removing closed connections

Resolution:
  - Manually deleted DO instance via CF dashboard
  - Deployed fix to remove WebSocket from sessions array on close

Prevention:
  - Added monitoring alert: "DO memory > 500MB → page SRE"
  - Added test: "Verify WebSocket cleanup on 1000 connections"
  - Updated runbook: Section "Issue: DO Memory Leak"

Action Items:
  - [ ] Deploy memory monitoring to production (due Feb 17)
  - [ ] Load test with 10k concurrent WebSocket connections (due Feb 20)
```

---

## Useful Commands

```bash
# Watch logs in real-time
wrangler tail --follow

# Filter logs by endpoint
wrangler tail --follow --filter "POST /api/allocate"

# Filter by error level
wrangler tail --follow --filter "ERROR"

# Execute D1 query
wrangler d1 execute revenue-guard-db --remote --sql "SELECT * FROM allocations LIMIT 10;"

# Check metrics
curl http://localhost:8787/metrics | jq

# Restart Worker
wrangler deploy

# View DO instance info (limited)
# Note: Cloudflare doesn't expose DO internals directly
# Use logs and metrics instead
```

---

**Last Updated**: February 5, 2026  
**Next Review**: After first incident or Phase 2 launch (Week 3)
