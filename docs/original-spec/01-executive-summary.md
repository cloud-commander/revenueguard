# 01. Executive Summary & Architecture

**Revenue Guard** is a high-concurrency inventory allocation engine simulation demonstrating the consistency guarantees of Cloudflare Durable Objects vs. the eventual consistency limitations of SQL databases.

## Core Success Metric

- **Unsafe Mode (D1)**: Must **consistently overallocate** (allow >100 users) due to race conditions
- **Safe Mode (DO)**: Must **consistently cap at exactly 100**, rejecting excess requests

## System Architecture

```
Browser → Worker (Router & Load Generator)
         ├─ Safe Mode   → Durable Object (Serialized)
         ├─ Unsafe Mode → D1 Database (Race Condition)
         └─ WebSocket   → DO (Real-time updates)
```

### Components

1. **Worker** – Routes API requests, serves frontend, spawns concurrent load for simulations
2. **Durable Object (`InventoryDO`)** – Single-threaded, guarantees atomic allocations
3. **D1 Database** – SQLite with intentional read-check-write gap to demonstrate races

## Simulation Scenario

- **5 distinct SKUs**, each with **100 units**
- Spawn **125 concurrent allocation requests** to trigger race conditions
- Compare results side-by-side (Safe: 100 allocated, 25 rejected | Unsafe: 125 allocated, 0 rejected)

See [02-data-models.md](02-data-models.md) for detailed type definitions and [03-api-protocol.md](03-api-protocol.md) for endpoint specs.
