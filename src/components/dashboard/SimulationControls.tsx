import {
  Settings2,
  Zap,
  AlertCircle,
  ShoppingCart,
  RefreshCcw,
  Gauge,
  Activity,
  Info,
  Database,
  Hash,
  Layers,
  Globe,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulationConfig } from "@/config/simulationDefaults";
import { SIMULATION_LIMITS } from "@/config/simulationDefaults";
import { SCENARIOS } from "@/config/scenarios";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SimulationControlsProps {
  config: SimulationConfig;
  onUpdate: (config: Partial<SimulationConfig>) => void;
  activeScenario: string;
  onScenarioChange: (id: string) => void;
  totalRequests: number;
  onResetSimulation: () => void;
  touchInteraction?: () => void;
}

export const SimulationControls = ({
  config,
  onUpdate,
  activeScenario,
  onScenarioChange,
  totalRequests,
  onResetSimulation,
  touchInteraction,
}: SimulationControlsProps) => {
  const handleUpdate = (cfg: Partial<SimulationConfig>) => {
    touchInteraction?.();
    onUpdate(cfg);
  };

  const handleScenarioChange = (id: string) => {
    touchInteraction?.();
    onScenarioChange(id);
  };

  const handleReset = () => {
    touchInteraction?.();
    onResetSimulation();
  };

  const presets = [
    {
      label: "Standard Day",
      icon: ShoppingCart,
      color: "text-blue-600 dark:text-blue-400",
      config: { baseTraffic: 800, chaosLevel: 0.5, refreshRate: 200 },
    },
    {
      label: "Black Friday",
      icon: AlertCircle,
      color: "text-orange-600 dark:text-orange-400",
      config: { baseTraffic: 4000, chaosLevel: 1.5, refreshRate: 100 },
    },
    {
      label: "Flash Sale",
      icon: Zap,
      color: "text-yellow-600 dark:text-yellow-400",
      config: { baseTraffic: 2000, chaosLevel: 2.5, refreshRate: 50 },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1 mb-4">
        <Settings2 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Simulation Lab
        </h3>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="bg-muted/40 border border-border rounded-xl px-3 py-2 text-[10px] font-mono text-muted-foreground flex items-center justify-between cursor-help hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-2">
              <Info className="w-3 h-3 text-[var(--color-status-success)]" />
              Runtime Architecture
            </span>
            <span className="opacity-50 underline decoration-dotted">
              Details
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="space-y-2 p-3 min-w-[240px]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-success)]" />
            <span className="font-bold">Stack:</span> Durable Objects + D1
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-alert)]" />
            <span className="font-bold">Efficiency:</span> 1e-9 Overhead
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            onClick={() => handleUpdate(preset.config)}
            className="h-auto flex-col gap-2 p-3 rounded-xl bg-card border-border hover:border-foreground/20 transition-all hover:bg-muted group"
          >
            <preset.icon
              className={cn(
                "w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity",
                preset.color,
              )}
            />
            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground">
              {preset.label}
            </span>
          </Button>
        ))}
      </div>

      {/* Regional Architecture Patterns */}
      <div className="space-y-2 px-1">
        <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          <span>Alternative Architecture Patterns</span>
        </div>
        <Tabs
          value={config.standardArchitecture}
          onValueChange={(v) =>
            handleUpdate({ standardArchitecture: v as any })
          }
          className="w-full"
        >
          <TabsList className="w-full bg-muted rounded-lg p-1 gap-1 h-auto grid grid-cols-5">
            <TabsTrigger
              value="sql"
              className="flex items-center justify-center gap-1 py-1.5 rounded-md text-[8px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm"
              title="Centralized SQL: Traditional Race Conditions"
            >
              <Database className="w-2.5 h-2.5" />
              SQL
            </TabsTrigger>
            <TabsTrigger
              value="redis"
              className="flex items-center justify-center gap-1 py-1.5 rounded-md text-[8px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-red-500 data-[state=active]:shadow-sm"
              title="Global Redis Lock: Performance Bottleneck"
            >
              <Hash className="w-2.5 h-2.5" />
              Redis
            </TabsTrigger>
            <TabsTrigger
              value="queue"
              className="flex items-center justify-center gap-1 py-1.5 rounded-md text-[8px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-blue-500 data-[state=active]:shadow-sm"
              title="Async Queue: Stale Reads & Ghost Orders"
            >
              <Layers className="w-2.5 h-2.5" />
              Queue
            </TabsTrigger>
            <TabsTrigger
              value="crdt"
              className="flex items-center justify-center gap-1 py-1.5 rounded-md text-[8px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-emerald-500 data-[state=active]:shadow-sm"
              title="Edge Sync (CRDT): Negative Inventory Merge"
            >
              <Globe className="w-2.5 h-2.5" />
              Sync
            </TabsTrigger>
            <TabsTrigger
              value="sticky"
              className="flex items-center justify-center gap-1 py-1.5 rounded-md text-[8px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-purple-500 data-[state=active]:shadow-sm"
              title="Sticky Cache: State Drift during Node Rebalance"
            >
              <Workflow className="w-2.5 h-2.5" />
              Sticky
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Scenario Selector */}
      <div className="space-y-2 px-1">
        <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
          <span>Simulation Scenario</span>
        </div>
        <Tabs
          value={activeScenario}
          onValueChange={handleScenarioChange}
          className="w-full"
        >
          <TabsList className="w-full bg-muted rounded-lg p-1 gap-1 h-auto grid grid-cols-2">
            {Object.values(SCENARIOS).map((scenario) => {
              const Icon = scenario.icon;
              return (
                <TabsTrigger
                  key={scenario.id}
                  value={scenario.id}
                  className="flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="w-3 h-3" />
                  <span className="">{scenario.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Sliders */}
      <div className="space-y-5 px-1">
        {/* Base Traffic */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span>Traffic Intensity</span>
            <span className="text-foreground font-bold">
              {config.baseTraffic} sessions
            </span>
          </div>
          <div className="py-2">
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={config.baseTraffic}
              onChange={(e) => {
                touchInteraction?.();
                onUpdate({ baseTraffic: parseInt(e.target.value) });
              }}
              aria-label="Traffic intensity (sessions)"
              aria-valuetext={`${config.baseTraffic} sessions`}
              className="w-full h-2 bg-muted rounded-full appearance-none accent-[var(--color-status-success)] cursor-pointer"
            />
          </div>
        </div>

        {/* Chaos Level */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span>Chaos Factor (Randomness)</span>
            <span className="text-foreground font-bold">
              x{config.chaosLevel.toFixed(1)}
            </span>
          </div>
          <div className="py-2">
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={config.chaosLevel}
              onChange={(e) => {
                touchInteraction?.();
                onUpdate({ chaosLevel: parseFloat(e.target.value) });
              }}
              aria-label="Chaos factor"
              aria-valuetext={`Chaos x${config.chaosLevel.toFixed(1)}`}
              className="w-full h-2 bg-muted rounded-full appearance-none accent-[var(--color-status-alert)] cursor-pointer"
            />
          </div>
        </div>

        {/* Refresh Rate */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span>Resolution Speed</span>
            <span className="text-foreground font-bold">
              {config.refreshRate}ms
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="500"
            step="50"
            value={config.refreshRate}
            onChange={(e) => {
              touchInteraction?.();
              onUpdate({ refreshRate: parseInt(e.target.value) });
            }}
            aria-label="Resolution speed"
            aria-valuetext={`${config.refreshRate} milliseconds`}
            className="w-full h-1 bg-muted rounded-full appearance-none accent-blue-500 cursor-pointer"
          />
        </div>

        {/* Latency Injection (Demo) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-2">
              <Gauge className="w-3 h-3" />
              Simulated Network Jitter
            </span>
            <span className="text-foreground font-bold">
              +{config.latencyInjectionMs}ms
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="80"
            step="10"
            value={config.latencyInjectionMs}
            onChange={(e) => {
              touchInteraction?.();
              onUpdate({ latencyInjectionMs: parseInt(e.target.value) });
            }}
            aria-label="Latency injection"
            aria-valuetext={`Plus ${config.latencyInjectionMs} milliseconds`}
            className="w-full h-1 bg-muted rounded-full appearance-none accent-orange-400 cursor-pointer"
          />
        </div>

        {/* Payload Profile */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              State Payload Size
            </span>
            <span className="text-foreground font-bold">
              {config.payloadSizeBytes}B
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[50, 500, 5000].map((size) => (
              <button
                key={size}
                onClick={() => handleUpdate({ payloadSizeBytes: size })}
                className={cn(
                  "py-2 rounded-lg text-[10px] font-bold border transition-all",
                  config.payloadSizeBytes === size
                    ? "bg-card border-foreground/30 text-foreground shadow-sm"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {size >= 1000 ? `${size / 1000}KB` : `${size}B`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-1 pb-2">
        {/* Allowance Consumption */}
        <div className="space-y-2 pt-4 border-t border-border">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-blue-500" />
              Allowance Consumption
            </span>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full bg-[var(--color-status-success)]/10 text-[var(--color-status-success)] text-[8px] font-bold border border-[var(--color-status-success)]/20 uppercase tracking-tighter">
                Cost Efficient Scale
              </span>
              <span
                className={cn(
                  "font-bold",
                  totalRequests >= SIMULATION_LIMITS.HARD_LIMIT
                    ? "text-destructive"
                    : totalRequests >= SIMULATION_LIMITS.ALERT
                      ? "text-orange-500"
                      : "text-foreground",
                )}
              >
                {Math.min(
                  100,
                  (totalRequests / SIMULATION_LIMITS.HARD_LIMIT) * 100,
                ).toFixed(1)}
                %
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                totalRequests >= SIMULATION_LIMITS.HARD_LIMIT
                  ? "bg-destructive"
                  : totalRequests >= SIMULATION_LIMITS.ALERT
                    ? "bg-orange-500"
                    : "bg-[var(--color-status-success)]",
              )}
              style={{
                width: `${Math.min(100, (totalRequests / SIMULATION_LIMITS.HARD_LIMIT) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[8px] font-mono text-muted-foreground uppercase tracking-widest opacity-60">
            <span>0</span>
            <span>
              {(SIMULATION_LIMITS.ALERT / 1000000).toFixed(2)}M (Alert)
            </span>
            <span>
              {(SIMULATION_LIMITS.HARD_LIMIT / 1000000).toFixed(2)}M (Halt)
            </span>
          </div>
        </div>

        {/* Global Reset */}
        <Button
          variant="outline"
          onClick={handleReset}
          className="w-full flex items-center justify-center gap-2 py-6 rounded-xl bg-muted border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-card hover:border-foreground/20 transition-all group"
        >
          <RefreshCcw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
          Reset All Simulation Data
        </Button>
      </div>

      <div className="bg-card p-4 rounded-xl border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
            <span>Resilience Testing</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span>External Service Degradation</span>
            <Switch
              checked={config.degradedDemo}
              onCheckedChange={(v) => handleUpdate({ degradedDemo: v })}
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
            Toggle high-load simulation behaviors.
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
                <Info className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className="max-w-[200px] text-[10px] leading-relaxed"
            >
              Simulates a complete outage or severe slowdown of an external
              regional database. Demonstrates how Revenue Guard maintains atomic
              integrity at the Edge even when backend systems experience high
              latency.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="bg-card p-4 rounded-xl border border-border flex items-start gap-3">
        <RefreshCcw className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          Higher chaos levels simulate inconsistent network conditions and
          extreme burst patterns.
        </p>
      </div>
    </div>
  );
};
