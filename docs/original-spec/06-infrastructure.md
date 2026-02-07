# 06. Infrastructure & Configuration

## Database Migrations

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

### Run Migration Commands

```bash
# Local development
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql

# Production
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql
```

---

## `wrangler.jsonc` Configuration

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "revenue-guard",
  "main": "src/index.ts",
  "compatibility_date": "2024-04-05",
  "compatibility_flags": ["nodejs_compat"],

  "durable_objects": {
    "bindings": [{ "name": "INVENTORY_DO", "class_name": "InventoryDO" }],
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

### Setup Commands

```bash
# Create D1 database
wrangler d1 create revenue-guard-db
# Copy the database_id from output to wrangler.jsonc

# Run migrations locally
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql

# Run migrations on production
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql
```

---

## CORS Configuration

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

## Key Infrastructure Points

- **D1 Database**: SQLite-based, replicated across Cloudflare regions
- **Durable Objects**: Globally distributed, single-threaded, persistent
- **WebSocket Hibernation API**: Reduces costs by pausing connections during inactivity
- **RACE_DELAY_MS**: Environment variable (default 200ms) controls the race condition window for testing

See [04-detailed-logic.md](04-detailed-logic.md) for how these configurations are used in the allocation logic.
