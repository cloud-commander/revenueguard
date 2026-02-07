# Demo Narrative: Interactive Education Tool

The POC is designed as an **interactive education tool**. At each critical state, pause and explain the business value and technical mechanism. This narrative guides the presenter through every important moment.

## 1) C-Suite Validation Matrix

| Persona              | Anxiety / Concern                    | How We Prove It (In This Demo)                                                                                               |
| :------------------- | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **CEO** (Chief Exec) | "Will this break core sales flows?"  | **Continuity:** Safe mode (Durable Objects) never oversells. Even under load, allocations stay consistent and recoverable.   |
| **CFO** (Finance)    | "Are we exposing ourselves to cost?" | **Hard Cost Lock:** DEMO_COST_LIMIT=0.0 and BILLING_SCALE=1e-9 block real spend; every response returns the cost ledger.     |
| **COO** (Ops)        | "Can it handle concurrency?"         | **Atomicity Under Load:** Safe path uses DO per session/SKU; show zero race conditions at high request rate.                 |
| **CIO** (Info)       | "Is this drop-in without rewrites?"  | **Edge Abstraction:** Logic lives at the edge (KV + DO + D1); frontend toggles mock/live without backend rewrites.           |
| **CMO** (Marketing)  | "Will UX jitter during spikes?"      | **Stable UX:** Live vs mock toggle shows identical UI; allocations return in <100ms on safe path; guardrail banners only.    |
| **CRO** (Revenue)    | "Are we losing carts to oversell?"   | **Oversell Demo:** Eventual mode intentionally oversells (shows oversellDelta); safe mode prevents it—conversion protection. |
| **CCO** (Compliance) | "Are we storing customer data?"      | **Minimal Data Footprint:** Only sessionId/ip/timestamps in KV; no PII, no cards. Easy data minimization story.              |
| **CSO** (Security)   | "Can bots or abuse drain resources?" | **Zero Trust + Rate Limits:** Turnstile for sessions, 200/min allocate throttle, 1/min reset throttle, AE logging.           |

## 2) Objection Handling & Competitive Analysis

- "Cloud costs will spike": The demo is hard-capped at $0 real spend (DEMO_COST_LIMIT=0.0, BILLING_SCALE=1e-9). No alerts-only posture—actual block.
- "It will add latency": Safe path (DO) returns in ~<100ms; overhead is minimal because state is colocated at the edge. Compare to gateway hops.
- "It will oversell under load": Show eventual path overselling (oversellDelta) vs safe path preventing it—atomic DO proves the fix.
- "We cannot touch the backend": The edge layer is toggleable (mock/live) with no legacy changes; it is an overlay, not a rewrite.
- "Bots will drain inventory": Turnstile-gated sessions + per-session/IP rate limits; AE events for abuse traces.

## 3) Demo Script & Flow

For each step: **What the customer sees** → **What to say** → **Educational point**.

1. **Login + Guardrails On**
   - Sees: Turnstile challenge, 20-min session banner, cost meter at $0.
   - Say: "Zero Trust entry: no session, no spend. Real billing is locked to zero by design."
   - Teach: KV session, DEMO_COST_LIMIT=0.0, BILLING_SCALE=1e-9, Authorization header.

2. **Baseline Allocation (Safe / Atomic Path)**
   - Sees: Safe allocation succeeds; latency ~<100ms; inventory decrements without oversell.
   - Say: "Durable Objects give per-session, per-SKU atomicity—no race, no double-sell."
   - Teach: DO shard per session+SKU; AE event on success; KV cost ledger updates.

3. **Race Condition Demo (Eventual Path)**
   - Sees: Eventual allocation oversells; `oversellDelta` appears; guardrail flag may light.
   - Say: "This is the failure mode we eliminate in safe mode—intentional oversell to prove the point."
   - Teach: D1 read → 100ms pause → write; illustrates lost-update risk vs DO atomic path.

4. **Virtual Guardrail Trip**
   - Sees: Virtual cost crosses threshold; banner warns; allocations continue safely.
   - Say: "We model financial risk without real spend—perfect for training and pilots."
   - Teach: Virtual vs real spend; guardrail metadata returned in ApiResponse.

5. **Reset & Recovery**
   - Sees: Reset clears allocations; rate limit protects against abuse.
   - Say: "Operational control is rate-limited—one reset per minute per IP."
   - Teach: KV rate limit keys; DO shards reset per SKU/session; idempotent recovery path.

6. **Wrap / Metrics**
   - Sees: Summary card: zero real spend, safe path no oversell, eventual path oversell shown for contrast.
   - Say: "We answered cost, concurrency, and safety in one flow—atomic when you need it, observable always."
   - Teach: Tie back to Validation Matrix; point to AE for traces and logs.

## 4) Presenter Tips

- Keep the pace: pause at oversell vs safe moments; translate to revenue and risk.
- Measure latency live: safe path targets ~<100ms; call it out.
- If Turnstile is unavailable, use DEBUG_TOKEN to proceed.
- Keep curl snippets handy to replay allocate-safe, allocate-eventual, reset.
