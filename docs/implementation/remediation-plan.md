# Remediation Plan: Backend Reality Gap & Spec Compliance

**Status**: 🔄 IN PROGRESS (Mock layer done; live backend pending)  
**Last Updated**: 2026-02-06  
**Phase**: Mock compliance → Live Worker build

---

## OPTIONS DECISION

**✅ CHOSE: Option 1 - Full EDGE_API_SPEC.md Conformance**

**Justification**:

- Demo lives on `*.cfdemo.link` → spec **applies**
- Spec defines zone-wide security (WAF, KV session, DO hibernation) → must conform
- Spec provides attack surface reduction (request/response envelope) → mandatory
- Mock-to-live path is ISO-identical (only transport layer changes) → low risk

---

## COMPLETED (Phase 1: Mock Spec Compliance)

### 1.1 Response Envelope Refactor ✅

- [x] Added `ApiResponse<T>` standard type in `src/types.ts` (envelope with meta)
- [x] Refactored `AllocationResponse` to use the envelope; added `SessionPayload`
- [x] Updated `mockApi` allocate calls to return spec envelope
- [x] Added helpers: `generateRequestId()`, `createResponse<T>()`
- **Impact**: Mock responses are spec-shaped; live swap remains

### 1.2 Session Management ✅

- [x] Extended `MockState` to track sessions (sessionId, expiresAt, ipAddress)
- [x] Added mock session creation/validation; live `/auth/me` call now wired when `isLive` is true
- **Impact**: Session shape matches spec; persistence is still in-memory only

### 1.3 Authorization Header Support ✅

- [x] Created `src/services/apiClient.ts` with live/mock mode toggle
- [x] Added Authorization header handling and session persistence
- [x] Added local meta for mock responses; fixed mock calls to pass units correctly
- **Impact**: Client can speak the envelope; still defaulting to mock

### 1.4 Documentation (Updated)

- [x] `EDGE_API_SPEC_CONFORMANCE.md` documents the target shape (mock compliant, live pending)
- [x] `WORKER_ENDPOINT_TEMPLATE.ts` is a template for live Worker endpoints
- **Impact**: Docs describe desired end-state; live code not yet implemented

---

## IN PROGRESS (Phase 2: Live Worker Build)

### What’s Missing (Reality Check)

- Live Worker endpoints are **not implemented** (auth/login, auth/me, demo/allocate, reset are templates only).
- No KV namespace, no Durable Object, no D1 wiring, no WAF rules in code.
- No server-side cost guardrails or rate limits; all limits remain client-side/mocked.
- UI still talks to mockApi; no Turnstile widget, no live session validation.

### Next Actions (Do Now)

1. **Stand up Worker** using `WORKER_ENDPOINT_TEMPLATE.ts`
   - Add wrangler config, bindings (KV sessions, DO inventory), env vars (BILLING_SCALE=0.001, TURNSTILE_SECRET).
2. **Implement KV sessions**
   - /api/auth/login → save session with TTL 1200s; /api/auth/me → validate.
3. **DO + cost guardrails**
   - /api/demo/allocate backed by Durable Object; enforce 0.1% billed, alert at ~$15, stop at ~$20; return envelope.
4. **Rate limits + WAF**
   - Per-IP rate limits (login 10/min, allocate 100/min, reset 1/min); add managed challenge on abuse.
5. **UI integration**
   - Wire `apiClient` live mode to real endpoints; add Turnstile and session countdown; keep mock fallback.

## TIMELINE (Reset)

- 🟥 Critical (today): Create Worker scaffold, bindings, and /auth/login + /auth/me live.
- 🟧 High (this week): /demo/allocate with DO + guardrails; rate limits + WAF rules.
- 🟨 Medium: UI wiring to live, Turnstile widget, session expiry UX, observability events.
- 🟩 Low: Docs polish, dashboards, expanded SKUs.

## SUCCESS CRITERIA (Revised)

- [x] Mock API returns spec envelope.
- [ ] Live Worker deployed with KV + DO and spec envelope.
- [ ] Server-side guardrails enforce 0.1% billed (alert/auto-stop) and rate limits.
- [ ] UI uses apiClient against live endpoints with Turnstile.
- [ ] Observability emits guardrail and allocation events.
