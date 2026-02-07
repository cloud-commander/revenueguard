import {
  type ApiResponse,
  type SessionResponse,
  type SessionPayload,
  type AllocationPayload,
  type SKUId,
} from "@/types";
import { mockApi } from "./mockApi";

class ApiClient {
  private baseUrl: string;
  private sessionId: string | null = null;

  private makeLocalMeta() {
    return {
      requestId: `req_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    } as const;
  }

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    this.sessionId = localStorage.getItem("demo-session-id");
  }

  private isLive(): boolean {
    const override = localStorage.getItem("demo-api-mode");
    if (override) return override === "live";
    return import.meta.env.VITE_API_MODE === "live";
  }

  /**
   * Override the API mode at runtime (e.g. for testing)
   */
  setApiMode(mode: "mock" | "live"): void {
    localStorage.setItem("demo-api-mode", mode);
  }

  /**
   * Get the current API mode (considering overrides)
   */
  getApiMode(): "mock" | "live" {
    return this.isLive() ? "live" : "mock";
  }

  /**
   * Set the current session token (from login or localStorage)
   */
  setSessionToken(sessionId: string | null): void {
    this.sessionId = sessionId;
    if (sessionId) {
      localStorage.setItem("demo-session-id", sessionId);
    } else {
      localStorage.removeItem("demo-session-id");
    }
  }

  /**
   * Initialize session from local storage
   */
  initializeSession(): void {
    this.sessionId = localStorage.getItem("demo-session-id");
  }

  async login(token: string, ipAddress: string): Promise<SessionResponse> {
    let response: SessionResponse;

    if (this.isLive()) {
      response = await this.request<SessionPayload>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ turnstileToken: token }),
      });
    } else {
      // For mock, directly call mockApi
      response = await mockApi.verifyToken(token, ipAddress);
    }

    if (response.success && response.data?.sessionId) {
      this.sessionId = response.data.sessionId;
      // Store in localStorage for persistence
      localStorage.setItem("demo-session-id", response.data.sessionId);
    }

    return response;
  }

  async logout(): Promise<ApiResponse<void>> {
    let response: ApiResponse<void>;

    if (this.isLive()) {
      response = await this.request<void>("/auth/logout", {
        method: "POST",
      });
    } else {
      // Mock logout is sync
      response = { success: true, meta: this.makeLocalMeta() };
    }

    this.sessionId = null;
    localStorage.removeItem("demo-session-id");
    return response;
  }

  async getCurrentSession(): Promise<SessionResponse> {
    if (!this.sessionId) {
      return {
        success: false,
        error: { code: "NO_SESSION", message: "No active session" },
        meta: this.makeLocalMeta(),
      };
    }

    if (this.isLive()) {
      return this.request<SessionPayload>("/auth/me");
    } else {
      // For mock, simulate async
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: {
              sessionId: this.sessionId!,
              expiresAt: Date.now() + 3600000,
            },
            meta: this.makeLocalMeta(),
          });
        }, 300);
      });
    }
  }

  async allocateSafe(
    skuId: string,
    units: number,
  ): Promise<ApiResponse<AllocationPayload>> {
    if (this.isLive()) {
      return this.request<AllocationPayload>("/demo/allocate", {
        method: "POST",
        body: JSON.stringify({ skuId, units, mode: "safe" }),
      });
    } else {
      // Direct call to mockApi (simulated)
      return mockApi.allocateSafe(skuId as SKUId, "mock-user", units);
    }
  }

  async allocateEventual(
    skuId: string,
    units: number,
  ): Promise<ApiResponse<AllocationPayload>> {
    if (this.isLive()) {
      return this.request<AllocationPayload>("/demo/allocate", {
        method: "POST",
        body: JSON.stringify({ skuId, units, mode: "eventual" }),
      });
    } else {
      // Direct call to mockApi (simulated)
      return mockApi.allocateEventual(skuId as SKUId, "mock-user", units);
    }
  }

  async reset(): Promise<ApiResponse<void>> {
    if (this.isLive()) {
      return this.request<void>("/demo/reset", { method: "POST" });
    } else {
      return { success: true, meta: this.makeLocalMeta() };
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.sessionId) {
      headers["Authorization"] = `Bearer ${this.sessionId}`;
    }

    return headers;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      console.log(`[ApiClient] Fetching: ${this.baseUrl}${path}`);
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      if (response.status === 401) {
        // Auto-logout on unauthorized
        await this.logout();
      }

      return (await response.json()) as ApiResponse<T>;
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message:
            err instanceof Error
              ? `${err.message} (URL: ${this.baseUrl}${path})`
              : String(err),
        },
        meta: {
          requestId: "req_local",
          timestamp: Date.now(),
        },
      };
    }
  }
}

export const apiClient = new ApiClient();
