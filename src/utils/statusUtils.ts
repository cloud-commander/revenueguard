import { THRESHOLDS } from "@/config/thresholds";

export type StatusColor =
  | "text-red-400"
  | "text-orange-400"
  | "text-green-400"
  | "text-amber-500"
  | "text-muted-foreground";
export type BgColor =
  | "bg-red-500"
  | "bg-orange-500"
  | "bg-green-500"
  | "bg-amber-500"
  | "bg-muted";

export const StatusUtils = {
  getLoadColor: (percentage: number): StatusColor => {
    if (percentage > THRESHOLDS.LOAD.CRITICAL) return "text-red-400";
    if (percentage > THRESHOLDS.LOAD.WARNING) return "text-orange-400";
    return "text-green-400";
  },

  getLoadBg: (percentage: number): BgColor => {
    if (percentage > THRESHOLDS.LOAD.CRITICAL) return "bg-red-500";
    if (percentage > THRESHOLDS.LOAD.WARNING) return "bg-orange-500";
    return "bg-green-500";
  },

  getReplicaLagColor: (lag: number): StatusColor => {
    if (lag > THRESHOLDS.REPLICA_LAG.BREACH) return "text-red-400";
    if (lag > THRESHOLDS.REPLICA_LAG.WARNING) return "text-amber-500";
    return "text-green-400";
  },

  getLatencyColor: (latency: number): StatusColor => {
    if (latency > THRESHOLDS.LATENCY.CRITICAL) return "text-red-400";
    if (latency > THRESHOLDS.LATENCY.WARNING) return "text-orange-400";
    return "text-green-400";
  },

  getLatencyBg: (latency: number): BgColor => {
    if (latency > THRESHOLDS.LATENCY.CRITICAL) return "bg-red-500";
    if (latency > THRESHOLDS.LATENCY.WARNING) return "bg-orange-500";
    return "bg-green-500";
  },
};
