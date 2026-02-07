-- Revenue Guard D1 Schema

-- Inventory Table (for Eventual Consistency / Persistence)
CREATE TABLE IF NOT EXISTS inventory (
  session_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  total_stock INTEGER NOT NULL,
  allocated INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, sku_id)
);

-- Session Table (for server-side guardrails and session tracking)
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  requests_count INTEGER DEFAULT 0,
  costs_accumulated REAL DEFAULT 0.0
);

-- Initial data is seeded dynamically per-session in the login handler.
