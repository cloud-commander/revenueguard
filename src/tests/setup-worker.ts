import { env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Global setup for all Worker integration tests
beforeAll(async () => {
  // Ensure D1 schema is present across all tests
  // This avoids redundant CREATE TABLE calls in every test file
  await env.REVENUE_GUARD_DB.prepare(
    `
    CREATE TABLE IF NOT EXISTS inventory (
      session_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      total_stock INTEGER NOT NULL,
      allocated INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, sku_id)
    )
  `,
  ).run();

  await env.REVENUE_GUARD_DB.prepare(
    `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      requests_count INTEGER DEFAULT 0,
      costs_accumulated REAL DEFAULT 0.0
    )
  `,
  ).run();
});
