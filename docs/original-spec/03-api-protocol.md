# 03. API & Protocol Specification

## HTTP Endpoints

All endpoints require a `Bearer <sessionId>` Authorization header unless otherwise specified.

### `POST /api/auth/login`

**No Auth Required**. Verifies Turnstile token and creates a session.

### `GET /api/auth/me`

Validates the current session. Returns expiration and IP context.

### `POST /api/demo/reset`

Resets simulation state for the active session. Clears inventory in D1 and resets the `InventoryGuard` DO instance.

### `POST /api/demo/allocate`

Attempts to allocate units in a SKU. Supports `safe` (DO-atomic) and `eventual` (D1-race) modes.

**Request Body**:

```json
{
  "skuId": "sku-001",
  "units": 1,
  "mode": "safe" | "eventual"
}
```

### `GET /api/demo/state`

Returns the current inventory state for the session, including `unitsAvailable` and `virtualCosts`.

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
