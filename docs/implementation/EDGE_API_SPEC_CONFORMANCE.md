# EDGE_API_SPEC.md Conformance Implementation

**Status**: ✅ Live Worker + Client aligned
**Date**: 2026-02-09  
**Scope**: Production Worker on cfdemo.link

---

## 1. Conformance Summary

The Worker now enforces the spec for Turnstile auth, rate limits, session validation, guardrail telemetry, and ApiResponse envelopes. All protected endpoints return `meta` on success and failure, the rate limits are enforced via KV counters, and Analytics Engine emits `guardrailTriggered` events whenever the virtual budget window is exceeded.

### Changes Made

#### 1.1 Response Envelope (types.ts)

- ✅ Added `ApiResponse<T>` standard type with:
  - `success`: boolean (root quick-branch)
  - `data`: T (payload on success)
  - `error`: { code: string; message: string } (on failure)
  - `meta`: { requestId: string; timestamp: number }
- ✅ Refactored `AllocationResponse` to use `ApiResponse<AllocationPayload>`
- ✅ Added `SessionPayload` and `SessionResponse` types
- ✅ Added `AuthMode` enum (turnstile | demo)

#### 1.2 Mock API Updates (services/mockApi.ts)

- ✅ Updated `allocateSafe()` to return spec-compliant responses
- ✅ Updated `allocateEventual()` to return spec-compliant responses
- ✅ Added `createSession()` method for session creation (20-min TTL per spec)
- ✅ Added `validateSession()` method for session validation
- ✅ Updated `verifyToken()` to return `SessionResponse` (not boolean)
- ✅ Added `generateRequestId()` helper (per spec meta.requestId)
- ✅ Added `createResponse()` helper for envelope wrapping
- ✅ Extended `MockState` to track sessions with expirationTtl

#### 1.3 API Client Layer (services/apiClient.ts)

- ✅ `ApiClient` class with Authorization header support, session persistence, and fallback for mock/live toggles
- ✅ Mock mode uses spec envelope while live mode negotiates directly with the Worker
- ✅ Live `/auth/login`, `/api/auth/me`, `/api/demo/allocate`, `/api/demo/state`, and `/api/demo/reset` are implemented; the client stores each session independently

#### 1.4 Live Worker Endpoint Coverage

- ✅ `/api/auth/login` (Turnstile + KV session)
- ✅ `/api/auth/me` (session validation + rate limiting)
- ✅ `/api/demo/state` (inventory snapshot from D1)
- ✅ `/api/demo/allocate` (DO-backed atomic allocation, guardrail enforcement)
- ✅ `/api/demo/reset` (session + inventory reset, rate limited)
- ✅ `/api/ws` proxies to `InventoryGuard` for session-level WebSocket streams

---

## 2. Endpoint Hierarchy (CONFORMANCE)

### 2.1 Authentication Endpoints

```
POST /api/auth/login
  Request: { turnstileToken: string }
  Response: ApiResponse<SessionPayload>
  Rate Limit: 10/min per IP (WAF managed challenge on breach)
  On Success: Client stores sessionId (Bearer token for future requests)

GET /api/auth/me
  Request: Authorization: Bearer <sessionId>
  Response: ApiResponse<SessionPayload>
  Rate Limit: 60/min per session
  Purpose: Validate session, get expiration
```

### 2.2 Inventory Snapshot Endpoint

```
GET /api/demo/state
  Request: Authorization: Bearer <sessionId>
  Response: ApiResponse<D1InventoryRow[]>
  Rate Limit: 30/min per session
  Purpose: Fetch the session-specific inventory snapshot stored in D1 so the UI can build the table harmonized with the Durable Object.
```

_(Note: There are no `/api/data/inventory` endpoints in the Worker today; `/api/demo/state` is the canonical inventory fetch.)_

### 2.3 Demo/Allocation Endpoints

```
POST /api/demo/allocate
  Request: { skuId: string; units: number; mode: "safe" | "eventual" }
  Headers: Authorization: Bearer <sessionId>
  Response: ApiResponse<AllocationPayload>
  Rate Limit:
    - /min per IP: 10 (KV counter)
    - /min per session: 30 (session key)
  Guardrails:
    - `DEMO_COST_LIMIT` env stops any session whose real costs exceed the threshold (default 1.0 for demo, 0.0 in production)
    - `virtualCosts` window hard-coded to 100 units per session; exceeding it flags `guardrailTriggered` and logs `VIRTUAL_GUARDRAIL_TRIGGERED` via Analytics Engine (meta includes timestamp + `virtualCosts`)
  Cost Tracking: the DO + KV records `costs` and `virtualCosts` per session; the API responds with `meta.guardrailTriggered` when the virtual window is breached

POST /api/demo/reset
  Request: (empty body)
  Headers: Authorization: Bearer <sessionId>
  Response: ApiResponse<{ success: boolean }>
  Rate Limit: 1/min per IP
  Purpose: Reset inventory state (operator use only)
```

### 2.4 WebSocket Endpoints (Real-time)

```
WS GET /api/ws?sessionId=<sessionId>
  Upgrade: websocket + sessionId query required
  Connection: Worker proxies to `InventoryGuard` Durable Object keyed by the session ID so each participant gets the session-specific stream
  Messages: DO broadcasts allocation deltas (`type: "UPDATE"`) with SKU and allocation metadata
  Close Codes: None are enforced yet; missing or expired session returns HTTP 400 before the upgrade
```

---

## 3. Session Management (EDGE_API_SPEC.md Compliance)

### 3.1 Storage: Cloudflare KV

```
Namespace: demo-sessions (alias `REVENUE_GUARD_KV`)

Key Format: sess-<sessionId>
TTL: 1200 seconds (20 minutes)
Value:
{
  "sessionId": "sess_...",
  "ip": "203.0.113.42",
  "expiresAt": 1707200000000,
  "costs": 0.0,
  "virtualCosts": 0.0
}
```

### 3.2 Session Lifecycle

1. **Create**: POST /api/auth/login (Turnstile → KV save)
2. **Validate**: GET /api/auth/me (KV lookup + TTL check)
3. **Track**: Each /api/demo/allocate increments `costs` and `virtualCosts`, writes the new session value back to KV, and records `guardrailTriggered` in the response meta if the virtual window trips
4. **Expire**: KV TTL auto-deletes after 1200s; client deletes from localStorage

---

## 4. Authorization & Security

### 4.1 Bearer Token Scheme

- **Header**: `Authorization: Bearer <sessionId>`
- **Validation**: KV lookup + TTL check on every request
- **Failure**: Return `{ success: false, error: { code: "UNAUTHORIZED", message: "..." }, meta: {...} }`
- **Impact**: 401 HTTP + spec-compliant error envelope

### 4.2 WAF Rules (Cloudflare Rule Set)

```yaml
Rule: Brute-Force Guard (Login)
  Path: /api/auth/login
  Threshold: 10 failures per minute per IP
  Action: Managed Challenge (captcha)

Rule: Rate Limit (General)
  Path: /api/demo/*
  Threshold: 10 per minute per IP + 30 per session (enforced via KV counters)
  Action: 429 Too Many Requests / guardrail alert (>virtual window)

Rule: User-Agent Filter
  Condition: Missing user-agent OR suspicious patterns
  Action: Deny

Rule: IP Reputation
  Condition: CloudLists (IP reputation, TOR, proxy)
  Action: Block with Managed Challenge
```

---

## 5. Cost Guardrails (DEMO_COST_LIMIT + Virtual Window)

### 5.1 Real Spend Guard: `DEMO_COST_LIMIT`

- **File**: src/worker/index.ts (allocation handler)
- **Behavior**: `costs` stored on the KV session are incremented by `units * 150 * BILLING_SCALE`. If `costs + totalCost > parseFloat(env.DEMO_COST_LIMIT)`, the request fails with `REAL_BUDGET_EXCEEDED` (HTTP 403) before the Durable Object is touched.
- **Defaults**: Managed in `wrangler.jsonc` as `1.0` for local + preview, while production overrides it to `0.0` to guarantee zero billable spend.

### 5.2 Virtual Budget Window

- **Virtual Unit Price**: Fixed at 150 (per-unit cost for the virtual window).
- **Implementation**: `virtualCosts` tracked on the KV session is compared against a hard-coded `VIRTUAL_LIMIT = 100`. When the next allocation would push `virtualCosts > 100`, the response still runs but a `guardrailTriggered` flag is set, and Analytics Engine receives a `VIRTUAL_GUARDRAIL_TRIGGERED` event.
- **Response Meta**: When the virtual guard trips, `meta.guardrailTriggered` is `true` and `meta.virtualCosts` reports the updated total.

### 5.3 Analytics Engine Export (Guardrail Telemetry)

- **Event**: `VIRTUAL_GUARDRAIL_TRIGGERED`
  - `blobs`: [`sessionId`, `ip`, `VIRTUAL_GUARDRAIL_TRIGGERED`, `skuId`]
  - `doubles`: `[virtualCosts, units, latencyMs]`
  - `indexes`: `[sessionId]`

---

## 6. Error Codes (Spec-Compliant)

### Authentication

- `MISSING_TOKEN`: Turnstile payload missing
- `INVALID_TOKEN`: Turnstile verification failed
- `RATE_LIMITED`: Login attempts exceeded (10/min per IP)
- `UNAUTHORIZED`: Authorization header missing or malformed
- `INVALID_SESSION`: SessionId not found
- `EXPIRED_SESSION`: Session timed out or KV expired

### Allocation

- `RATE_LIMITED`: Allocation attempted after IP/session quota (10 IP / 30 session)
- `INVALID_UNITS`: `units` missing, NaN, or otherwise invalid
- `NEGATIVE_UNITS`: Negative allocation values are rejected
- `INVALID_SKU`: SKU ID not recognized in inventory
- `OUT_OF_STOCK`: Inventory exhausted (eventual path when oversell prevented)
- `REAL_BUDGET_EXCEEDED`: The session already hit `DEMO_COST_LIMIT`

### System

- `RATE_LIMITED`: Generic catch-all when the KV limiter blocks a path (e.g., `/api/demo/reset`)
- `INTERNAL_ERROR`: Unexpected errors fallback to 500 with spec envelope

---

## 7. Mock vs. Live Transition

### 7.1 Mock Phase (Default offline experience)

- **Behavior**: `mockApi.ts` still simulates allocations for demo scenarios or when live endpoints are not reachable
- **Storage**: In-memory state and local session map
- **Latency**: Regulated (50-500ms) to mimic network delay
- **Purpose**: Allows local development and failure recovery when live Worker is unreachable

### 7.2 Live Phase (Worker Endpoints)

- **Behavior**: `apiClient` issues live HTTP requests to `/api/auth`, `/api/demo/*`, and `/api/ws` while mirroring the spec envelope
- **Storage**: Cloudflare KV + D1 + Durable Objects guarantee atomic inventory and session persistence
- **Sessions**: Both mock and live sessions are tracked side-by-side so toggling modes preserves context
- **Latency**: Real (1-50ms) and includes the DO round trip for safe allocations

### 7.3 Mock↔Live Toggle (UI)

- **Current UI**: `<SimulationControls>` exposes a toggle named “Mode” to flip between live and mock, storing each session ID separately under `demo-session-id-mock` and `demo-session-id-live`
- **Strategy**: Logging in hits both APIs in parallel (live + mock) so the client can switch modes without a second login
- **Fallback**: Live failures surface as `SERVER_OFFLINE`, and the UI can fall back to mock until the Worker is available again

---

## 8. Implementation Roadmap

### Phase 1: ✅ COMPLETE (Mock + Client)

- [x] Refactor response envelope → ApiResponse<T>
- [x] Update mock API methods (allocateSafe, allocateEventual, verify)
- [x] Add session management (createSession, validateSession)
- [x] Create ApiClient layer with Authorization header
- [x] Add requestId + timestamp to all responses

### Phase 2: ✅ Live Worker Implementation

- [x] Create Cloudflare Worker endpoints for `/api/auth/login`, `/api/auth/me`, `/api/demo/allocate`, `/api/demo/state`, `/api/demo/reset`
- [x] Bind KV namespace, D1 database, and `InventoryGuard` Durable Object for atomic inventory
- [x] Persist sessions + guardrails in KV (`costs`, `virtualCosts`, `guardrailTriggered` meta)
- [x] Enforce rate limits via KV counters (login 10/min IP, allocate 10/min IP + 30/min session, `/auth/me` 60/min)
- [x] Emit Analytics Engine telemetry for guardrail breaches and allocation success
- [x] Apply WAF rule set (brute-force login guard, demo rate limiter, UA filter, IP reputation) to `cfdemo.link`

### Phase 3: 🔄 UI & Observability Completion

- [ ] Finalize `/api/demo/state` integration so live inventory renders in the dashboard
- [ ] Surface session expiration + guardrail warnings (countdown / auto-stop) in the UI
- [ ] Harden WebSocket flow (per-session validation, telemetry, graceful close codes)
- [ ] Complete observability wiring (Logpush / Analytics Engine dashboards for `guardrailTriggered`)
- [ ] Update knowledge base + runbook docs with the live wiring (this doc is part of that effort)

---

## 9. Testing Checklist

- [ ] Call POST /api/auth/login with "mock-token-test" → get sessionId
- [ ] Call GET /api/auth/me with Bearer token → get valid session
- [ ] Call POST /api/demo/allocate with Bearer token → get AllocationResponse
- [ ] Call without Bearer token → get UNAUTHORIZED error
- [ ] Call with expired sessionId → get EXPIRED_SESSION error
- [ ] Verify error envelope: success=false, error.code, error.message, meta (requestId, timestamp)
- [ ] Verify allocation success envelope: success=true, data (unitsAvailable, totalAllocated, revenueGenerated), meta
- [ ] Trigger cost_guard_alert at ~$15 billed
- [ ] Trigger cost_guard_auto_stop at ~$20 billed
- [ ] Verify requestId in meta is unique per call (for Analytics Engine tracing)
- [ ] Call GET /api/demo/state with Bearer token → get inventory payload (inventory rows + meta)
- [ ] Observe rate limits: login (10/min IP), `/auth/me` (60/min session), allocate (30/min session + 10/min IP)
- [ ] Force virtual guardrail by exceeding 100 virtual units → expect `meta.guardrailTriggered` and AE event `VIRTUAL_GUARDRAIL_TRIGGERED`
- [ ] Verify `REAL_BUDGET_EXCEEDED` triggers when `costs` surpasses `DEMO_COST_LIMIT`
- [ ] Verify requestId in meta is unique per call (for Analytics Engine tracing)

---

## 10. Client Integration Example

```typescript
// App.tsx or root component
import { apiClient } from './services/apiClient';
import { useEffect, useState } from 'react';

export function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // On mount: restore session from localStorage
    apiClient.initializeSession();
    validateSession();
  }, []);

  async function validateSession() {
    const response = await apiClient.getCurrentSession();
    if (response.success) {
      setSession(response.data);
      console.log(`Session valid until ${new Date(response.data.expiresAt)}`);
    } else {
      console.log('Session invalid or expired; show login');
    }
  }

  async function handleLogin(token: string) {
    const response = await apiClient.login(token, getClientIp());
    if (response.success) {
      setSession(response.data);
      console.log('Login successful:', response.meta.requestId);
    } else {
      console.error('Login failed:', response.error);
    }
  }

  async function handleAllocate(skuId: string, units: number) {
    const response = await apiClient.allocateSafe(skuId, units);
    if (response.success) {
      console.log('Allocation granted:', response.data, 'ID:', response.meta.requestId);
    } else {
      console.error('Allocation failed:', response.error.code, response.error.message);
    }
  }

  return (
    <>
      {session ? (
        <Dashboard session={session} onAllocate={handleAllocate} />
      ) : (
        <LoginGate onLogin={handleLogin} />
      )}
    </>
  );
}
```

---

## 11. Deployable Live Endpoint Reference

The implementation in [`src/worker/index.ts`](../../src/worker/index.ts) currently provides the following routes:

- `POST /api/auth/login` → Turnstile verification + KV session save
- `GET /api/auth/me` → Session validation + rate limiting
- `GET /api/demo/state` → D1 inventory snapshot per session
- `POST /api/demo/allocate` → Durable Object-backed allocation + guardrails
- `POST /api/demo/reset` → Inventory & session reset (operator rate limited)

---

## Summary

Current state:

1. ✅ `ApiResponse<T>` strictly followed across mock, client, and live Worker responses (meta provided on every path)
2. ✅ Live Worker hosts `/api/auth/*`, `/api/demo/*`, `/api/ws`, KV/D1 stores sessions & inventory, Durable Object handles atomic allocations
3. ✅ Rate limits enforced via KV counters (login: 10/min IP, `/auth/me`: 60/min session, allocate: 10/min IP + 30/min session, reset: 1/min IP)
4. ✅ Guardrails (`DEMO_COST_LIMIT`, `virtualCosts`, Analytics Engine events) and `REAL_BUDGET_EXCEEDED` responses match the doc
5. 🔄 Next steps: surface live inventory/guardrail UI, finalize WS validation, and document telemetry as part of ongoing runbook updates

**Next Step**: Reconcile live Worker telemetry and documentation so the runbooks stay in sync with the deployed Guardrail service.
