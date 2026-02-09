/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { BUSINESS_RULES } from "../shared/constants";
import { InventoryRules } from "../shared/rules";

interface Env {
  REVENUE_GUARD_DB: D1Database;
}

interface AllocationRequest {
  sessionId: string;
  skuId: string;
  units: number;
  mode: "safe" | "eventual";
  billingScale: number;
}

interface InventoryState {
  total: number;
  allocated: number;
}

export class InventoryGuard extends DurableObject<Env> {
  // Store inventory in-memory for zero-latency access
  // DOs are single-threaded, so this is safe.
  private inventory: Map<string, InventoryState> = new Map();
  private sqlQueue: Array<{
    query: string;
    params: any[];
  }> = [];

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    // Restore state from disk on wake
    this.ctx.blockConcurrencyWhile(async () => {
      // We could load all SKUs here if needed
      // For now, we load lazily or assume empty start for session
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
    } else if (
      path === "/api/ws" ||
      request.headers.get("Upgrade") === "websocket"
    ) {
      // This is the fetch handler for the WebSocket upgrade
      // The router (Hono) forwarded the request here via stub.fetch
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleAllocate(request: Request): Promise<Response> {
    const body = (await request.json()) as AllocationRequest;
    const { skuId, units, mode, billingScale, sessionId } = body;

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
      inventory.allocated += units;
      await this.saveInventory(skuId, inventory);

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

      return new Response(
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
      );
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

    if (!skuId) return new Response("Missing SKU", { status: 400 });

    const inventory = await this.getInventory(skuId, sessionId || undefined);
    return new Response(JSON.stringify(inventory));
  }

  async handleReset(): Promise<Response> {
    await this.ctx.storage.deleteAll();
    this.inventory.clear();

    this.broadcast(JSON.stringify({ type: "RESET", skuId: "all" }));
    return new Response(JSON.stringify({ success: true }));
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
    // Handle incoming messages if needed (e.g., pings or client-initiated actions)
    // For now, clients mainly listen.
    try {
      const data = JSON.parse(message as string);
      if (data.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
      }
    } catch (e) {
      // ignore invalid json
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    // Cleanup if needed
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    // Log error
    console.error("WebSocket error:", error);
  }

  private broadcast(message: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch (e) {
        // Handle disconnected sockets safely
      }
    }
  }
}
