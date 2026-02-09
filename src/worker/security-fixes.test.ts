import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import type { ExecutionContext } from "@cloudflare/workers-types";
import worker from "./index";

describe("Security Fixes Verification", () => {
  const sessionId = "sess_security_fix_test";
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

    // Seed D1 Inventory for tests
    await env.REVENUE_GUARD_DB.prepare(
      "INSERT OR REPLACE INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-sec-001", 1000, 150, Date.now())
      .run();
  });

  describe("DEBUG_TOKEN Bypass Prevention", () => {
    it("should reject DEBUG_TOKEN when TURNSTILE_SECRET is production value", async () => {
      const mockEnv = {
        ...env,
        TURNSTILE_SECRET: "PRODUCTION_SECRET_VALUE",
      };

      const ctx = {
        waitUntil: (promise: Promise<unknown>) => {
          promise.catch(console.error);
        },
        passThroughOnException: () => {},
      } as ExecutionContext;

      const req = new Request("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: "DEBUG_TOKEN" }),
      });

      const response = await worker.fetch(req, mockEnv, ctx);
      // Should be rejected because DEBUG_TOKEN is not valid in production
      expect(response.status).toBe(403);
    });

    it("should allow DEBUG_TOKEN when TURNSTILE_SECRET is DEBUG_TOKEN (dev mode)", async () => {
      const mockEnv = {
        ...env,
        TURNSTILE_SECRET: "DEBUG_TOKEN",
      };

      const ctx = {
        waitUntil: (promise: Promise<unknown>) => {
          promise.catch(console.error);
        },
        passThroughOnException: () => {},
      } as ExecutionContext;

      const req = new Request("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: "DEBUG_TOKEN" }),
      });

      const response = await worker.fetch(req, mockEnv, ctx);
      // Should succeed in dev mode
      expect(response.status).toBe(200);
    });
  });

  describe("CSPRNG Session IDs", () => {
    it("should generate session IDs using UUID format", async () => {
      const response = await SELF.fetch("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: "DEBUG_TOKEN" }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        success: boolean;
        data?: { sessionId: string };
      };
      expect(body.success).toBe(true);

      // UUID format: sess_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPattern =
        /^sess_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(body.data?.sessionId).toMatch(uuidPattern);
    });
  });

  describe("MAX_UNITS Validation", () => {
    it("should reject allocation requests exceeding 50 units at worker layer", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            skuId: "sku-sec-001",
            units: 51,
            mode: "safe",
          }),
        },
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        success: boolean;
        error?: { code: string };
      };
      expect(body.error?.code).toBe("EXCEEDS_MAX_TRANSACTION");
    });

    it("should accept allocation requests with 50 or fewer units", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            skuId: "sku-sec-001",
            units: 50,
            mode: "safe",
          }),
        },
      );

      // Should pass MAX_UNITS check (may fail for other reasons)
      expect(response.status).not.toBe(400);
      const body = (await response.json()) as {
        success: boolean;
        error?: { code: string };
      };
      expect(body.error?.code).not.toBe("EXCEEDS_MAX_TRANSACTION");
    });
  });

  describe("WebSocket Authorization", () => {
    it("should reject WebSocket connections without matching Authorization header", async () => {
      const response = await SELF.fetch(
        `http://example.com/api/ws?sessionId=${sessionId}`,
        {
          headers: {
            Upgrade: "websocket",
            // Missing Authorization header
          },
        },
      );

      expect(response.status).toBe(401);
    });

    it("should reject WebSocket connections with mismatched Authorization header", async () => {
      const response = await SELF.fetch(
        `http://example.com/api/ws?sessionId=${sessionId}`,
        {
          headers: {
            Upgrade: "websocket",
            Authorization: "Bearer different-session-id",
          },
        },
      );

      expect(response.status).toBe(401);
    });

    it("should accept WebSocket connections with matching Authorization header", async () => {
      const response = await SELF.fetch(
        `http://example.com/api/ws?sessionId=${sessionId}`,
        {
          headers: {
            Upgrade: "websocket",
            Authorization: authHeader,
          },
        },
      );

      expect(response.status).toBe(101);
    });
  });

  describe("CSRF Protection", () => {
    it("should reject POST to /api/demo/* without X-Requested-With header", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            // Missing X-Requested-With header
          },
          body: JSON.stringify({
            skuId: "sku-sec-001",
            units: 1,
            mode: "safe",
          }),
        },
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as {
        success: boolean;
        error?: { code: string };
      };
      expect(body.error?.code).toBe("CSRF_BLOCKED");
    });

    it("should accept POST to /api/demo/* with X-Requested-With header", async () => {
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            skuId: "sku-sec-001",
            units: 1,
            mode: "safe",
          }),
        },
      );

      // Should not be blocked by CSRF
      expect(response.status).not.toBe(403);
      const body = (await response.json()) as {
        success: boolean;
        error?: { code: string };
      };
      expect(body.error?.code).not.toBe("CSRF_BLOCKED");
    });

    it("should NOT require X-Requested-With for GET requests", async () => {
      const response = await SELF.fetch("http://example.com/api/demo/state", {
        method: "GET",
        headers: {
          Authorization: authHeader,
          // No X-Requested-With header
        },
      });

      // GET requests should not be blocked by CSRF middleware
      expect(response.status).not.toBe(403);
    });
  });

  describe("Eventual Mode Atomic Billing", () => {
    it("should use DO for atomic billing check in eventual mode", async () => {
      // Set up session with costs near limit
      const highCostSession = {
        sessionId,
        ip: "3.3.3.3",
        expiresAt: Date.now() + 3600000,
        costs: 0.99,
        virtualCosts: 0,
      };
      await env.REVENUE_GUARD_KV.put(
        sessionId,
        JSON.stringify(highCostSession),
      );

      const mockEnv = {
        ...env,
        BILLING_SCALE: "0.01", // 1.5 per unit
        DEMO_COST_LIMIT: "1.0", // Low limit
      };

      const ctx = {
        waitUntil: (promise: Promise<unknown>) => {
          promise.catch(console.error);
        },
        passThroughOnException: () => {},
      } as ExecutionContext;

      const req = new Request("http://example.com/api/demo/allocate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          skuId: "sku-sec-001",
          units: 1,
          mode: "eventual",
        }),
      });

      const response = await worker.fetch(req, mockEnv, ctx);

      // With costs at 0.99 and unit cost 1.5, should exceed the 1.0 limit
      expect(response.status).toBe(403);
      const body = (await response.json()) as {
        success: boolean;
        error?: { code: string };
      };
      expect(body.error?.code).toBe("REAL_BUDGET_EXCEEDED");
    });
  });
});
