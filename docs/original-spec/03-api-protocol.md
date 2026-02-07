# 03. API & Protocol Specification

## HTTP Endpoints

### `POST /api/reset`

Resets the simulation state for all SKUs.

```typescript
// D1: Reset both tables
await env.REVENUE_DB.batch([
  env.REVENUE_DB.prepare("UPDATE inventory SET allocated_units = 0"),
  env.REVENUE_DB.prepare("DELETE FROM allocations"),
]);

// DO: Delete all instances (for each SKU)
for (const skuId of VALID_SKUS) {
  const id = env.INVENTORY_DO.idFromName(skuId);
  const stub = env.INVENTORY_DO.get(id);
  await stub.fetch(new Request("https://fake/reset", { method: "DELETE" }));
}
```

### `POST /api/allocate`

Attempts to allocate a unit in a SKU.

**Request Body**:

```json
{
  "skuId": "sku-001",
  "userId": "uuid-v4-string",
  "mode": "safe" | "unsafe"
}
```

**Routing Logic**:

```typescript
if (mode === "safe") {
  // Route to Durable Object
  const id = env.INVENTORY_DO.idFromName(skuId);
  const stub = env.INVENTORY_DO.get(id);
  return stub.fetch(request.clone());
} else {
  // Route to D1 (Unsafe path)
  return handleUnsafeAllocation(env, skuId, userId);
}
```

### `POST /api/simulate-rush`

Triggers a server-side burst of concurrent allocation requests.

**Why**: Browsers limit concurrent connections (~6 max). The Worker spawns 120+ async requests internally.

**Request Body**:

```json
{
  "skuId": "sku-001",
  "mode": "safe" | "unsafe",
  "count": 125
}
```

**Logic**:

```typescript
const results = await Promise.allSettled(
  Array.from({ length: count }, (_, i) =>
    handleAllocationInternal(env, {
      skuId,
      userId: `sim-user-${Date.now()}-${i}`,
      mode,
    }),
  ),
);
```

### `GET /api/state`

Returns current allocation state for a SKU.

**Query Params**: `?skuId=sku-001&mode=safe|unsafe`

**Response**:

```json
{
  "skuId": "sku-001",
  "totalStock": 100,
  "allocatedUnits": 15,
  "availableUnits": 85,
  "allocations": ["user-1", "user-2"]
}
```

## WebSocket Protocol (`/api/ws`)

Used for real-time updates of the inventory grid.

**Connection Setup**:

```typescript
const ws = new WebSocket("ws://localhost:8787/api/ws?skuId=sku-001");
```

**Server → Client Messages**:

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

**WebSocket Hibernation Implementation**:

The Durable Object accepts the WebSocket upgrade and registers handlers for the Hibernation API:

```typescript
class InventoryDO {
  sessions: WebSocket[] = [];

  // Accept connection with hibernation enabled
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  this.ctx.acceptWebSocket(server);
  this.sessions.push(server);

  // Send current state immediately
  server.send(JSON.stringify({
    type: "UPDATE",
    skuId: this.state.id,
    availableUnits: this.state.totalStock - this.state.allocations.size,
    allocatedUnits: this.state.allocations.size,
    allocations: Array.from(this.state.allocations),
  }));

  return new Response(null, { status: 101, webSocket: client });
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
```

## Cross-References

- See [02-data-models.md](02-data-models.md) for type definitions used in these endpoints
- See [04-detailed-logic.md](04-detailed-logic.md) for the allocation logic implementation
