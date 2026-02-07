/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";

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

export class InventoryGuard extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
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
    } else if (path === "/ws") {
      return this.handleWebSocketUpgrade();
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleAllocate(request: Request): Promise<Response> {
    const body = (await request.json()) as AllocationRequest;
    const { skuId, units, mode, billingScale } = body;

    let inventory = await this.ctx.storage.get<{
      total: number;
      allocated: number;
    }>(skuId);

    if (!inventory) {
      inventory = { total: 1000, allocated: 0 };
    }

    const availableUnits = inventory.total - inventory.allocated;

    if (mode === "safe") {
      if (availableUnits < units) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "OUT_OF_STOCK", message: "Insufficient stock." },
            data: {
              unitsAvailable: availableUnits,
              totalAllocated: inventory.allocated,
            },
          }),
          { status: 400 },
        );
      }

      inventory.allocated += units;
      await this.ctx.storage.put(skuId, inventory);

      // Persist to D1 asynchronously
      this.ctx.waitUntil(
        this.env.REVENUE_GUARD_DB.prepare(
          "UPDATE inventory SET allocated = allocated + ?, updated_at = ? WHERE session_id = ? AND sku_id = ?",
        )
          .bind(units, Date.now(), body.sessionId, skuId)
          .run(),
      );

      this.broadcast({
        type: "UPDATE",
        skuId,
        availableUnits: inventory.total - inventory.allocated,
        allocatedUnits: inventory.allocated,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            unitsAvailable: inventory.total - inventory.allocated,
            totalAllocated: inventory.allocated,
            revenueGenerated: units * 150 * billingScale,
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
    const skuId = new URL(request.url).searchParams.get("skuId");
    if (!skuId) return new Response("Missing SKU", { status: 400 });

    const inventory = await this.ctx.storage.get<{
      total: number;
      allocated: number;
    }>(skuId);
    return new Response(
      JSON.stringify(inventory || { total: 1000, allocated: 0 }),
    );
  }

  async handleReset(): Promise<Response> {
    await this.ctx.storage.deleteAll();
    this.broadcast({ type: "RESET", skuId: "all" });
    return new Response(JSON.stringify({ success: true }));
  }

  async handleWebSocketUpgrade(): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {}

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {}

  async webSocketError(_ws: WebSocket, _error: unknown) {}

  private broadcast(message: {
    type: string;
    skuId: string;
    availableUnits?: number;
    allocatedUnits?: number;
  }) {
    const msg = JSON.stringify(message);
    this.ctx.getWebSockets().forEach((ws) => {
      ws.send(msg);
    });
  }
}
