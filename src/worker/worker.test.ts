import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Worker Integration Tests", () => {
  const sessionId = "sess_integration_test";
  const authHeader = `Bearer ${sessionId}`;

  beforeAll(async () => {
    // Setup session and inventory in KV/D1 before tests
    // Mocking session data in KV
    await env.REVENUE_GUARD_KV.put(
      sessionId,
      JSON.stringify({
        sessionId,
        ip: "1.1.1.1",
        expiresAt: Date.now() + 3600000,
        costs: 0,
        virtualCosts: 0,
      }),
    );

    // Seed inventory in D1 for this session
    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-001", 100, 150.0, Date.now())
      .run();
  });

  describe("Fault Injection (Unhappy Paths)", () => {
    it("should reject negative units", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: -10, mode: "safe" }),
        },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NEGATIVE_UNITS");
    });

    it("should reject non-integer units", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: 1.5, mode: "safe" }),
        },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NON_INTEGER_UNITS");
    });

    it("should handle malformed JSON gracefully", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: "{ malformed json: true ",
        },
      );

      // Hono's c.req.json() usually throws or returns a 400
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Business Logic Scenarios (User Stories)", () => {
    it("should accept valid allocation and sync KV/D1", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: 5, mode: "safe" }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.success).toBe(true);

      // Verify KV session was updated
      const session = JSON.parse(
        (await env.REVENUE_GUARD_KV.get(sessionId)) || "{}",
      );
      expect(session.virtualCosts).toBeGreaterThan(0);

      // Verify D1 was updated (Write-Behind)
      // Since it's waitUntil, we might need a small wait or just check if it eventually settles
      // In vitest-pool-workers, SELF.fetch waits for waitUntil to settle if configured,
      // but let's be explicit if needed.
      const d1Row = await env.REVENUE_GUARD_DB.prepare(
        "SELECT allocated FROM inventory WHERE session_id = ? AND sku_id = ?",
      )
        .bind(sessionId, "sku-001")
        .first<{ allocated: number }>();

      expect(d1Row?.allocated).toBe(5);
    });

    it("Story 1: Should reject overdrawing balance (insufficient stock)", async () => {
      // Seed a specific stock for this SKU
      await env.REVENUE_GUARD_DB.prepare(
        "UPDATE inventory SET total_stock = 10, allocated = 0 WHERE session_id = ? AND sku_id = ?",
      )
        .bind(sessionId, "sku-001")
        .run();

      // Allocate 10 (Ok)
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: 10, mode: "safe" }),
        },
      );
      expect(response.status).toBe(200);

      // Try 1 more (Fail)
      const response2 = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
        },
      );

      expect(response2.status).toBe(400);
      const body2 = (await response2.json()) as any;
      expect(body2.error.code).toBe("INSUFFICIENT_STOCK");
    });

    it("Story 3: Should enforce max units per transaction", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ skuId: "sku-001", units: 51, mode: "safe" }),
        },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as any;
      expect(body.error.code).toBe("EXCEEDS_MAX_TRANSACTION");
    });
  });
});
