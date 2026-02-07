import React from "react";
import { Card } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle } from "lucide-react";

interface Metrics {
  p99: number;
  requests: number;
  errors: number;
}

interface MetricsDisplayProps {
  metrics: Metrics;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MetricCard
        label="Requests"
        value={metrics.requests.toString()}
        icon={<Activity className="w-4 h-4 text-blue-500" />}
      />
      <MetricCard
        label="Latency (P99)"
        value={`${metrics.p99}ms`}
        icon={<CheckCircle className="w-4 h-4 text-green-500" />}
      />
      <MetricCard
        label="Errors"
        value={metrics.errors.toString()}
        icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
        isError={metrics.errors > 0}
      />
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  icon,
  isError,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  isError?: boolean;
}) => (
  <Card
    className={`bg-card/30 border-border/50 p-3 flex flex-col justify-between transition-all ${isError ? "border-destructive/50 bg-destructive/10 cursor-pointer hover:bg-destructive/20 active:scale-95" : ""}`}
    onClick={() => {
      if (isError) {
        console.warn(`[Metrics] Error state detected for ${label}: ${value}`);
        alert(
          `System Alert: ${label} threshold exceeded. Check worker logs for details.`,
        );
      }
    }}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-muted-foreground uppercase font-bold">
        {label}
      </span>
      {icon}
    </div>
    <span className="text-2xl font-mono font-bold tracking-tight">{value}</span>
  </Card>
);
