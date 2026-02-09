import { useState } from "react";
import type { SimulationMode } from "@/hooks/useSimulation";
import type { SimulationConfig } from "@/config/simulationDefaults";
import type { InventoryItem, QuotaStatus, ThrottleLevel } from "@/types";
import { DISABLE_LIVE_ENGINE } from "@/config/simulationDefaults";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Sidebar, type ViewState } from "@/components/layout/Sidebar";
import { ControlPanel } from "@/components/layout/ControlPanel";
import { KnowledgeBase } from "@/components/views/KnowledgeBase";
import { MonitorView } from "@/components/views/MonitorView";
import { SessionStatusView } from "@/components/views/SessionStatusView";
import { LegalDisclaimer } from "@/components/views/LegalDisclaimer";
import { Menu, SlidersHorizontal, Info } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"; // For Mobile Nav
import { Button } from "@/components/ui/button";
import { TelemetryView } from "@/components/views/TelemetryView";
import { type TelemetryEvent } from "@/hooks/useSimulation";

// --- Components ---

const ModeToggle = ({
  mode,
  onToggle,
}: {
  mode: SimulationMode;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className={cn(
      "relative h-10 w-32 md:w-48 rounded-full bg-muted border border-border p-1 flex items-center cursor-pointer overflow-hidden transition-all duration-300 hover:border-foreground/20 shadow-inner",
      mode === "safe" && "border-[var(--color-status-success)]/40",
    )}
  >
    <div className="relative z-10 grid grid-cols-2 w-full text-center text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
      <span
        className={cn(
          "transition-colors duration-300 py-1",
          mode === "eventual" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        Eventual
      </span>
      <span
        className={cn(
          "transition-colors duration-300 py-1",
          mode === "safe"
            ? "text-[var(--color-status-success)]"
            : "text-muted-foreground",
        )}
      >
        Safe
      </span>
    </div>
    <motion.div
      className={cn(
        "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-sm backdrop-blur-md",
        mode === "eventual"
          ? "bg-[var(--color-status-alert)]/20 left-1"
          : "bg-[var(--color-status-success)]/20 right-1",
      )}
      layout
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    />
  </button>
);

// LiveToggle removed
interface DashboardLayoutProps {
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
    telemetry: TelemetryEvent[];
    cumulativeSavings: number;
    overbookingCost: number;
    isLive: boolean;
    session: import("@/types").SessionPayload | null;
    guardrailTriggered: boolean;
    apiMode: "mock" | "live";
    history: { actual: number; potential: number }[];
    inventorySnapshot: InventoryItem[];
    inventoryLoading: boolean;
    inventoryError: string | null;
    quotaStatus: QuotaStatus | null;
    throttleLevel: ThrottleLevel;
  };
  onToggleMode: () => void;
  onToggleLive: () => void;
  onUpdateConfig: (config: Partial<SimulationConfig>) => void;
  onScenarioChange: (id: string) => void;
  onResetSimulation: () => void;
  onToggleApiMode: () => void;
  onLogout: () => void;
  touchInteraction?: () => void;
}

export const DashboardLayout = ({
  state,
  onToggleMode,
  onUpdateConfig,
  onScenarioChange,
  onResetSimulation,
  onToggleApiMode,
  onLogout,
  touchInteraction,
}: DashboardLayoutProps) => {
  const { mode, config, activeScenario, apiMode } = state;
  const effectiveSkuCount = apiMode === "live" ? 5 : config.skuCount;

  // View State
  const [currentView, setCurrentView] = useState<ViewState>("monitor");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [legalDisclaimerOpen, setLegalDisclaimerOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex h-screen w-full text-foreground overflow-hidden selection:bg-[var(--color-status-success)]/30 transition-colors duration-500",
        state.apiMode === "live"
          ? "engine-live bg-[var(--color-engine-bg)]"
          : "engine-mock bg-[var(--color-engine-bg)]",
      )}
    >
      {/* 1. Left Sidebar (Desktop) */}
      <div className="hidden lg:block w-[340px] shrink-0">
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          apiMode={state.apiMode}
          onToggleApiMode={onToggleApiMode}
          onLogout={onLogout}
          onLegalClick={() => setLegalDisclaimerOpen(true)}
        />
      </div>

      {/* 2. Main Centre Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header (Mobile & Desktop) */}
        <header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background/80 backdrop-blur-sm z-10 transition-all">
          {/* Mobile Nav Trigger */}
          <div className="lg:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px]">
                <Sidebar
                  currentView={currentView}
                  onNavigate={(v) => {
                    setCurrentView(v);
                    setMobileNavOpen(false);
                  }}
                  apiMode={state.apiMode}
                  onToggleApiMode={onToggleApiMode}
                  onLogout={onLogout}
                  onLegalClick={() => setLegalDisclaimerOpen(true)}
                />
              </SheetContent>
            </Sheet>
          </div>

          {/* Source Badge (Desktop/Tablet) */}
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border rounded-xl px-3 py-1.5 transition-colors ml-4">
            <Info className="w-3 h-3 text-[var(--color-status-success)]" />
            <span>
              Source:{" "}
              {state.apiMode === "live"
                ? "Live Worker (Real Telemetry)"
                : "Mock Engine (Client-side)"}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4 ml-auto">
            {!DISABLE_LIVE_ENGINE && (
              <button
                onClick={() => {
                  touchInteraction?.();
                  onToggleApiMode();
                }}
                className={cn(
                  "h-10 px-3 md:px-4 rounded-full border p-1 flex items-center cursor-pointer transition-all duration-300 shadow-sm gap-2",
                  state.apiMode === "live"
                    ? "bg-[var(--color-engine-accent)]/10 border-[var(--color-engine-accent)]/50 text-[var(--color-engine-accent)]"
                    : "bg-muted border-border text-muted-foreground hover:border-foreground/20",
                )}
              >
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    state.apiMode === "live"
                      ? "bg-[var(--color-engine-accent)] animate-pulse shadow-[0_0_8px_var(--color-engine-accent)]"
                      : "bg-muted-foreground/30",
                  )}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {state.apiMode === "live" ? "Live Worker" : "Mock Engine"}
                </span>
              </button>
            )}
            <ModeToggle
              mode={mode}
              onToggle={() => {
                touchInteraction?.();
                onToggleMode();
              }}
            />
            <ThemeToggle />

            {/* Mobile Controls Trigger */}
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileControlsOpen(true)}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto">
            {currentView === "monitor" ? (
              <MonitorView state={state} />
            ) : currentView === "session" ? (
              <SessionStatusView state={state} />
            ) : currentView === "telemetry" ? (
              <TelemetryView
                telemetry={state.telemetry}
                skuCount={effectiveSkuCount}
              />
            ) : (
              <KnowledgeBase />
            )}
          </div>

          {/* Bottom Padding for Mobile Fab */}
          <div className="h-24 lg:hidden" />
        </main>
      </div>

      {/* 3. Right Control Panel (Desktop & Mobile Sheet) */}
      <ControlPanel
        config={config}
        onUpdate={onUpdateConfig}
        activeScenario={activeScenario}
        onScenarioChange={onScenarioChange}
        onResetSimulation={onResetSimulation}
        touchInteraction={touchInteraction}
        mobileOpen={mobileControlsOpen}
        onMobileOpenChange={setMobileControlsOpen}
      />

      {/* Legal Disclaimer Modal */}
      <LegalDisclaimer
        open={legalDisclaimerOpen}
        onOpenChange={setLegalDisclaimerOpen}
      />
    </div>
  );
};
