import { VALID_SKUS } from "../types";
import type {
  InventoryItem,
  SKUId,
  AllocationResponse,
  ApiResponse,
  SessionResponse,
} from "../types";

// State Management
const API_BASE = "http://localhost:8787"; // Local wrangler dev
let isLive = false;
let currentSessionId: string | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generateRequestId = (): string =>
  `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const generateSessionId = (): string =>
  `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createResponse = <T>(
  success: boolean,
  data?: T,
  error?: { code: string; message: string },
): ApiResponse<T> => ({
  success,
  data,
  error,
  meta: {
    requestId: generateRequestId(),
    timestamp: Date.now(),
  },
});

// Mock Database State (for local mode)
interface MockState {
  inventory: Record<
    SKUId,
    {
      totalStock: number;
      allocated: number;
      unitPrice: number;
    }
  >;
  sessions: Record<
    string,
    {
      sessionId: string;
      ipAddress: string;
      expiresAt: number;
      createdAt: number;
    }
  >;
}

let mockState: MockState = {
  inventory: VALID_SKUS.reduce(
    (acc, id) => ({
      ...acc,
      [id]: {
        totalStock: 100,
        allocated: 0,
        unitPrice: 150.0,
      },
    }),
    {} as MockState["inventory"],
  ),
  sessions: {},
};

export const mockApi = {
  setLiveMode: (live: boolean) => {
    isLive = live;
  },

  getLiveMode: () => isLive,

  setSessionId: (id: string | null) => {
    currentSessionId = id;
  },

  reset: async () => {
    if (isLive) {
      try {
        const res = await fetch(`${API_BASE}/api/demo/reset`, {
          method: "POST",
          headers: { Authorization: `Bearer admin-token` },
        });
        return await res.json();
      } catch (e) {
        return createResponse(false, undefined, {
          code: "SERVER_OFFLINE",
          message: "Live backend unreachable",
        });
      }
    }
    await delay(500);
    mockState = {
      inventory: VALID_SKUS.reduce(
        (acc, id) => ({
          ...acc,
          [id]: {
            totalStock: 100,
            allocated: 0,
            unitPrice: 150.0,
          },
        }),
        {} as MockState["inventory"],
      ),
      sessions: {},
    };
    return createResponse(true, { success: true });
  },

  getState: async (): Promise<InventoryItem[]> => {
    if (isLive) {
      try {
        const res = await fetch(`${API_BASE}/api/demo/state`);
        const apiRes = (await res.json()) as ApiResponse<any[]>;
        if (apiRes.success && apiRes.data) {
          // Flattening the live one-SKU slice or multiple SKUs if D1 has them
          return apiRes.data.map((item) => ({
            id: item.sku_id as SKUId,
            name: `Product ${item.sku_id.toUpperCase()}`,
            category: "Live Slice",
            totalStock: item.total_stock,
            unitPrice: item.unit_price,
            allocatedUnits: item.allocated,
            availableUnits: item.total_stock - item.allocated,
            isAllocated: false,
          }));
        }
      } catch (e) {
        console.error("Live fetch failed, falling back to mock", e);
      }
    }
    await delay(100);
    return VALID_SKUS.map((id) => {
      const inv = mockState.inventory[id];
      return {
        id,
        name: `Product ${id.toUpperCase()}`,
        category: `Category-${id.charCodeAt(5) % 5}`,
        totalStock: inv.totalStock,
        unitPrice: inv.unitPrice,
        allocatedUnits: inv.allocated,
        availableUnits: Math.max(0, inv.totalStock - inv.allocated),
        isAllocated: false,
      };
    });
  },

  allocateSafe: async (
    skuId: SKUId,
    _userId: string,
    unitsToAllocate: number = 1,
  ): Promise<AllocationResponse> => {
    if (isLive && currentSessionId) {
      try {
        const res = await fetch(`${API_BASE}/api/demo/allocate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentSessionId}`,
          },
          body: JSON.stringify({ skuId, units: unitsToAllocate, mode: "safe" }),
        });
        return await res.json();
      } catch (e) {
        return createResponse(false, undefined, {
          code: "SERVER_OFFLINE",
          message: "Live backend unreachable",
        });
      }
    }

    await delay(Math.random() * 200 + 100);
    const inv = mockState.inventory[skuId];
    if (!inv)
      return createResponse(false, undefined, {
        code: "INVALID_SKU",
        message: "SKU not found",
      });

    const availableUnits = inv.totalStock - inv.allocated;
    if (availableUnits < unitsToAllocate) {
      return createResponse(
        false,
        { unitsAvailable: availableUnits, totalAllocated: inv.allocated },
        { code: "OUT_OF_STOCK", message: "Insufficient stock" },
      );
    }

    inv.allocated += unitsToAllocate;
    return createResponse(true, {
      unitsAvailable: inv.totalStock - inv.allocated,
      totalAllocated: inv.allocated,
      revenueGenerated: unitsToAllocate * inv.unitPrice,
    });
  },

  allocateEventual: async (
    skuId: SKUId,
    _userId: string,
    unitsToAllocate: number = 1,
  ): Promise<AllocationResponse> => {
    if (isLive && currentSessionId) {
      try {
        const res = await fetch(`${API_BASE}/api/demo/allocate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentSessionId}`,
          },
          body: JSON.stringify({
            skuId,
            units: unitsToAllocate,
            mode: "eventual",
          }),
        });
        return await res.json();
      } catch (e) {
        return createResponse(false, undefined, {
          code: "SERVER_OFFLINE",
          message: "Live backend unreachable",
        });
      }
    }

    const inv = mockState.inventory[skuId];
    const availableUnits = inv.totalStock - inv.allocated;
    await delay(Math.random() * 300 + 300);

    if (availableUnits < unitsToAllocate) {
      return createResponse(
        false,
        { unitsAvailable: 0, totalAllocated: inv.allocated },
        { code: "OUT_OF_STOCK", message: "Out of stock" },
      );
    }

    inv.allocated += unitsToAllocate;
    return createResponse(true, {
      unitsAvailable: Math.max(0, inv.totalStock - inv.allocated),
      totalAllocated: inv.allocated,
      revenueGenerated: unitsToAllocate * inv.unitPrice,
    });
  },

  verifyToken: async (
    token: string,
    ipAddress: string,
  ): Promise<SessionResponse> => {
    if (isLive) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnstileToken: token }),
        });
        const apiRes = (await res.json()) as SessionResponse;
        if (apiRes.success && apiRes.data) {
          currentSessionId = apiRes.data.sessionId;
        }
        return apiRes;
      } catch (e) {
        return createResponse(false, undefined, {
          code: "SERVER_OFFLINE",
          message: "Live backend unreachable",
        });
      }
    }

    await delay(300);
    if (!token.startsWith("mock-token-")) {
      return createResponse(false, undefined, {
        code: "INVALID_TOKEN",
        message: "Verification failed",
      });
    }

    const sessionId = generateSessionId();
    const expiresAt = Date.now() + 20 * 60 * 1000;
    mockState.sessions[sessionId] = {
      sessionId,
      ipAddress,
      expiresAt,
      createdAt: Date.now(),
    };
    currentSessionId = sessionId;

    return createResponse(true, { sessionId, expiresAt, ipAddress });
  },

  validateSession: async (sessionId: string): Promise<SessionResponse> => {
    if (isLive && sessionId) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${sessionId}` },
        });
        return (await res.json()) as SessionResponse;
      } catch (e) {
        return createResponse(false, undefined, {
          code: "SERVER_OFFLINE",
          message: "Live backend unreachable",
        });
      }
    }
    const session = mockState.sessions[sessionId];
    if (!session || session.expiresAt < Date.now()) {
      return createResponse(false, undefined, {
        code: "INVALID_SESSION",
        message: "Session invalid",
      });
    }
    return createResponse(true, {
      sessionId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
    });
  },
};
