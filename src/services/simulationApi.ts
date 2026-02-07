import { apiClient } from "@/services/apiClient";
import { mockApi } from "@/services/mockApi";
import type { AllocationResponse, SessionResponse } from "@/types";

export type ApiMode = "mock" | "live";

export interface SimulationApi {
  login(token: string, ip: string): Promise<SessionResponse>;
  logout(): Promise<void>;
  initializeSession(): void;
  getCurrentSession(): Promise<SessionResponse>;
  getApiMode(): ApiMode;
  setApiMode(mode: ApiMode): void;
  allocate(
    mode: "safe" | "eventual",
    skuId: string,
    quantity: number,
  ): Promise<AllocationResponse>;
  setLiveMode(live: boolean): void;
}

export const simulationApi: SimulationApi = {
  login: (token: string, ip: string) => apiClient.login(token, ip),
  logout: async () => {
    await apiClient.logout();
  },
  initializeSession: () => apiClient.initializeSession(),
  getCurrentSession: () => apiClient.getCurrentSession(),
  getApiMode: () => apiClient.getApiMode() as ApiMode,
  setApiMode: (mode: ApiMode) => apiClient.setApiMode(mode),
  allocate: (mode, skuId, quantity) =>
    mode === "safe"
      ? apiClient.allocateSafe(skuId, quantity)
      : apiClient.allocateEventual(skuId, quantity),
  setLiveMode: (live: boolean) => mockApi.setLiveMode(live),
};
