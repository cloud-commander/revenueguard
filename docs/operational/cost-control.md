# Revenue Guard Cost Control Plan

**Purpose**: Prevent bill shock for the Revenue Guard POC, cap potential abuse, and make operating costs entirely predictable. Project traffic is intentionally scaled down to near-zero impact.

## Objectives

- Keep Workers and Durable Objects spend negligible ($0.00) during demos.
- Detect anomalous usage early and auto-stop before any real billing occurs.
- Provide a unified, secure origin via **Workers with Assets**.

## Guardrails (Applied Implementation)

- **Micro-Billing Scaling**: Real billing events are scaled by `1e-9` (0.000000001). This ensures that even millions of simulated requests result in less than $0.01 of real impact.
- **Zero-Tolerance Hard Stop**: The system enforces a strict **$0.00** total real overage limit. If the demo detects even a $0.01 real billing projection, it triggers a `REAL_BUDGET_EXCEEDED` halt.
- **Virtual Alert Threshold**: A virtual "Safety Alert" surfaces in the UI at **$100.00** of simulated revenue/cost (internal guardrail for educational storytelling).
- **Simulator Resolution Caps**:
  - **Alert**: Triggered at 500,000 simulated requests.
  - **Halt**: Triggered at 1,000,000 simulated requests (~20% of a standard paid Workers allowance).
- **Unified Origin**: Served via **Workers with Assets**, ensuring all assets and API calls happen on a single secure origin.

## Operational Controls

- **Pre-flight checks**: Confirm `BILLING_SCALE` is set to `1e-9` in `wrangler.jsonc` and `TURNSTILE_SECRET` is active.
- **Runtime monitoring**: Live counters display simulated throughput vs. the "Virtual Budget" safety meter.
- **Stop actions**: On budget breach, the simulator throws a `SIMULATION_HALTED` error, requiring a manual Reset to continue.
- **Session Isolation**: Each demo session is namespaced (via Turnstile + KV) to prevent cross-operator state collisions.

## Estimated Running Costs (POC)

- **Workers + Durable Objects**: Due to the `1e-9` scale-down, effective billable requests are near zero. Demos are designed to fit comfortably within the Cloudflare Workers Free Tier.
- **D1 (Eventual Path)**: Used for legacy reference contrast; usage is minimal and scoped per session.
- **Egress**: Zero cost for assets, as the site is served directly from the Worker's global asset cache.

## Abuse Prevention

- **Cloudflare Turnstile**: All sessions require a Turnstile challenge to prevent bot-driven resource exhaustion.
- **Idle Timeout**: Simulations auto-stop after **5 minutes** of operator inactivity (`IDLE_TIMEOUT_MS`).
- **Rate Protection**:
  - **Login**: 10/min per IP (WAF managed).
  - **Allocations**: 200/min per session.
  - **Resets**: 1/min per IP.
- **Unauthorized Block**: Any request without a valid `Bearer` token (KV-validated) is rejected at the edge.

## Implementation Notes

- **Current Status**: All guardrails (scaling, hard-stop, idle-timeout, rate-limiting) are implemented in `src/worker/index.ts` and `src/hooks/useSimulation.ts`.
- **Infrastructure**: Uses `ASSETS` binding in `wrangler.jsonc` to co-locate React assets with the core logic.

## Operator Runbook (Short)

1. **Before Demo**: Clear previous run data and verify the "Zero-Cost Guardrail" banner is visible.
2. **During Demo**: Monitor the usage meter; narrate the "Revenue at Risk" vs. "Revenue Protected" contrast.
3. **On Alert**: If the Virtual Budget hits $100, use it as a teaching moment for automated risk mitigation.
4. **On Halt**: Reset the simulation if the 1M request safety cap is reached.
