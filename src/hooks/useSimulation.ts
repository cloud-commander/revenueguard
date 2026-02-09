import { useState, useEffect, useRef, useCallback } from "react";
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

import { useWebSocket } from "./useWebSocket";

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
  history: { actual: number; potential: number }[];
  isLive: boolean;
  session: SessionPayload | null;
  sessionMock: SessionPayload | null;
  sessionLive: SessionPayload | null;
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
  history: Array(40).fill({ actual: 0, potential: 0 }),
  isLive: false,
  session: null,
  sessionMock: null,
  sessionLive: null,
  apiMode: "mock",
  error: null,
};

export function useSimulation() {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [isRunning, setIsRunning] = useState(true);

  // Use refs for values that change too fast for React render cycle in the loop
  const stateRef = useRef(INITIAL_STATE);
  const configRef = useRef(DEFAULT_CONFIG);
  const lastRenderRef = useRef<number>(0);

  // Initialize stateRef and configRef with the initial state and config
  useEffect(() => {
    stateRef.current = INITIAL_STATE;
    configRef.current = DEFAULT_CONFIG;
  }, []);

  const toggleMode = () => {
    const newMode = stateRef.current.mode === "eventual" ? "safe" : "eventual";
    stateRef.current = {
      ...stateRef.current,
      mode: newMode,
      lockWaitTime: newMode === "safe" ? 0 : stateRef.current.lockWaitTime,
    };
    setState((prev) => ({ ...prev, mode: newMode }));
  };

  const logout = useCallback(async () => {
    const activeMode = stateRef.current.apiMode;
    await simulationApi.logout();

    stateRef.current = {
      ...stateRef.current,
      session: null,
      sessionMock: activeMode === "mock" ? null : stateRef.current.sessionMock,
      sessionLive: activeMode === "live" ? null : stateRef.current.sessionLive,
      isLive: false,
    };
    setState((prev) => ({
      ...prev,
      session: null,
      sessionMock: activeMode === "mock" ? null : prev.sessionMock,
      sessionLive: activeMode === "live" ? null : prev.sessionLive,
      isLive: false,
    }));
  }, []);

  // --- WebSocket Integration ---
  const wsUrl = state.session?.sessionId
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws?sessionId=${state.session.sessionId}`
    : "";

  useWebSocket({
    url: wsUrl,
    shouldConnect: state.isLive && !!state.session,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "UPDATE") {
          const liveEvent: TelemetryEvent = {
            id: `ws-${Date.now()}`,
            op: "TX",
            target: `REAL::${data.skuId}`,
            latency: 5,
            status: "OK",
            timestamp: Date.now(),
          };

          stateRef.current = {
            ...stateRef.current,
            telemetry: [liveEvent, ...stateRef.current.telemetry].slice(0, 50),
          };
          // Trigger re-render if needed or rely on loop
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    },
  });

  const login = async (
    token: string,
  ): Promise<{ success: boolean; error?: string }> => {
    // Attempt login which now seeds BOTH engines in background
    const response = await simulationApi.login(token, "0.0.0.0");

    if (response.success && response.data) {
      // Re-fetch both sessions to be sure
      const mockRes = await simulationApi.getCurrentSession("mock");
      const liveRes = await simulationApi.getCurrentSession("live");

      const sessionMock = mockRes.success ? mockRes.data : null;
      const sessionLive = liveRes.success ? liveRes.data : null;

      const currentMode = stateRef.current.apiMode;
      const activeSession = currentMode === "live" ? sessionLive : sessionMock;

      // Auto-enable live simulation if in Live Engine mode
      const shouldEnableLive = currentMode === "live" && !!sessionLive;

      stateRef.current = {
        ...stateRef.current,
        session: activeSession as SessionPayload,
        sessionMock: sessionMock as SessionPayload,
        sessionLive: sessionLive as SessionPayload,
        isLive: shouldEnableLive,
      };

      setState((prev) => ({
        ...prev,
        session: activeSession as SessionPayload,
        sessionMock: sessionMock as SessionPayload,
        sessionLive: sessionLive as SessionPayload,
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
    const newMode: ApiMode =
      stateRef.current.apiMode === "mock" ? "live" : "mock";

    simulationApi.setApiMode(newMode);

    // Swap active session to the one corresponding to the new mode
    const newSession =
      newMode === "live"
        ? stateRef.current.sessionLive
        : stateRef.current.sessionMock;

    stateRef.current = {
      ...stateRef.current,
      apiMode: newMode,
      session: newSession,
      isLive: newMode === "live" && !!newSession,
    };

    setState((prev) => ({
      ...prev,
      apiMode: newMode,
      session: newSession,
      isLive: newMode === "live" && !!newSession,
    }));
  };

  const toggleLive = async () => {
    const newLive = !stateRef.current.isLive;

    // If switching to live, we need a session
    if (newLive && !stateRef.current.session) {
      // Try to re-fetch if we somehow lost the pointer
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

      // Load BOTH sessions if they exist
      const [mockRes, liveRes] = await Promise.all([
        simulationApi.getCurrentSession("mock"),
        simulationApi.getCurrentSession("live"),
      ]);

      const sessionMock = mockRes.success ? mockRes.data : null;
      const sessionLive = liveRes.success ? liveRes.data : null;
      const activeSession = currentMode === "live" ? sessionLive : sessionMock;

      stateRef.current = {
        ...stateRef.current,
        session: activeSession as SessionPayload,
        sessionMock: sessionMock as SessionPayload,
        sessionLive: sessionLive as SessionPayload,
        apiMode: currentMode,
      };

      setState((prev) => ({
        ...prev,
        session: activeSession as SessionPayload,
        sessionMock: sessionMock as SessionPayload,
        sessionLive: sessionLive as SessionPayload,
        apiMode: currentMode,
      }));
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isRunning || !state.session) return;

    const interval = setInterval(() => {
      // Idle auto-stop using centralized constant
      // Note: we might want to use a ref for lastInteraction if we want to support it
      // For now, let's assume keep-alive via WS or just disable idle check for this step

      const current = stateRef.current;
      // DEBUG: Verify loop execution
      if (Math.random() > 0.95)
        console.log("[Simulation] Tick", {
          users: state.activeUsers,
          hasSession: !!state.session,
          running: isRunning,
          apiMode: current.apiMode,
        });

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

      if (newTotalRequests >= SIMULATION_LIMITS.HARD_LIMIT) {
        setIsRunning(false);
        // ... error state logic could be added here or just stop
      }

      // --- CALCULATE PHYSICS (Separated Logic) ---
      const results = SimulationEngine.calculatePhysics(
        current.mode,
        activeUsers,
        config,
        config.chaosLevel,
      );

      // --- CALCULATE ROI ---
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

      // --- TELEMETRY GENERATION ---
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
        // totalRequests: newTotalRequests, // We can skip strictly tracking this for now or re-add
        telemetry: trimmedTelemetry,
        timestamp: Date.now(),
        config: config,
        history: [
          ...current.history.slice(1),
          {
            actual: results.revenueDelta,
            potential: results.revenueDelta + results.lostDelta,
          },
        ],
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
  }, [isRunning, state.session]);

  const setScenario = (scenarioId: ScenarioId) => {
    stateRef.current = {
      ...stateRef.current,
      activeScenario: scenarioId,
    };
    setState((prev) => ({ ...prev, activeScenario: scenarioId }));
  };

  const updateConfig = (newConfig: Partial<SimulationConfig>) => {
    // Auto-reset on architecture change to ensure clean benchmark
    if (
      newConfig.standardArchitecture &&
      newConfig.standardArchitecture !== configRef.current.standardArchitecture
    ) {
      console.info(
        "[simulation] Architecture change detected. Resetting for clean benchmark.",
      );
      resetSimulation();
      // After reset, we still want to apply the new config
      setTimeout(() => {
        const fullConfig = {
          ...configRef.current,
          ...newConfig,
        } as SimulationConfig;
        configRef.current = fullConfig;
        setState((prev) => ({ ...prev, config: fullConfig }));
      }, 0);
      return;
    }

    const fullConfig = {
      ...configRef.current,
      ...newConfig,
    } as SimulationConfig;
    configRef.current = fullConfig;
    setState((prev) => ({ ...prev, config: fullConfig }));
  };

  const touchInteraction = () => {
    // This function might become obsolete or need re-evaluation with WebSocket
    // as idle timeout might be handled server-side or differently.
    // For now, keeping it as a no-op or placeholder.
  };

  const resetSimulation = () => {
    const preservedState = {
      ...INITIAL_STATE,
      session: stateRef.current.session,
      apiMode: stateRef.current.apiMode,
      isLive: stateRef.current.isLive,
      config: stateRef.current.config,
    };
    stateRef.current = preservedState;
    setState(preservedState);
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
