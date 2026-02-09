import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import type { ExecutionContext } from "@cloudflare/workers-types";
import worker from "./index";

describe("Security & Hardening", () => {
  const sessionId = "sess_security_test";
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

    // Seed D1 Inventory for DO tests
    await env.REVENUE_GUARD_DB.prepare(
      "INSERT INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
      .bind(sessionId, "sku-001", 10000000, 150, Date.now())
      .run();
  });

  describe("Authentication", () => {
    it("should reject requests with missing Authorization header", async () => {
      const response = await SELF.fetch("http://example.com/api/demo/state", {
        method: "GET",
      });
      expect(response.status).toBe(401);
    });

    it("should reject requests with malformed tokens", async () => {
      const response = await SELF.fetch("http://example.com/api/demo/state", {
        method: "GET",
        headers: { Authorization: "NotBearer token" },
      });
      expect(response.status).toBe(401);
    });

    it("should reject requests with invalid session IDs", async () => {
      const response = await SELF.fetch("http://example.com/api/demo/state", {
        method: "GET",
        headers: { Authorization: "Bearer non-existent-session" },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("Rate Limiting", () => {
    it("should trigger IP-based rate limiting after 10 requests", async () => {
      let rateLimited = false;
      const testIp = "9.9.9.9";

      for (let i = 0; i < 15; i++) {
        const response = await SELF.fetch(
          "http://example.com/api/demo/allocate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
              "cf-connecting-ip": testIp,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
          },
        );

        if (response.status === 429) {
          rateLimited = true;
          const body = (await response.json()) as any;
          expect(body.error.code).toBe("RATE_LIMITED");
          expect(body.error.message).toContain("IP limit reached");
          break;
        }
      }

      expect(rateLimited).toBe(true);
    });

    it("should trigger Session-based rate limiting after 30 requests", async () => {
      let rateLimited = false;
      // Use different IPs to avoid triggering IP limit first
      for (let i = 0; i < 40; i++) {
        const response = await SELF.fetch(
          "http://example.com/api/demo/allocate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
              "cf-connecting-ip": `1.1.1.${i}`,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
          },
        );

        if (response.status === 429) {
          rateLimited = true;
          const body = (await response.json()) as any;
          expect(body.error.code).toBe("RATE_LIMITED");
          expect(body.error.message).toContain("session limit reached");
          break;
        }
      }

      expect(rateLimited).toBe(true);
    });

    it("should enforce Atomic Rate Limit (DO) even if KV is bypassed", async () => {
      // 1. Reset KV limit for the session to simulate a race condition bypass
      const kvKey = `rl:alloc:${sessionId}`;
      await env.REVENUE_GUARD_KV.put(kvKey, "0");

      // 2. Consume tokens (Distributed Attack style to avoid IP limit)
      for (let i = 0; i < 35; i++) {
        await SELF.fetch("http://example.com/api/demo/allocate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "cf-connecting-ip": `5.5.5.${i}`, // Rotate IP
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
        });
      }

      // Reset KV again
      await env.REVENUE_GUARD_KV.put(kvKey, "0");

      // Trigger request (should fall through IP limit but hit Session limit in DO)
      const response = await SELF.fetch(
        "http://example.com/api/demo/allocate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "cf-connecting-ip": "5.5.5.100", // Unique IP
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ skuId: "sku-001", units: 1, mode: "safe" }),
        },
      );

      // Expect 429 from DO
      expect(response.status).toBe(429);
      const body = (await response.json()) as any;
      expect(body.error.message).toContain("Session limit");
    });
  });

  describe("Atomic Billing (Kill Vector Mitigation)", () => {
    it("should prevent budget overrun during high-concurrency attacks", async () => {
      // 1. Set up session with 0 cost
      const nearLimitSession = {
        sessionId,
        ip: "2.2.2.2",
        expiresAt: Date.now() + 3600000,
        costs: 0,
        virtualCosts: 0,
      };
      await env.REVENUE_GUARD_KV.put(
        sessionId,
        JSON.stringify(nearLimitSession),
      );

      // Create a Mock Env with high billing scale
      const mockEnv = {
        ...env,
        BILLING_SCALE: "0.001", // Cost 0.15 per unit
        DEMO_COST_LIMIT: "1.0",
      };

      // Mock Context (waitUntil, passThroughOnException)
      const ctx = {
        waitUntil: (promise: Promise<any>) => {
          promise.catch(console.error);
        },
        passThroughOnException: () => {},
      } as ExecutionContext;

      // 2. Fire 20 concurrent requests
      const rotatedRequests = Array(20)
        .fill(0)
        .map((_, i) => {
          const req = new Request("http://example.com/api/demo/allocate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
              "cf-connecting-ip": `2.2.2.${i}`,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              skuId: "sku-001",
              units: 1,
              mode: "safe",
            }),
          });
          // Call worker handler directly
          return worker.fetch(req, mockEnv, ctx);
        });

      const responses = await Promise.all(rotatedRequests);
      const statuses = responses.map((r: Response) => r.status);

      const successes = statuses.filter((s: number) => s === 200).length;
      const budgetBlocked = statuses.filter((s: number) => s === 403).length;
      const rateBlocked = statuses.filter((s: number) => s === 429).length;
      const otherErrors = statuses.filter(
        (s: number) => s !== 200 && s !== 403 && s !== 429,
      ).length;

      console.log(
        `Billing Race Results: ${successes} passed, ${budgetBlocked} budget blocked, ${rateBlocked} rate blocked, ${otherErrors} errors`,
      );

      expect(otherErrors).toBe(0);
      expect(successes).toBeGreaterThan(0);
      expect(successes).toBeLessThan(15);
      expect(budgetBlocked).toBeGreaterThan(5);
    });
  });

  describe("Input Sanitization", () => {
    it("should reject requests with malformed JSON types", async () => {
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
            skuId: "sku-001",
            units: "HACKER",
            mode: "safe",
          }),
        },
      );

      // Should be 400 because units is not a number
      expect(response.status).toBe(400);
    });
  });
});
