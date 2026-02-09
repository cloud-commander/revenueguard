import { Hono } from "hono";
import type { Env } from "../index";
import { VALID_SKUS, BUSINESS_RULES } from "../../shared/rules";
import {
  calculateTransactionCost,
  calculateVirtualCost,
} from "../../shared/rules";
import { recordCpuUsage } from "../services/quota";

import { genReqId, getSession } from "../utils/session";

const inventory = new Hono<{ Bindings: Env }>();

inventory.get("/state", async (c) => {
  const reqId =
    c.req.header("X-Idempotency-Key") ||
    c.req.header("X-Request-ID") ||
    genReqId();
  const authHeader = c.req.header("Authorization")?.split(" ")[1];

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
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
        error: { code: "INVALID_SESSION", message: "Session expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

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

  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(authHeader);
  const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);
  const res = await doStub.fetch(
    new Request("http://do/state?sessionId=" + authHeader),
  );
  const results = await res.json();

  c.executionCtx.waitUntil(recordCpuUsage(c.env, 20));
  return c.json({
    success: true,
    data: results,
    meta: { requestId: reqId, timestamp: Date.now() },
  });
});

inventory.post("/allocate", async (c) => {
  const start = Date.now();
  const reqId =
    c.req.header("X-Idempotency-Key") ||
    c.req.header("X-Request-ID") ||
    genReqId();
  const body = await c.req.json<{
    skuId: string;
    mode: string;
    units: number;
  }>();
  const authHeader = c.req.header("Authorization")?.split(" ")[1];
  const ip = c.req.header("cf-connecting-ip") || "0.0.0.0";
  const makeMeta = () => ({ requestId: reqId, timestamp: Date.now() });

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
        meta: makeMeta(),
      },
      401,
    );
  }

  const session = await getSession(c.env, authHeader);
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

  const sessionRateLimitKey = `rl:alloc:${authHeader}`;
  const ipRateLimitKey = `rl:alloc:ip:${ip}`;
  const [sessionRateCountRaw, ipRateCountRaw] = await Promise.all([
    c.env.REVENUE_GUARD_KV.get(sessionRateLimitKey),
    c.env.REVENUE_GUARD_KV.get(ipRateLimitKey),
  ]);
  const sessionRateCount = parseInt(sessionRateCountRaw || "0", 10);
  const ipRateCount = parseInt(ipRateCountRaw || "0", 10);

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

  if (!(VALID_SKUS as readonly string[]).includes(body.skuId)) {
    console.error(
      `[Inventory] Invalid SKU: "${body.skuId}". Valid SKUs: ${JSON.stringify(VALID_SKUS)}`,
    );
    return c.json(
      {
        success: false,
        error: { code: "INVALID_SKU", message: "Invalid SKU ID" },
        meta: makeMeta(),
      },
      400,
    );
  }

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
  const totalCost = calculateTransactionCost(
    units,
    parseFloat(c.env.BILLING_SCALE),
  );
  const virtualCost = calculateVirtualCost(units);
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
      blobs: [authHeader as string, session.ip, "VIRTUAL_GUARDRAIL_TRIGGERED"],
      doubles: [currentVirtualCosts + virtualCost],
      indexes: [authHeader as string],
    });
  } else {
    session.guardrailTriggered = false;
  }

  if (body.mode === "safe") {
    const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(authHeader);
    const doStub = c.env.REVENUE_GUARD_INVENTORY_DO.get(doId);

    const res = await doStub.fetch(
      new Request("http://do/allocate", {
        method: "POST",
        body: JSON.stringify({
          requestId: reqId,
          sessionId: authHeader,
          skuId: body.skuId,
          units: body.units,
          mode: body.mode,
          billingScale: parseFloat(c.env.BILLING_SCALE),
          previousCosts: session.costs,
          costLimit: parseFloat(c.env.DEMO_COST_LIMIT),
        }),
      }) as unknown as Request,
    );

    const data = (await res.json()) as any;

    if (data.success) {
      session.costs += totalCost;
      session.virtualCosts = currentVirtualCosts + virtualCost;
      await c.env.REVENUE_GUARD_KV.put(authHeader, JSON.stringify(session), {
        expirationTtl: 1200,
      });
      c.executionCtx.waitUntil(
        (async () => {
          c.env.REVENUE_GUARD_AE.writeDataPoint({
            blobs: [
              authHeader,
              session.ip,
              "ALLOCATION_SUCCESS_SAFE",
              body.skuId,
            ],
            doubles: [totalCost, units, Date.now() - start],
            indexes: [authHeader],
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

    // Propagate headers (like X-Processed-Id)
    const headers = new Headers();
    res.headers.forEach((v, k) => headers.set(k, v));

    return c.json(data, {
      status: res.status as any,
      headers,
    });
  } else {
    // Eventual path normally handled by DO reset or similar if needed,
    // but the original code said eventual path handled directly in index.ts.
    // I will include the eventual logic here too.
    const inv = (await c.env.REVENUE_GUARD_DB.prepare(
      "SELECT * FROM inventory WHERE session_id = ? AND sku_id = ?",
    )
      .bind(authHeader, body.skuId)
      .first<{ total_stock: number; allocated: number }>()) || {
      total_stock: BUSINESS_RULES.DEFAULT_STOCK,
      allocated: 0,
    };

    const available = inv.total_stock - inv.allocated;
    if (available < units) {
      return c.json(
        {
          success: false,
          error: { code: "INSUFFICIENT_STOCK", message: "Insufficient stock" },
          meta: makeMeta(),
        },
        400,
      );
    }

    // UPDATE DB
    await c.env.REVENUE_GUARD_DB.prepare(
      "UPDATE inventory SET allocated = allocated + ?, updated_at = ? WHERE session_id = ? AND sku_id = ?",
    )
      .bind(units, Date.now(), authHeader, body.skuId)
      .run();

    session.costs += totalCost;
    session.virtualCosts = currentVirtualCosts + virtualCost;
    await c.env.REVENUE_GUARD_KV.put(authHeader, JSON.stringify(session), {
      expirationTtl: 1200,
    });

    c.executionCtx.waitUntil(recordCpuUsage(c.env, 50));
    return c.json({
      success: true,
      data: {
        unitsAvailable: available - units,
        totalAllocated: inv.allocated + units,
      },
      meta: {
        ...makeMeta(),
        guardrailTriggered,
        virtualCosts: session.virtualCosts,
      },
    });
  }
});

inventory.post("/reset", async (c) => {
  const reqId =
    c.req.header("X-Idempotency-Key") ||
    c.req.header("X-Request-ID") ||
    genReqId();
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

  const authHeader = c.req.header("Authorization")?.split(" ")[1];
  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing session" },
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
        error: { code: "INVALID_SESSION", message: "Session expired" },
        meta: { requestId: reqId, timestamp: Date.now() },
      },
      401,
    );
  }

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
  await c.env.REVENUE_GUARD_KV.put(authHeader, JSON.stringify(session), {
    expirationTtl: 1200,
  });

  await c.env.REVENUE_GUARD_DB.prepare(
    "UPDATE inventory SET allocated = 0, updated_at = ? WHERE session_id = ?",
  )
    .bind(Date.now(), authHeader)
    .run();

  const doId = c.env.REVENUE_GUARD_INVENTORY_DO.idFromName(authHeader);
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

export default inventory;
