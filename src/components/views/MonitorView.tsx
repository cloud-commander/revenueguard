import { RevenueTicker } from "../dashboard/RevenueTicker";
import { ContentionGrid } from "../dashboard/ContentionGrid";
import { SystemHealth } from "../dashboard/SystemHealth";
import { ConflictLog } from "../dashboard/ConflictLog";
import { SimulationNarrative } from "../dashboard/SimulationNarrative";
import { EdgePresence } from "../dashboard/EdgePresence";
import { PerformanceMaths } from "../dashboard/PerformanceMaths";
import { SCENARIOS } from "@/config/scenarios";
import type { SimulationMode } from "@/hooks/useSimulation";
import type { SimulationConfig } from "@/config/simulationDefaults";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Info, ShieldCheck } from "lucide-react";
import { type TelemetryEvent } from "@/hooks/useSimulation";
import { SIMULATION_LIMITS } from "@/config/simulationDefaults";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface MonitorViewProps {
  state: {
    revenue: number;
    revenueLost: number;
    latency: number;
    lockWaitTime: number;
    activeUsers: number;
    transactionsProcessed: number;
    totalRequests: number;
    replicaLag: number;
    mode: SimulationMode;
    timestamp: number;
    config: SimulationConfig;
    activeScenario: string;
    error?: string | null;
    cumulativeSavings: number;
    telemetry: TelemetryEvent[];
    apiMode: "mock" | "live";
    history: { actual: number; potential: number }[];
  };
}

export const MonitorView = ({ state }: MonitorViewProps) => {
  const {
    revenue,
    revenueLost,
    latency,
    lockWaitTime,
    activeUsers,
    transactionsProcessed,
    totalRequests,
    mode,
    cumulativeSavings,
    config,
    activeScenario,
    timestamp,
    error,
    apiMode,
    history,
  } = state;

  const scenario = SCENARIOS[activeScenario] || SCENARIOS.auction;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border rounded-xl px-3 py-1.5 transition-colors">
          <Info className="w-3 h-3 text-[var(--color-status-success)]" />
          <span className="hidden sm:inline">
            Source:{" "}
            {apiMode === "live"
              ? "Live Worker (Real Telemetry)"
              : "Mock Engine (Client-side)"}
          </span>
          <span className="sm:hidden text-[9px]">
            {apiMode === "live" ? "Live Worker" : "Mock Data"}
          </span>
        </div>
        <div className="flex lg:hidden items-center gap-2 text-[9px] font-mono text-muted-foreground bg-[var(--color-status-alert)]/5 border border-[var(--color-status-alert)]/20 rounded-xl px-3 py-1.5">
          <ShieldCheck className="w-3 h-3 text-[var(--color-status-alert)]" />
          Auto-stop ~10%
        </div>
      </div>

      {error && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border-2 border-destructive/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-center"
          >
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Allowance Reached
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {error}
              </p>
            </div>
            <div className="pt-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Safeguard active: Simulation Halted
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {config.degradedDemo && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-800 dark:text-yellow-200 rounded-xl p-3 text-xs font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Demo degraded mode active (SLO breach simulated). No real SQL routing
          performed.
        </div>
      )}

      {totalRequests >= SIMULATION_LIMITS.ALERT && !error && (
        <div className="bg-orange-500/10 border border-orange-500/40 text-orange-800 dark:text-yellow-200 rounded-xl p-3 text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          USAGE WARNING: {(totalRequests / 1000000).toFixed(2)}M /{" "}
          {(SIMULATION_LIMITS.HARD_LIMIT / 1000000).toFixed(2)}M requests
          consumed (Allowance Alert).
        </div>
      )}

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        {/* Main Ticker */}
        <Card
          className={cn(
            "lg:col-span-8 bg-card rounded-2xl border relative overflow-hidden group transition-all duration-500",
            apiMode === "live"
              ? "border-[var(--color-engine-accent)]/30 shadow-[0_0_20px_var(--color-engine-accent)]/5"
              : "border-border",
          )}
        >
          <CardContent className="p-4 md:p-6">
            <div
              className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-br",
                apiMode === "live"
                  ? "from-[var(--color-engine-accent)]/10 to-transparent"
                  : "from-white/5 to-transparent",
              )}
            />
            <div className="flex flex-col gap-4">
              <RevenueTicker
                value={revenue}
                mode={mode}
                label={`${scenario.itemLabel}s ${scenario.actionLabel}`}
                history={history}
              />
              <RevenueTicker
                value={revenueLost}
                mode="eventual"
                label="Revenue at Risk"
              />
            </div>
            <AnimatePresence>
              {mode === "safe" && cumulativeSavings > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 p-3 rounded-xl bg-[var(--color-status-success)]/10 border border-[var(--color-status-success)]/30 text-[var(--color-status-success)] font-mono text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-status-success)] animate-pulse" />
                    <span>TOTAL LOSS PREVENTED (ROI)</span>
                  </div>
                  <span className="font-bold text-sm">
                    +${Math.floor(cumulativeSavings).toLocaleString()}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Narrative / Context */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex-1">
            <SimulationNarrative
              mode={mode}
              latency={latency}
              lockWaitTime={lockWaitTime}
              activeScenario={activeScenario}
              config={config}
              error={error}
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[500px]">
        {/* Left: System Health & Edge Presence */}
        <div className="lg:col-span-4 space-y-6">
          <SystemHealth
            latency={latency}
            lockWaitTime={lockWaitTime}
            mode={mode}
          />
          <PerformanceMaths
            sessions={activeUsers}
            skus={config.skuCount}
            activeScenario={activeScenario}
            apiMode={apiMode}
            simMode={mode}
            standardArchitecture={config.standardArchitecture}
            replicaLag={state.replicaLag}
          />
          <EdgePresence mode={mode} />
        </div>

        {/* Centre/Right: The Grid */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Global Inventory Contention
            </h2>
            <div className="flex gap-4 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-alert)]" />{" "}
                High Contention
              </span>
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-success)]" />{" "}
                Safe Lock
              </span>
            </div>
          </div>

          <Card className="flex-1 bg-card rounded-2xl border border-border overflow-hidden min-h-[400px]">
            <CardContent className="p-1 h-full">
              <ContentionGrid
                mode={mode}
                activeUsers={activeUsers}
                timestamp={timestamp}
                activeScenario={activeScenario}
                skuCount={apiMode === "live" ? 5 : config.skuCount}
              />
            </CardContent>
          </Card>

          <div className="h-48 mt-auto">
            <ConflictLog
              mode={mode}
              transactions={transactionsProcessed}
              activeScenario={activeScenario}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
