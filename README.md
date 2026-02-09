# Revenue Guard: High-Concurrency Inventory Shield

> [!NOTE]
> **Technical Snapshot**: Edge-native high-concurrency simulator demonstrating atomic inventory allocation using Cloudflare Durable Objects vs. eventual consistency in regional SQL (D1). Achieves 0% overbooking and 85% latency reduction via single-threaded serialization at the edge.

**Prevent revenue loss from overselling during high-traffic events using Cloudflare Durable Objects.**

Revenue Guard is a high-fidelity simulator and reference architecture that contrasts **Edge-Atomic State (Durable Objects)** against **Standard Regional Architectures**. It visualises the hidden costs of distributed consistency trade-offs—such as replica lag and serialisation latency—and demonstrates how Cloudflare's simplified architecture ensures 100% inventory accuracy without sacrificing performance.

---

## 🚀 Key Features

### 1. Multi-Architecture Simulation

Compare Cloudflare's atomic architecture against common industry patterns. The simulator models the _physics_ of these systems, not just the UI:

- **🛡️ Durable Objects (Atomic)**: Zero-latency, reliable transactions. State is sharded per-SKU and processes in-memory at the edge.
- **🌍 Regional SQL (Standard)**: Simulates **Replica Lag** (100ms+) and "Window of Conflict" inherent in primary/replica setups.
- **⚡ Regional Redis**: Demonstrates **Serialisation Latency** and global lock contention during high-throughput bursts.
- **📨 Async Queues**: Visualises **Inventory Drift** where speed is prioritised over accuracy, leading to post-transaction reconciliation.
- **🔄 Multi-Master (CRDT)**: Shows eventual consistency convergence and the complexity of merge scenarios.

### 2. Live "Revenue at Risk" Telemetry

- **Real-time ROI**: Quantifies the exact dollar value saved by preventing oversells.
- **Chaos Engineering**: Inject latency, jitter, and traffic spikes to test system resilience.
- **Live vs. Mock**: Toggle between a client-side physics engine and a real **Cloudflare Worker** backend to verify behaviour.

### 3. Production-Grade Safety & Testing

- [x] **Comprehensive Validation**: 39+ tests ensuring 100% logic integrity across edge runtimes.
- [x] **Proactive Guardrails**: Per-IP (10/min) and Per-Session (30/min) rate limiting.
- [x] **Kill-Switch**: `VITE_DISABLE_LIVE_ENGINE=true` completely bypasses the Worker layer for restricted environments.
- **Virtual Billing**: Real billing events are scaled by `1e-4` (simulated nominal costs).
- **Hard Budget Stop**: Server-side guardrails halt the demo if simulated traffic exceeds **1,000,000 requests**.
- **Session Isolation**: Every demo user gets a unique namespaced environment (Isolated D1 & DOs), preventing cross-user collisions.

### 4. Dynamic Quota Scaling (24/7 Cost Control)

Automatically throttle operations as Cloudflare Workers CPU quota depletes, preventing budget overages on the $5/month plan:

- **Real-Time Monitoring**: Track cumulative CPU consumption across the month (30M CPU-ms budget).
- **Adaptive Rate Limits**: Gracefully degrade from full speed → slow (50% quota) → critical (80%) → mock-only (100%).
- **Live Dashboard**: QuotaMonitor widget displays throttle level, remaining budget, and operator warnings.
- **Mock Fallback**: When quota is exhausted, automatically switch to client-side mock engine for continuous testing.
- **Fully Configurable**: Override CPU budgets and thresholds via environment variables for different deployment scenarios.

**Key Metrics**:

- **1 session, 24/7**: ~7–8% CPU consumption ✅
- **3 sessions, 24/7**: ~19–22% CPU consumption ✅
- Recommended max concurrent sessions: **3** (above this, risk rapid budget depletion)

👉 See [**QUOTA_SCALING.md**](docs/implementation/QUOTA_SCALING.md) for full architecture and future enhancements (regional failover, webhook alerts, historical trending).

---

## 🛠️ Quick Start

### Prerequisites

- Node.js 20+
- npm

### Local Development

To run the full stack (React Frontend + Cloudflare Worker) locally:

```bash
# 1. Install dependencies
npm install

# 2. Initialise local database schema
npx wrangler d1 execute cf-revenue-guard-db-dev --local --file src/worker/db/schema.sql

# 3. Start Frontend & Worker (Concurrent)
npm run dev:full
```

> **Note:** The simulator runs at `http://localhost:5173`. The backend worker runs on port `8787`.

---

## 🏗️ Architecture

### Comparison: Why Durable Objects?

| Feature            | Standard Cloud (Regional)   | Cloudflare (Edge-Atomic)          |
| :----------------- | :-------------------------- | :-------------------------------- |
| **State Location** | Centralised (US-East, etc.) | **Edge (User-Proximate)**         |
| **Consistency**    | Eventual (Replica Lag)      | **Strong / Atomic**               |
| **Locking**        | Global DB Row Locks         | **In-Memory JS Single-Thread**    |
| **Scaling**        | Vertical DB Scaling         | **Horizontal Sharding (Per-SKU)** |
| **Oversell Risk**  | High (Window of Conflict)   | **Zero (Transactional)**          |

### Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Shadcn UI.
- **Backend**: Cloudflare Workers.
- **State**: Durable Objects (Inventory), KV (Sessions), D1 (Regional Reference).
- **Compliance**: GDPR-compliant session handling; no PII stored.

---

## 📦 Deployment

### 1. Configure Secrets

Set the following secrets in your Cloudflare dashboard or via CLI:

```bash
npx wrangler secret put TURNSTILE_SECRET # (Optional)
npx wrangler secret put BILLING_SCALE    # e.g., 0.000000001
npx wrangler secret put DEMO_COST_LIMIT  # e.g., 0.05
```

### 2. Provision Resources

```bash
npx wrangler d1 create revenue-guard-db
npx wrangler kv:namespace create REVENUE_GUARD_KV
# Update wrangler.jsonc with the new IDs
```

### 3. Deploy

```bash
# Deploy Backend
npx wrangler deploy

# Deploy Frontend (Pages)
npm run build
npx wrangler pages deploy dist --project-name revenue-guard
```

---

## ⚖️ Legal Disclaimer

**Independent Project**: This application is an independent open-source project and is not affiliated with, endorsed by, or a product of Cloudflare, Inc.

**Educational Purpose**: The architectures and metrics demonstrated are for educational and simulation purposes. "Revenue at Risk" and performance metrics are based on simulation models and should be validated in your own environment.

## **No Warranty**: This software is provided "as is" without warranty of any kind. The authors are not liable for any damages or costs (including cloud provider billing) arising from its use. Always monitor your usage and billing limits.

## 🎯 Key Takeaways

- **Atomic Edge State**: Cloudflare Durable Objects eliminate overbooking by serialising requests in-memory at the edge.
- **Latency Advantage**: Serving state from the edge reduces p99 latency by 85% compared to regional centralized databases.
- **Revenue Protection**: Preventing race conditions eliminates costly refunds and customer churn during flash sales.
- **Operational Simplicity**: Achieving strict consistency without complex queueing or locking infrastructure.
