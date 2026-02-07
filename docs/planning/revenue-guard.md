# Revenue Guard: Technical Design Document

> [!IMPORTANT]
> **Project Status**: Specification Phase
> **Goal**: Comparative simulation of distributed race conditions (D1 SQLite vs Durable Objects) during a high-concurrency Flash Sale.

### Core Constraints:

1.  **Configuration:** Use **`wrangler.jsonc`**.
2.  **Billing Efficiency:** Implement the **WebSocket Hibernation API**.
3.  **Frontend/Build**: Use **Vite** for the frontend. Served via Hybrid approach (Pages for assets, Worker for DO/API).
4.  **Frontend Stack**: **Vite**, **React**, **Tailwind CSS**, and **shadcn/ui**.
5.  **Motion**: Use **Framer Motion** for high-fidelity micro-interactions.

## 1. Executive Summary

"Revenue Guard" is a high-concurrency inventory allocation simulator designed to demonstrate the consistency guarantees of Cloudflare Durable Objects (DO) against the eventual consistency limitations of standard Key-Value (KV) or D1 stores under massive load.

The system simulates a **High-Demand Revenue Protection** scenario where **24 high-demand SKUs** are released simultaneously, each with limited inventory (e.g., **100 units**). The objective is to prove that under high load, the "Unsafe" (D1/SQL) implementation fails to prevent overallocation, while the "Safe" (DO) implementation guarantees strict inventory correctness, thereby protecting revenue from refunds and chargebacks.

### Core Success Metric

- **Eventual Consistency Mode** (formerly "Unsafe"): Must consistently **over-allocate** (allow > inventory) due to race conditions (Read-Modify-Write in SQL without strict serialization). This represents standard Postgres/MySQL architectures where read replicas lag behind the primary writer.
- **Safe Mode**: Must consistently **cap at exactly the available stock**, rejecting excess requests.

### Economic & Isolation Design (Phase 2 Additions)

- **Zero-Cost Demo Path**: Decouples virtual simulation metrics from real Cloudflare billing. Uses a `0.000000001` billing scale to ensure 24/7 usage costs less than $0.20/mo in overages.
- **Session Isolation**: Dynamically namespaces Durable Object shards by `sessionId`. Every visitor gets a private, fresh demo environment, supporting millions of concurrent views without state collisions.
- **Virtual Guardrails**: Instead of hard-blocking users, the system triggers educational "Safety Alert" states when virtual budgets are exceeded.

---

## 2. System Architecture

The solution utilizes a single-stack Cloudflare Worker deployment serving both the frontend and the API.

```mermaid
graph TD
    User[Browser Client]

    subgraph Cloudflare Edge
        Worker[Worker (Router & UI Server)]
        Turnstile[Turnstile (Bot Protection)]

        subgraph Data Layer
            DO[Durable Object (InventoryDO)]
            D1[D1 Database (SQL / Eventual Consistency)]
        end
    end

    User -->|Validates Token| Turnstile
    User -->|HTTP GET /| Worker
    User -->|HTTP POST /api/allocate| Worker
    User -->|WS /api/ws| Worker
    User -->|HTTP POST /api/simulate-rush| Worker

    Worker -->|Mode: Safe| DO
    Worker -->|Mode: Eventual Consistency| D1
    Worker -->|WS Upgrade| DO
```

### Components

1.  **Worker (Router)**: Handles routing, serves static HTML/JS, and dispatches API requests. **Crucially**, it also acts as the **Load Generator** to bypass browser connection limits.
2.  **Durable Object (`InventoryDO`)**: The "Safe" authority. Serializes requests.
3.  **D1 Database (`REVENUE_DB`)**: The "Eventual Consistency" simulation. A real SQLite database accessed without transactions to prove row-locking failure.

---

## 3. Data & State Models

### 3.1. Durable Object State (`InventoryDO`)

The DO maintains the authoritative state for a single SKU (e.g., "SKU-001").

```typescript
interface InventoryState {
  /** The unique ID of the SKU (e.g., "SKU-001") */
  id: string;

  /** Total available capacity (Constant: 100) */
  totalStock: number;

  /** Set of confirmed User IDs. Size must never exceed totalStock. */
  allocations: Set<string>;

  /** Active WebSocket sessions for real-time updates */
  sessions: WebSocket[];
}
```

### 3.2. D1 Schema (Unsafe)

Two tables: one for aggregate counts (prone to race conditions), one for individual allocations (to prove duplicates/phantoms).

```sql
-- Aggregate counter (used for the race condition demo)
CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  allocated_units INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 100
);

-- Individual allocation records (NO uniqueness constraint = intentional vulnerability)
CREATE TABLE allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sku_id) REFERENCES inventory(id)
);
-- Note: No UNIQUE(sku_id, user_id) constraint to allow duplicate allocations

-- Initial Seed
INSERT INTO inventory (id, allocated_units, total_stock) VALUES
  ('sku-001', 0, 100),
  ('sku-002', 0, 100),
  ('sku-003', 0, 100),
  ('sku-004', 0, 100),
  ('sku-005', 0, 100);
```

### 3.3. Type Definitions

**Environment Bindings**

```typescript
interface Env {
  INVENTORY_NS: DurableObjectNamespace;
  REVENUE_DB: D1Database;
  RACE_DELAY_MS?: string; // Optional: override default 200ms delay
}

// Valid SKU IDs
const VALID_SKUS = [
  "sku-001",
  "sku-002",
  "sku-003",
  "sku-004",
  "sku-005",
] as const;
type SKUId = (typeof VALID_SKUS)[number];
```

**Allocation Request (`POST /api/allocate`)**

```typescript
interface AllocationRequest {
  skuId: SKUId;
  userId: string; // Unique UUID v4
  mode: "safe" | "eventual";
}
```

**Simulation Request (`POST /api/simulate-rush`)**

```typescript
interface SimulationRequest {
  skuId: string;
  count: number; // e.g., 20
  mode: "safe" | "eventual";
}
```

**Allocation Response**

```typescript
interface AllocationResponse {
  success: boolean;
  message: string;
  availableUnits?: number;
  totalAllocated?: number;
  error?:
    | "OUT_OF_STOCK"
    | "INVALID_SKU"
    | "INVALID_USER"
    | "STORAGE_FAILURE"
    | "INTERNAL_ERROR";
}

// HTTP Status Codes:
// 200 OK - Allocation successful
// 409 Conflict - SKU is out of stock
// 400 Bad Request - Invalid skuId or userId
// 500 Internal Server Error - Storage failure or other error
```

---

## 4. API & Protocol Specification

### 4.1. HTTP Endpoints

#### `POST /api/reset`

**Description**: Resets the simulation state.

**Request Body**: None

**Response**: `{ success: true, message: "Reset complete" }`

**Logic**:

```typescript
// D1: Reset both tables
await env.REVENUE_DB.batch([
  env.REVENUE_DB.prepare("UPDATE inventory SET allocated_units = 0"),
  env.REVENUE_DB.prepare("DELETE FROM allocations"),
]);

// DO: Delete all instances (for each SKU)
for (const skuId of VALID_SKUS) {
  const id = env.INVENTORY_NS.idFromName(skuId);
  const stub = env.INVENTORY_NS.get(id);
  await stub.fetch(new Request("https://fake/reset", { method: "DELETE" }));
}
```

#### `POST /api/allocate`

**Description**: Attempts to allocate inventory units.

**Request Body**:

```json
{
  "skuId": "sku-001",
  "userId": "uuid-v4-string",
  "mode": "safe" | "eventual"
}
```

**Response**: See `AllocationResponse` type above.

**Routing Logic** (Worker):

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/allocate" && request.method === "POST") {
      const { skuId, userId, mode } = await request.json();

      // Validation
      if (!VALID_SKUS.includes(skuId)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "INVALID_SKU",
          }),
          { status: 400 },
        );
      }

      if (mode === "safe") {
        // Route to Durable Object
        const id = env.INVENTORY_NS.idFromName(skuId);
        const stub = env.INVENTORY_NS.get(id);
        return stub.fetch(request.clone());
      } else {
        // Route to D1 (Eventual Consistency path)
        return handleEventualConsistencyAllocation(env, skuId, userId);
      }
    }
  },
};
```

#### `POST /api/simulate-rush`

**Description**: Triggers a server-side burst of concurrent allocation requests.

**Reason**: Browsers limit concurrent connections (~6 max). To achieve true concurrency, the Worker spawns 20+ async requests internally.

**Request Body**:

```json
{
  "skuId": "sku-001",
  "mode": "safe" | "eventual",
  "count": 25  // Number of concurrent requests (default: 25 to prove overallocation)
}
```

**Logic** (Direct function calls, NOT localhost fetch):

```typescript
async function handleFlashSale(env: Env, body: any): Promise<Response> {
  const { skuId, mode, count = 25 } = body;

  // Spawn concurrent allocation requests
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) =>
      handleAllocationInternal(env, {
        skuId,
        userId: `sim-user-${Date.now()}-${i}`,
        mode,
      }),
    ),
  );

  const successful = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = count - successful;

  return new Response(
    JSON.stringify({
      success: true,
      message: `Simulation complete: ${successful} allocated, ${failed} rejected`,
      results: { successful, failed, total: count },
    }),
  );
}
```

#### `GET /api/state`

**Description**: Returns current allocation state for a SKU.

**Query Params**: `?skuId=sku-001&mode=safe|eventual`

**Response**:

```json
{
  "skuId": "sku-001",
  "totalStock": 100,
  "allocatedUnits": 15,
  "availableUnits": 85,
  "allocations": ["user-1", "user-2", ...] // Only for Safe mode
}
```

---

### 4.2. WebSocket Protocol (`/api/ws`)

Used for real-time updates of the inventory map.

**Connection Setup**:

```typescript
// Client
const ws = new WebSocket("ws://localhost:8787/api/ws?skuId=sku-001");
```

**Client -> Server Messages**

- _None (Client is passive listener)_

**Server -> Client Messages**

```typescript
type WSMessage =
  | {
      type: "UPDATE";
      skuId: string;
      availableUnits: number;
      allocatedUnits: number;
      allocations: string[];
    }
  | { type: "RESET"; skuId: string }
  | { type: "ERROR"; message: string };
```

**Implementation** (Durable Object):

```typescript
class InventoryDO {
  sessions: WebSocket[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept with hibernation
      this.ctx.acceptWebSocket(server);
      this.sessions.push(server);

      // Send current state immediately
      server.send(
        JSON.stringify({
          type: "UPDATE",
          classId: this.state.id,
          availableUnits: this.state.totalStock - this.state.allocations.size,
          allocatedUnits: this.state.allocations.size,
          allocations: Array.from(this.state.allocations),
        }),
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    // ... other endpoints
  }

  // Hibernation API handlers
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.sessions = this.sessions.filter((s) => s !== ws);
  }

  webSocketError(ws: WebSocket, error: Error) {
    console.error("WebSocket error:", error);
    this.sessions = this.sessions.filter((s) => s !== ws);
  }

  // Broadcast helper
  broadcast(message: WSMessage) {
    const json = JSON.stringify(message);
    this.sessions.forEach((ws) => {
      try {
        ws.send(json);
      } catch (err) {
        console.error("Failed to send to WebSocket:", err);
      }
    });
  }
}
```

---

## 5. Detailed Logic Flows

### 5.1. The "Eventual Consistency" Path (D1 / SQL)

_Designed to Fail via Optimistic Locking Race Condition (Actual Overallocation)._

**Goal**: Demonstrate that **more than the available inventory** can successfully be allocated due to race conditions.

**Implementation**:

```typescript
async function handleEventualConsistencyAllocation(
  env: Env,
  skuId: string,
  userId: string,
): Promise<Response> {
  try {
    const RACE_DELAY_MS = parseInt(env.RACE_DELAY_MS || "200");

    // Step 1: Read current state
    const { results } = await env.REVENUE_DB.prepare(
      "SELECT allocated_units, total_stock FROM inventory WHERE id = ?",
    )
      .bind(skuId)
      .all();

    const current = results[0];
    if (!current) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_SKU",
        }),
        { status: 400 },
      );
    }

    // Step 2: Artificial delay (forces race condition window)
    await new Promise((resolve) => setTimeout(resolve, RACE_DELAY_MS));

    // Step 3: Optimistic check (but don't enforce atomically)
    // In a concurrent burst, multiple requests will pass this check
    if (current.allocated_units >= current.total_stock) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "OUT_OF_STOCK",
          message: "SKU is out of stock",
          availableUnits: 0,
        }),
        { status: 409 },
      );
    }

    // Step 4: Write WITHOUT atomic compare-and-swap
    // This is the vulnerability: no WHERE clause checking previous value
    await env.REVENUE_DB.batch([
      env.REVENUE_DB.prepare(
        "UPDATE inventory SET allocated_units = allocated_units + 1 WHERE id = ?",
      ).bind(skuId),
      env.REVENUE_DB.prepare(
        "INSERT INTO allocations (sku_id, user_id) VALUES (?, ?)",
      ).bind(skuId, userId),
    ]);

    // Step 5: Return success (even though we might have overallocated)
    return new Response(
      JSON.stringify({
        success: true,
        message: "Allocation confirmed",
        availableUnits: current.total_stock - (current.allocated_units + 1),
      }),
    );
  } catch (err) {
    console.error("Unsafe allocation error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "INTERNAL_ERROR",
        message: err.message,
      }),
      { status: 500 },
    );
  }
}
```

**Why This Creates Overallocation**:

1. **Concurrent Read**: 25 requests all read `allocated_units = 99` simultaneously
2. **Delay Window**: 200ms delay ensures they all complete the read before any write
3. **Optimistic Check**: All 25 pass the `>= 100` check (since they read 99)
4. **Non-Atomic Write**: All 25 execute `allocated_units + 1` independently
5. **Result**: Database ends up with 124+ allocations for a 100-unit SKU

_Note: This is a realistic race condition pattern seen in production systems without proper locking._

### 5.2. The "Safe" Path (DO)

_Designed to Succeed via Serialization._

**Implementation**:

```typescript
class InventoryDO {
  state: InventoryState;
  ctx: DurableObjectState;
  sessions: WebSocket[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.state = {
      id: "", // Set during first fetch
      totalStock: 100,
      allocations: new Set(),
      sessions: [],
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize state from storage on first access
    if (!this.state.id) {
      await this.initializeState();
    }

    // Handle allocation request
    if (request.method === "POST") {
      const { userId } = await request.json();
      return this.handleAllocation(userId);
    }

    // Handle reset
    if (request.method === "DELETE") {
      return this.handleReset();
    }

    // WebSocket upgrade handled in Section 4.2
    // ...
  }

  async initializeState() {
    const stored = await this.ctx.storage.get<{
      id: string;
      allocations: string[];
    }>("state");

    if (stored) {
      this.state.id = stored.id;
      this.state.allocations = new Set(stored.allocations || []);
    } else {
      // Extract SKU ID from DO name
      this.state.id = this.ctx.id.name || "unknown";
    }
  }

  async handleAllocation(userId: string): Promise<Response> {
    try {
      // Step 1: Atomic check (implicit serialization via DO's single-threaded model)
      if (this.state.allocations.size >= this.state.totalStock) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "OUT_OF_STOCK",
            message: "SKU is out of stock",
            availableUnits: 0,
          }),
          { status: 409 },
        );
      }

      // Step 2: Prevent duplicate allocations
      if (this.state.allocations.has(userId)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "ALREADY_ALLOCATED",
            message: "User already has an allocation",
            availableUnits: this.state.totalStock - this.state.allocations.size,
          }),
          { status: 409 },
        );
      }

      // Step 3: Update in-memory state
      this.state.allocations.add(userId);

      // Step 4: Persist atomically (with rollback on failure)
      try {
        await this.ctx.storage.put("state", {
          id: this.state.id,
          allocations: Array.from(this.state.allocations),
        });
      } catch (storageErr) {
        // Rollback in-memory state
        this.state.allocations.delete(userId);
        throw new Error("STORAGE_FAILURE: " + storageErr.message);
      }

      // Step 5: Broadcast to WebSockets
      this.broadcast({
        type: "UPDATE",
        skuId: this.state.id,
        availableUnits: this.state.totalStock - this.state.allocations.size,
        allocatedUnits: this.state.allocations.size,
        allocations: Array.from(this.state.allocations),
      });

      // Step 6: Schedule cleanup alarm (refresh on each allocation)
      await this.ctx.storage.setAlarm(Date.now() + 60000); // 60s from now

      return new Response(
        JSON.stringify({
          success: true,
          message: "Allocation confirmed",
          availableUnits: this.state.totalStock - this.state.allocations.size,
          totalAllocated: this.state.allocations.size,
        }),
      );
    } catch (err) {
      console.error("Safe allocation error:", err);
      return new Response(
        JSON.stringify({
          success: false,
          error: "INTERNAL_ERROR",
          message: err.message,
        }),
        { status: 500 },
      );
    }
  }

  async handleReset(): Promise<Response> {
    this.state.allocations.clear();
    await this.ctx.storage.deleteAll();

    this.broadcast({
      type: "RESET",
      skuId: this.state.id,
    });

    return new Response(JSON.stringify({ success: true }));
  }
}
```

**Why This Prevents Overallocation**:

1. **Serialization**: Durable Objects process requests sequentially (single-threaded)
2. **Atomic Check-and-Set**: The check and update happen in the same turn
3. **Persistence**: Storage is updated before responding
4. **Error Handling**: Rollback on storage failure
5. **Result**: Exactly the available stock allocated, requests beyond are rejected

### 5.3. Hoarding Prevention (Smart Timeout)

**Mandatory for Replayability.**

**Implementation** (Durable Object):

```typescript
class InventoryDO {
  // ... existing code

  async alarm() {
    // Only reset if no active WebSocket connections
    // This prevents wiping state while users are viewing results
    if (this.sessions.length === 0) {
      console.log(`[${this.state.id}] Alarm fired: Cleaning up stale state`);
      this.state.allocations.clear();
      await this.ctx.storage.deleteAll();
    } else {
      console.log(
        `[${this.state.id}] Alarm fired: ${this.sessions.length} active sessions, rescheduling`,
      );
      // Reschedule for another 60 seconds
      await this.ctx.storage.setAlarm(Date.now() + 60000);
    }
  }
}
```

**Benefits**:

1. **Automatic Cleanup**: State is reset after 60s of inactivity
2. **No Interruption**: Active viewers aren't disrupted
3. **Resource Efficiency**: Prevents zombie DO instances
4. **Replayability**: Demo can be re-run without manual reset

### 5.4 High-Scale Architecture (Sharding)

To surpass the 1,000 RPS limit per DO instance, we implement **Inventory Sharding**.

```typescript
// Sharding Logic (Conceptual)
function getShardId(skuId: string, shardCount: number = 10): string {
  // Random, Round-Robin, or Hash-based routing
  const shardIndex = Math.floor(Math.random() * shardCount);
  return `${skuId}-shard-${shardIndex}`;
}

// In Worker Router
const shardId = getShardId(skuId);
const stub = env.INVENTORY_NS.get(env.INVENTORY_NS.idFromName(shardId));
```

This linearizes scalablity: 10 shards = 10,000 RPS.

### 5.5 Revenue Protected Metric (The "Money Shot")

We track not just "Overallocated Count" but actual **Financial Impact**.

```typescript
const REVENUE_PER_UNIT = 150; // $150 ticket
const PROCESSING_COST = 50; // $50 refund processing cost

const revenueProtected = (overallocatedCount) => {
  return overallocatedCount * PROCESSING_COST;
};
```

This metric is displayed prominently in the dashboard ticker.

---

## 6. Infrastructure & Configuration

### 6.1. Database Migrations

**Migration File**: `migrations/0001_create_schema.sql`

```sql
-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  allocated_units INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 100
);

-- Create allocations table (no uniqueness constraint = intentional vulnerability)
CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sku_id) REFERENCES inventory(id)
);

-- Seed initial data
INSERT OR IGNORE INTO inventory (id, allocated_units, total_stock) VALUES
  ('sku-001', 0, 100),
  ('sku-002', 0, 100),
  ('sku-003', 0, 100),
  ('sku-004', 0, 100),
  ('sku-005', 0, 100);
```

**Run Migration**:

```bash
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql
```

### 6.2. `wrangler.jsonc` Configuration

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "revenue-guard",
  "main": "src/index.ts",
  "compatibility_date": "2024-04-05",
  "compatibility_flags": ["nodejs_compat"],

  "durable_objects": {
    "bindings": [{ "name": "INVENTORY_NS", "class_name": "InventoryDO" }],
  },

  "d1_databases": [
    {
      "binding": "REVENUE_DB",
      "database_name": "revenue-guard-db",
      "database_id": "TBD_AFTER_CREATION",
    },
  ],

  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["InventoryDO"],
    },
  ],

  "vars": {
    "RACE_DELAY_MS": "200",
  },
}
```

**Setup Commands**:

```bash
# Create D1 database
wrangler d1 create revenue-guard-db
# Copy the database_id from output to wrangler.jsonc

# Run migrations
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql
```

### 6.3. CORS Configuration

**Required for Dev Mode** (Vite on 5173, Wrangler on 8787):

```typescript
// src/index.ts - Add CORS headers
function corsHeaders(origin: string = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ... your logic

    // Add CORS to all responses
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  },
};
```

---

## 7. Architecture Decision Records (ADRs)

> **Purpose**: Document the critical fork-in-the-road decisions and their trade-offs. This captures organizational knowledge and prevents revisiting decisions.

### ADR-001: Why Durable Objects instead of Workers + External Coordination?

**Status**: ACCEPTED  
**Date**: 2026-02-04

**Context**:

- Need strong consistency for preventing overallocation (no double-allocations allowed)
- Distributed systems typically require external consensus mechanisms (Zookeeper, Redis, Consul)
- Cloudflare offers Durable Objects as a first-party alternative
- Teams unfamiliar with distributed systems often resort to "eventual consistency with hope"

**Decision**:
Use Durable Objects for the "Safe" path, not external coordination or KV-based eventual consistency.

**Consequences**:

✅ **Positive**:

- Guaranteed atomicity via single-threaded serialization (no compare-and-swap needed)
- Zero operational complexity (no external service to manage)
- Cloudflare-managed replication for durability
- Latency: ~50-200ms (acceptable for allocation API)
- Cost: Negligible for this demo scale

❌ **Negative**:

- Throughput bottleneck: ~1000 requests/second max per DO instance
  - Mitigation: Shard by SKU ID (24 instances = 24,000 req/s capacity)
- Learning curve: Team must understand DO single-threaded model
- Cloudflare lock-in: API not available on other platforms
- Latency: 50-200ms vs 5ms direct database access (trade-off for correctness)

**Alternatives Considered**:

1. **Pure KV with eventual consistency**: Simpler, but doesn't prevent overallocation
2. **Workers + Redis**: Strong consistency, but adds external dependency
3. **D1 with database locks**: Possible, but SQL locking is database-specific and complex

---

### ADR-002: Why D1 (SQLite) for Unsafe Path Instead of KV?

**Status**: ACCEPTED  
**Date**: 2026-02-04

**Context**:

- Need to demonstrate realistic production failure pattern
- Most race conditions in production occur in SQL-based systems
- KV is fundamentally eventual consistent (by design)
- D1 was chosen to match real-world SQL failures developers encounter

**Decision**:
Use D1 with explicit non-atomic read-check-write pattern for the "Unsafe" path.

**Consequences**:

✅ **Positive**:

- Realistic (matches actual production bugs in Rails, Django, Node.js e-commerce apps)
- Educational (demonstrates TOCTOU: Time-of-Check to Time-of-Use race)
- Illustrates SQL-specific problems (no atomic compare-and-swap)
- Developers recognize the pattern from their own code

❌ **Negative**:

- Could use KV instead (simpler, also shows race condition)
- Adds another Cloudflare binding (complexity)
- SQL-specific (doesn't generalize to all databases)
- Intentional vulnerability (must add comments preventing future "fixes")

**Alternatives Considered**:

1. **KV with optimistic locking**: Simpler, but less realistic to actual production failures
2. **Memory-based counter**: Fast, but unrealistic (no persistence)
3. **PostgreSQL**: More realistic, but not available in Cloudflare

---

### ADR-003: Why WebSocket Hibernation API?

**Status**: ACCEPTED  
**Date**: 2026-02-04

**Context**:

- Need to keep demo running for 20+ concurrent viewers without draining resources
- Traditional WebSocket: each connection consumes CPU, memory (costs $$)
- Demo runs frequently (sales demos, customer onboarding)
- Alternative: traditional heartbeat + cleanup (complex, error-prone)

**Decision**:
Use WebSocket Hibernation API with DO alarm-based cleanup.

**Consequences**:

✅ **Positive**:

- Near-zero cost for idle connections (suspended, not running)
- Automatic cleanup after 60s (prevents zombie DO instances)
- Cloudflare-managed (no custom timeout logic needed)
- Scales to 1000+ concurrent connections per DO instance

❌ **Negative**:

- Requires understanding Hibernation API (new for most engineers)
- Cloudflare-specific feature (not portable to other platforms)
- Debugging hibernated connections is non-obvious
- Must disable hibernation during local development (wrangler limitation)

**Alternatives Considered**:

1. **Traditional heartbeat + server cleanup**: Works, but complex to maintain
2. **Hard timeout on connection**: Simple, but abruptly disconnects users
3. **No cleanup (zombie instances)**: Cheap, but pollutes operational state

---

### ADR-004: Why Zero Authentication for the Demo?

**Status**: ACCEPTED (with caveats)  
**Date**: 2026-02-04

**Context**:

- Demo is for internal sales & educational use only
- Adding OAuth2/OIDC adds 40% complexity (credential management, token refresh, RBAC)
- Goal is to teach race conditions, not authentication
- Anyone resetting the demo is a feature, not a bug (enables rapid re-runs)

**Decision**:
Implement zero authentication (anyone can allocate/reset without credentials).

**Consequences**:

✅ **Positive**:

- Minimal complexity (pure demo focus)
- Instant access (no login friction during sales presentations)
- Rapid replay (no need to log in again between runs)
- Easier onboarding for first-time users

❌ **Negative**:

- Not suitable for production use (security issue)
- No audit trail (can't track who reset the demo)
- No RBAC (can't give viewers read-only access)
- Potential for accidental resets by curious users

**Mitigation for Production**:

- Implement OAuth2 via Auth0 or Okta
- Add role-based access (["demo", "presenter", "admin"])
- Log all resets with timestamps and user IDs
- Use Cloudflare Workers KV for rate-limiting reset endpoint

---

## 8. FinOps: Cost & Resource Analysis

### 8.1. Detailed Cost Breakdown

**Assumptions**:

- Light demo usage (40-50 runs per month)
- Each run: 1 simulation with 100 concurrent requests across SKUs
- 5 concurrent viewers per run (watching WebSocket updates)
- Audience: Sales demos, customer onboarding, internal presentations

**Monthly Cost Estimate**:

#### Durable Objects

- **Pricing**: $0.15 per million requests
- **Usage**: 24 instances × 100 requests/month = 2,400 requests/month
- **Cost**: (2,400 / 1,000,000) × $0.15 = **$0.00036 / month** ✓ Negligible

#### D1 Database

- **Pricing**: $0.25 per million database operations
- **Usage**: ~300 queries per demo × 40 demos = 12,000 ops/month
  - SELECT allocated_units: 100 ops
  - UPDATE allocated_units: 100 ops
  - INSERT allocations: 100 ops
  - Reset (DELETE + UPDATE): 24 ops per reset
- **Cost**: (12,000 / 1,000,000) × $0.25 = **$0.003 / month** ✓ Negligible

#### Workers Requests

- **Pricing**: Free tier includes 100,000 requests/day (3M/month)
- **Usage**: (40 demos × 25 requests) + (5 viewers × 30min × 10 msgs/sec × 2592000sec) = 1K + ~360K = ~361K ops/month
- **Cost**: FREE (well under limit) ✓

#### Bandwidth

- **Pricing**: Free tier includes 1 TB egress/month
- **Usage**:
  - HTTP responses: 40 demos × 50KB = 2MB
  - WebSocket messages: 5 connections × 30min × 10KB/min = 1.5MB
  - Total: ~3.5MB
- **Cost**: FREE (well under limit) ✓

#### **TOTAL ESTIMATED MONTHLY COST: $0.0003** (less than one penny)

### 8.2. Cost Controls & Monitoring

**Prevent Runaway Costs**:

```markdown
1. **Rate Limiting**:
   - /api/reset: Max 1 per minute per IP (prevent accidental spam)
   - /api/allocate: Max 100 per minute per IP (normal allocations)
   - /api/simulate-rush: Max 10 per minute per IP (prevent load testing)

2. **Connection Limits**:
   - WebSocket connections: 1000 per DO instance
   - Session timeout: 1 hour (force reconnect for stale connections)
   - Max active demos: 5 concurrent (warn at 4, block at 5)

3. **Database Quotas**:
   - D1 row limit: Monitor at 1M rows, alert at 800K rows
   - Table cleanup: Auto-delete allocations older than 30 days
   - Backup: Daily snapshot to external storage

4. **Monitoring**:
   - Alert if error rate > 1% for 2 minutes
   - Alert if DO crashes > 3 times per day
   - Alert if D1 quota > 80%
   - Daily cost report (automated)
```

### 8.3. Scaling Scenarios

**Scenario 1: Heavy Demo Usage (500 demos/month)**

- Monthly cost: ~$0.03 (still negligible)
- Bottleneck: DO throughput (1000 req/s per instance)
- Solution: Shard to 24 DO instances (already designed)

**Scenario 2: Customer Self-Service (1000+ concurrent viewers)**

- Monthly cost: ~$0.10
- Bottleneck: WebSocket connections per DO (1000 limit)
- Solution: Deploy to 5 regions, shard viewers by geography

**Scenario 3: High-Frequency Load Testing (10,000 reqs/month)**

- Monthly cost: ~$0.015
- Bottleneck: D1 disk space (not request limit)
- Solution: Implement hourly cleanup, use separate D1 instance

### 8.4. Cost vs. Alternative Approaches

| Approach                  | Cost/Month | Consistency | Latency  | Operational Burden   |
| ------------------------- | ---------- | ----------- | -------- | -------------------- |
| **Current (DO + D1)**     | $0.003     | Strong      | 50-200ms | None (fully managed) |
| KV + eventual consistency | $0.0001    | Weak        | 5ms      | None                 |
| Workers + Redis           | $0.50+     | Strong      | 50ms     | Redis ops overhead   |
| EC2 + PostgreSQL          | $50+       | Strong      | 10ms     | Full ops team        |
| Managed PostgreSQL        | $20+       | Strong      | 10ms     | Credential mgmt      |

**Conclusion**: Durable Objects provide the best cost-to-consistency ratio for this use case.

---

## 9. Migration & Transition Plan

### 9.1. Current State → Target State

**CURRENT STATE** (Pre-Deployment):

- No database
- No Durable Objects
- No Worker code
- No demo infrastructure

**TRANSITION PHASE** (Deploy):

1. Create D1 database
2. Run migrations (create schema)
3. Deploy Worker code
4. Initialize DO bindings
5. Seed 24 SKU records

**TARGET STATE** (Post-Deployment):

- ✓ Worker running on Cloudflare edge
- ✓ D1 database with 24 SKUs seeded
- ✓ 24 DO instances ready for requests
- ✓ WebSocket route configured
- ✓ Demo accessible at `https://revenue-guard.*.workers.dev`

### 9.2. Pre-Deployment Checklist

```markdown
- [ ] npm install && npm run build succeeds
- [ ] npm run lint has no errors
- [ ] npm run test passes all test cases
- [ ] wrangler.jsonc has correct schema
- [ ] D1 database_id populated in wrangler.jsonc
- [ ] RACE_DELAY_MS set to 200ms (or acceptable value)
- [ ] CORS headers configured for dev (localhost:5173)
- [ ] SSL certificate valid (automatic via CF)
- [ ] Environment variables set in wrangler.toml
- [ ] GitHub Actions workflow passing
- [ ] Staging deployment successful
- [ ] Production rollback plan documented
```

### 9.3. Data Migration Strategy

**Step 1: Create Database**

```bash
wrangler d1 create revenue-guard-db
# Copy database_id from output to wrangler.jsonc
```

**Step 2: Run Migrations**

```bash
# Local testing
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql

# Production
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql
```

**Step 3: Verify Seeding**

```bash
wrangler d1 execute revenue-guard-db --remote --command "SELECT * FROM inventory"
# Expected output: 24 rows (SKU-001, SKU-002, ...)
```

### 9.4. Rollback Procedures

**If Worker Code Has Bugs**:

```bash
# Immediate: Revert to previous version
git revert <current-commit>
wrangler deploy
# Estimated RTO: 2 minutes
```

**If D1 Data is Corrupted**:

```bash
# Option 1: Use /api/reset endpoint
curl -X POST https://revenue-guard.*.workers.dev/api/reset

# Option 2: Restore from snapshot
wrangler d1 execute revenue-guard-db --remote --file=backups/snapshot-2026-02-04.sql

# Estimated RTO: 5 minutes
```

**If Durable Object is Stuck**:

```bash
# DO auto-restarts on next request
# Or force deletion:
wrangler d1 execute revenue-guard-db --remote --command "DELETE FROM allocations"
# Estimated RTO: 30 seconds (CF handles auto-restart)
```

---

## 10. Non-Functional Requirements (The -ilities)

### 10.1. Scalability Analysis

**Primary Bottleneck**: WebSocket connections per Durable Object instance

- Cloudflare limit: ~1000 concurrent connections per DO
- Current design: 5 DO instances (one per class)
- **Safe capacity**: 5,000 concurrent viewers

**Secondary Bottleneck**: D1 database throughput

- SQLite is single-writer (but very fast)
- Estimated capacity: 10,000 writes/second (not a practical limit here)

**Scaling Strategy for 10,000 Concurrent Viewers**:

1. Deploy 2 Worker instances (different regions)
2. Each manages different set of classes
3. Total capacity: 10,000 viewers × 1000 = unlimited growth
4. No cross-region sync needed (independent demos)

### 10.2. Reliability Targets

**MTTR/MTBF Goals**:

- **MTTR** (Mean Time To Repair): < 5 minutes
- **MTBF** (Mean Time Between Failures): > 720 hours (30 days)
- **Target Availability**: 99.5% (allowing ~3.6 hours downtime/month)

**Failover Mechanisms**:

- **DO instance crash**: Auto-restart by Cloudflare (RTO: ~30 seconds)
- **D1 database failure**: Restore from latest snapshot (RTO: ~5 minutes)
- **Network partition**: Requests fail gracefully, user retries (idempotent booking API)
- **WebSocket disconnect**: Client auto-reconnects with exponential backoff

### 10.3. Observability & SLOs

**Structured Logging** (JSON format with all requests):

```json
{
  "timestamp": "2026-02-04T10:30:00Z",
  "request_id": "abc123xyz",
  "level": "INFO",
  "component": "InventoryDO",
  "message": "Booking confirmed",
  "duration_ms": 45,
  "metadata": {
    "class_id": "phone-16-pro",
    "user_id": "sim-user-x",
    "allocated_units": 15,
    "available_units": 85,
    "mode": "safe"
  }
}
```

**SLI/SLO Targets**:

| Service Level Indicator      | Target  | Measurement                 | Alert Threshold   |
| ---------------------------- | ------- | --------------------------- | ----------------- |
| API latency (p99)            | < 500ms | Per /api/book request       | > 800ms for 2 min |
| DO availability              | 99.5%   | Uptime / total time         | < 99% for 1 hour  |
| Booking success rate         | > 99%   | Successful / total attempts | < 98% for 2 min   |
| WebSocket connection success | 99%     | Connected / total attempts  | < 97% for 2 min   |
| Error rate (5xx)             | < 1%    | 5xx responses / total       | > 2% for 2 min    |

**Monitoring Stack**:

- Log aggregation: `wrangler tail --follow` (development)
- Distributed tracing: OpenTelemetry (future enhancement)
- Metrics: Prometheus-compatible /metrics endpoint (future)
- Alerting: PagerDuty (critical errors only)

---

## 11. Security & Threat Modeling

### 11.1. Threat Model Matrix

| Threat ID | Threat                 | Attack Vector                         | Probability | Impact   | Severity    | Mitigation                                     | Status        |
| --------- | ---------------------- | ------------------------------------- | ----------- | -------- | ----------- | ---------------------------------------------- | ------------- |
| **T1**    | DoS via reset spam     | Attacker calls `/api/reset` 1000x/sec | Medium      | High     | 🔴 CRITICAL | Rate-limit: 1 reset/min per IP                 | ❌ TODO       |
| **T2**    | Duplicate allocations  | Forge userID in POST /api/allocate    | Low         | Medium   | 🟠 HIGH     | Validate userID format (UUID v4), dedupe at DO | ✅ Protected  |
| **T3**    | WebSocket hijacking    | MITM intercepts WS upgrade            | Low         | Medium   | 🟠 HIGH     | Use WSS (HTTPS only), Cloudflare mTLS          | ✅ Protected  |
| **T4**    | API enumeration        | Brute-force valid classIDs            | Medium      | Low      | 🟡 MEDIUM   | No mitigation (open demo), document acceptable | ⚠️ Acceptable |
| **T5**    | SQL injection          | Attacker submits `"; DROP TABLE;--"`  | Very Low    | Critical | 🔴 CRITICAL | Parameterized queries (prepared statements)    | ✅ Protected  |
| **T6**    | Storage race condition | Concurrent storage.put calls          | Very Low    | Critical | 🔴 CRITICAL | DO serialization prevents concurrent execution | ✅ Protected  |

### 11.2. Encryption Strategy

**HTTPS/TLS** (In Transit):

- ✅ All traffic encrypted (TLS 1.3 via Cloudflare)
- ✅ No plaintext HTTP allowed
- ✅ HSTS headers enabled (force HTTPS)

**Storage at Rest**:

- ✅ DO storage encrypted with Cloudflare's default key
- ✅ D1 database encrypted by Cloudflare
- ⚠️ Future: Customer-managed encryption keys (CMK)

**API Keys/Secrets**:

- ✓ No API keys required (zero-auth demo)
- ✓ D1 credentials managed by Cloudflare IAM
- Future: If adding external integrations, store in Cloudflare Secrets

### 11.3. Rate Limiting & DDoS Protection

**Cloudflare Edge Protection** (Always-on):

- ✅ L3/L4 DDoS mitigation (automatic)
- ✅ WAF rules for common attacks (SQL injection, XSS)
- ✅ IP reputation filtering

**Application-Level Rate Limiting**:

```
POST /api/book:        100 req/min per IP
POST /api/reset:       1 req/min per IP (prevent spam)
POST /api/simulate-rush: 10 req/min per IP (prevent load testing)
GET /api/state:        1000 req/min per IP (allow polling)
```

---

## 12. Risk Assessment & Mitigation Matrix

### 12.1. Risk Scoring (Probability × Impact)

**Risk Matrix**:

```
IMPACT
↑
│ HIGH │      R4 (Data Loss)    R1 (Total Outage)
│      │      R6 (Virus)        R7 (Breach)
│ MED  │   R2 (Performance)     R3 (Availability)
│      │   R5 (Memory Leak)
│ LOW  │  R8 (UI Bug)           R9 (Typo)
│      │
└──────┴─────────────────────────────────────
       LOW        MED        HIGH
       PROBABILITY
```

### 12.2. Detailed Risk Register

| Risk ID | Risk                                       | Probability | Impact                     | Score        | Mitigation                                          | Owner    | Due Date   |
| ------- | ------------------------------------------ | ----------- | -------------------------- | ------------ | --------------------------------------------------- | -------- | ---------- |
| **R1**  | DO instance crashes repeatedly             | 5%          | High (demo unavailable)    | **HIGH**     | Auto-restart by CF, alert on 5+ crashes/day         | SRE      | 2026-02-10 |
| **R2**  | D1 quota exceeded                          | 1%          | Medium (reset fails)       | **MEDIUM**   | Monitor quota, alert at 80%, cleanup job            | Database | 2026-02-15 |
| **R3**  | WebSocket disconnect storms                | 10%         | Low (user refreshes)       | **LOW**      | Auto-reconnect with backoff, logging                | Frontend | 2026-02-20 |
| **R4**  | Security breach (SQL injection)            | <0.1%       | Critical (data loss)       | **CRITICAL** | Parameterized queries, WAF, code review             | Security | 2026-02-07 |
| **R5**  | Memory leak in DO                          | 2%          | Medium (OOM after days)    | **MEDIUM**   | Implement cleanup alarms, test with loadgen         | Backend  | 2026-02-25 |
| **R6**  | Cloudflare API deprecation                 | 5%          | High (refactor needed)     | **HIGH**     | Monitor CF changelog, maintain vendor relationships | Arch     | Ongoing    |
| **R7**  | Unauthorized API access                    | 15%         | Low (open demo acceptable) | **LOW**      | Rate limiting, IP whitelisting for prod             | Security | 2026-02-28 |
| **R8**  | User education gap (don't understand demo) | 20%         | Low (just explain again)   | **LOW**      | Improve tooltips, add video guide                   | Product  | 2026-03-15 |
| **R9**  | Browser compatibility issue                | 10%         | Low (works on fallback)    | **LOW**      | Test on Chrome, Firefox, Safari monthly             | QA       | Ongoing    |

### 12.3. Intentional Technical Debt

| Item                             | Reason                 | Payoff Date                | Risk                             |
| -------------------------------- | ---------------------- | -------------------------- | -------------------------------- |
| **Fixed capacity (100 units)**   | Simplicity for demo    | Post-launch (v2)           | Won't scale to dynamic inventory |
| **No authentication**            | Open demo, fast access | Before monetization        | Not suitable for sensitive data  |
| **No audit log**                 | Ephemeral demo state   | Before handling PII        | Can't investigate incidents      |
| **Hardcoded race delay (200ms)** | Reproducibility        | Enhancement (nice-to-have) | Doesn't test variable latency    |
| **No persistent storage**        | Cost optimization      | Post-launch (v2)           | Results disappear after 60s      |

---

## 13. Cross-Team Dependencies

### 13.1. Dependencies Matrix

| Dependency                    | Owner     | Type       | Timeline | Blocking | Status      |
| ----------------------------- | --------- | ---------- | -------- | -------- | ----------- |
| **CF Account Setup**          | DevOps    | Infra      | Week 1   | YES      | Not started |
| **D1 Database Creation**      | DevOps    | Infra      | Week 1   | YES      | Not started |
| **Worker Deployment Creds**   | DevOps    | Infra      | Week 1   | YES      | Not started |
| **DNS Configuration**         | DevOps    | Infra      | Week 2   | NO       | Not started |
| **Security Threat Review**    | Security  | Governance | Week 1   | YES      | Not started |
| **WAF Rule Approval**         | Security  | Governance | Week 2   | NO       | Not started |
| **Demo Script & Messaging**   | Marketing | Content    | Week 1   | YES      | Not started |
| **Sales Enablement Training** | Sales     | Training   | Week 2   | YES      | Not started |
| **Analytics Event Schema**    | Analytics | Data       | Week 1   | NO       | Not started |
| **Dashboard Creation**        | Analytics | Data       | Week 2   | NO       | Not started |

### 13.2. Dependency Blocking Tree

```
LAUNCH (Week 2)
├─ Week 1 Critical
│  ├─ DevOps: CF account + D1 setup
│  │  └─ Blocks: Worker deployment
│  ├─ Security: Threat model review
│  │  └─ Blocks: Launch approval
│  └─ Marketing: Demo script
│     └─ Blocks: Sales training
│
└─ Week 2 Execution
   ├─ Backend: Integration testing
   ├─ Frontend: Final QA
   ├─ Sales: Team training
   └─ Launch!
```

### 13.3. RACI Matrix (Responsible, Accountable, Consulted, Informed)

| Activity              | Backend | Frontend | DevOps  | Security | Marketing | Sales | Analytics |
| --------------------- | ------- | -------- | ------- | -------- | --------- | ----- | --------- |
| Design Architecture   | **R**   | C        | C       | C        | I         | I     | I         |
| Implement Backend     | **R/A** | -        | C       | C        | -         | -     | -         |
| Implement Frontend    | -       | **R/A**  | -       | -        | C         | -     | -         |
| Deploy Infrastructure | -       | -        | **R/A** | C        | -         | -     | -         |
| Security Review       | C       | C        | **R**   | **A**    | -         | -     | -         |
| Create Demo Script    | C       | C        | -       | -        | **R/A**   | C     | -         |
| Sales Training        | I       | I        | -       | -        | **R**     | **A** | -         |
| Launch Demo           | **A**   | **A**    | **R**   | **A**    | I         | I     | C         |

---

## 14. Deployment & Operational Plan (Day 2)

### 14.1. CI/CD Pipeline

**GitHub Actions Workflow** (`deploy.yml`):

```yaml
name: Deploy Revenue Guard
on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint
      - run: bun run test
      - run: bun run type-check

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      - run: echo "✅ Deployed to production"
```

### 14.2. Operational Runbook

#### **Issue: DO instance crashes repeatedly**

```
Symptom: Users can't book, wrangler tail shows durable_object_error
Root causes: Memory leak, infinite loop, storage corruption

Resolution:
  1. Check recent commits: git log --oneline -10
  2. Check logs: wrangler tail --format pretty
  3. Force restart: Calls to DO trigger auto-restart
  4. If persists: Delete DO instance (CF will recreate on next request)
     wrangler do delete <instance-id>
  5. Reset state: POST /api/reset

Escalation: Page on-call SRE if >5 crashes/day
Prevention: Monitor crash rate hourly, alert at >2/hour
```

#### **Issue: D1 database quota exceeded**

```
Symptom: Error "database quota exceeded" in /api/book responses
Root causes: Too many allocations (> quota), large transaction log

Resolution:
  1. Check quota: wrangler d1 info revenue-guard-db
  2. Clear old data: DELETE FROM allocations WHERE created_at < (now - 30 days)
  3. Run VACUUM: VACUUM
  4. Upgrade plan if needed: Contact Cloudflare sales

Prevention: Monitor usage hourly, alert at 80% quota
Alternative: Implement hourly cleanup job
```

#### **Issue: WebSocket connections dropping**

```
Symptom: Users see "Connection lost" message, need to refresh
Root causes: Network timeout, DO hibernation waking badly, client crash

Resolution:
  1. Check network tab in DevTools
  2. Check browser console for errors
  3. Client auto-reconnects (should be transparent)
  4. If persists: Clear browser cache, hard refresh (Ctrl+Shift+R)

Prevention: Monitor WebSocket error rate, alert if >1%
Logs: wrangler tail --format pretty | grep WebSocket
```

#### **Issue: High latency (>1 second)**

```
Symptom: POST /api/book taking 1-2 seconds
Root causes: DO under load, D1 slow query, network congestion

Resolution:
  1. Check concurrent allocations: wrangler tail | grep "allocatedUnits"
  2. Monitor DO CPU: Cloudflare dashboard
  3. Profile D1 query: Check slow query log
  4. Shard more DO instances if needed

Prevention: Set alert if p99 latency > 500ms for >2 minutes
Metrics: Collect latency histogram, review monthly
```

### 14.3. Database Migration Strategy During Deployment

**Safe Migration Pattern** (zero downtime):

**Example: Adding a new field**

1. Create migration: `ALTER TABLE allocations ADD COLUMN source TEXT`
2. Deploy migration (new field is NULL for existing rows)
3. Deploy code that reads/writes new field (handles NULL gracefully)
4. No downtime, no blocking calls ✓

**Example: Removing a field (dangerous)**

1. ❌ DON'T: Delete column in one step (old code breaks)
2. ✓ DO: Step 1 - Deploy code that ignores the field
3. ✓ DO: Step 2 - Wait 24 hours for all requests to use new code
4. ✓ DO: Step 3 - Deploy migration that deletes field
5. Zero downtime, safe rollback ✓

### 14.4. Alerting & Incident Response

**Alert Rules** (in Datadog or PagerDuty):

```
🔴 CRITICAL (Page on-call):
  - Error rate > 5% for 2+ minutes
  - Latency p99 > 2 seconds for 5+ minutes
  - DO crash count > 5 in 1 hour
  - D1 quota > 90%

🟠 WARNING (Slack #incidents):
  - Error rate > 1% for 5+ minutes
  - Latency p99 > 500ms for 5+ minutes
  - WebSocket disconnect rate > 5%
  - DO memory usage > 70%

🟡 INFO (Auto-escalate):
  - DO instance restarted
  - WebSocket timeout
  - Cache miss spike
```

**Incident Response SOP**:

1. Alert received → Acknowledge in PagerDuty
2. Assess severity (is demo down? Is data corrupted?)
3. Implement immediate mitigation (restart, rollback, reset)
4. Root cause analysis (review logs, commit history)
5. Implement permanent fix (code change, config update)
6. Post-mortem (document lessons learned)

---

## 15. Client Simulation Logic

### 7.1. The "Trigger" Flow

1.  **User Click**: "Start Flash Sale" button in UI
2.  **Request**: `POST /api/simulate-rush` with `{ skuId, mode, count: 100 }`
3.  **Server Processing**: Worker spawns 100 concurrent allocation attempts
4.  **Visuals**:
    - **Safe Mode**:
      - WebSocket receives `UPDATE` messages as DO processes requests sequentially
      - Units fill one-by-one (smooth, controlled)
      - Exactly the specified stock (e.g. 100) succeed, others are rejected
    - **Unsafe Mode**:
      - All 100 requests return `200 OK` (race condition allows all through)
      - UI polls `GET /api/state` after 1s
      - Database shows `allocated_units: 125` (overallocation proven for 100-unit stock)
      - Visual: 100 green units + 25 red "OVERFLOW" indicators
5.  **The Reveal**: Side-by-side comparison shows DO correctness vs D1 race condition

### 7.2. Expected Outcomes

| Mode   | Concurrent Requests | Successful Allocations | Database State | Result           |
| ------ | ------------------- | ---------------------- | -------------- | ---------------- |
| Safe   | 125                 | 100                    | 100 records    | ✅ Correct       |
| Unsafe | 125                 | 125                    | 125 records    | ❌ Overallocated |

### 7.3. Educational UI Requirements

> [!IMPORTANT]
> **Design Goal**: The POC is an educational tool. Every critical state transition must include real-time explanations that teach customers about distributed systems concepts.

#### A. The "Explainer Panel"

**Location**: Fixed panel on the right side of the screen (or collapsible overlay).

**Purpose**: Provides live narration of what's happening during each phase of the simulation.

**Content Structure**:

```typescript
interface ExplainerState {
  phase: "idle" | "preparing" | "racing" | "resolving" | "complete";
  title: string;
  description: string;
  technicalDetail?: string;
  visualization?: "concurrent-reads" | "write-collision" | "serialization";
}
```

**Example Messages by Phase**:

```typescript
  idle: {
    title: "Ready to Simulate",
    description:
      "Click 'Impact Load' to spawn concurrent allocation requests.",
    technicalDetail:
      "This simulates real-world traffic spikes (e.g., flash sales, ticket drops, inventory releases).",
  },

  preparing: {
    title: "Spawning Concurrent Requests",
    description:
      "Multiple users are simultaneously attempting to allocate the same 100-unit SKU.",
    technicalDetail:
      "All requests start at the exact same millisecond to maximize race condition window.",
  },

  racing_unsafe: {
    title: "⚠️ Race Condition in Progress",
    description: "Multiple requests read 'allocated_units = 99' at the same time.",
    technicalDetail:
      "200ms delay ensures concurrent reads complete before any writes. No atomic compare-and-swap protection.",
    visualization: "concurrent-reads",
  },

  racing_safe: {
    title: "✅ Serialization Active",
    description: "Durable Object processes requests one-by-one in FIFO order.",
    technicalDetail:
      "Single-threaded execution model guarantees atomic check-and-set operations.",
    visualization: "serialization",
  },

  resolving_unsafe: {
    title: "❌ Overallocation Detected",
    description:
      "More requests passed the capacity check than there was available stock.",
    technicalDetail:
      "Result: 125 allocations for 100 units. This is data corruption.",
  },

  resolving_safe: {
    title: "✅ Capacity Enforced",
    description: "Exactly 100 allocations succeeded. Excess requests were rejected.",
    technicalDetail:
      "DO's serialization prevented any race condition from occurring.",
  },

  complete: {
    title: "Simulation Complete",
    description: "Compare the results side-by-side to see the difference.",
    technicalDetail: "Unsafe: Inventory oversold. Safe: Perfect consistency.",
  },
};
```

#### B. Visual Annotations on Inventory Grid

**Seat States with Explanations**:

1. **Empty Unit** (Default)
   - Visual: Dashed border, low opacity
   - Tooltip: `"Available - No allocations yet"`

2. **Reading State** (Unsafe Mode Only)
   - Visual: Pulsing cyan border
   - Tooltip: `"Request reading current count: ${count}"`
   - Label: `READ: ${count}`

3. **Pending Write** (Unsafe Mode Only)
   - Visual: Yellow glow
   - Tooltip: `"Writing new count: ${count + 1}"`
   - Label: `WRITE: ${count + 1}`

4. **Allocated (Safe)**
   - Visual: Solid green fill
   - Tooltip: `"Allocated by ${userId} - Atomically verified"`
   - Label: User ID (truncated)

5. **Allocated (Unsafe - Valid)**
   - Visual: Green fill
   - Tooltip: `"Allocated by ${userId} - Within stock"`
   - Label: User ID

6. **Overflow (Unsafe - Invalid)**
   - Visual: Red fill with glitch effect
   - Tooltip: `"OVERFLOW: Allocation #${index} - This should not exist!"`
   - Label: `ERR::${index}`
   - Annotation: `"This represents data corruption / over-selling"`

7. **Rejected (Safe)**
   - Visual: Brief red flash, then fades out
   - Tooltip: `"Request rejected - Out of Stock"`
   - Label: `FULL`

#### C. Side-by-Side Comparison Mode

**Layout**: Split screen showing Safe and Unsafe modes simultaneously.

**Synchronized Triggers**: When "Impact Load" is clicked, both modes execute in parallel.

**Real-Time Diff Highlighting**:

- Highlight divergence points (when Unsafe starts accepting allocation #101)
- Draw visual connection lines showing "This should have been rejected"

**Counter Display**:

```
┌─────────────────────┬─────────────────────┐
|   SAFE (DO)           |   UNSAFE (D1)         |
├───────────────────────┼───────────────────────┤
│ Allocated: 100/100 ✅  │ Allocated: 125/100 ❌  │
│ Rejected: 25          │ Rejected: 0           │
│ Data State: Valid     │ Data State: Corrupt   │
└───────────────────────┴───────────────────────┘
```

#### D. Step-by-Step Narration (Optional "Tutorial Mode")

**Enable via Toggle**: "Show Step-by-Step"

**Flow**:

1. **Step 1**: "We'll send concurrent allocation requests..."
   - Wait for user to click "Next"
2. **Step 2**: "Multiple requests read the database at the same time..."
   - Show animated diagram
3. **Step 3**: "In Unsafe mode, requests pass the stock check..."
   - Highlight the vulnerability
4. **Step 4**: "Requests write their allocation to the database..."
   - Show write collisions
5. **Step 5**: "Result: Over-selling inventory"
   - Show final corrupt state

**Contrast with Safe Mode**:

- Same steps but show serialization at Step 3
- Show rejection at Step 4
- Show correct final state at Step 5

#### E. Technical Deep-Dive Expandable

**Trigger**: "Show Code" button

**Content**: Side-by-side code comparison

```typescript
// ❌ UNSAFE (D1)
const current = await db.query(
  "SELECT allocated_units FROM inventory WHERE id = ?",
);
await sleep(200); // ⚠️ Race window
if (current.allocated_units < 100) {
  await db.execute(
    "UPDATE inventory SET allocated_units = allocated_units + 1",
  );
  // 👆 No atomic check - multiple requests pass this and increment
}

// ✅ SAFE (DO)
if (this.allocations.size >= 100) {
  return "OUT_OF_STOCK"; // Atomic check in single thread
}
this.allocations.add(userId);
await this.ctx.storage.put("state", {
  nominations: Array.from(this.allocations),
});
// 👆 Sequential execution guarantees exactly 100 allocations
```

#### F. Key Metrics Dashboard

**Display During Simulation**:

```
┌─────────────────────────────────────────┐
│ 🔬 Race Condition Metrics               │
├─────────────────────────────────────────┤
│ Concurrent Reads:        125            │
│ Read Value (Unsafe):     99 (same!)     │
│ Successful Writes:       125            │
│ Expected Writes:         100            │
│ Overflow:                +25 ❌         │
│                                         │
│ Race Window:             200ms          │
│ Requests in Window:      125/125        │
│ Collision Probability:   100%           │
└─────────────────────────────────────────┘
```

#### G. Educational Tooltips

**Key Terms with Hover Definitions**:

- **Race Condition**: "When multiple operations access shared data concurrently, and the outcome depends on timing."
- **Atomic Operation**: "An operation that completes entirely or not at all, with no intermediate state visible."
- **Serialization**: "Processing requests sequentially to prevent concurrent access conflicts."
- **Optimistic Locking**: "Assuming no conflicts will occur, then checking at write time (can fail)."
- **Durable Object**: "Cloudflare's single-threaded, globally distributed coordination primitive."

#### H. Post-Simulation Summary

**Modal or Slide-In Panel After Completion**:

```
╔══════════════════════════════════════════════╗
║          SIMULATION RESULTS                  ║
╠══════════════════════════════════════════════╣
║ ❌ UNSAFE MODE (Traditional SQL)            ║
║    • Allowed 125 allocations (25 overflow)   ║
║    • Cause: Non-atomic read-check-write      ║
║    • Impact: Revenue loss, inventory drift   ║
║                                              ║
║ ✅ SAFE MODE (Durable Objects)              ║
║    • Enforced exactly 100 allocations        ║
║    • Cause: Serialized execution             ║
║    • Impact: Data integrity maintained       ║
║                                              ║
║ 🎯 Key Takeaway:                             ║
║    Distributed systems require coordination  ║
║    primitives to prevent race conditions.    ║
║    Durable Objects provide this guarantee    ║
║    at the edge, with zero configuration.     ║
╚══════════════════════════════════════════════╝

[Try Again] [Reset Demo] [Learn More]
```

#### I. "Learn More" Resources

**Links to Educational Content**:

- Cloudflare Durable Objects documentation
- "What is a race condition?" (blog post)
- "Consistency models explained" (interactive guide)
- "Why edge coordination matters" (case studies)

#### J. Animation Timing for Educational Flow

**Critical**: Animations should be **slow enough to understand** but **fast enough to stay engaged**.

- **Request Spawn**: 50ms per request (stagger for visibility)
- **Read Phase**: Hold for 500ms with "All reading '19'" label
- **Write Phase**: 100ms per write, with counter incrementing visually
- **Reveal**: 1000ms pause before showing final state
- **Comparison Highlight**: 2000ms with blinking indicators

**Adjustable Speed**: Include playback controls (0.5x, 1x, 2x speed).

## 5.5. Educational UI Requirements (Self-Contained, No Presenter Needed)

> **Design Principle:** This is not an allocation application—it is a **distributed systems teaching tool**. Every interaction, state transition, and data flow must be self-explanatory, allowing users to understand race conditions, serialization, and consistency guarantees without a live presenter or documentation.

### A. Explanatory Tooltips for Status Badges

Every UI element representing a system state must have a **persistent, context-sensitive tooltip** that explains "What is happening?" and "Why?"

**Tooltip Specifications**:

- **Trigger**: Hover (desktop) or long-press (mobile)
- **Delay**: 300ms (fast enough to feel responsive, slow enough to avoid clutter)
- **Duration**: Until user moves away
- **Styling**: Neon accent color (cyan for "Info", red for "Error", green for "Success")
- **Position**: Anchor to element without obscuring critical UI
- **Font**: Small, technical monospace for data; regular sans-serif for explanation

**Tooltip Content Structure**:

```
[Icon] Status Label
─────────────────────
Human-readable explanation (1-2 lines)
Technical detail (gray, smaller text)
Optional: [Learn More →] link
```

**Examples by State**:

| State                  | Badge              | Tooltip                                                                                                     |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Empty Unit**         | `●` (Dashed)       | "Available — No allocations yet. Ready to accept a new request."                                            |
| **Reading (Unsafe)**   | `◐` (Cyan pulse)   | "Reading current count... Stock availability check in progress. [Why is it pulsing? → Race condition demo]" |
| **Pending Write**      | `◑` (Yellow glow)  | "Writing new count... Multiple requests are attempting to update the database simultaneously."              |
| **Allocated (Safe)**   | `●` (Solid green)  | "Allocated ✓ — Atomically verified. DO serialization guaranteed this allocation."                           |
| **Allocated (Unsafe)** | `●` (Green)        | "Allocated ✓ — Allocation succeeded, but may exceed capacity. D1 race condition allows this."               |
| **Overflow (Unsafe)**  | `●` (Glitched red) | "❌ OVERFLOW — This allocation should not exist! Unit #101 proves the race condition."                      |
| **Rejected (Safe)**    | `X` (Red flash)    | "Rejected — SKU out of stock. DO prevented overallocation. This is correct behavior."                       |

### B. Contextual Help Cards (Expandable Deep-Dive Sections)

Learners need **progressive disclosure**: basic understanding at a glance, deeper knowledge on demand.

**Help Card Specifications**:

- **Trigger**: "Why?" or "Learn More" button (chevron icon, subtle styling)
- **Animation**: Smooth height expansion (150ms), `max-height` CSS transition
- **Layout**: Right-aligned sidebar or modal depending on screen size
- **Dismissal**: Click anywhere outside, ESC key, or explicit close button

**Key Help Cards by Module**:

#### **Card 1: "What is a Race Condition?"** (Always visible, collapsed)

```markdown
### 🔄 Race Condition Explained

A race condition occurs when multiple operations access shared data
simultaneously, and the final result depends on timing—not logic.

**In this demo:**

- Multiple concurrent requests all read `allocated_units = 99`
- None see each other's updates
- All write: `allocated_units + 1`
- Database ends up with `allocated_units = 125` (incorrect)

**Real-world impact:**

- Overselling of airline tickets
- Double-charging customers
- Inventory discrepancies

[← Collapse] | [View Code] | [Read Blog Post →]
```

#### **Card 2: "How DO Prevents This"** (Unlocked after Safe mode demo)

```markdown
### ✅ Durable Objects = Serialization

Cloudflare Durable Objects are **single-threaded, globally distributed**.
Requests to the same DO instance are processed one-at-a-time.

**The guarantee:**

1. Request 1 checks: `size >= 100?` → False
2. Request 1 allocates: `allocations.add(user-1)`
3. Request 2 checks: `size >= 100?` → False (now size = 1)
4. Request 2 allocates: `allocations.add(user-2)`
   ...
5. Request 100 allocates: `allocations.add(user-100)`
6. Request 101 checks: `size >= 100?` → TRUE → REJECTED ✓

No two requests execute atomically at the same time.

[← Collapse] | [View Pseudocode] | [Cloudflare Docs →]
```

#### **Card 3: "Why We Use D1 for the Unsafe Path"** (Available always)

```markdown
### ⚠️ Why SQLite Race Conditions Are Realistic

We use D1 (Cloudflare's SQLite) for the "Unsafe" path because:

**Real SQL-based systems suffer from this exact issue:**

- Most ORMs don't enforce atomic transactions by default
- Developers often write: SELECT → App Logic → UPDATE
- This leaves a race window between read and write

**If we used KV instead:**

- Would look contrived (KV is fundamentally designed for this use case)
- Wouldn't match production failures in SQL databases

**The vulnerability in our schema:**

- No `UNIQUE(sku_id, user_id)` constraint
- No `CHECK (allocated_units <= total_stock)` constraint
- These _should_ be there; their absence is intentional

[← Collapse] | [View DB Schema] | [SQLite Lock Modes →]
```

#### **Card 4: "Understanding Durable Object Storage"** (Available for Safe mode)

```markdown
### 💾 How DO State Persists

When you book a unit in Safe mode:

1. In-memory check: `if (allocations.size >= 100) reject`
2. In-memory update: `allocations.add(user-id)`
3. Persistent write: `await storage.put("state", {...})`
4. Atomicity: Steps 1-3 complete or none do

**Failure scenario:**

- If storage.put fails, we rollback the in-memory state
- This prevents a divergence between what the DO claims and what's stored

**Durability:**

- Cloudflare replicates storage across multiple datacenters
- Your allocation survives DO restart

[← Collapse] | [View Implementation] | [Storage API Docs →]
```

#### **Card 5: "WebSocket Hibernation & Auto-Cleanup"** (Available always)

```markdown
### 😴 How the Demo Auto-Resets After 60 Seconds

**The problem:** If we don't clean up state, the demo becomes stale.

**Traditional approach:** Server sends `:CLOSE` after timeout.

- Requires active monitoring
- Costs CPU and memory

**Our approach: Durable Object Alarms**

1. Every allocation schedules an alarm for 60 seconds from now
2. When alarm fires, check: "Are there active WebSocket sessions?"
3. If YES: Reschedule (users are watching)
4. If NO: Clear all state (demo is ready for re-run)

**Educational benefit:**

- Shows edge-case handling in distributed systems
- Demonstrates cost-efficient cleanup patterns

[← Collapse] | [Alarm API Docs →]
```

### C. Inline Documentation (Disabled States & Guidance Messages)

When a user cannot perform an action, the UI should **teach them why** and **guide them forward**.

**Disabled State Pattern**:

```
┌─────────────────────────────────────────────────┐
│ [Button Text] — DISABLED                        │
│                                                 │
│ ⓘ Why is this disabled?                         │
│                                                 │
│ Your reason: "Waiting for previous simulation   │
│ to complete. (2 seconds remaining)"             │
│                                                 │
│ What to do: [Show ongoing simulation] or        │
│ [Interrupt & Reset]                             │
└─────────────────────────────────────────────────┘
```

**Examples**:

#### **Disabled: "Reset Button" (Mid-Simulation)**

```
[RESET] ⊘ DISABLED

ⓘ Why? A simulation is in progress. Resetting now would corrupt
  the results and confuse the educational outcome.

What to do? Wait for the current run to complete (~5 seconds),
  or click [Force Reset] to abort immediately.
```

#### **Disabled: "Switch Mode" (During WebSocket Connection)**

```
[SWITCH TO UNSAFE MODE] ⊘ DISABLED

ⓘ Why? You're currently viewing live updates via WebSocket.
  Switching modes mid-stream would disconnect you.

What to do? Disconnect WebSocket (click 🔌 in the top bar),
  then you can switch modes.
```

#### **Disabled: "Start Flash Sale" (No Mode Selected)**

```
[SIMULATE RUSH] ⊘ DISABLED

ⓘ Why? You haven't selected a mode yet (Safe or Unsafe).

What to do? Use the Mode Switch (top-left) to choose one, then
  this button will activate.
```

#### **Disabled: "Trigger Alarm Cleanup" (For Developers)**

```
[MANUAL CLEANUP] ⊘ DISABLED

ⓘ Why? The alarm system is designed to auto-trigger after 60
  seconds of inactivity. Manual cleanup is unnecessary under
  normal conditions.

What to do? This is here for testing. If you need to force cleanup,
  open DevTools (F12) and call:
  navigator.fetch('/api/reset?debug=true').
```

### D. Learning Path Progression (State-Based UI)

The interface adapts based on user progress, guiding them through a **natural learning journey**.

#### **Phase 1: Introduction (First Load)**

```
╔═══════════════════════════════════════════════════════╗
║           Welcome to Revenue Guard Demo                  ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║ Let's explore how distributed systems prevent        ║
║ inventory overallocation race conditions.             ║
║                                                       ║
║ [→ Learn the Basics]    [→ Skip to Demo]             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

If user clicks "Learn the Basics", show a **progressive tutorial**:

1. "This is an allocation system for inventory. Each SKU has 100 units."
2. "We'll test two approaches: Safe (Durable Objects) and Unsafe (SQL)."
3. "Watch what happens when multiple people try to allocate simultaneously..."
4. "Ready? [→ Continue]"

#### **Phase 2: Mode Selection**

```
┌─────────────────────────────────────────────────────┐
│ Choose a mode to begin:                             │
│                                                     │
│ [SAFE MODE]              [UNSAFE MODE]             │
│ ✅ Durable Objects       ❌ SQL Race Condition     │
│ Serialized requests      Concurrent requests       │
│ Prevents overallocation  Allows overallocation    │
│                                                     │
│ ℹ️  Pick one to see what happens. You can try      │
│     both and compare!                               │
└─────────────────────────────────────────────────────┘
```

#### **Phase 3: Pre-Simulation Checklist**

```
┌─────────────────────────────────────────────────────┐
│ Mode: SAFE ✓                                        │
│ SKU: SKU-001 ✓                                      │
│ Concurrent Requests: 125 ✓                          │
│                                                     │
│ Ready to simulate?                                  │
│                                                     │
│ [← Change Settings]  [INITIATE RUSH →]             │
│                                                     │
│ ℹ️  This will spawn concurrent allocation requests. │
│     Watch the units fill (or overflow)!            │
└─────────────────────────────────────────────────────┘
```

#### **Phase 4: Live Simulation (With Real-Time Narration)**

The explainer panel narrates the event as it happens:

```
═══ LIVE SIMULATION ═══════════════════════════════════

Phase: READING (1/4)
─────────────────────
🔵 All 25 requests are reading the database...
   Current capacity check: `allocated_units = 99`

   ⏱ This happens in parallel. All 25 see the
     same value at the same millisecond.

[Next Step]  [Pause]  [Speed: 1x ▼]
```

Then:

```
Phase: WRITING (2/4)
─────────────────────
🟡 In Unsafe mode, all 25 requests are writing...
   Each one increments: `allocated_units + 1`

   ⚠️ Problem: There's no atomic check-and-set.
     All 25 updates execute independently.
     Database becomes inconsistent.

[Next Step]  [Pause]  [Speed: 1x ▼]
```

Finally:

```
Phase: RESULT (3/4)
─────────────────────
❌ Data Corruption Detected!

   Expected: 100 allocations
   Actual:   125 allocations

   This is the race condition in action. The
   database now has a constraint violation
   (>100 units in a 100-unit stock).

[See Code] [Run Safe Mode] [Next Step]
```

#### **Phase 5: Post-Simulation Comparison**

```
╔════════════════════════════════════════════════════╗
║              SIMULATION COMPLETE                   ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║ UNSAFE (D1 SQL):          SAFE (Durable Objects): ║
║ ❌ 125 allocations        ✅ 100 allocations       ║
║ ❌ NONE rejected          ✅ 25 rejected           ║
║ ❌ Data: CORRUPT          ✅ Data: VALID           ║
║                                                    ║
║ The difference? Serialization.                    ║
║ DO's single-threaded model prevents the race.    ║
║                                                    ║
║ [← Run Again] [Switch Mode] [Share Results]      ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

### E. Accessibility-First Tooltip System (WCAG 2.1 AA)

**Tooltip Accessibility**:

1. **Keyboard Navigation**:
   - Tooltips must be accessible via Tab + Arrow keys
   - No hover-only information (use `aria-describedby`)
   - Focus-visible indicator (4px outline in neon accent color)

2. **Screen Reader Support**:

   ```html
   <button
     aria-label="Initiate 25-request simulation"
     aria-describedby="rush-tooltip"
     disabled="{isSimulating}"
   >
     INITIATE RUSH
   </button>

   <span id="rush-tooltip" role="tooltip" hidden="{!isHovering}">
     Click to spawn concurrent allocation requests. This will demonstrate the
     race condition (Unsafe) or serialization (Safe).
   </span>
   ```

3. **Color Contrast**:
   - All text in tooltips must be WCAG AAA (contrast ratio ≥ 7:1)
   - Use both color AND icons to convey state (not color alone)

4. **Motion**:
   - Respect `prefers-reduced-motion` media query
   - Disable glitch effects and shake animations for users who set this

### F. "Show Code" Deep-Dive Component

**Trigger**: "Show Code" or "View Implementation" link in any help card.

**Layout**: Side-by-side code comparison with annotations.

```
╔══════════════════════════════════════════════════════════╗
║ ❌ UNSAFE Path (D1 SQL)                                  ║
╠══════════════════════════════════════════════════════════╣
║ const current = await db                                ║
║   .prepare("SELECT allocated_units FROM inventory")         ║
║   .bind(classId)                                        ║
║   .first();                                             ║
║                                                          ║
║ await sleep(200); // Race window opens here!  ⚠️        ║
║                                                          ║
║ if (current.allocated_units < 100) {                        ║
║   // All 25 requests pass this check! ⚠️               ║
║   await db.prepare(                                     ║
║     "UPDATE classes                                     ║
║      SET allocated_units = allocated_units + 1"              ║
║   ).bind(classId).run();                                ║
║ }                                                        ║
║                                                          ║
║ ↓ Result: Multiple succeed → Over-allocation!      ║
╠══════════════════════════════════════════════════════════╣
║ ✅ SAFE Path (Durable Object)                            ║
╠══════════════════════════════════════════════════════════╣
║ if (this.allocations.size >= 100) {                      ║
║   // Atomic check in single-threaded context ✓          ║
║   return { success: false, error: "OUT_OF_STOCK" };     ║
║ }                                                        ║
║                                                          ║
║ // Serialization: Only 1 request at a time ✓           ║
║ this.allocations.add(userId);                            ║
║                                                          ║
║ await this.ctx.storage.put("state", {                  ║
║   allocations: Array.from(this.allocations)              ║
║ });                                                      ║
║                                                          ║
║ ↓ Result: Exactly 100 succeed, others rejected ✓       ║
╚══════════════════════════════════════════════════════════╝

[Copy Code] [Open in GitHub] [Close]
```

### G. Status Badge Animations with Educational Captions

**Each visual transition should include a brief caption explaining what's happening:**

**Sequence for Unsafe Mode:**

```
[0ms]   User clicks "INITIATE RUSH"
        Caption: "Spawning concurrent requests..."

[50ms]  Unit animation begins (staggered)
        Caption: "Each request reads the database..."

[300ms] Read-phase complete, all show "99" count
        Caption: "Multiple requests see the same value!"
        Highlight: "This is the vulnerability."

[500ms] Write-phase begins
        Caption: "Multiple requests are now writing..."
        Highlight: "No atomic check prevents duplicate writes!"

[1000ms] All requests complete
        Caption: "Simulation complete. Checking results..."

[1500ms] Final state revealed
        Caption: "❌ Result: 125 allocations for 100 units = OVERALLOCATION"
        Highlight: "This should never happen!"
```

### H. Migration Module Documentation

**When user is on the "Migration" explainer:**

```markdown
### 📋 What This Module Does

The Migration module shows how data moves from one state to another:

1. **Current State**: Database is empty (0 allocations)
2. **Initialization**: Schema is created, 24 SKUs seeded
3. **Demo Runs**: Allocations are added
4. **Reset**: State returns to (1) for re-playability

**Why this matters:**

- Real systems must handle data transitions safely
- Migrations are a critical (often-forgotten) part of
  architectural design
- We auto-migrate on Worker startup for simplicity

**What we're doing:**

1. ✓ Creating tables with proper constraints
2. ✓ Seeding initial SKU data
3. ✓ Cleaning up after demos
4. ⊘ (Out of scope) Multi-version migrations, rollbacks

[← Back to Main] [View Migration File] [Learn More →]
```

### I. Auth & Compliance Module Documentation

**When user is on the "Auth" explainer:**

```markdown
### 🔐 Authentication & Compliance

**This demo uses ZERO authentication:**

- Anyone can allocate units
- Anyone can reset the system
- This is intentional (demo simplicity)

**In a real system, you'd need:**

- User registration & login
- Role-based access control (RBAC)
- Audit logging for all allocations
- PII protection (GDPR, CCPA)

**What we're not doing:**

- ❌ Storing real user names or emails
- ❌ Charging payment
- ❌ Creating long-term accounts
- ❌ Complying with data residency laws

**What you should do in production:**

- Use OAuth2 / OIDC (via Auth0, Okta)
- Implement RBAC for ["admin", "user", "viewer"]
- Log all transactions for audit trails
- Encrypt PII and comply with data regulations

[← Back to Main] [Auth Flow Diagram →] [GDPR Checklist →]
```

### J. Interactive "Metrics Live Dashboard"

During simulation, display a real-time metrics panel:

```
╔═════════════════════════════════════════════════════╗
║ 📊 Race Condition Metrics (Live)                    ║
╠═════════════════════════════════════════════════════╣
║                                                     ║
║ Concurrent Requests Spawned:        125             ║
║ Requests Completed:                 125 / 125       ║
║                                                     ║
║ Reading Phase:                                      ║
║   All read value:   99 (same) ✓                     ║
║   Read latency:     3ms                             ║
║                                                     ║
║ Writing Phase:                                      ║
║   Updates attempted:  125                           ║
║   Writes completed:   125                           ║
║   Write collision rate: 100%  ⚠️                     ║
║                                                     ║
║ Final State:                                        ║
║   Expected allocations: 100                         ║
║   Actual allocations:   125 ❌                       ║
║   Overflow:           +25 UNITS                     ║
║                                                     ║
║ Race Window Duration: 200ms (user-configurable)    ║
║                                                     ║
╚═════════════════════════════════════════════════════╝
```

**Each metric includes a tooltip:**

- "What is 'collision rate'?" → Explains overlapping writes
- "Why is the race window 200ms?" → Explains artificial delay
- "Can we reduce the race window?" → Yes, slider in settings

---

## 16. Vite + React Frontend Configuration

### 16.1. Project Structure

```text
/
├── wrangler.jsonc
├── migrations/
│   └── 0001_create_schema.sql
├── src/ (Worker + DO)
│   ├── index.ts
│   ├── InventoryDO.ts
│   └── types.ts
├── frontend/ (Vite + React)
│   ├── src/
│   │   ├── components/ui/ (shadcn)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
└── package.json
```

### 16.2. UI Components (shadcn/ui)

Utilize specific components to enhance the "Terminal" feel:

- **Card**: For SKU selection
- **Badge**: For real-time status (Safe/Unsafe)
- **Toast**: For "Success" or "Rejected" allocation notifications
- **Skeleton**: For initial loading states
- **Button**: For the "Impact Load" trigger

### 16.3. Dev Server Proxying

**Fixed Vite Configuration** (corrects WebSocket path):

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for /api/ws
      },
    },
  },
});
```

**Note**: The `/api` prefix covers both HTTP endpoints and `/api/ws` WebSocket connections.

---

## 17. Visual Design System: "Neon Velocity"

> [!IMPORTANT]
> **Design Philosophy**: The UI must feel like **Critical Infrastructure**. It should evoke the tension and precision of a High-Frequency Trading Terminal or a Spacecraft Launch Control. It is not an "allocation app"; it is a **Concurrency Battleground**.

### 17.1. The "Void" Aesthetic

- **Background**: `bg-black` (Pure #000000). Not dark gray. **Black**.
- **Surface**: Glassmorphism is OUT. We are doing **Wireframe & Scanline**.
  - **Grid**: A background optimization grid (CSS repeating-linear-gradient) @ 5% opacity.
  - **Vignette**: Heavy radial gradient to focus attention on the center.
  - **Scanlines**: subtle CRT overlay effect (pointer-events-none).

### 17.2. Color Palette (The "Flux" System)

High-contrast neon against deep void.

| Token      | Hex       | Tailwind Name        | Usage                         |
| :--------- | :-------- | :------------------- | :---------------------------- |
| **VOID**   | `#000000` | `bg-neutral-950`     | Main Background               |
| **SAFE**   | `#39FF14` | `text-neon-green`    | Safe Mode, Success, Confirmed |
| **UNSAFE** | `#FF003C` | `text-neon-red`      | Unsafe Mode, Collision, Error |
| **DATA**   | `#00F3FF` | `text-cyan-400`      | SKU ID, Pending State         |
| **MUTED**  | `#333333` | `border-neutral-800` | Grid lines, Inactive Borders  |
| **WHITE**  | `#EAEAEA` | `text-neutral-100`   | Primary Text                  |

### 17.3. Typography

- **Headers / Labels**: **`Rajdhani`** (Google Fonts). Square, technical, medium weight. Uppercase with `tracking-widest`.
- **Data / Numbers**: **`JetBrains Mono`** or **`Fira Code`**. Strictly tabular figures.

### 17.4. UI Layout & Components

#### A. The "Status HUD" (Top Bar)

A thin, monospaced ticker tape running across the top.

- Left: `REVENUE::GUARD // v1.0.4`
- Right: `CONNECTED: 24ms // MEM: 12MB`
- Center: `SYSTEM STATUS: [ NOMINAL ]` (Green) or `[ CRITICAL ]` (Red).

#### B. The "Battle Grid" (Center)

- A grid of **Inventory Units**.
- **The Inventory Unit Cell**:
  - **Default**: 1px dashed border (`#333`). Opacity 0.2.
  - **Pending**: Border turns SOLID cyan (`#00F3FF`). Inner icon spins.
  - **Allocated (Safe)**: Flash White -> Fade to Solid Green (`#39FF14`). Text: `USER_ID`.
  - **Allocated (Unsafe/Ghost)**: Flash White -> Glitches. Randomly toggles between Green and Red.
  - **Collision**: **SHATTERS**. The cell scales up 1.2x, shakes violently, and turns Red. Text: `ERR::RACE`.

#### C. The "Control Deck" (Bottom)

Floating panel, seemingly physically attached to the bottom of the screen.

- **Mode Toggle**: A chunky, skeuomorphic "Toggle Switch".
  - **Safe**: "HYPERVISOR ACTIVE" (Green Glow).
  - **Unsafe**: "SAFETY OVERRIDE" (Red Strobe).
- **The Trigger**: A massive button labeled **`INITIATE RUSH`**.
  - **Idle**: Pulsing outline.
  - **Hover**: Fills with solid color.
  - **Active (Click)**: Depresses (Y-axis translation), Screen shake involved.

### 17.5. Motion & Feedback (Framer Motion)

- **Camera Shake**: On "Rush", the entire wrapper `div` translates randomly `x: ±5px, y: ±5px` for 200ms.
- **Unit Entry**: `staggerChildren: 0.05`. Units don't just appear; they "boot up" (scale 0 -> 1, opacity 0 -> 1).
- **Glitch**: CSS keyframes shifting `clip-path` randomly. Used on the "Unsafe" headers.
- **Sound**: (Optional) High-pitch "charge" sound on pending, "thud" on allocation.

## 18. Frontend Implementation Details

### 18.1. Tech Stack

- **Vite 6** (React SWC)
- **Tailwind v4** (CSS Variables)
- **Framer Motion** (Animation)
- **Lucide React** (Icons)
- **Howler.js** (SFX - Optional but recommended)

### 18.2. File Structure

```text
src/
├── components/
│   ├── deck/
│   │   ├── ModeSwitch.tsx   // The physical toggle
│   │   └── LaunchKey.tsx    // The big button
│   ├── grid/
│   │   ├── Unit.tsx         // The individual cell
│   │   └── Grid.tsx         // The layout
│   └── layout/
│       ├── CRTOverlay.tsx   // Scanlines
│       └── HUD.tsx          // Top bar
├── hooks/
│   └── useWebSocket.ts      // WebSocket connection manager
├── lib/
│   └── api.ts               // API client functions
└── App.tsx
```

---

## 19. Deployment & Operations Guide

### 19.1. Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Create D1 database
wrangler d1 create revenue-guard-db
# Copy database_id to wrangler.jsonc

# 3. Run migrations
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql

# 4. Start development servers
npm run dev:worker  # Starts wrangler dev on :8787
npm run dev:ui      # Starts vite on :5173
```

### 19.2. Local Development Workflow

1. **Terminal 1**: `npm run dev:worker` (Wrangler)
2. **Terminal 2**: `npm run dev:ui` (Vite)
3. **Browser**: Navigate to `http://localhost:5173`
4. **Testing**: Use the UI to trigger rushes and observe behavior

### 19.3. Production Deployment

```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Deploy Worker (which serves frontend assets)
wrangler deploy

# 3. Run remote migrations (first time only)
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql

# 4. Test production
curl https://revenue-guard.YOUR_SUBDOMAIN.workers.dev/api/state?skuId=sku-001&mode=safe
```

### 19.4. Monitoring & Debugging

**View Durable Object Logs**:

```bash
wrangler tail --format pretty
```

**Inspect D1 Database**:

```bash
# Local
wrangler d1 execute revenue-guard-db --local --command "SELECT * FROM inventory"

# Remote
wrangler d1 execute revenue-guard-db --remote --command "SELECT * FROM allocations LIMIT 50"
```

**Reset Demo State**:

```bash
curl -X POST https://revenue-guard.YOUR_SUBDOMAIN.workers.dev/api/reset
```

### 19.5. Cost Optimization

**Expected Costs** (Paid Workers Plan):

- **Durable Objects**: ~24 instances (one per SKU) × minimal active time
- **D1**: Minimal reads/writes
- **Workers Requests**: ~100-500 per demo run
- **WebSocket Connections**: ~1-10 concurrent viewers

**Estimated**: < $1/month for light demo usage

**Cost Controls**:

1. Use WebSocket Hibernation API (already specified)
2. Smart alarm cleanup (prevents long-running DOs)
3. No public traffic (demo/sales use only)

---

## 20. Testing & Validation

### 20.1. Manual Test Cases

**Test 1: Safe Mode - No Overallocation**

1. Set mode to "Safe"
2. Trigger rush with count=125
3. **Expected**: Exactly 100 allocations succeed, excess rejected
4. **Verify**: `GET /api/state` shows `allocatedUnits: 100`

**Test 2: Unsafe Mode - Overallocation Occurs**

1. Reset state
2. Set mode to "Unsafe"
3. Trigger rush with count=125
4. **Expected**: All 125 allocations succeed (race condition)
5. **Verify**: `GET /api/state` shows `allocatedUnits: 125`

**Test 3: WebSocket Real-Time Updates**

1. Open two browser windows
2. Connect to same SKU WebSocket
3. Trigger allocation from window 1
4. **Expected**: Window 2 receives UPDATE message immediately

**Test 4: Alarm Cleanup**

1. Create allocations
2. Keep WebSocket connected
3. Wait 60+ seconds
4. **Expected**: State NOT cleared (active session)
5. Disconnect WebSocket
6. Wait 60+ seconds
7. **Expected**: State cleared (no active sessions)

### 20.2. Automated Tests

Create `tests/booking.test.ts`:

```typescript
import { describe, test, expect } from "vitest";

describe("Allocation System", () => {
  test("Safe mode prevents overallocation", async () => {
    // Test implementation
  });

  test("Unsafe mode allows race condition", async () => {
    // Test implementation
  });
});
```

---

## 21. Known Limitations & Future Enhancements

### Current Limitations

1. **No Authentication**: Anyone can book/reset (acceptable for demo)
2. **No Persistence Beyond 60s**: Alarms clean up state (intentional)
3. **No User Names**: Uses UUIDs only (simplifies demo)
4. **Fixed Capacity**: Hardcoded to 100 units

### Potential Enhancements

1. **Payment Integration**: Simulate Stripe checkout flow
2. **Multi-Region**: Deploy to multiple CF regions, show edge routing
3. **Analytics Dashboard**: Real-time metrics on race conditions detected
4. **Load Testing**: Automated script to generate 1000+ concurrent requests
5. **Video Recording**: Capture demo runs for sales presentations
