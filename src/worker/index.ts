/// <reference types="@cloudflare/workers-types" />
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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const reqId = genReqId();

    // CORS headers
    const origin = request.headers.get("Origin");
    const ALLOWED_ORIGINS = [
      "http://localhost:5173",
      "https://revenue-guard.cfdemo.link",
      "https://cf-peakpass.pages.dev",
    ];

    const isAllowed =
      origin &&
      (ALLOWED_ORIGINS.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      console.log(
        `[REQUEST] id=${reqId} method=${request.method} path=${path}`,
      );
      if (path === "/api/auth/login")
        return await handleLogin(request, env, reqId, corsHeaders);
      if (path === "/api/auth/me")
        return await handleAuthMe(request, env, reqId, corsHeaders);
      if (path === "/api/demo/state")
        return await handleState(request, env, reqId, corsHeaders);
      if (path === "/api/demo/allocate")
        return await handleAllocate(request, env, ctx, reqId, corsHeaders);
      if (path === "/api/demo/reset")
        return await handleReset(request, env, ctx, reqId, corsHeaders);
      if (path === "/api/auth/logout")
        return await handleLogout(request, env, reqId, corsHeaders);

      // Fallback to static assets
      if (!path.startsWith("/api")) {
        return await env.ASSETS.fetch(request);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "SERVER_ERROR", message: errorMessage },
          meta: { requestId: reqId, timestamp: Date.now() },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  },
};

async function handleLogin(
  request: Request,
  env: Env,
  reqId: string,
  headers: Record<string, string>,
) {
  const { turnstileToken } = (await request.json()) as {
    turnstileToken: string;
  };
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";

  // Real Turnstile Verification
  if (!turnstileToken) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "MISSING_TOKEN", message: "Missing token" },
      }),
      { status: 400, headers },
    );
  }

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET);
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
    !(isDebugToken && env.TURNSTILE_SECRET === "DEBUG_TOKEN")
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Turnstile verification failed",
        },
      }),
      { status: 403, headers },
    );
  }

  // Rate Limiting (10/min per IP for login)
  const loginRlKey = `rl:login:${ip}`;
  const loginCount = (await env.REVENUE_GUARD_KV.get(loginRlKey)) || "0";
  if (parseInt(loginCount) >= 10) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many login attempts" },
      }),
      { status: 429, headers },
    );
  }
  await env.REVENUE_GUARD_KV.put(
    loginRlKey,
    (parseInt(loginCount) + 1).toString(),
    { expirationTtl: 60 },
  );

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = Date.now() + 20 * 60 * 1000;

  await env.REVENUE_GUARD_KV.put(
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
    env.REVENUE_GUARD_DB.prepare(
      "INSERT INTO inventory (session_id, sku_id, total_stock, allocated, unit_price, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).bind(sessionId, sku.id, sku.stock, sku.price, Date.now()),
  );
  await env.REVENUE_GUARD_DB.batch(batch);

  return new Response(
    JSON.stringify({
      success: true,
      data: { sessionId, expiresAt, ipAddress: ip },
      meta: { requestId: reqId, timestamp: Date.now() },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function handleAuthMe(
  request: Request,
  env: Env,
  reqId: string,
  headers: Record<string, string>,
) {
  const auth = request.headers.get("Authorization")?.split(" ")[1];
  if (!auth) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  const session = await getSession(env, auth);
  if (!session) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "EXPIRED_SESSION",
          message: "Session not found or expired",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // Validate TTL
  if (session.expiresAt && Date.now() > session.expiresAt) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "EXPIRED_SESSION", message: "Session has expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // Rate Limiting (60/min per session for /me)
  const meRlKey = `rl:me:${auth}`;
  const meCount = (await env.REVENUE_GUARD_KV.get(meRlKey)) || "0";
  if (parseInt(meCount) >= 60) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many requests" },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      { status: 429, headers },
    );
  }
  await env.REVENUE_GUARD_KV.put(meRlKey, (parseInt(meCount) + 1).toString(), {
    expirationTtl: 60,
  });

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        ipAddress: session.ip,
      },
      meta: { requestId: reqId, timestamp: Date.now() },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function handleState(
  request: Request,
  env: Env,
  reqId: string,
  headers: Record<string, string>,
) {
  const auth = request.headers.get("Authorization")?.split(" ")[1];
  if (!auth) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
      }),
      { status: 401, headers },
    );
  }

  const { results } = await env.REVENUE_GUARD_DB.prepare(
    "SELECT * FROM inventory WHERE session_id = ?",
  )
    .bind(auth)
    .all();

  return new Response(
    JSON.stringify({
      success: true,
      data: results,
      meta: { requestId: reqId, timestamp: Date.now() },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function handleAllocate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  reqId: string,
  headers: Record<string, string>,
) {
  const start = Date.now();
  const body = (await request.json()) as {
    skuId: string;
    mode: string;
    units: number;
  };
  const auth = request.headers.get("Authorization")?.split(" ")[1];

  if (!auth)
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
      }),
      { status: 401, headers },
    );

  const session = await getSession(env, auth);
  if (!session)
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "INVALID_SESSION", message: "Session expired" },
      }),
      { status: 401, headers },
    );

  // Rate Limiting (120/min per session for allocation to handle 2s ticker + burst)
  const rateLimitKey = `rl:alloc:${auth}`;
  const rateLimitCount = (await env.REVENUE_GUARD_KV.get(rateLimitKey)) || "0";
  if (parseInt(rateLimitCount) >= 120) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message:
            "Too many allocation requests (120/min limit reached). Simulation slowed.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 429,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }
  // Increment and expire after 60s
  ctx.waitUntil(
    env.REVENUE_GUARD_KV.put(
      rateLimitKey,
      (parseInt(rateLimitCount) + 1).toString(),
      { expirationTtl: 60 },
    ),
  );

  const units = body.units || 1;
  const costPerUnit = 150 * parseFloat(env.BILLING_SCALE);
  const totalCost = units * costPerUnit;

  const virtualUnitPrice = 150;
  const virtualCost = units * virtualUnitPrice;
  const currentVirtualCosts = session.virtualCosts || 0;

  // Real Hard Safety: Zero-Tolerance for actual billing
  if (session.costs + totalCost > parseFloat(env.DEMO_COST_LIMIT)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "REAL_BUDGET_EXCEEDED",
          message: "Safety bypass triggered. Actual billing limit reached.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  // Virtual Demo Limit: The "Wow" moment
  const VIRTUAL_LIMIT = 100;
  let guardrailTriggered = false;
  if (currentVirtualCosts + virtualCost > VIRTUAL_LIMIT) {
    guardrailTriggered = true;
    env.REVENUE_GUARD_AE.writeDataPoint({
      blobs: [auth as string, session.ip, "VIRTUAL_GUARDRAIL_TRIGGERED"],
      doubles: [currentVirtualCosts + virtualCost],
      indexes: [auth as string],
    });
  }

  if (body.mode === "safe") {
    // Inventory Sharding removed (Option A: Consolidation)
    // Using one DO per SKU per session for true atomicity.
    const shardId = `${auth}-${body.skuId}`;

    const doId = env.REVENUE_GUARD_INVENTORY_DO.idFromName(shardId);
    const doStub = env.REVENUE_GUARD_INVENTORY_DO.get(doId);
    const res = await doStub.fetch(
      new Request("http://do/allocate", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          sessionId: auth,
          billingScale: parseFloat(env.BILLING_SCALE),
        }),
      }) as unknown as Request,
    );

    const data = (await res.json()) as {
      success: boolean;
      data?: {
        unitsAvailable: number;
        totalAllocated: number;
        revenueGenerated: number;
      };
      error?: { code: string; message: string };
      meta?: Meta;
    };

    // Update session costs in KV
    if (data.success) {
      session.costs += totalCost;
      session.virtualCosts = currentVirtualCosts + virtualCost;
      await env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
        expirationTtl: 1200,
      });
      ctx.waitUntil(
        (async () => {
          env.REVENUE_GUARD_AE.writeDataPoint({
            blobs: [auth, session.ip, "ALLOCATION_SUCCESS_SAFE", body.skuId],
            doubles: [totalCost, units, Date.now() - start], // totalCost, units, latency
            indexes: [auth],
          });
        })(),
      );
    }

    // Inject metadata
    data.meta = {
      requestId: reqId,
      timestamp: Date.now(),
      guardrailTriggered,
      virtualCosts: session.virtualCosts,
    };

    return new Response(JSON.stringify(data), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } else {
    // Eventual Consistency (D1 Race Condition)
    // 1. Read
    const inv = (await env.REVENUE_GUARD_DB.prepare(
      "SELECT * FROM inventory WHERE session_id = ? AND sku_id = ?",
    )
      .bind(auth, body.skuId)
      .first()) as {
      sku_id: string;
      allocated: number;
      total_stock: number;
    } | null;
    if (!inv)
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INVALID_SKU", message: "SKU not found" },
        }),
        { status: 400, headers },
      );

    // 2. Simulate Latency Change
    await new Promise((r) => setTimeout(r, 100));

    // 3. Write
    const oversold = inv.allocated + body.units > inv.total_stock;
    const oversellDelta = oversold
      ? inv.allocated + body.units - inv.total_stock
      : 0;

    if (inv.allocated < inv.total_stock || oversold) {
      // Allow "oversell" for demo purposes in eventual mode
      await env.REVENUE_GUARD_DB.prepare(
        "UPDATE inventory SET allocated = allocated + ?, updated_at = ? WHERE session_id = ? AND sku_id = ?",
      )
        .bind(body.units, Date.now(), auth, body.skuId)
        .run();

      // Update session costs in KV
      session.costs += totalCost;
      session.virtualCosts = currentVirtualCosts + virtualCost;
      await env.REVENUE_GUARD_KV.put(auth, JSON.stringify(session), {
        expirationTtl: 1200,
      });

      return new Response(
        JSON.stringify({
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
        }),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "OUT_OF_STOCK", message: "Insufficient stock" },
          meta: { requestId: reqId, timestamp: Date.now() },
        }),
        {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        },
      );
    }
  }
}

async function handleReset(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  reqId: string,
  headers: Record<string, string>,
) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const rateLimitKey = `rl_reset_${ip}`;

  // Rate Limit: 1 reset per minute per IP
  const lastReset = await env.REVENUE_GUARD_KV.get(rateLimitKey);
  if (lastReset) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Reset limited to once per minute.",
        },
        meta: { requestId: reqId, timestamp: Date.now() },
      }),
      {
        status: 429,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  await env.REVENUE_GUARD_KV.put(rateLimitKey, "true", { expirationTtl: 60 });

  console.log(`[RESETEVENT] id=${reqId} ip=${ip}`);

  const auth = request.headers.get("Authorization")?.split(" ")[1];
  if (!auth) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
      }),
      { status: 401, headers },
    );
  }

  // Reset D1 for THIS session
  await env.REVENUE_GUARD_DB.prepare(
    "UPDATE inventory SET allocated = 0, updated_at = ? WHERE session_id = ?",
  )
    .bind(Date.now(), auth)
    .run();

  // Reset DO Shards for THIS session
  const SKUS = ["sku-001", "sku-002", "sku-003", "sku-004", "sku-005"];
  for (const skuId of SKUS) {
    const shardId = `${auth}-${skuId}`;
    const doId = env.REVENUE_GUARD_INVENTORY_DO.idFromName(shardId);
    const doStub = env.REVENUE_GUARD_INVENTORY_DO.get(doId);
    ctx.waitUntil(
      doStub.fetch(new Request("http://do/reset", { method: "POST" })),
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: { success: true },
      meta: { requestId: reqId, timestamp: Date.now() },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}

async function handleLogout(
  request: Request,
  env: Env,
  reqId: string,
  headers: Record<string, string>,
) {
  const auth = request.headers.get("Authorization")?.split(" ")[1];
  if (auth) {
    await env.REVENUE_GUARD_KV.delete(auth);
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: { success: true },
      meta: { requestId: reqId, timestamp: Date.now() },
    }),
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
}

export { InventoryGuard };
