/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import {
  BUSINESS_RULES,
  VALID_SKUS,
  calculateTransactionCost,
  InventoryRules,
} from "../shared/rules";

import type { Env } from "./index";

interface AllocationRequest {
  requestId?: string; // For idempotency
  sessionId: string;
  skuId: string;
  units: number;
  mode: "safe" | "eventual";
  billingScale: number;
  previousCosts: number; // Sync from Worker KV
  costLimit?: number; // Optional dynamic limit
}

interface InventoryState {
  total: number;
  allocated: number;
}

// Rate Limiter Implementation (Token Bucket)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerSecond: number;

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRatePerSecond = refillRatePerSecond;
    this.lastRefill = Date.now();
  }

  tryConsume(cost: number = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRatePerSecond;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

export class InventoryGuard extends DurableObject<Env> {
  // Store inventory in-memory for zero-latency access
  // DOs are single-threaded, so this is safe.
  private inventory: Map<string, InventoryState> = new Map();
  private sessionCost: number = 0; // Total cost for this session
  private rateLimiter: RateLimiter; // Session-level rate limiter
  private processedRequests: Map<string, Response> = new Map(); // Idempotency cache

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    // 30 requests per minute = 0.5 requests per second
    this.rateLimiter = new RateLimiter(30, 0.5);

    // Restore state from disk on wake
    this.ctx.blockConcurrencyWhile(async () => {
      // Restore session cost if previously persisted
      const storedCost = await this.ctx.storage.get<number>("session_cost");
      if (storedCost) {
        this.sessionCost = storedCost;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/allocate") {
      return this.handleAllocate(request);
    } else if (path === "/state") {
      return this.handleGetState(request);
    } else if (path === "/reset") {
      return this.handleReset();
    } else if (path === "/billing-check") {
      return this.handleBillingCheck(request);
    } else if (
      path === "/api/ws" ||
      request.headers.get("Upgrade") === "websocket"
    ) {
      // WebSocket handling with authentication
      return this.handleWebSocket(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    // Extract sessionId from query params
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    // Validate sessionId presence
    if (!sessionId) {
      return new Response(
        JSON.stringify({
          error: "INVALID_REQUEST",
          message: "WebSocket connection requires sessionId query parameter",
        }),
        { status: 400 },
      );
    }

    // Validate session exists in KV
    // Note: We can't access KV from Durable Object directly, so we trust the Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "WebSocket connection requires Authorization: Bearer header",
        }),
        { status: 401 },
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    if (token !== sessionId) {
      return new Response(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Session token does not match sessionId parameter",
        }),
        { status: 403 },
      );
    }

    // Validate request origin (basic CORS check)
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    if (!origin && !referer) {
      console.warn(
        `[WebSocket] Connection without Origin/Referer: ${sessionId}`,
      );
      // Don't reject - some clients don't send these headers
    }

    // Accept WebSocket connection
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);

    // Log connection
    console.log(
      `[WebSocket] Connection accepted for session: ${sessionId.substring(0, 12)}...`,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleAllocate(request: Request): Promise<Response> {
    const body = (await request.json()) as AllocationRequest;
    const {
      requestId,
      skuId,
      units,
      mode,
      billingScale,
      sessionId,
      previousCosts,
      costLimit,
    } = body;

    // --- IDEMPOTENCY CHECK ---
    if (requestId && this.processedRequests.has(requestId)) {
      const res = this.processedRequests.get(requestId)!.clone();
      res.headers.set("X-Processed-Id", requestId);
      return res;
    }

    // 1. ATOMIC RATE LIMIT CHECK
    if (!this.rateLimiter.tryConsume(1)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many allocation requests (Session limit).",
          },
        }),
        { status: 429 },
      );
    }

    // Sync Budget: Ensure we account for costs incurred in Eventual mode (passed from KV)
    // We take the max of what we know and what the Worker knows.
    this.sessionCost = Math.max(this.sessionCost, previousCosts || 0);

    const totalTransactionCost = calculateTransactionCost(units, billingScale);

    // 2. ATOMIC BILLING CHECK
    // Use passed limit or fallback to hardcoded safety net
    const HARD_BUDGET = costLimit || 100.0;

    if (this.sessionCost + totalTransactionCost > HARD_BUDGET) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "REAL_BUDGET_EXCEEDED",
            message:
              "Safety bypass triggered. Actual billing limit reached (Atomic).",
          },
        }),
        { status: 403 },
      );
    }

    const inventory = await this.getInventory(skuId, sessionId);
    if (!inventory) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INVALID_SKU", message: "SKU not found" },
        }),
        { status: 400 },
      );
    }
    const availableUnits = inventory.total - inventory.allocated;
    const validation = InventoryRules.validateAllocation(units, availableUnits);

    if (!validation.isValid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: validation.errorCode, message: validation.message },
          data: {
            unitsAvailable: availableUnits,
            totalAllocated: inventory.allocated,
          },
        }),
        { status: 400 },
      );
    }

    if (mode === "safe") {
      // UPDATE STATE
      inventory.allocated += units;
      this.sessionCost += totalTransactionCost;

      // Persist Atomic Changes
      await this.saveInventory(skuId, inventory);
      // We also persist the session cost occasionally or on every write?
      // To be safe against crashes, we persist 'session_cost'.
      this.ctx.waitUntil(
        this.ctx.storage.put("session_cost", this.sessionCost),
      );

      // Persist to D1 asynchronously (Write-Behind Pattern)
      this.ctx.waitUntil(
        this.env.REVENUE_GUARD_DB.prepare(
          "UPDATE inventory SET allocated = allocated + ?, updated_at = ? WHERE session_id = ? AND sku_id = ?",
        )
          .bind(units, Date.now(), sessionId, skuId)
          .run(),
      );

      // Broadcast update to all connected clients (The "Wow" Factor)
      this.broadcast(
        JSON.stringify({
          type: "UPDATE",
          skuId,
          availableUnits: inventory.total - inventory.allocated,
          allocatedUnits: inventory.allocated,
          timestamp: Date.now(),
        }),
      );

      const response = new Response(
        JSON.stringify({
          success: true,
          data: {
            unitsAvailable: inventory.total - inventory.allocated,
            totalAllocated: inventory.allocated,
            revenueGenerated: InventoryRules.calculateRevenue(
              units,
              billingScale,
            ),
          },
        }),
        { status: 200, headers: { "X-Processed-Id": requestId || "none" } },
      );

      // Cache for idempotency if requestId provided
      if (requestId) {
        const rid = requestId;
        this.processedRequests.set(rid, response.clone());
        // Auto-cleanup after 5 minutes to prevent memory leaks
        this.ctx.waitUntil(
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 300000));
            this.processedRequests.delete(rid);
          })(),
        );
      }

      return response;
    } else {
      return new Response(
        "Eventual path should be handled by index.ts directly",
        { status: 400 },
      );
    }
  }

  async handleGetState(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const skuId = url.searchParams.get("skuId");
    const sessionId = url.searchParams.get("sessionId");

    if (skuId) {
      const inventory = await this.getInventory(skuId, sessionId || undefined);
      return new Response(JSON.stringify(inventory));
    }

    // SECURITY: Return full state from memory to avoid D1 scans (State Hammer fix)
    const allState = [];
    for (const sku of VALID_SKUS) {
      const inv = await this.getInventory(sku, sessionId || undefined);
      if (inv) {
        allState.push({
          sku_id: sku,
          total_stock: inv.total,
          allocated: inv.allocated,
          unit_price: 150.0, // Hardcoded or looked up
        });
      }
    }
    return new Response(JSON.stringify(allState));
  }

  async handleReset(): Promise<Response> {
    await this.ctx.storage.deleteAll();
    this.inventory.clear();
    this.sessionCost = 0;
    // Reset rate limiter tokens? Optional, but good practice.
    this.rateLimiter = new RateLimiter(30, 0.5);

    this.broadcast(JSON.stringify({ type: "RESET", skuId: "all" }));
    return new Response(JSON.stringify({ success: true }));
  }

  // SECURITY: Atomic billing check for eventual mode to prevent race conditions
  async handleBillingCheck(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      requestId?: string;
      previousCosts: number;
      transactionCost: number;
      costLimit: number;
      skuId?: string; // Soft check params
      units?: number;
    };

    if (body.requestId && this.processedRequests.has(body.requestId)) {
      return this.processedRequests.get(body.requestId)!.clone();
    }

    // Sync with latest known costs from KV
    this.sessionCost = Math.max(this.sessionCost, body.previousCosts || 0);

    // Atomic budget check
    if (this.sessionCost + body.transactionCost > body.costLimit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "REAL_BUDGET_EXCEEDED",
            message: "Atomic billing limit reached (eventual mode).",
          },
        }),
        { status: 403 },
      );
    }

    // SECURITY: Soft Stock Check (Eventual Bypass Mitigation)
    if (body.skuId && body.units) {
      const inv = await this.getInventory(body.skuId); // Don't need session sync for soft check, just local state
      if (inv && inv.total - inv.allocated < body.units) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "INSUFFICIENT_STOCK",
              message: "Soft stock check failed (DO memory).",
            },
          }),
          { status: 400 },
        );
      }
    }

    // Reserve the cost atomically
    this.sessionCost += body.transactionCost;
    this.ctx.waitUntil(this.ctx.storage.put("session_cost", this.sessionCost));

    const response = new Response(JSON.stringify({ success: true }), {
      status: 200,
    });

    if (body.requestId) {
      const rid = body.requestId;
      this.processedRequests.set(rid, response.clone());
      this.ctx.waitUntil(
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 300000));
          this.processedRequests.delete(rid);
        })(),
      );
    }

    return response;
  }

  // Helper to get inventory with storage fallback and D1 sync
  private async getInventory(
    skuId: string,
    sessionId?: string,
  ): Promise<InventoryState | null> {
    if (this.inventory.has(skuId)) {
      return this.inventory.get(skuId)!;
    }

    const stored = await this.ctx.storage.get<InventoryState>(skuId);
    if (stored) {
      this.inventory.set(skuId, stored);
      return stored;
    }

    // Default fallback
    let totalStock: number = BUSINESS_RULES.DEFAULT_STOCK;
    let found = false;

    // Sync with D1 if sessionId is provided
    if (sessionId) {
      try {
        const d1Row = await this.env.REVENUE_GUARD_DB.prepare(
          "SELECT total_stock FROM inventory WHERE session_id = ? AND sku_id = ?",
        )
          .bind(sessionId, skuId)
          .first<{ total_stock: number }>();

        if (d1Row) {
          totalStock = d1Row.total_stock;
          found = true;
        }
      } catch (e) {
        console.error("Failed to sync total_stock from D1", e);
      }
    }

    if (sessionId && !found) {
      return null;
    }

    const state = { total: totalStock, allocated: 0 };
    this.inventory.set(skuId, state);
    await this.ctx.storage.put(skuId, state);
    return state;
  }

  private async saveInventory(skuId: string, state: InventoryState) {
    this.inventory.set(skuId, state);
    await this.ctx.storage.put(skuId, state);
  }

  // --- WebSocket Hibernation API ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Validate message size (prevent DoS)
    const messageSize =
      message instanceof ArrayBuffer ? message.byteLength : message.length;
    if (messageSize > 10000) {
      // 10KB limit
      console.warn(`[WebSocket] Message too large: ${messageSize} bytes`);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          code: "MESSAGE_TOO_LARGE",
          message: "Message exceeds 10KB limit",
        }),
      );
      ws.close(1009, "Message too large");
      return;
    }

    try {
      // Parse and validate message structure
      const data =
        typeof message === "string"
          ? JSON.parse(message)
          : JSON.parse(new TextDecoder().decode(message));

      // Validate message type
      if (!data.type || typeof data.type !== "string") {
        console.warn("[WebSocket] Invalid message format: missing type");
        ws.send(
          JSON.stringify({
            type: "ERROR",
            code: "INVALID_MESSAGE",
            message: "Message must include 'type' field",
          }),
        );
        return;
      }

      // Handle known message types
      switch (data.type) {
        case "PING":
          // Respond to ping
          ws.send(
            JSON.stringify({
              type: "PONG",
              timestamp: Date.now(),
            }),
          );
          break;

        case "SUBSCRIBE":
          // Client wants to subscribe to updates for specific SKU
          if (data.skuId) {
            console.log(`[WebSocket] Client subscribed to SKU: ${data.skuId}`);
            ws.send(
              JSON.stringify({
                type: "SUBSCRIBED",
                skuId: data.skuId,
                timestamp: Date.now(),
              }),
            );
          }
          break;

        case "UNSUBSCRIBE":
          // Client wants to unsubscribe
          if (data.skuId) {
            console.log(
              `[WebSocket] Client unsubscribed from SKU: ${data.skuId}`,
            );
            ws.send(
              JSON.stringify({
                type: "UNSUBSCRIBED",
                skuId: data.skuId,
                timestamp: Date.now(),
              }),
            );
          }
          break;

        default:
          // Unknown message type
          console.warn(`[WebSocket] Unknown message type: ${data.type}`);
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "UNKNOWN_TYPE",
              message: `Unknown message type: ${data.type}`,
            }),
          );
      }
    } catch (err) {
      // Invalid JSON or parsing error
      console.error("[WebSocket] Message parse error", err);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          code: "INVALID_JSON",
          message: "Message must be valid JSON",
        }),
      );
    }
  }

  async webSocketClose(
    _ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    // Log disconnection details for debugging
    console.log(
      `[WebSocket] Connection closed: code=${code}, reason='${reason}', clean=${wasClean}`,
    );

    // Cleanup resources if needed
    // Could implement per-session tracking here for metrics
  }

  async webSocketError(_ws: WebSocket, error: unknown) {
    // Log WebSocket error with context
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WebSocket] Error occurred: ${errorMessage}`, error);

    // Could implement error tracking/alerting here
    // For example, trigger alerts if error rate is high
  }

  private broadcast(message: string) {
    // Safely broadcast message to all connected clients
    const wsClients = this.ctx.getWebSockets();
    let successCount = 0;
    let failureCount = 0;

    for (const ws of wsClients) {
      try {
        // Check WebSocket ready state before sending
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          successCount++;
        }
      } catch (e) {
        // Handle disconnected or closed sockets safely
        failureCount++;
        console.warn(
          `[WebSocket] Failed to send to client: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    }

    // Log broadcast result if significant failures
    if (failureCount > 0) {
      console.warn(
        `[WebSocket] Broadcast: ${successCount} sent, ${failureCount} failed`,
      );
    }
  }
}
