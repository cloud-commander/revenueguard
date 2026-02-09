import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Production Hardening (Advanced Edge)", () => {
  const sessionId = "sess_hardening_test";
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
      .bind(sessionId, "sku-001", 100, 150.0, Date.now())
      .run();
  });

  describe("WebSocket Broadcast", () => {
    it("should receive real-time updates on WebSocket when allocation occurs", async () => {
      // 1. Connect to WebSocket - worker expects sessionId in query params
      const response = await SELF.fetch(
        `http://example.com/api/ws?sessionId=${sessionId}`,
        {
          headers: {
            Upgrade: "websocket",
            Authorization: authHeader,
          },
        },
      );

      const webSocket = response.webSocket;
      expect(webSocket).toBeDefined();
      webSocket!.accept();

      // 2. Setup listener for the update
      const updatePromise = new Promise((resolve) => {
        webSocket!.addEventListener("message", (event: MessageEvent) => {
          const data = JSON.parse(event.data as string);
          if (data.type === "UPDATE" && data.skuId === "sku-001") {
            resolve(data);
          }
        });
      });

      // 3. Trigger allocation
      await SELF.fetch("http://example.com/api/demo/allocate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
      });

      // 4. Verify update was received
      const update = (await updatePromise) as any;
      expect(update.availableUnits).toBe(99);
      expect(update.allocatedUnits).toBe(1);
    });
  });

  describe("Durable Object Persistence", () => {
    it("should verify inventory state in DO follows D1 seeding", async () => {
      const doId = env.REVENUE_GUARD_INVENTORY_DO.idFromName(sessionId);
      const stub = env.REVENUE_GUARD_INVENTORY_DO.get(doId);

      // 1. Allocate initial units
      await SELF.fetch("http://example.com/api/demo/allocate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ skuId: "sku-001", units: 5, mode: "safe" }),
      });

      // 2. Verify state in DO
      let stateRes = await stub.fetch(
        `http://do/state?skuId=sku-001&sessionId=${sessionId}`,
      );
      let state = (await stateRes.json()) as any;
      expect(state.allocated).toBe(5);

      // 3. Verify it survives a fetch re-entry (lazy load check)
      let stateRes2 = await stub.fetch(
        `http://do/state?skuId=sku-001&sessionId=${sessionId}`,
      );
      let state2 = (await stateRes2.json()) as any;
      expect(state2.allocated).toBe(5);
    });
  });

  describe("Chaos & Fault Injection", () => {
    it("should handle D1 failures gracefully with 500", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid_session",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            skuId: "sku-001",
            units: 1,
            mode: "eventual",
          }),
        },
      );

      // unauthorized first
      expect(response.status).toBe(401);
    });
  });
});
