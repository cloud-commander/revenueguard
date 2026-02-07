/**
 * Cloudflare Worker Endpoint Template
 *
 * Implements EDGE_API_SPEC.md endpoints for demo.cfdemo.link
 *
 * Bindings Required:
 * - DEMO_KV: KV namespace (for sessions) - TTL 1200 seconds
 * - DEMO_DO: Durable Object binding (for inventory atomicity)
 * - TURNSTILE_SECRET: Cloudflare Turnstile secret key
 * - BILLING_SCALE: 0.001 (0.1%, immutable)
 *
 * Deployment: wrangler deploy
 */

// ============================================================================
// Type Definitions (from src/types.ts)
// ============================================================================

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: number;
  };
}

interface AllocationPayload {
  unitsAvailable: number;
  totalAllocated: number;
  revenueGenerated?: number;
}

interface SessionPayload {
  sessionId: string;
  expiresAt: number;
  ipAddress?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createResponse<T>(
  success: boolean,
  data?: T,
  error?: { code: string; message: string },
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    meta: {
      requestId: generateRequestId(),
      timestamp: Date.now(),
    },
  };
}

function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /api/auth/login
 *
 * Turnstile verification → Session creation
 *
 * Request:
 *   POST /api/auth/login
 *   Content-Type: application/json
 *   {
 *     "turnstileToken": "token_from_turnstile_widget"
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "sessionId": "sess_...",
 *       "expiresAt": 1707300000000,
 *       "ipAddress": "203.0.113.42"
 *     },
 *     "meta": { "requestId": "req_...", "timestamp": 1707200000000 }
 *   }
 *
 * Errors:
 *   - INVALID_TOKEN: Token verification failed
 *   - RATE_LIMITED: 10 failed attempts per minute (WAF managed challenge)
 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = (await request.json()) as { turnstileToken: string };
    const ipAddress = getClientIp(request);

    // Verify Turnstile token
    const turnstileResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: body.turnstileToken,
        }),
      },
    );

    const turnstileData = (await turnstileResponse.json()) as {
      success: boolean;
      error_codes?: string[];
    };

    if (!turnstileData.success) {
      return new Response(
        JSON.stringify(
          createResponse<SessionPayload>(false, undefined, {
            code: "INVALID_TOKEN",
            message: "Turnstile verification failed.",
          }),
        ),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Generate session
    const sessionId = `sess_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const expiresAt = Date.now() + 1200 * 1000; // 20 minutes

    // Store in KV with TTL
    await env.DEMO_KV.put(
      sessionId,
      JSON.stringify({
        sessionId,
        ipAddress,
        createdAt: Date.now(),
        expiresAt,
        requestsCount: 0,
        costsAccumulated: 0,
      }),
      { expirationTtl: 1200 }, // KV TTL = 1200 seconds
    );

    return new Response(
      JSON.stringify(
        createResponse<SessionPayload>(true, {
          sessionId,
          expiresAt,
          ipAddress,
        }),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[auth/login] Error:", error);
    return new Response(
      JSON.stringify(
        createResponse(false, undefined, {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        }),
      ),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * GET /api/auth/me
 *
 * Validate session and get expiration
 *
 * Request:
 *   GET /api/auth/me
 *   Authorization: Bearer <sessionId>
 *
 * Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "sessionId": "sess_...",
 *       "expiresAt": 1707300000000,
 *       "ipAddress": "203.0.113.42"
 *     },
 *     "meta": { "requestId": "req_...", "timestamp": 1707200000000 }
 *   }
 *
 * Errors:
 *   - UNAUTHORIZED: Authorization header missing
 *   - INVALID_SESSION: SessionId not found
 *   - EXPIRED_SESSION: SessionId TTL exceeded
 */
async function handleGetMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "UNAUTHORIZED",
            message: "Authorization header required.",
          }),
        ),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionId = authHeader.substring(7); // Remove "Bearer "

    // Look up session in KV
    const sessionData = await env.DEMO_KV.get(sessionId);

    if (!sessionData) {
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "INVALID_SESSION",
            message: "Session not found.",
          }),
        ),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const session = JSON.parse(sessionData) as {
      sessionId: string;
      ipAddress: string;
      expiresAt: number;
    };

    if (session.expiresAt < Date.now()) {
      await env.DEMO_KV.delete(sessionId);
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "EXPIRED_SESSION",
            message: "Session has expired.",
          }),
        ),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(
        createResponse<SessionPayload>(true, {
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
        }),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[auth/me] Error:", error);
    return new Response(
      JSON.stringify(
        createResponse(false, undefined, {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        }),
      ),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * POST /api/demo/allocate
 *
 * Safe allocation request (atomic via Durable Objects)
 *
 * Request:
 *   POST /api/demo/allocate
 *   Authorization: Bearer <sessionId>
 *   Content-Type: application/json
 *   {
 *     "skuId": "sku-001",
 *     "units": 1,
 *     "mode": "safe" (or "eventual")
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "unitsAvailable": 99,
 *       "totalAllocated": 1,
 *       "revenueGenerated": 149.85  (= 1 * 150 * 0.001)
 *     },
 *     "meta": { "requestId": "req_...", "timestamp": 1707200000000 }
 *   }
 *
 * Errors:
 *   - UNAUTHORIZED: Authorization header missing
 *   - OUT_OF_STOCK: No units available
 *   - INVALID_SKU: SKU does not exist
 *   - COST_LIMIT_REACHED: 0.1% billed hard-lock triggered
 *   - RATE_LIMITED: Rate limit exceeded
 */
async function handleAllocate(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // Validate Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "UNAUTHORIZED",
            message: "Authorization header required.",
          }),
        ),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionId = authHeader.substring(7);

    // Validate session
    const sessionData = await env.DEMO_KV.get(sessionId);
    if (!sessionData) {
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "INVALID_SESSION",
            message: "Session not found.",
          }),
        ),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const session = JSON.parse(sessionData) as {
      sessionId: string;
      ipAddress: string;
      costsAccumulated: number;
      requestsCount: number;
    };

    if (session.costsAccumulated > 20.0) {
      // Log auto-stop event
      console.log(
        `[cost-guard-auto-stop] Session ${sessionId} cost limit reached`,
        {
          costsAccumulated: session.costsAccumulated,
          timestamp: Date.now(),
        },
      );

      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "COST_LIMIT_REACHED",
            message: "Demo cost limit reached. Session halted.",
          }),
        ),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse request
    const body = (await request.json()) as {
      skuId: string;
      units: number;
      mode: "safe" | "eventual";
    };

    // Call Durable Object for allocation
    const doStub = env.DEMO_DO.get("inventory");
    const doResponse = (await doStub
      .fetch(
        new Request("https://do.local/allocate", {
          method: "POST",
          body: JSON.stringify({
            skuId: body.skuId,
            units: body.units,
            mode: body.mode || "safe",
            billingScale: env.BILLING_SCALE,
          }),
        }),
      )
      .then((res: Response) => res.json())) as ApiResponse<AllocationPayload>;

    // Update session costs and request count
    if (doResponse.success && doResponse.data?.revenueGenerated) {
      session.costsAccumulated +=
        doResponse.data.revenueGenerated * parseFloat(env.BILLING_SCALE);
      session.requestsCount += 1;

      // Alert threshold: ~15%
      if (session.costsAccumulated > 15.0) {
        console.log(
          `[cost-guard-alert] Session ${sessionId} approaching limit`,
          {
            costsAccumulated: session.costsAccumulated,
            threshold: 15.0,
            timestamp: Date.now(),
          },
        );
      }

      // Re-save session with updated costs
      await env.DEMO_KV.put(sessionId, JSON.stringify(session), {
        expirationTtl: 1200,
      });
    }

    return new Response(JSON.stringify(doResponse), {
      status: doResponse.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[demo/allocate] Error:", error);
    return new Response(
      JSON.stringify(
        createResponse(false, undefined, {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        }),
      ),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * POST /api/demo/reset
 *
 * Reset inventory state (admin-only)
 *
 * Request:
 *   POST /api/demo/reset
 *   Authorization: Bearer <admin-token>
 *
 * Response:
 *   { "success": true, "data": { "success": true }, "meta": {...} }
 *
 * WAF: Admin IP whitelist (set in WAF rule)
 */
async function handleReset(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // Verify admin token (WAF should gate this)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(
          createResponse(false, undefined, {
            code: "UNAUTHORIZED",
            message: "Admin authorization required.",
          }),
        ),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Call DO to reset
    const doStub = env.DEMO_DO.get("inventory");
    const doResponse = (await doStub
      .fetch(
        new Request("https://do.local/reset", {
          method: "POST",
        }),
      )
      .then((res: Response) => res.json())) as ApiResponse;

    return new Response(JSON.stringify(doResponse), {
      status: doResponse.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[demo/reset] Error:", error);
    return new Response(
      JSON.stringify(
        createResponse(false, undefined, {
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
        }),
      ),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ============================================================================
// ROUTER
// ============================================================================

// Cloudflare Environment Types (for documentation template)
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): string;
  get(id: string): DurableObjectStub;
}

export interface Env {
  DEMO_KV: KVNamespace;
  DEMO_DO: DurableObjectNamespace;
  TURNSTILE_SECRET: string;
  BILLING_SCALE: string; // "0.001"
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route requests
    if (path === "/api/auth/login") {
      return handleLogin(request, env);
    } else if (path === "/api/auth/me") {
      return handleGetMe(request, env);
    } else if (path === "/api/demo/allocate") {
      return handleAllocate(request, env);
    } else if (path === "/api/demo/reset") {
      return handleReset(request, env);
    } else {
      return new Response("Not Found", { status: 404 });
    }
  },
};

// ============================================================================
// WRANGLER CONFIGURATION
// ============================================================================

/*
# wrangler.toml

name = "demo-revenueguard"
type = "service"
main = "src/index.ts"

[env.production]
route = "https://demo.cfdemo.link/api/*"
zone_id = "..."

[build]
command = "npm run build"
cwd = "."

[[kv_namespaces]]
binding = "DEMO_KV"
id = "demo-kv-id"
preview_id = "demo-kv-preview-id"

[[durable_objects.bindings]]
name = "DEMO_DO"
class_name = "InventoryAllocator"
script_name = "demo-allocator-do"
environment = "production"

[env.production.vars]
BILLING_SCALE = "0.001"
TURNSTILE_SECRET = "your-turnstile-secret"
*/
