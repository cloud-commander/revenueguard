import { useState, useEffect, useRef } from "react";
import { type ScenarioId } from "@/config/scenarios";

import { type AllocationMode, type SessionPayload } from "@/types";
import {
  BILLING_SCALE,
  DEFAULT_CONFIG,
  SIMULATION_LIMITS,
  SIMULATION_CONSTANTS,
  type SimulationConfig,
} from "@/config/simulationDefaults";
import { simulationApi, type ApiMode } from "@/services/simulationApi";
import { SimulationEngine } from "@/lib/simulationEngine";
import { TelemetryGenerator } from "@/lib/telemetryGenerator";

export type SimulationMode = AllocationMode;

export interface TelemetryEvent {
  id: string;
  op: "GET" | "SET" | "ALARM" | "TX";
  target: string;
  latency: number;
  status: "OK" | "FAIL" | "WAIT" | "RETRY";
  timestamp: number;
}

interface SimulationState {
  revenue: number;
  revenuePotential: number;
  revenueLost: number;
  cumulativeSavings: number;
  latency: number;
  lockWaitTime: number;
  activeUsers: number;
  transactionsProcessed: number;
  totalRequests: number;
  replicaLag: number;
  overbookings: number;
  overbookingCost: number;
  mode: SimulationMode;
  timestamp: number;
  config: SimulationConfig;
  activeScenario: ScenarioId;
  telemetry: TelemetryEvent[];
  isLive: boolean;
  session: SessionPayload | null;
  apiMode: "mock" | "live";
  error?: string | null;
}

const INITIAL_STATE: SimulationState = {
  revenue: 124500,
  revenuePotential: 124500,
  revenueLost: 0,
  cumulativeSavings: 0,
  latency: 45,
  lockWaitTime: 0,
  activeUsers: 40,
  transactionsProcessed: 0,
  totalRequests: 0,
  replicaLag: 0,
  overbookings: 0,
  overbookingCost: 0,
  mode: "eventual",
  timestamp: Date.now(),
  config: DEFAULT_CONFIG,
  activeScenario: "auction",
  telemetry: [],
  isLive: false,
  session: null,
  apiMode: "mock",
  error: null,
};

export function useSimulation() {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [isRunning, setIsRunning] = useState(true);

  const lastInteractionRef = useRef<number>(0);

  useEffect(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  // Use refs for values that change too fast for React render cycle in the loop
  const stateRef = useRef(INITIAL_STATE);
  const configRef = useRef(DEFAULT_CONFIG);
  const lastRenderRef = useRef<number>(0);
  const lastLiveApiCallRef = useRef<number>(0);

  const toggleMode = () => {
    lastInteractionRef.current = Date.now();
    const newMode = stateRef.current.mode === "eventual" ? "safe" : "eventual";
    stateRef.current = {
      ...stateRef.current,
      mode: newMode,
      lockWaitTime: newMode === "safe" ? 0 : stateRef.current.lockWaitTime,
    };
    setState((prev) => ({ ...prev, mode: newMode }));
  };

  const logout = async () => {
    await simulationApi.logout();
    stateRef.current = { ...stateRef.current, session: null, isLive: false };
    setState((prev) => ({ ...prev, session: null, isLive: false }));
  };

  const login = async (
    token: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await simulationApi.login(token, "0.0.0.0"); // Ip handled by worker

    if (response.success && response.data) {
      // Auto-enable live simulation if in Live Engine mode
      const shouldEnableLive = simulationApi.getApiMode() === "live";

      stateRef.current = {
        ...stateRef.current,
        session: response.data,
        isLive: shouldEnableLive,
      };
      setState((prev) => ({
        ...prev,
        session: response.data as SessionPayload,
        isLive: shouldEnableLive,
        error: null,
      }));

      if (shouldEnableLive) {
        simulationApi.setLiveMode(true);
      }

      return { success: true };
    } else {
      const errorMsg = response.error?.message || "Login failed";
      setState((prev) => ({
        ...prev,
        error: errorMsg,
      }));
      return { success: false, error: errorMsg };
    }
  };

  const toggleApiMode = async () => {
    lastInteractionRef.current = Date.now();
    const newMode: ApiMode =
      stateRef.current.apiMode === "mock" ? "live" : "mock";

    simulationApi.setApiMode(newMode);

    // Refresh session from the new mode's storage
    const response = await simulationApi.getCurrentSession();
    const newSession = response.success ? response.data : null;

    stateRef.current = {
      ...stateRef.current,
      apiMode: newMode,
      session: newSession as SessionPayload,
      isLive: newMode === "live" && !!newSession,
    };

    setState((prev) => ({
      ...prev,
      apiMode: newMode,
      session: newSession as SessionPayload,
      isLive: newMode === "live" && !!newSession,
    }));
  };

  const toggleLive = async () => {
    lastInteractionRef.current = Date.now();
    const newLive = !stateRef.current.isLive;

    // If switching to live, we need a session
    if (newLive && !stateRef.current.session) {
      // For now, if no session, we just stay in simulated mode or let the UI handle it
      // But we'll try to initialize first
      simulationApi.initializeSession();
      const response = await simulationApi.getCurrentSession();
      if (!response.success) {
        setState((prev) => ({
          ...prev,
          error: "A valid session is required for Live mode. Please log in.",
        }));
        return;
      }
      stateRef.current = {
        ...stateRef.current,
        session: response.data ?? null,
      };
    }

    stateRef.current = { ...stateRef.current, isLive: newLive };
    setState((prev) => ({ ...prev, isLive: newLive }));
    simulationApi.setLiveMode(newLive);
  };

  useEffect(() => {
    const init = async () => {
      simulationApi.initializeSession();
      const currentMode = simulationApi.getApiMode();
      const response = await simulationApi.getCurrentSession();
      if (response.success && response.data) {
        stateRef.current = {
          ...stateRef.current,
          session: response.data,
          apiMode: currentMode,
        };
        setState((prev) => ({
          ...prev,
          session: response.data as SessionPayload,
          apiMode: currentMode,
        }));
      } else {
        stateRef.current = { ...stateRef.current, apiMode: currentMode };
        setState((prev) => ({ ...prev, apiMode: currentMode }));
      }
    };
    init();
  }, []);

  const setScenario = (scenarioId: ScenarioId) => {
    lastInteractionRef.current = Date.now();
    stateRef.current = {
      ...stateRef.current,
      activeScenario: scenarioId,
    };
    setState((prev) => ({ ...prev, activeScenario: scenarioId }));
  };

  const updateConfig = (newConfig: Partial<SimulationConfig>) => {
    lastInteractionRef.current = Date.now();
    const fullConfig = {
      ...configRef.current,
      ...newConfig,
    } as SimulationConfig;
    configRef.current = fullConfig;
    setState((prev) => ({ ...prev, config: fullConfig }));
  };

  const touchInteraction = () => {
    lastInteractionRef.current = Date.now();
  };

  useEffect(() => {
    if (!isRunning || !state.session) return;

    const interval = setInterval(() => {
      // Idle auto-stop using centralized constant
      if (
        Date.now() - lastInteractionRef.current >
        SIMULATION_CONSTANTS.IDLE_TIMEOUT_MS
      ) {
        setIsRunning(false);
        const stopped = {
          ...stateRef.current,
          error:
            "AUTO-STOP: Demo paused after 5 minutes of inactivity. Resume or reset to continue.",
          timestamp: Date.now(),
        };
        stateRef.current = stopped;
        setState(stopped);
        console.info("[cost-guard] idle auto-stop triggered", {
          idleMs: Date.now() - lastInteractionRef.current,
        });
        return;
      }

      const current = stateRef.current;
      const config = configRef.current;
      const previousError = current.error;

      // Simulate random traffic spikes based on chaosLevel
      const trafficFluctuation =
        (Math.sin(Date.now() / 1000) * 50 + Math.random() * 20) *
        config.chaosLevel;

      const activeUsers = Math.max(
        100,
        Math.floor(
          config.baseTraffic +
            (Math.random() * 10 - 4) +
            trafficFluctuation * 0.1,
        ),
      );

      const rpsPerUser = 1000 / config.refreshRate;
      const totalRps = activeUsers * rpsPerUser;

      // Track total billable-equivalent requests (scaled down for demo safety)
      const billedThisTick =
        totalRps * (config.refreshRate / 1000) * BILLING_SCALE;
      const newTotalRequests = Math.min(
        SIMULATION_LIMITS.HARD_LIMIT,
        current.totalRequests + billedThisTick,
      );

      // --- LIVE API INTERACTION (If enabled) ---
      if (current.isLive && current.session) {
        // Trigger a "Live Allocation" every 2 seconds using a deterministic timer
        const now = Date.now();
        const shouldCallApi = now - lastLiveApiCallRef.current >= 2000;
        if (shouldCallApi) {
          lastLiveApiCallRef.current = now;
          const skuId = "sku-001"; // Default demo SKU
          const handler = (
            res: Awaited<ReturnType<typeof simulationApi.allocate>>,
          ) => {
            if (res.success && res.data?.oversellDelta) {
              const deltaLoss =
                res.data.oversellDelta * SIMULATION_CONSTANTS.COSTS.UNIT_PRICE;
              stateRef.current = {
                ...stateRef.current,
                revenueLost: stateRef.current.revenueLost + deltaLoss,
              };
            }
            if (
              !res.success &&
              (res.error?.code === "EXPIRED_SESSION" ||
                res.error?.code === "INVALID_SESSION")
            ) {
              logout();
            }
          };

          const startTime = Date.now();
          simulationApi.allocate(current.mode, skuId, 1).then((res) => {
            const duration = Date.now() - startTime;

            // Add real response to telemetry
            if (res.success) {
              const liveEvent: TelemetryEvent = {
                id: `real-${Math.random().toString(36).substring(7)}`,
                op: "TX",
                target: `REAL::${skuId}`,
                latency: duration,
                status: "OK",
                timestamp: Date.now(),
              };

              stateRef.current = {
                ...stateRef.current,
                telemetry: [liveEvent, ...stateRef.current.telemetry].slice(
                  0,
                  50,
                ),
              };
            }

            handler(res);
          });
        }
      }

      if (newTotalRequests >= SIMULATION_LIMITS.HARD_LIMIT) {
        setIsRunning(false);
        const finalState = {
          ...current,
          totalRequests: SIMULATION_LIMITS.HARD_LIMIT,
          error:
            "SIMULATION HALTED: Demo request budget reached (~20% of paid Workers included allowance). Please reset to continue.",
          timestamp: Date.now(),
        };
        stateRef.current = finalState;
        setState(finalState);
        console.info("[cost-guard] auto-stop triggered at hard limit", {
          totalRequests: SIMULATION_LIMITS.HARD_LIMIT,
        });
        return;
      }

      if (newTotalRequests >= SIMULATION_LIMITS.ALERT && !current.error) {
        console.info("[cost-guard] alert threshold reached", {
          totalRequests: newTotalRequests,
        });
        setState((prev) => ({
          ...prev,
          totalRequests: newTotalRequests,
          error:
            "NOTICE: Approaching demo budget (~15% of included allowance). You can keep narrating safely; halt soon to stay under 20%.",
        }));
      }

      // --- CALCULATE PHYSICS (Separated Logic) ---
      const results = SimulationEngine.calculatePhysics(
        current.mode,
        activeUsers,
        config,
        config.chaosLevel,
      );

      // --- CALCULATE ROI (Separated Logic - simplified inline for context) ---
      // We keep atomic savings calculation here as it depends on hypothetical regional state
      let savingsDelta = 0;
      if (current.mode === "safe") {
        const hypotheticalLatency =
          SIMULATION_CONSTANTS.LATENCY.GLOBAL_AVG + 50 * config.chaosLevel;
        const hypotheticalLossFactor =
          Math.max(0, (hypotheticalLatency - 150) / 1000) * 0.1;
        const potentialRevenueTick = activeUsers * 0.5;
        savingsDelta = potentialRevenueTick * hypotheticalLossFactor;
      }

      const overbookingCostDelta =
        results.overbookingDelta *
        SIMULATION_CONSTANTS.COSTS.OVERBOOKING_PENALTY;

      // --- TELEMETRY GENERATION (Separated Logic) ---
      const trimmedTelemetry = TelemetryGenerator.generate(
        stateRef.current.telemetry,
        activeUsers,
        results.latency,
        config,
        current.apiMode === "live",
      );

      const newState: SimulationState = {
        ...current,
        revenue: current.revenue + results.revenueDelta,
        revenuePotential:
          current.revenuePotential + results.revenueDelta + results.lostDelta,
        revenueLost:
          current.revenueLost + results.lostDelta + overbookingCostDelta,
        cumulativeSavings: stateRef.current.cumulativeSavings + savingsDelta,
        overbookings: current.overbookings + results.overbookingDelta,
        overbookingCost: current.overbookingCost + overbookingCostDelta,
        latency: results.latency,
        lockWaitTime: results.lockWaitTime,
        replicaLag: results.replicaLag,
        activeUsers,
        transactionsProcessed:
          current.transactionsProcessed + results.processed,
        totalRequests: newTotalRequests,
        telemetry: trimmedTelemetry,
        timestamp: Date.now(),
        config: config,
      };

      stateRef.current = newState;
      const now = Date.now();
      const shouldRender =
        now - lastRenderRef.current >= 200 || previousError !== newState.error;

      if (shouldRender) {
        lastRenderRef.current = now;
        setState(newState);
      }
    }, configRef.current.refreshRate);

    return () => clearInterval(interval);
  }, [isRunning, configRef.current.refreshRate]);

  const resetSimulation = () => {
    lastInteractionRef.current = Date.now();
    stateRef.current = INITIAL_STATE;
    setState(INITIAL_STATE);
  };

  return {
    ...state,
    toggleMode,
    toggleLive,
    updateConfig,
    setScenario,
    resetSimulation,
    isRunning,
    setIsRunning,
    touchInteraction,
    login,
    logout,
    toggleApiMode,
  };
}
