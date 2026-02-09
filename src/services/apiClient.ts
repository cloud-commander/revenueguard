import {
  type ApiResponse,
  type SessionResponse,
  type SessionPayload,
  type AllocationPayload,
  type SKUId,
  type InventoryRow,
} from "@/types";
import { DISABLE_LIVE_ENGINE } from "@/config/simulationDefaults";
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
    this.initializeSession();
  }

  private isLive(): boolean {
    if (DISABLE_LIVE_ENGINE) return false;
    const override = localStorage.getItem("demo-api-mode");
    if (override) return override === "live";
    return import.meta.env.VITE_API_MODE === "live";
  }

  /**
   * Override the API mode at runtime (e.g. for testing)
   */
  setApiMode(mode: "mock" | "live"): void {
    localStorage.setItem("demo-api-mode", mode);
    // When switching mode, we need to refresh the local sessionId from the new mode's storage
    this.initializeSession();
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
  setSessionToken(sessionId: string | null, mode?: "mock" | "live"): void {
    const targetMode = mode || this.getApiMode();
    const key = `demo-session-id-${targetMode}`;

    if (sessionId) {
      localStorage.setItem(key, sessionId);
    } else {
      localStorage.removeItem(key);
    }

    // Always update the internal sessionId if it matches the current active mode
    if (targetMode === this.getApiMode()) {
      this.sessionId = sessionId;
    }
  }

  /**
   * Initialize session from local storage based on current mode
   */
  initializeSession(): void {
    const key = `demo-session-id-${this.getApiMode()}`;
    this.sessionId = localStorage.getItem(key);
  }

  async login(token: string, ipAddress: string): Promise<SessionResponse> {
    const isCurrentlyLive = this.isLive();

    const livePromise = DISABLE_LIVE_ENGINE
      ? Promise.resolve({
          success: false,
          error: { code: "LIVE_DISABLED", message: "Live engine is disabled" },
          meta: this.makeLocalMeta(),
        } as SessionResponse)
      : this.request<SessionPayload>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ turnstileToken: token }),
        }).catch(
          (err) =>
            ({
              success: false,
              error: { code: "LIVE_LOGIN_FAILED", message: String(err) },
              meta: this.makeLocalMeta(),
            }) as SessionResponse,
        );

    const mockPromise = mockApi.verifyToken(token, ipAddress);

    const [liveRes, mockRes] = await Promise.all([livePromise, mockPromise]);

    // Store sessions for both modes independently
    if (liveRes.success && liveRes.data?.sessionId) {
      this.setSessionToken(liveRes.data.sessionId, "live");
    }

    if (mockRes.success && mockRes.data?.sessionId) {
      this.setSessionToken(mockRes.data.sessionId, "mock");
      // Don't call mockApi.setSessionId here, it will be handled by setApiMode or initializeSession
    }

    // Return the response for the mode that was ACTIVE when login was triggered
    return isCurrentlyLive ? liveRes : mockRes;
  }

  async logout(): Promise<ApiResponse<void>> {
    const activeMode = this.getApiMode();
    let response: ApiResponse<void>;

    if (activeMode === "live") {
      response = await this.request<void>("/auth/logout", {
        method: "POST",
      });
    } else {
      response = { success: true, meta: this.makeLocalMeta() };
    }

    // Clear session for the current mode
    this.setSessionToken(null, activeMode);

    return response;
  }

  async getCurrentSession(mode?: "mock" | "live"): Promise<SessionResponse> {
    const targetMode = mode || this.getApiMode();
    const key = `demo-session-id-${targetMode}`;
    const storedSessionId = localStorage.getItem(key);

    if (!storedSessionId) {
      return {
        success: false,
        error: {
          code: "NO_SESSION",
          message: `No active session for ${targetMode}`,
        },
        meta: this.makeLocalMeta(),
      };
    }

    // Update internal pointer if we are querying the active mode
    if (targetMode === this.getApiMode()) {
      this.sessionId = storedSessionId;
    }

    if (targetMode === "live") {
      // For live, we actually check with the server
      return this.request<SessionPayload>("/auth/me");
    } else {
      // For mock, we check our mock state
      return mockApi.validateSession(storedSessionId);
    }
  }

  async getInventory(): Promise<ApiResponse<InventoryRow[]>> {
    return this.request<InventoryRow[]>("/demo/state");
  }

  async getQuotaStatus(): Promise<
    ApiResponse<{
      cpuUsedMs: number;
      cpuRemainingMs: number;
      cpuLimitMs: number;
      throttleLevel: "normal" | "slow" | "critical";
      percentageUsed: number;
    }>
  > {
    if (this.isLive()) {
      return this.request("/quota/status");
    } else {
      // Mock always has plenty of quota
      return {
        success: true,
        data: {
          cpuUsedMs: 0,
          cpuRemainingMs: 30_000_000,
          cpuLimitMs: 30_000_000,
          throttleLevel: "normal",
          percentageUsed: 0,
        },
        meta: this.makeLocalMeta(),
      };
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
      "X-Requested-With": "XMLHttpRequest",
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

      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();

        // Check for common proxy errors (Vite, Cloudflare)
        let message = `Expected JSON but received ${contentType || "unknown"}`;

        if (
          text.includes("Vite Hot Module Replacement") ||
          text.includes("<title>Vite + React</title>")
        ) {
          message =
            "Backend worker is unreachable. Did you start it with `npm run dev:full`?";
        } else if (response.status === 404) {
          message = `API route not found: ${path}. Make sure the worker is running and the route is defined.`;
        } else if (text.length > 0) {
          message += `: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`;
        }

        throw new Error(message);
      }

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (err: unknown) {
      console.error(`[ApiClient] Request failed: ${this.baseUrl}${path}`, err);
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
