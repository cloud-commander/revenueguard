import { Hono } from "hono";
import { cors } from "hono/cors";
import { InventoryGuard } from "./InventoryGuard";
import { BUSINESS_RULES, VALID_SKUS } from "../shared/constants";

export interface Env {
  REVENUE_GUARD_KV: KVNamespace;
  REVENUE_GUARD_DB: D1Database;
  REVENUE_GUARD_INVENTORY_DO: DurableObjectNamespace;
  TURNSTILE_SECRET: string;
  BILLING_SCALE: string;
  DEMO_COST_LIMIT: string;
  ALERT_THRESHOLD: string;
  REVENUE_GUARD_AE: {
    writeDataPoint(data: {
      blobs?: string[];
      doubles?: number[];
      indexes?: string[];
    }): void;
  };
  ASSETS: { fetch: typeof fetch };
  // Quota scaling env vars (optional, with defaults)
  QUOTA_CPU_MS?: string;
  QUOTA_SLOW_THRESHOLD?: string;
  QUOTA_CRITICAL_THRESHOLD?: string;
  QUOTA_CPU_LOGIN_MS?: string;
  QUOTA_CPU_ALLOCATE_MS?: string;
  QUOTA_CPU_STATE_MS?: string;
  QUOTA_POLL_INTERVAL_NORMAL?: string;
  QUOTA_POLL_INTERVAL_SLOW?: string;
  QUOTA_POLL_INTERVAL_CRITICAL?: string;
}

interface Meta {
  requestId: string;
  timestamp: number;
  guardrailTriggered?: boolean;
  virtualCosts?: number;
}

// Utility for Request IDs
function genReqId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Utility for session lookup
async function getSession(env: Env, sessionId: string) {
  try {
    const data = await env.REVENUE_GUARD_KV.get(sessionId);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error(`Failed to parse session ${sessionId}`, e);
    return null;
  }
}
// Quota tracking configuration helper
interface QuotaConfig {
  cpuLimitMs: number;
  throttleSlowThreshold: number;
  throttleCriticalThreshold: number;
  cpuLoginMs: number;
  cpuAllocateMs: number;
  cpuStateMs: number;
}

function getQuotaConfig(env: Env): QuotaConfig {
  return {
    cpuLimitMs: parseInt(env.QUOTA_CPU_MS || "30000000", 10),
    throttleSlowThreshold: parseFloat(env.QUOTA_SLOW_THRESHOLD || "0.5"),
    throttleCriticalThreshold: parseFloat(
      env.QUOTA_CRITICAL_THRESHOLD || "0.8",
    ),
    cpuLoginMs: parseInt(env.QUOTA_CPU_LOGIN_MS || "50", 10),
    cpuAllocateMs: parseInt(env.QUOTA_CPU_ALLOCATE_MS || "50", 10),
    cpuStateMs: parseInt(env.QUOTA_CPU_STATE_MS || "20", 10),
  };
}

// Get current month key for quota tracking
function getQuotaKey() {
  const now = new Date();
  return `quota:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Get current quota status
async function getQuotaStatus(env: Env) {
  const config = getQuotaConfig(env);
  const quotaKey = getQuotaKey();
  const data = await env.REVENUE_GUARD_KV.get(quotaKey);
  const cpuUsedMs = data ? parseInt(data, 10) : 0;
  const cpuRemainingMs = Math.max(0, config.cpuLimitMs - cpuUsedMs);
  const percentageUsed = Math.round((cpuUsedMs / config.cpuLimitMs) * 100);

  let throttleLevel: "normal" | "slow" | "critical" = "normal";
  const usageRatio = cpuUsedMs / config.cpuLimitMs;
  if (usageRatio >= config.throttleCriticalThreshold) {
    throttleLevel = "critical";
  } else if (usageRatio >= config.throttleSlowThreshold) {
    throttleLevel = "slow";
  }

  return {
    cpuUsedMs,
    cpuRemainingMs,
    cpuLimitMs: config.cpuLimitMs,
    throttleLevel,
    percentageUsed,
  };
}

// Record CPU usage for a request
// Record CPU usage for a request (Sampled)
async function recordCpuUsage(env: Env, cpuMs: number) {
  // SECURITY: Probabilistic sampling to reduce KV write costs (Bill Shock)
  if (Math.random() > 0.1) return;

  const quotaKey = getQuotaKey();
  const status = await getQuotaStatus(env);
  // Scale up usage to account for sampling
  const newUsage = status.cpuUsedMs + cpuMs * 10;
  await env.REVENUE_GUARD_KV.put(quotaKey, newUsage.toString(), {
    expirationTtl: 2_592_000, // 30 days
  });
}

const app = new Hono<{ Bindings: Env }>();

// SECURITY: Global error handler to sanitise error messages
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An error occurred" },
      meta: { requestId: genReqId(), timestamp: Date.now() },
    },
    500,
  );
});

// Add NotFound handler to ensure 404s return JSON
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: `Route not found: ${c.req.path}` },
      meta: { requestId: genReqId(), timestamp: Date.now() },
    },
    404,
  );
});

// SECURITY: Request body size limit (10KB)
app.use("/api/*", async (c, next) => {
  const contentLength = parseInt(c.req.header("Content-Length") || "0", 10);
  if (contentLength > 10_000) {
    return c.json(
      {
        success: false,
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
        meta: { requestId: genReqId(), timestamp: Date.now() },
      },
      413,
    );
  }
  await next();
});

// SECURITY: Content-Type validation for POST requests
app.use("/api/*", async (c, next) => {
  if (c.req.method === "POST") {
    const ct = c.req.header("Content-Type");
    if (!ct?.includes("application/json")) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_CONTENT_TYPE",
            message: "Content-Type must be application/json",
          },
          meta: { requestId: genReqId(), timestamp: Date.now() },
        },
        415,
      );
    }
  }
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:5173",
        "https://revenue-guard.cfdemo.link",
        "https://cf-peakpass.pages.dev",
      ];
      // SECURITY: Hardened CORS - exact localhost match only (prevents localhost.attacker.com)
      const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
      if (allowed.includes(origin) || devOrigins.includes(origin)) {
        return origin;
      }
      return allowed[0];
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Upgrade",
      "X-Requested-With",
    ],
    maxAge: 86400,
  }),
);

// SECURITY: CSRF protection for state-changing demo endpoints
app.use("/api/demo/*", async (c, next) => {
  if (c.req.method === "POST") {
    const xRequestedWith = c.req.header("X-Requested-With");
    if (xRequestedWith !== "XMLHttpRequest") {
      return c.json(
        {
          success: false,
          error: { code: "CSRF_BLOCKED", message: "Missing CSRF header" },
          meta: { requestId: genReqId(), timestamp: Date.now() },
        },
        403,
      );
    }
  }
  await next();
});

app.post("/api/auth/login", async (c) => {
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
  // SECURITY: Only allow debug tokens in non-production environments
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

  // SECURITY: Global Session Limit (Zombie Swarm Mitigation)
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
  // Probabilistic increment to avoid hotspot (1 in 10)
  if (Math.random() < 0.1) {
    const count = parseInt(globalCount || "0", 10);
    c.executionCtx.waitUntil(
      c.env.REVENUE_GUARD_KV.put(globalSessionKey, (count + 10).toString(), {
        expirationTtl: 3600,
      }),
    );
  }

  // Rate Limiting (10/min per IP for login)
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

  // SECURITY: Use CSPRNG for session IDs
  const sessionId = `sess_${crypto.randomUUID()}`;
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const quotaStatus = await getQuotaStatus(c.env);
  const throttleLevel = quotaStatus.throttleLevel;

  // Force mock-only mode when quota is critical or exhausted
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

  // Seed isolated inventory for this session
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

// SECURITY: Logout endpoint to invalidate sessions
app.post("/api/auth/logout", async (c) => {
  const reqId = genReqId();
  const auth = c.req.header("Authorization")?.split(" ")[1];

  if (auth) {
    await c.env.REVENUE_GUARD_KV.delete(auth);
  }

  return c.json({
    success: true,
    data: { loggedOut: true },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.get("/api/auth/me", async (c) => {
  const reqId = genReqId();
  const auth = c.req.header("Authorization")?.split(" ")[1];

  if (!auth) {
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

  const session = await getSession(c.env, auth);
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

  const meRlKey = `rl:me:${auth}`;
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
      ipAddress: session.ip,
    },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.get("/api/demo/state", async (c) => {
  const reqId = genReqId();
  const auth = c.req.header("Authorization")?.split(" ")[1];

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  const session = await getSession(c.env, auth);
  if (!session) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SESSION", message: "Session expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  // Reject live state requests when quota is exhausted
  if (session.forcesMockOnly) {
    return c.json(
      {
        success: false,
        error: {
          code: "QUOTA_EXHAUSTED",
          message:
            "Worker CPU quota exhausted. Switch to mock mode to continue demo.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      503,
    );
  }

  // SECURITY: State Hammer Mitigation - Read from DO memory instead of D1
  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(auth);
  const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);
  // Use internal Request to fetch state
  const res = await doStub.fetch(
    new Request("http://do/state?sessionId=" + auth),
  );
  const results = await res.json();

  c.executionCtx.waitUntil(recordCpuUsage(c.env, 20));
  return c.json({
    success: true,
    data: results,
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.get("/api/quota/status", async (c) => {
  const reqId = genReqId();

  // SECURITY: Require authentication for quota status
  const auth = c.req.header("Authorization")?.split(" ")[1];
  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  const quotaStatus = await getQuotaStatus(c.env);

  return c.json({
    success: true,
    data: quotaStatus,
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.post("/api/demo/allocate", async (c) => {
  const start = Date.now();
  const reqId = genReqId();
  const body = await c.req.json<{
    skuId: string;
    mode: string;
    units: number;
  }>();
  const auth = c.req.header("Authorization")?.split(" ")[1];
  const ip = c.req.header("cf-connecting-ip") || "0.0.0.0";
  const makeMeta = () => ({ requestId: reqId, timestamp: Date.now() });

  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
        meta: makeMeta(),
      },
      401,
    );
  }

  const session = await getSession(c.env, auth);
  if (!session) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SESSION", message: "Session expired" },
        meta: makeMeta(),
      },
      401,
    );
  }

  // Reject live allocations when quota is exhausted
  if (session.forcesMockOnly) {
    return c.json(
      {
        success: false,
        error: {
          code: "QUOTA_EXHAUSTED",
          message:
            "Worker CPU quota exhausted. Switch to mock mode to continue demo.",
        },
        meta: makeMeta(),
      },
      503,
    );
  }

  const sessionRateLimitKey = `rl:alloc:${auth}`;
  const ipRateLimitKey = `rl:alloc:ip:${ip}`;
  const [sessionRateCountRaw, ipRateCountRaw] = await Promise.all([
    c.env.REVENUE_GUARD_KV.get(sessionRateLimitKey),
    c.env.REVENUE_GUARD_KV.get(ipRateLimitKey),
  ]);
  const sessionRateCount = parseInt(sessionRateCountRaw || "0", 10);
  const ipRateCount = parseInt(ipRateCountRaw || "0", 10);

  // Determine throttle-aware rate limits
  const throttleLevel = session.throttleLevel || "normal";
  let maxSessionRate = 30;
  let maxIpRate = 10;
  if (throttleLevel === "slow") {
    maxSessionRate = 5;
    maxIpRate = 2;
  } else if (throttleLevel === "critical") {
    maxSessionRate = 1;
    maxIpRate = 1;
  }

  if (ipRateCount >= maxIpRate || sessionRateCount >= maxSessionRate) {
    const reason = ipRateCount >= maxIpRate ? "IP" : "session";
    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many allocation requests (${reason} limit reached). Throttle level: ${throttleLevel}`,
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      429,
    );
  }
  c.executionCtx.waitUntil(
    Promise.all([
      c.env.REVENUE_GUARD_KV.put(
        sessionRateLimitKey,
        (sessionRateCount + 1).toString(),
        { expirationTtl: 60 },
      ),
      c.env.REVENUE_GUARD_KV.put(ipRateLimitKey, (ipRateCount + 1).toString(), {
        expirationTtl: 60,
      }),
    ]),
  );

  if (typeof body.units !== "number" || isNaN(body.units)) {
    return c.json(
      {
        success: false,
        error: {
          code: "INVALID_UNITS",
          message: "Units must be a valid number",
        },
        meta: makeMeta(),
      },
      400,
    );
  }

  if (body.units < 0) {
    return c.json(
      {
        success: false,
        error: { code: "NEGATIVE_UNITS", message: "Units cannot be negative" },
        meta: makeMeta(),
      },
      400,
    );
  }

  // SECURITY: Ghost SKU Check
  if (!(VALID_SKUS as readonly string[]).includes(body.skuId)) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SKU", message: "Invalid SKU ID" },
        meta: makeMeta(),
      },
      400,
    );
  }

  // SECURITY: Enforce MAX_UNITS at worker layer (defense in depth)
  if (body.units > BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION) {
    return c.json(
      {
        success: false,
        error: {
          code: "EXCEEDS_MAX_TRANSACTION",
          message: `Max ${BUSINESS_RULES.MAX_UNITS_PER_TRANSACTION} units per transaction`,
        },
        meta: makeMeta(),
      },
      400,
    );
  }

  const units = Math.floor(body.units);
  const costPerUnit = 150 * parseFloat(c.env.BILLING_SCALE);
  const totalCost = units * costPerUnit;

  const virtualUnitPrice = 150;
  const virtualCost = units * virtualUnitPrice;
  const currentVirtualCosts = session.virtualCosts || 0;

  if (session.costs + totalCost > parseFloat(c.env.DEMO_COST_LIMIT)) {
    return c.json(
      {
        success: false,
        error: {
          code: "REAL_BUDGET_EXCEEDED",
          message: "Safety bypass triggered. Actual billing limit reached.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      403,
    );
  }

  const VIRTUAL_LIMIT = 100;
  let guardrailTriggered = false;
  if (currentVirtualCosts + virtualCost > VIRTUAL_LIMIT) {
    guardrailTriggered = true;
    session.guardrailTriggered = true;
    c.env.REVENUE_GUARD_AE.writeDataPoint({
      blobs: [auth as string, session.ip, "VIRTUAL_GUARDRAIL_TRIGGERED"],
      doubles: [currentVirtualCosts + virtualCost],
      indexes: [auth as string],
    });
  } else {
    session.guardrailTriggered = false;
  }

  if (body.mode === "safe") {
    // Inventory Guard DO
    // CRITICAL FIX: Use SessionID as the DO ID to match the WebSocket connection
    // This allows the DO to broadcast back to the connected client.
    const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(auth);
    const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);

    // Using simple fetch to DO (could be RPC if upgraded)
    const res = await doStub.fetch(
      new Request("http://do/allocate", {
        method: "POST",
        body: JSON.stringify({
          sessionId: auth,
          skuId: body.skuId,
          units: body.units,
          mode: body.mode,
          billingScale: parseFloat(c.env.BILLING_SCALE),
          previousCosts: session.costs, // Critical: Sync KV cost to DO for strict atomic limit
          costLimit: parseFloat(c.env.DEMO_COST_LIMIT), // Pass dynamic limit
        }),
      }) as unknown as Request,
    );

    const data = (await res.json()) as {
      success: boolean;
      data?: any;
      error?: any;
      meta?: Meta;
    };

    if (data.success) {
      session.costs += totalCost;
      session.virtualCosts = currentVirtualCosts + virtualCost;
      await c.env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
        expirationTtl: 1200,
      });
      c.executionCtx.waitUntil(
        (async () => {
          c.env.REVENUE_GUARD_AE.writeDataPoint({
            blobs: [auth, session.ip, "ALLOCATION_SUCCESS_SAFE", body.skuId],
            doubles: [totalCost, units, Date.now() - start],
            indexes: [auth],
          });
        })(),
      );
    }

    data.meta = {
      requestId: reqId,
      timestamp: Date.now(),
      guardrailTriggered,
      virtualCosts: session.virtualCosts,
    };

    c.executionCtx.waitUntil(recordCpuUsage(c.env, 50));
    return c.json(data, res.status as any);
  } else {
    // Eventual Consistency
    const inv = (await c.env.REVENUE_GUARD_DB.prepare(
      "SELECT * FROM inventory WHERE session_id = ? AND sku_id = ?",
    )
      .bind(auth, body.skuId)
      .first()) as {
      sku_id: string;
      allocated: number;
      total_stock: number;
    } | null;

    if (!inv) {
      return c.json(
        {
          success: false,
          error: { code: "INVALID_SKU", message: "SKU not found" },
        },
        400,
      );
    }

    await new Promise((r) => setTimeout(r, 100));

    // SECURITY: Use DO for atomic billing check even in eventual mode
    const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(auth);
    const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);
    const billingCheckRes = await doStub.fetch(
      new Request("http://do/billing-check", {
        method: "POST",
        body: JSON.stringify({
          previousCosts: session.costs,
          transactionCost: totalCost,
          costLimit: parseFloat(c.env.DEMO_COST_LIMIT),
          skuId: body.skuId, // Soft check param
          units: body.units, // Soft check param
        }),
      }),
    );
    if (!billingCheckRes.ok) {
      const billingError = (await billingCheckRes.json()) as {
        success: boolean;
        error?: { code: string; message: string };
      };
      return c.json(
        billingError,
        billingCheckRes.status as 200 | 400 | 403 | 429,
      );
    }

    const oversold = inv.allocated + body.units > inv.total_stock;
    const oversellDelta = oversold
      ? inv.allocated + body.units - inv.total_stock
      : 0;

    if (inv.allocated < inv.total_stock || oversold) {
      await c.env.REVENUE_GUARD_DB.prepare(
        "UPDATE inventory SET allocated = allocated + ?, updated_at = ? WHERE session_id = ? AND sku_id = ?",
      )
        .bind(body.units, Date.now(), auth, body.skuId)
        .run();

      session.costs += totalCost;
      session.virtualCosts = currentVirtualCosts + virtualCost;
      await c.env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
        expirationTtl: 1200,
      });

      c.executionCtx.waitUntil(recordCpuUsage(c.env, 50));
      return c.json({
        success: true,
        data: {
          unitsAvailable: Math.max(
            0,
            inv.total_stock - (inv.allocated + body.units),
          ),
          totalAllocated: inv.allocated + body.units,
          revenueGenerated: totalCost,
          oversellDelta,
        },
        meta: {
          requestId: reqId,
          timestamp: Date.now(),
          guardrailTriggered,
          virtualCosts: session.virtualCosts,
        },
      });
    } else {
      return c.json(
        {
          success: false,
          error: { code: "OUT_OF_STOCK", message: "Insufficient stock" },
          meta: { requestId: reqId, timestamp: Date.now() },
        },
        400,
      );
    }
  }
});

app.post("/api/demo/reset", async (c) => {
  const reqId = genReqId();
  const ip = c.req.header("cf-connecting-ip") || "0.0.0.0";
  const rateLimitKey = `rl_reset_${ip}`;

  const lastReset = await c.env.REVENUE_GUARD_KV.get(rateLimitKey);
  if (lastReset) {
    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Reset limited to once per minute.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      429,
    );
  }

  await c.env.REVENUE_GUARD_KV.put(rateLimitKey, "true", { expirationTtl: 60 });

  const auth = c.req.header("Authorization")?.split(" ")[1];
  if (!auth) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  // Reset session metrics in KV
  const session = await getSession(c.env, auth);
  if (!session) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SESSION", message: "Session expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

  // Reject live resets when quota is exhausted
  if (session.forcesMockOnly) {
    return c.json(
      {
        success: false,
        error: {
          code: "QUOTA_EXHAUSTED",
          message:
            "Worker CPU quota exhausted. Switch to mock mode to continue demo.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      503,
    );
  }

  session.costs = 0;
  session.virtualCosts = 0;
  session.guardrailTriggered = false;
  await c.env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
    expirationTtl: 1200,
  });

  await c.env.REVENUE_GUARD_DB.prepare(
    "UPDATE inventory SET allocated = 0, updated_at = ? WHERE session_id = ?",
  )
    .bind(Date.now(), auth)
    .run();

  // Reset the Session DO
  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(auth);
  const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);
  c.executionCtx.waitUntil(
    doStub.fetch(new Request("http://do/reset", { method: "POST" })),
  );

  return c.json({
    success: true,
    data: { success: true },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.post("/api/auth/logout", async (c) => {
  const reqId = genReqId();
  const auth = c.req.header("Authorization")?.split(" ")[1];
  if (auth) {
    await c.env.REVENUE_GUARD_KV.delete(auth);
  }
  return c.json({
    success: true,
    data: { success: true },
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

app.get("/api/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  /*
   * CRITICAL: We need a mapping strategy.
   * Option A: One Global Room (Multi-tenant chaos)
   * Option B: One Room Per Session (Isolation)
   *
   * Since this is Revenue Guard, we want per-user isolation for the demo.
   * However, to demonstrate "Multiplayer", we might want a shared room.
   *
   * Updated Strategy:
   * We attach to a "Global Dashboard" DO for generic metrics,
   * OR we attach to the specific Inventory DO if we want SKU updates.
   *
   * For Simplicity & Architecture correctness:
   * We will connect to a NEW "SessionMonitor" DO or reuse InventoryGuard?
   *
   * Let's reuse InventoryGuard. We need to connect to the specific SKU shard?
   * No, that's too many connections.
   *
   * Better Pattern: connecting to a "SessionController" DO that aggregates.
   *
   * For this PoC, let's connect to a singleton "Global" InventoryGuard
   * OR simply allow connecting to the User's Session ID as the DO ID.
   */

  // Using the Session ID as the DO ID for a "Session Controller" pattern
  // But wait, InventoryGuard is per SKU in the current logic:
  // const shardId = `${auth}-${body.skuId}`;

  // To get ALL updates for a session, we need a Session-Level DO.
  // OR we just connect to one "Aggregator".

  // Let's create a "SessionRoom" DO or just use a specific ID for the WS.
  // We'll use the SessionID as the generic "Room" for this user.

  /*
   * REVISION: Using `InventoryGuard` as the WebSocket Target.
   * But `InventoryGuard` is logically sharded.
   *
   * Simplification: The frontend will open ONE WebSocket to `InventoryGuard`
   * with ID = `session_id`.
   * This specific DO instance will act as the "Coordinator" for that session.
   */

  const url = new URL(c.req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return c.text("Missing sessionId", 400);
  }

  // SECURITY: If Authorization is present, it must match the sessionId.
  const authHeader = c.req.header("Authorization")?.split(" ")[1];
  if (authHeader && authHeader !== sessionId) {
    return c.text("Authorization must match sessionId", 401);
  }

  const session = await getSession(c.env, sessionId);
  if (!session) {
    return c.text("Session not found", 401);
  }
  if (session.expiresAt && Date.now() > session.expiresAt) {
    return c.text("Session expired", 401);
  }
  if (session.guardrailTriggered) {
    return c.text("Guardrail triggered", 403);
  }

  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(sessionId);
  const stub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);

  // Ensure the DO sees an Authorization header (browser WebSocket cannot set headers).
  const forwardHeaders = new Headers(c.req.raw.headers);
  forwardHeaders.set("Authorization", `Bearer ${sessionId}`);
  const forwardRequest = new Request(c.req.raw, { headers: forwardHeaders });

  return stub.fetch(forwardRequest);
});

export default app;
export { InventoryGuard };
