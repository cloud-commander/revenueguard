import { AlertCircle, AlertTriangle, Zap } from "lucide-react";
import type { QuotaStatus, ThrottleLevel } from "@/types";

interface QuotaMonitorProps {
  quotaStatus: QuotaStatus | null;
  throttleLevel: ThrottleLevel;
  isLive: boolean;
}

export function QuotaMonitor({
  quotaStatus,
  throttleLevel,
  isLive,
}: QuotaMonitorProps) {
  if (!isLive || !quotaStatus) {
    return null;
  }

  const getThrottleColor = (level: ThrottleLevel): string => {
    switch (level) {
      case "normal":
        return "from-green-500 to-emerald-500";
      case "slow":
        return "from-yellow-500 to-amber-500";
      case "critical":
        return "from-red-500 to-rose-500";
    }
  };

  const getThrottleLabel = (level: ThrottleLevel): string => {
    switch (level) {
      case "normal":
        return "Normal";
      case "slow":
        return "Slowed";
      case "critical":
        return "Critical";
    }
  };

  const getThrottleIcon = (level: ThrottleLevel) => {
    switch (level) {
      case "normal":
        return <Zap className="w-4 h-4" />;
      case "slow":
        return <AlertTriangle className="w-4 h-4" />;
      case "critical":
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">Worker Quota</h3>
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full bg-gradient-to-r ${getThrottleColor(throttleLevel)} text-white text-xs font-medium`}
        >
          {getThrottleIcon(throttleLevel)}
          {getThrottleLabel(throttleLevel)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>CPU Usage</span>
          <span className="font-mono">
            {quotaStatus.percentageUsed}% (
            {quotaStatus.cpuUsedMs.toLocaleString()} /
            {quotaStatus.cpuLimitMs.toLocaleString()} ms)
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              throttleLevel === "normal"
                ? "bg-green-500"
                : throttleLevel === "slow"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${quotaStatus.percentageUsed}%` }}
          />
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-800/50 rounded p-2">
          <div className="text-slate-500">Used</div>
          <div className="font-mono text-slate-200">
            {(quotaStatus.cpuUsedMs / 1_000_000).toFixed(1)}M ms
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-2">
          <div className="text-slate-500">Remaining</div>
          <div className="font-mono text-slate-200">
            {(quotaStatus.cpuRemainingMs / 1_000_000).toFixed(1)}M ms
          </div>
        </div>
      </div>

      {/* Warnings */}
      {throttleLevel === "slow" && (
        <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-200">
          ⚠️ Quota usage at 50%+. Rate limits reduced to preserve budget.
        </div>
      )}

      {throttleLevel === "critical" && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-700/50 rounded text-xs text-red-200">
          🚨 Critical quota threshold. Consider switching to mock mode to avoid
          overages.
        </div>
      )}
    </div>
  );
}
