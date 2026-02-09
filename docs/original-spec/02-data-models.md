# 02. Data Models & Type Definitions

## Durable Object State

```typescript
interface InventoryState {
  id: string; // "sku-001", "sku-002", etc.
  totalStock: number; // Always 100
  allocations: Set<string>; // Set of user IDs
  sessions: WebSocket[]; // Active WebSocket connections
}
```

## D1 Database Schema

**Inventory Table**:

```sql
CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  allocated_units INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 100
);
```

**Allocations Table**:

```sql
CREATE TABLE allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sku_id) REFERENCES inventory(id)
);
-- NOTE: No UNIQUE constraint = intentional vulnerability
```

## Type Definitions

### Environment Bindings

```typescript
interface Env {
  INVENTORY_GUARD: DurableObjectNamespace;
  REVENUE_GUARD_DB: D1Database;
  REVENUE_GUARD_KV: KVNamespace;
}
```

const VALID_SKUS = [
"sku-001",
"sku-002",
"sku-003",
"sku-004",
"sku-005",
] as const;
type SkuId = (typeof VALID_SKUS)[number];

### Allocation Request & Response

```typescript
interface AllocationRequest {
  skuId: string;
  units: number;
  mode: "safe" | "eventual";
}

interface AllocationResponse {
  success: boolean;
  data?: {
    availableUnits: number;
    totalAllocated: number;
    revenueGenerated: number;
  };
  error?: {
    code: string;
    message: string;
  };
  meta: ApiResponseMeta;
}
```

**Simulation Request**:

```typescript
interface SimulationRequest {
  skuId: string;
  count: number; // Usually 125
  mode: "safe" | "unsafe";
}
```

### WebSocket Message Types

```typescript
type WSMessage = {
  type: "UPDATE";
  skuId: string;
  units: number;
};
```

See [03-api-protocol.md](03-api-protocol.md) for endpoint usage.
