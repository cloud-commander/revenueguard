import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Simulation Reset Integrity", () => {
  const sessionId = "sess_reset_test";
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

    // Seed inventory
    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-reset-001", 100, 150.0, Date.now())
      .run();
  });

  it("should clear session costs and virtualCosts in KV after reset", async () => {
    // 1. Perform an allocation to generate costs
    const allocRes = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ skuId: "sku-reset-001", units: 10, mode: "safe" }),
    });
    expect(allocRes.status).toBe(200);

    // 2. Verify costs are > 0 in KV
    const sessionData = await env.REVENUE_GUARD_KV.get(sessionId);
    const session = JSON.parse(sessionData!) as any;
    expect(session.costs).toBeGreaterThan(0);
    expect(session.virtualCosts).toBeGreaterThan(0);

    // 3. Trigger Reset
    const resetRes = await SELF.fetch("http://example.com/api/demo/reset", {
      method: "POST",
      headers: { Authorization: authHeader },
    });
    expect(resetRes.status).toBe(200);

    // 4. Verify costs are back to 0 in KV
    const sessionDataAfter = await env.REVENUE_GUARD_KV.get(sessionId);
    const sessionAfter = JSON.parse(sessionDataAfter!) as any;
    expect(sessionAfter.costs).toBe(0);
    expect(sessionAfter.virtualCosts).toBe(0);
  });
});
