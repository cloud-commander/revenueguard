import { Hono } from "hono";
import type { Env } from "../index";
import { VALID_SKUS } from "../../shared/rules";
import { getQuotaStatus, recordCpuUsage } from "../services/quota";

import { genReqId, getSession } from "../utils/session";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/login", async (c) => {
  const reqId = genReqId();
  const { turnstileToken } = await c.req.json<{ turnstileToken: string }>();
  const ip = c.req.header("cf-connecting-ip") || "0.0.0.0";

  if (!turnstileToken) {
    return c.json(
      {
        success: false,
        error: { code: "MISSING_TOKEN", message: "Missing token" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      400,
    );
  }

  const formData = new FormData();
  formData.append("secret", c.env.TURNSTILE_SECRET);
  formData.append("response", turnstileToken);
  formData.append("remoteip", ip);

  const result = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      body: formData,
      method: "POST",
    },
  );

  const outcome = (await result.json()) as { success: boolean };
  const isDevEnvironment = c.env.TURNSTILE_SECRET === "DEBUG_TOKEN";
  const isDebugToken =
    turnstileToken === "DEBUG_TOKEN" ||
    turnstileToken.startsWith("mock-token-");

  if (!outcome.success && !(isDebugToken && isDevEnvironment)) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Turnstile verification failed",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      403,
    );
  }

  const globalSessionKey = "global:active_sessions";
  const globalCount = await c.env.REVENUE_GUARD_KV.get(globalSessionKey);
  if (parseInt(globalCount || "0", 10) > 10000) {
    return c.json(
      {
        success: false,
        error: { code: "GLOBAL_RATE_LIMIT", message: "System at capacity" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      503,
    );
  }

  if (Math.random() < 0.1) {
    const count = parseInt(globalCount || "0", 10);
    c.executionCtx.waitUntil(
      c.env.REVENUE_GUARD_KV.put(globalSessionKey, (count + 10).toString(), {
        expirationTtl: 3600,
      }),
    );
  }

  const loginRlKey = `rl:login:${ip}`;
  const loginCount = (await c.env.REVENUE_GUARD_KV.get(loginRlKey)) || "0";
  if (parseInt(loginCount, 10) >= 10) {
    return c.json(
      {
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many login attempts" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      429,
    );
  }
  await c.env.REVENUE_GUARD_KV.put(
    loginRlKey,
    (parseInt(loginCount, 10) + 1).toString(),
    { expirationTtl: 60 },
  );

  const sessionId = `sess_${crypto.randomUUID()}`;
  const expiresAt = Date.now() + 20 * 60 * 1000;

  const quotaStatus = await getQuotaStatus(c.env);
  const throttleLevel = quotaStatus.throttleLevel;

  const forcesMockOnly =
    throttleLevel === "critical" || quotaStatus.percentageUsed >= 100;

  await c.env.REVENUE_GUARD_KV.put(
    sessionId,
    JSON.stringify({
      sessionId,
      ip,
      expiresAt,
      costs: 0,
      virtualCosts: 0,
      guardrailTriggered: false,
      throttleLevel,
      forcesMockOnly,
    }),
    { expirationTtl: 1200 },
  );

  const SKUS = VALID_SKUS.map((id) => ({ id, stock: 1000, price: 150.0 }));

  const batch = SKUS.map((sku) =>
    c.env.REVENUE_GUARD_DB.prepare(
      "INSERT INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).bind(sessionId, sku.id, sku.stock, sku.price, Date.now()),
  );
  await c.env.REVENUE_GUARD_DB.batch(batch);

  // Record CPU usage for login (estimate 50ms)
  await recordCpuUsage(c.env, 50);

  return c.json({
    success: true,
    data: {
      sessionId,
      expiresAt,
      ipAddress: ip,
      throttleLevel,
      forcesMockOnly,
    },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

auth.post("/logout", async (c) => {
  const reqId = genReqId();
  const authHeader = c.req.header("Authorization")?.split(" ")[1];

  if (authHeader) {
    await c.env.REVENUE_GUARD_KV.delete(authHeader);
  }

  return c.json({
    success: true,
    data: { loggedOut: true },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

auth.get("/me", async (c) => {
  const reqId = genReqId();
  const authHeader = c.req.header("Authorization")?.split(" ")[1];

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  const session = await getSession(c.env, authHeader);
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          code: "EXPIRED_SESSION",
          message: "Session not found or expired",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  if (session.expiresAt && Date.now() > session.expiresAt) {
    return c.json(
      {
        success: false,
        error: { code: "EXPIRED_SESSION", message: "Session has expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  const meRlKey = `rl:me:${authHeader}`;
  const meCount = (await c.env.REVENUE_GUARD_KV.get(meRlKey)) || "0";
  if (parseInt(meCount, 10) >= 60) {
    return c.json(
      {
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many requests" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      429,
    );
  }
  await c.env.REVENUE_GUARD_KV.put(
    meRlKey,
    (parseInt(meCount, 10) + 1).toString(),
    { expirationTtl: 60 },
  );

  return c.json({
    success: true,
    data: {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress || session.ip, // Handle inconsistency in session field name
    },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

export default auth;
