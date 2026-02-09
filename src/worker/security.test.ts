import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

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
