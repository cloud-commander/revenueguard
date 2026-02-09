import { VALID_SKUS } from "../types";
import type {
  InventoryItem,
  SKUId,
  AllocationResponse,
  ApiResponse,
  SessionResponse,
} from "../types";
import { SCENARIOS, type ScenarioId } from "../config/scenarios";
import { BUSINESS_RULES } from "../shared/constants";

// State Management
let currentScenarioId: ScenarioId = "auction";

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

const createInitialInventory = () =>
  VALID_SKUS.reduce(
    (acc, id) => ({
      ...acc,
      [id]: {
        totalStock: BUSINESS_RULES.DEFAULT_STOCK,
        allocated: 0,
        unitPrice: SCENARIOS[currentScenarioId].valuePerUnit,
      },
    }),
    {} as MockState["inventory"],
  );

let mockState: MockState = {
  inventory: createInitialInventory(),
  sessions: {},
};

export const mockApi = {
  setScenario: (id: ScenarioId) => {
    currentScenarioId = id;
  },

  reset: async () => {
    await delay(200);
    mockState = {
      inventory: createInitialInventory(),
      sessions: {},
    };
    return createResponse(true, { success: true });
  },

  getState: async (): Promise<InventoryItem[]> => {
    await delay(50);
    const scenario = SCENARIOS[currentScenarioId];
    return VALID_SKUS.map((id) => {
      const inv = mockState.inventory[id];
      const numericId = parseInt(id.split("-")[1]);
      return {
        id,
        name: scenario.getProductName(numericId),
        category: scenario.isHighDemand(numericId)
          ? "High Demand"
          : "Standard Stock",
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
    await delay(Math.random() * 50 + 20);
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
    const inv = mockState.inventory[skuId];
    const availableUnits = inv.totalStock - inv.allocated;
    await delay(Math.random() * 20 + 10);

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
    await delay(200);
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

    return createResponse(true, { sessionId, expiresAt, ipAddress });
  },

  validateSession: async (sessionId: string): Promise<SessionResponse> => {
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
