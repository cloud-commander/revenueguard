import { Hono } from "hono";
import { cors } from "hono/cors";
import { InventoryGuard } from "./InventoryGuard";

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

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:5173",
        "https://revenue-guard.cfdemo.link",
        "https://cf-peakpass.pages.dev",
      ];
      if (
        allowed.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return origin;
      }
      return allowed[0];
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Upgrade"],
    maxAge: 86400,
  }),
);

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
  const isDebugToken =
    turnstileToken === "DEBUG_TOKEN" ||
    turnstileToken.startsWith("mock-token-");

  if (
    !outcome.success &&
    !(isDebugToken && c.env.TURNSTILE_SECRET === "DEBUG_TOKEN")
  ) {
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

  // Rate Limiting (10/min per IP for login)
  const loginRlKey = `rl:login:${ip}`;
  const loginCount = (await c.env.REVENUE_GUARD_KV.get(loginRlKey)) || "0";
  if (parseInt(loginCount) >= 10) {
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
    (parseInt(loginCount) + 1).toString(),
    { expirationTtl: 60 },
  );

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = Date.now() + 20 * 60 * 1000;

  await c.env.REVENUE_GUARD_KV.put(
    sessionId,
    JSON.stringify({ sessionId, ip, expiresAt, costs: 0, virtualCosts: 0 }),
    { expirationTtl: 1200 },
  );

  // Seed isolated inventory for this session
  const SKUS = [
    { id: "sku-001", stock: 1000, price: 150.0 },
    { id: "sku-002", stock: 1000, price: 150.0 },
    { id: "sku-003", stock: 1000, price: 150.0 },
    { id: "sku-004", stock: 1000, price: 150.0 },
    { id: "sku-005", stock: 1000, price: 150.0 },
  ];

  const batch = SKUS.map((sku) =>
    c.env.REVENUE_GUARD_DB.prepare(
      "INSERT INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).bind(sessionId, sku.id, sku.stock, sku.price, Date.now()),
  );
  await c.env.REVENUE_GUARD_DB.batch(batch);

  return c.json({
    success: true,
    data: { sessionId, expiresAt, ipAddress: ip },
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
  if (parseInt(meCount) >= 60) {
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
    (parseInt(meCount) + 1).toString(),
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

  const { results } = await c.env.REVENUE_GUARD_DB.prepare(
    "SELECT * FROM inventory WHERE session_id = ?",
  )
    .bind(auth)
    .all();

  return c.json({
    success: true,
    data: results,
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

  const sessionRateLimitKey = `rl:alloc:${auth}`;
  const ipRateLimitKey = `rl:alloc:ip:${ip}`;
  const [sessionRateCountRaw, ipRateCountRaw] = await Promise.all([
    c.env.REVENUE_GUARD_KV.get(sessionRateLimitKey),
    c.env.REVENUE_GUARD_KV.get(ipRateLimitKey),
  ]);
  const sessionRateCount = parseInt(sessionRateCountRaw || "0", 10);
  const ipRateCount = parseInt(ipRateCountRaw || "0", 10);
  if (ipRateCount >= 10 || sessionRateCount >= 30) {
    const reason = ipRateCount >= 10 ? "IP" : "session";
    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many allocation requests (${reason} limit reached).`,
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

  if (!body.skuId || typeof body.skuId !== "string") {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SKU", message: "Missing or invalid SKU ID" },
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
    c.env.REVENUE_GUARD_AE.writeDataPoint({
      blobs: [auth as string, session.ip, "VIRTUAL_GUARDRAIL_TRIGGERED"],
      doubles: [currentVirtualCosts + virtualCost],
      indexes: [auth as string],
    });
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
          ...body,
          sessionId: auth,
          billingScale: parseFloat(c.env.BILLING_SCALE),
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
  if (session) {
    session.costs = 0;
    session.virtualCosts = 0;
    await c.env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
      expirationTtl: 1200,
    });
  }

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

  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(sessionId);
  const stub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);

  return stub.fetch(c.req.raw);
});

export default app;
export { InventoryGuard };
