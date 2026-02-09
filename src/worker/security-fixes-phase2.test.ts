import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import type { ExecutionContext } from "@cloudflare/workers-types";
import worker from "./index";

describe("Security Fixes Phase 2 Verification", () => {
  const sessionId = "sess_phase2_test";
  const authHeader = `Bearer ${sessionId}`;

  beforeAll(async () => {
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

  describe("Content-Type Validation", () => {
    it("should reject POST without application/json Content-Type", async () => {
      const response = await SELF.fetch("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "turnstileToken=DEBUG_TOKEN",
      });

      expect(response.status).toBe(415);
      const body = (await response.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe("INVALID_CONTENT_TYPE");
    });
  });

  describe("Body Size Limit", () => {
    it("should reject requests with Content-Length > 10KB", async () => {
      const ctx = {
        waitUntil: (p: Promise<unknown>) => p.catch(console.error),
        passThroughOnException: () => {},
      } as ExecutionContext;

      const req = new Request("http://example.com/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "15000",
        },
        body: JSON.stringify({ turnstileToken: "DEBUG_TOKEN" }),
      });

      const response = await worker.fetch(req, env, ctx);
      expect(response.status).toBe(413);
      const body = (await response.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe("PAYLOAD_TOO_LARGE");
    });
  });

  describe("Quota Endpoint Authentication", () => {
    it("should reject /api/quota/status without authentication", async () => {
      const response = await SELF.fetch("http://example.com/api/quota/status", {
        method: "GET",
        // No Authorization header
      });

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe("UNAUTHORIZED");
    });

    it("should accept /api/quota/status with authentication", async () => {
      const response = await SELF.fetch("http://example.com/api/quota/status", {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Logout Endpoint", () => {
    it("should delete session from KV on logout", async () => {
      // Create a test session
      const logoutTestSession = "sess_logout_test";
      await env.REVENUE_GUARD_KV.put(
        logoutTestSession,
        JSON.stringify({ sessionId: logoutTestSession }),
      );

      // Verify session exists
      const before = await env.REVENUE_GUARD_KV.get(logoutTestSession);
      expect(before).not.toBeNull();

      // Call logout
      const response = await SELF.fetch("http://example.com/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${logoutTestSession}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);

      // Verify session deleted
      const after = await env.REVENUE_GUARD_KV.get(logoutTestSession);
      expect(after).toBeNull();
    });
  });

  describe("Error Sanitisation", () => {
    it("should not expose internal error details", async () => {
      // Trigger an error by sending invalid JSON to a handler that parses it
      const response = await SELF.fetch("http://example.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json",
      });

      // Should get sanitised error, not raw stack trace
      const body = (await response.json()) as {
        error?: { code: string; message: string };
      };
      expect(body.error?.code).toBe("INTERNAL_ERROR");
      expect(body.error?.message).not.toContain("parse");
      expect(body.error?.message).not.toContain("JSON");
    });
  });
});
