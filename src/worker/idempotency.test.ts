import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Idempotency Integration Tests", () => {
  const sessionId = "sess_idempotency_test";
  const authHeader = `Bearer ${sessionId}`;

  beforeAll(async () => {
    // Setup session and inventory
    await env.REVENUE_GUARD_KV.put(
      sessionId,
      JSON.stringify({
        sessionId,
        ip: "127.0.0.1",
        expiresAt: Date.now() + 3600000,
        costs: 0,
        virtualCosts: 0,
      }),
    );

    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-001", 100, 150.0, Date.now())
      .run();
  });

  it("should handle retries (idempotent) and new requests (non-idempotent) correctly", async () => {
    const payload = { skuId: "sku-001", units: 5, mode: "safe" };
    const idempotencyKey = "test-key-123";

    // 1. FIRST REQUEST
    const response1 = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-Requested-With": "XMLHttpRequest",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    expect(response1.status).toBe(200);
    expect(response1.headers.get("X-Processed-Id")).toBe(idempotencyKey);
    const data1 = (await response1.json()) as any;
    expect(data1.success).toBe(true);
    expect(data1.data.totalAllocated).toBe(5);

    // 2. RETRY (Same Key)
    const response2 = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-Requested-With": "XMLHttpRequest",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    expect(response2.status).toBe(200);
    expect(response2.headers.get("X-Processed-Id")).toBe(idempotencyKey);
    const data2 = (await response2.json()) as any;
    expect(data2.data.totalAllocated).toBe(5); // Cached

    // 3. NEW REQUEST (Different Key)
    const response3 = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-Requested-With": "XMLHttpRequest",
        "X-Idempotency-Key": "test-key-456",
      },
      body: JSON.stringify(payload),
    });

    expect(response3.status).toBe(200);
    expect(response3.headers.get("X-Processed-Id")).toBe("test-key-456");
    const data3 = (await response3.json()) as any;
    expect(data3.data.totalAllocated).toBe(10); // 5 + 5
  });
});
