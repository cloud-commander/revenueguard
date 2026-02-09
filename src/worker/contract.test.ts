import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Contract & API Integrity", () => {
  const sessionId = "sess_contract_test";
  const authHeader = `Bearer ${sessionId}`;

  beforeAll(async () => {
    // Setup basic session
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

    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-contract-001", 100, 150.0, Date.now())
      .run();
  });

  it("should adhere to the ApiResponse schema for successful allocation", async () => {
    const response = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        skuId: "sku-contract-001",
        units: 1,
        mode: "safe",
      }),
    });

    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("unitsAvailable");
    expect(body.data).toHaveProperty("totalAllocated");
    expect(body.data).toHaveProperty("revenueGenerated");
    expect(body).toHaveProperty("meta");
    expect(body.meta).toHaveProperty("requestId");
    expect(body.meta).toHaveProperty("timestamp");
  });

  it("should adhere to the ApiResponse schema for error responses", async () => {
    const response = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ skuId: "non-existent", units: 1, mode: "safe" }),
    });

    const body = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(body).toHaveProperty("success", false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(body).toHaveProperty("meta");
  });

  it("should return correct status code for unauthorized requests", async () => {
    const response = await SELF.fetch("http://example.com/api/demo/state", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
