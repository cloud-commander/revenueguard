import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";

import { InventoryGuard } from "./InventoryGuard";
import auth from "./routes/auth";
import inventory from "./routes/inventory";
import quota from "./routes/quota";
import { getSession } from "./utils/session";

export interface Env {
  REVENUE_GUARD_KV: KVNamespace;
  REVENUE_GUARD_DB: D1Database;
  REVENUE_GUARD_INVENTORY_DO: DurableObjectNamespace<InventoryGuard>;
  REVENUE_GUARD_AE: AnalyticsEngineDataset;
  TURNSTILE_SECRET: string;
  DEMO_COST_LIMIT: string;
  BILLING_SCALE: string;
  QUOTA_CPU_MS?: string;
  QUOTA_SLOW_THRESHOLD?: string;
  QUOTA_CRITICAL_THRESHOLD?: string;
  QUOTA_CPU_LOGIN_MS?: string;
  QUOTA_CPU_ALLOCATE_MS?: string;
  QUOTA_CPU_STATE_MS?: string;
}

const app = new Hono<{ Bindings: Env }>();

// --- MIDDLEWARE ---
app.use("*", cors());

// Custom CSRF middleware (PeakPass requirement: X-Requested-With for POST on demo routes)
app.use("/api/demo/*", async (c, next) => {
  if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
    const xReqWith = c.req.header("X-Requested-With");
    if (!xReqWith || xReqWith !== "XMLHttpRequest") {
      return c.json(
        {
          success: false,
          error: { code: "CSRF_BLOCKED", message: "CSRF protection triggered" },
        },
        403,
      );
    }
  }
  await next();
});

// Content-Type validation
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    const contentType = c.req.header("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      return c.json(
        {
          success: false,
          error: { code: "INVALID_CONTENT_TYPE", message: "Must be JSON" },
        },
        415,
      );
    }
  }
  await next();
});

app.use(
  "/api/*",
  bodyLimit({
    maxSize: 10 * 1024, // 10KB max for API requests
    onError: (c) => {
      return c.json(
        {
          success: false,
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Request body exceeds 10KB limit",
          },
        },
        413,
      );
    },
  }),
);

// --- ROUTES ---
app.route("/api/auth", auth);
app.route("/api/demo", inventory);
app.route("/api/quota", quota);

// --- WEBSOCKET ---
app.get("/api/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  const url = new URL(c.req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return c.text("Missing sessionId", 400);
  }

  // NOTE: Browser-native WebSockets cannot send custom headers.
  // We rely on the sessionId query parameter which is validated against the session store.
  // The session itself is retrieved and verified below.

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

  const forwardHeaders = new Headers(c.req.raw.headers);
  forwardHeaders.set("Authorization", `Bearer ${sessionId}`);
  const forwardRequest = new Request(c.req.raw, { headers: forwardHeaders });

  return stub.fetch(forwardRequest);
});

app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    },
    404,
  ),
);

app.onError((err, c) => {
  console.error(`[Global Error] ${err.message}`, err);
  return c.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred" },
    },
    500,
  );
});

export default app;
export { InventoryGuard };
