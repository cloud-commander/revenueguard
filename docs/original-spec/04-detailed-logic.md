# 04. Detailed Logic Flows

## The "Unsafe" Path (D1 / SQL)

**Goal**: Demonstrate overallocation via optimistic locking race condition.

### Implementation

```typescript
async function handleUnsafeAllocation(
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
          error: "FULL",
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

### Why This Creates Overallocation

1. **Concurrent Read**: 125 requests all read `allocated_units = 99` simultaneously
2. **Delay Window**: 200ms delay ensures they all complete the read before any write
3. **Optimistic Check**: All 125 pass the `>= 100` check (since they read 99)
4. **Non-Atomic Write**: All 125 execute `allocated_units + 1` independently
5. **Result**: Database ends up with 125+ allocations for a 100-unit SKU

_This is a realistic race condition pattern seen in production systems without proper locking._

---

## The "Safe" Path (Durable Objects)

**Goal**: Prevent overallocation via serialization.

### Implementation

```typescript
class InventoryDO {
  state: InventoryState;
  ctx: DurableObjectState;
  sessions: WebSocket[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.state = {
      id: "",
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
      this.state.id = this.ctx.id.name || "unknown";
    }
  }

  async handleAllocation(userId: string): Promise<Response> {
    try {
      // Step 1: Atomic check (implicit serialization via single-threaded model)
      if (this.state.allocations.size >= this.state.totalStock) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "FULL",
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
      await this.ctx.storage.setAlarm(Date.now() + 60000);

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

### Why This Prevents Overallocation

1. **Serialization**: Durable Objects process requests sequentially (single-threaded)
2. **Atomic Check-and-Set**: The check and update happen in the same turn
3. **Persistence**: Storage is updated before responding
4. **Error Handling**: Rollback on storage failure
5. **Result**: Exactly 100 allocations, requests 101+ get rejected

---

## Hoarding Prevention (Smart Timeout)

**Mandatory for Replayability.**

### Implementation

```typescript
class InventoryDO {
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

### Benefits

1. **Automatic Cleanup**: State is reset after 60s of inactivity
2. **No Interruption**: Active viewers aren't disrupted
3. **Resource Efficiency**: Prevents zombie DO instances
4. **Replayability**: Demo can be re-run without manual reset

See [03-api-protocol.md](03-api-protocol.md) for WebSocket broadcast implementation.
