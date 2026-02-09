import React from "react";
import { motion } from "framer-motion";
import {
  Zap,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Activity,
  AlertTriangle,
  Clock,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface GridMonitorProps {
  state: {
    revenue: number;
    revenueLost: number;
    latency: number;
    lockWaitTime: number;
    activeUsers: number;
    transactionsProcessed: number;
    totalRequests: number;
    replicaLag: number;
    mode: "safe" | "eventual";
    timestamp: number;
    cumulativeSavings: number;
    overbookingCost: number;
    guardrailTriggered: boolean;
  };
}

const MetricCard = ({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
  className,
  valueClassName,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  className?: string;
  valueClassName?: string;
}) => (
  <Card
    className={cn(
      "overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:bg-card/80",
      className,
    )}
  >
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </CardHeader>
    <CardContent>
      <div className={cn("text-2xl font-bold tracking-tight", valueClassName)}>
        {value}
      </div>
      {subValue && (
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          {trend === "up" && (
            <TrendingUp className="w-3 h-3 text-[var(--color-status-success)]" />
          )}
          {trend === "down" && (
            <TrendingDown className="w-3 h-3 text-[var(--color-status-alert)]" />
          )}
          {subValue}
        </p>
      )}
    </CardContent>
  </Card>
);

export const GridMonitorView: React.FC<GridMonitorProps> = ({ state }) => {
  const {
    revenue,
    revenueLost,
    latency,
    lockWaitTime,
    activeUsers,
    transactionsProcessed,
    totalRequests: _totalRequests,
    replicaLag,
    mode,
    cumulativeSavings,
    overbookingCost: _overbookingCost,
    guardrailTriggered,
  } = state;

  const isSafe = mode === "safe";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Status Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">
            Active Edge Monitor
          </h2>
          <p className="text-muted-foreground">
            Real-time performance and revenue metrics from the Cloudflare global
            network.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isSafe ? "outline" : "destructive"}
            className={cn(
              "pl-1 pr-3 py-1 gap-2 font-mono uppercase tracking-tighter",
              isSafe &&
                "border-[var(--color-status-success)] text-[var(--color-status-success)] bg-[var(--color-status-success)]/5",
            )}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isSafe ? "bg-[var(--color-status-success)]" : "bg-destructive",
              )}
            />
            {mode} Mode
          </Badge>
          {guardrailTriggered && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Guardrail Active
            </Badge>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <section
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Core Metrics Grid"
      >
        <MetricCard
          title="Potential Revenue"
          value={`$${revenue.toLocaleString()}`}
          subValue={
            activeUsers > 0
              ? `${(revenue / activeUsers).toFixed(2)} per user`
              : "No active traffic"
          }
          icon={TrendingUp}
          trend="up"
          className="border-l-4 border-l-[var(--color-status-success)]"
          valueClassName="text-[var(--color-status-success)]"
        />
        <MetricCard
          title="Revenue at Risk"
          value={`$${revenueLost.toLocaleString()}`}
          subValue={
            revenueLost > 0 ? "Race condition leaks" : "Maximum protection"
          }
          icon={ShieldCheck}
          trend={revenueLost > 0 ? "down" : "neutral"}
          className={cn(
            revenueLost > 0 &&
              "border-l-4 border-l-[var(--color-status-alert)]",
          )}
          valueClassName={
            revenueLost > 0 ? "text-[var(--color-status-alert)]" : ""
          }
        />
        <MetricCard
          title="Edge Latency"
          value={`${latency.toFixed(1)}ms`}
          subValue={
            latency < 30 ? "Ultra-low (Global)" : "Regional tail latency"
          }
          icon={Zap}
          valueClassName="text-amber-500"
        />
        <MetricCard
          title="Atomic Savings"
          value={`$${cumulativeSavings.toLocaleString()}`}
          subValue="Locked revenue"
          icon={Activity}
          valueClassName="text-blue-500"
        />
      </section>

      {/* Secondary Details Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Resource Efficiency */}
        <Card className="lg:col-span-2 border-border/50 bg-card/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4" />
              Resource & Consistency Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">
                  Active Users
                </p>
                <p className="text-xl font-bold">
                  {activeUsers.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">
                  Transactions
                </p>
                <p className="text-xl font-bold">
                  {transactionsProcessed.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">
                  Replica Lag
                </p>
                <p
                  className={cn(
                    "text-xl font-bold",
                    isSafe
                      ? "text-[var(--color-status-success)]"
                      : "text-[var(--color-status-alert)]",
                  )}
                >
                  {replicaLag.toFixed(1)}ms
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">
                  Lock Time
                </p>
                <p className="text-xl font-bold">{lockWaitTime.toFixed(2)}ms</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium">Efficiency Score</p>
                <p className="text-xs text-muted-foreground">
                  {isSafe ? "99.9%" : "84.2%"}
                </p>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: isSafe ? "99.9%" : "84.2%" }}
                  className={cn(
                    "h-full transition-all",
                    isSafe
                      ? "bg-[var(--color-status-success)]"
                      : "bg-[var(--color-status-alert)]",
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Distribution Status */}
        <Card className="border-border/50 bg-card/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Consensus Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative pl-6 border-l border-border/50 space-y-6">
              {[
                { label: "Edge Propagation", status: "complete", time: "2ms" },
                { label: "Regional Quorum", status: "complete", time: "8ms" },
                {
                  label: "Atomic Commit",
                  status: isSafe ? "complete" : "skipped",
                  time: isSafe ? "12ms" : "N/A",
                },
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div
                    className={cn(
                      "absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-background",
                      step.status === "complete"
                        ? "bg-[var(--color-status-success)]"
                        : "bg-muted",
                    )}
                  />
                  <div className="flex justify-between items-center text-sm">
                    <span
                      className={cn(
                        step.status === "skipped" && "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {step.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
