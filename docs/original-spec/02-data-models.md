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

**Environment Bindings**:

```typescript
interface Env {
  INVENTORY_DO: DurableObjectNamespace;
  REVENUE_DB: D1Database;
  RACE_DELAY_MS?: string; // Optional override, default 200ms
}

const VALID_SKUS = [
  "sku-001",
  "sku-002",
  "sku-003",
  "sku-004",
  "sku-005",
] as const;
type SkuId = (typeof VALID_SKUS)[number];
```

**Booking Request & Response**:

````typescript
**Allocation Request & Response**:

```typescript
interface AllocationRequest {
  skuId: SkuId;
  userId: string; // UUID v4
  mode: "safe" | "unsafe";
}

interface AllocationResponse {
  success: boolean;
  message: string;
  availableUnits?: number;
  allocatedUnits?: number;
  error?: "FULL" | "INVALID_SKU" | "STORAGE_FAILURE" | "INTERNAL_ERROR";
}
````

**Simulation Request**:

```typescript
interface SimulationRequest {
  skuId: string;
  count: number; // Usually 125
  mode: "safe" | "unsafe";
}
```

**WebSocket Message Types**:

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

See [03-api-protocol.md](03-api-protocol.md) for how these types are used in endpoints.
