import { apiClient } from "@/services/apiClient";
import { mockApi } from "@/services/mockApi";
import type {
  AllocationResponse,
  SessionResponse,
  InventoryItem,
  InventoryRow,
  QuotaStatus,
  ApiResponse,
} from "@/types";
import { type ScenarioId } from "@/config/scenarios";

export type ApiMode = "mock" | "live";

export interface SimulationApi {
  login(token: string, ip: string): Promise<SessionResponse>;
  logout(): Promise<void>;
  initializeSession(): void;
  getCurrentSession(mode?: ApiMode): Promise<SessionResponse>;
  getApiMode(): ApiMode;
  setApiMode(mode: ApiMode): void;
  allocate(
    mode: "safe" | "eventual",
    skuId: string,
    quantity: number,
  ): Promise<AllocationResponse>;
  setLiveMode(live: boolean): void;
  setScenario(id: ScenarioId): void;
  getInventory(mode?: ApiMode): Promise<InventoryItem[]>;
  getQuotaStatus(): Promise<ApiResponse<QuotaStatus>>;
}

const normalizeInventoryRow = (row: InventoryRow): InventoryItem => ({
  id: row.sku_id,
  name: `Product ${row.sku_id.toUpperCase()}`,
  category: "Live Slice",
  totalStock: row.total_stock,
  unitPrice: row.unit_price,
  allocatedUnits: row.allocated,
  availableUnits: Math.max(0, row.total_stock - row.allocated),
});

export const simulationApi: SimulationApi = {
  login: (token: string, ip: string) => apiClient.login(token, ip),
  logout: async () => {
    await apiClient.logout();
  },
  initializeSession: () => apiClient.initializeSession(),
  getCurrentSession: (mode?: ApiMode) => apiClient.getCurrentSession(mode),
  getApiMode: () => apiClient.getApiMode() as ApiMode,
  setApiMode: (mode: ApiMode) => apiClient.setApiMode(mode),
  allocate: (mode, skuId, quantity) =>
    mode === "safe"
      ? apiClient.allocateSafe(skuId, quantity)
      : apiClient.allocateEventual(skuId, quantity),
  setLiveMode: (_live: boolean) => {
    // Intent: Notify backend simulation if needed
    // Currently handled via allocate calls in the loop
  },
  setScenario: (id: ScenarioId) => mockApi.setScenario(id),
  getInventory: async (mode?: ApiMode) => {
    const targetMode = mode || apiClient.getApiMode();
    if (targetMode === "live") {
      const response = await apiClient.getInventory();
      if (!response.success || !response.data) {
        throw new Error(
          response.error?.message ?? "Live inventory unavailable",
        );
      }
      return response.data.map(normalizeInventoryRow);
    }
    return mockApi.getState();
  },
  getQuotaStatus: () => apiClient.getQuotaStatus(),
};
