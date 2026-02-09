import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("Edge Performance & Benchmarking", () => {
  const sessionId = "sess_perf_test";
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

    // Seed SKUs for mode comparison
    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-001", 1000, 150.0, Date.now())
      .run();
  });

  it("should benchmark Safe mode (DO) latency", async () => {
    const start = performance.now();
    const response = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
    });
    const end = performance.now();
    const duration = end - start;

    expect(response.status).toBe(200);
    // Safe mode involves a DO stub and wait, so it should be observable
    console.log(`[Performance] Safe Mode Latency: ${duration.toFixed(2)}ms`);
  });

  it("should benchmark Eventual mode (D1) latency", async () => {
    const start = performance.now();
    const response = await SELF.fetch("http://example.com/api/demo/allocate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        skuId: "sku-001",
        units: 1,
        mode: "eventual",
      }),
    });
    const end = performance.now();
    const duration = end - start;

    expect(response.status).toBe(200);
    console.log(
      `[Performance] Eventual Mode Latency: ${duration.toFixed(2)}ms`,
    );
  });

  it("should enforce maximum payload size guardrails", async () => {
    const response = await SELF.fetch("http://example.com/api/demo/state", {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    const bodyText = await response.text();
    const sizeBytes = new TextEncoder().encode(bodyText).length;

    // Response should be compact (e.g., < 10KB for state)
    expect(sizeBytes).toBeLessThan(10240);
    console.log(`[Performance] State Payload Size: ${sizeBytes} bytes`);
  });
});
