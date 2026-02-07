import { motion } from "framer-motion";
import { Calculator, Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENARIOS } from "@/config/scenarios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  type StandardArchitecture,
  SIMULATION_CONSTANTS,
} from "@/config/simulationDefaults";
import { StatusUtils } from "@/utils/statusUtils";

interface PerformanceMathsProps {
  sessions: number;
  skus: number;
  activeScenario?: string;
  apiMode?: "mock" | "live";
  simMode?: "safe" | "eventual";
  standardArchitecture?: StandardArchitecture;
  replicaLag?: number;
}

export const PerformanceMaths = ({
  sessions,
  skus,
  activeScenario = "retail",
  apiMode = "mock",
  simMode = "safe",
  standardArchitecture = "sql",
  replicaLag = 0,
}: PerformanceMathsProps) => {
  const scenario = SCENARIOS[activeScenario] || SCENARIOS.retail;

  const RPS_LIMIT_PER_DO = SIMULATION_CONSTANTS.RPS.LIMIT_PER_DO;
  const POLL_RATE_MS = SIMULATION_CONSTANTS.RPS.POLL_RATE_MS;
  const RPS_REQUIRED_PER_USER = 1000 / POLL_RATE_MS;

  const totalRps = sessions * RPS_REQUIRED_PER_USER;
  const dosRequired = apiMode === "live" ? 5 : skus;
  const rpsPerDo = totalRps / dosRequired;
  const loadPercentage = (rpsPerDo / RPS_LIMIT_PER_DO) * 100;

  return (
    <Card className="border-border overflow-hidden">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="flex items-center gap-3">
          <Calculator className="w-5 h-5 text-blue-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Runtime Performance Analysis
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-4 space-y-6">
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase font-bold">
              Total Traffic
            </p>
            <p className="text-lg font-mono font-bold text-foreground leading-none">
              {totalRps.toLocaleString()}{" "}
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                Reqs/Sec
              </span>
            </p>
            <p className="text-[9px] text-muted-foreground italic">
              ({sessions} active users)
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase font-bold">
              {simMode === "safe"
                ? "Processing Power"
                : standardArchitecture === "redis"
                  ? "Serialisation Latency"
                  : standardArchitecture === "queue"
                    ? "Deferral Overhead"
                    : standardArchitecture === "crdt"
                      ? "Sync Jitter"
                      : standardArchitecture === "sticky"
                        ? "Node Affinity"
                        : "Regional Infrastructure"}
            </p>
            <p
              className={cn(
                "text-lg font-mono font-bold leading-none",
                simMode === "safe" ? "text-blue-400" : "text-amber-500/80",
              )}
            >
              {simMode === "safe"
                ? dosRequired
                : standardArchitecture === "sql" ||
                    standardArchitecture === "redis"
                  ? "1 Primary + 3 Reps"
                  : standardArchitecture === "crdt"
                    ? "Global Grid"
                    : "Standard Instance"}{" "}
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {simMode === "safe"
                  ? "Durable Objects"
                  : standardArchitecture === "sql" ||
                      standardArchitecture === "redis"
                    ? "(Distributed DB)"
                    : standardArchitecture === "queue"
                      ? "Async Service"
                      : standardArchitecture === "crdt"
                        ? "(Multi-Master)"
                        : standardArchitecture === "sticky"
                          ? "Regional Nodes"
                          : "Relational DB"}
              </span>
            </p>
            <p className="text-[9px] text-muted-foreground italic">
              {simMode === "safe"
                ? `(1 Object per ${scenario.itemLabel})`
                : standardArchitecture === "redis"
                  ? "(Synchronous Write)"
                  : standardArchitecture === "queue"
                    ? "(Asynchronous Process)"
                    : standardArchitecture === "crdt"
                      ? "(Eventual Consensus)"
                      : standardArchitecture === "sticky"
                        ? "(State Affinity)"
                        : "(Primary + 3 Read Reps)"}
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-2">
              <Cpu className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-mono">
                {simMode === "safe"
                  ? "Object Saturation"
                  : "Database Queue Load"}
              </span>
            </div>
            <span
              className={cn(
                "text-[10px] font-mono font-bold",
                simMode === "safe"
                  ? StatusUtils.getLoadColor(loadPercentage)
                  : StatusUtils.getReplicaLagColor(replicaLag),
              )}
            >
              {simMode === "safe"
                ? `${loadPercentage.toFixed(1)}% of 1k RPS/Obj saturation`
                : replicaLag > 500
                  ? "SLO BREACH (Lag > 5s)"
                  : `${Math.round(replicaLag)}ms Replica Lag`}
            </span>
          </div>

          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width:
                  simMode === "safe"
                    ? `${Math.min(loadPercentage, 100)}%`
                    : `${Math.min((replicaLag / 1000) * 100, 100)}%`,
              }}
              className={cn(
                "h-full rounded-full transition-colors duration-500",
                simMode === "safe"
                  ? StatusUtils.getLoadBg(loadPercentage)
                  : "bg-amber-500", // Keep amber for replica lag as it's not a scale of good/bad same as load
              )}
            />
          </div>
        </div>

        <div className="flex items-start gap-2 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
          <Zap className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-[9px] text-blue-700 dark:text-blue-300 leading-relaxed font-bold uppercase tracking-tighter">
              {simMode === "safe"
                ? "Edge-Atomic Processing Active"
                : "Regional Convergence Active"}
            </p>
            <p className="text-[9px] text-blue-700 dark:text-blue-300 leading-relaxed opacity-80">
              {simMode === "safe"
                ? "Durable Objects ensure zero race conditions. Runtime scales by sharding high-concurrency hotspots across the global network."
                : "Requests bypass the Edge-atomic layer to hit a regional infrastructure pattern directly. This demonstrates the standard sync trade-offs shown in logs."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
