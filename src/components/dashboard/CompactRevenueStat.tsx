import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

interface CompactRevenueStatProps {
  value: number;
  label: string;
  mode: "safe" | "eventual";
  history?: { actual: number; potential: number }[];
  showChart?: boolean;
}

const MiniSparkline = ({
  history,
  mode,
}: {
  history: { actual: number; potential: number }[];
  mode: "safe" | "eventual";
}) => {
  if (!history || history.length < 2) return null;

  const values = history.map((h) => h.actual);
  const max = Math.max(...values, 1);
  const width = 60;
  const height = 20;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-[60px] h-[20px] overflow-visible"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          mode === "safe"
            ? "text-[var(--color-status-success)]"
            : "text-[var(--color-status-alert)]",
        )}
        points={points}
      />
    </svg>
  );
};

export const CompactRevenueStat = ({
  value,
  label,
  mode,
  history = [],
  showChart = false,
}: CompactRevenueStatProps) => {
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

  // Calculate trend from history
  const trend =
    history.length >= 2
      ? history[history.length - 1].actual - history[history.length - 2].actual
      : 0;
  const trendPercentage =
    history.length >= 2 && history[history.length - 2].actual > 0
      ? ((trend / history[history.length - 2].actual) * 100).toFixed(1)
      : "0";

  const isPositive = mode === "safe";
  const Icon = isPositive ? ShieldCheck : AlertTriangle;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all",
        isPositive
          ? "bg-[var(--color-status-success)]/5 border-[var(--color-status-success)]/20"
          : "bg-[var(--color-status-alert)]/5 border-[var(--color-status-alert)]/20",
      )}
    >
      <Icon
        className={cn(
          "w-5 h-5 shrink-0",
          isPositive
            ? "text-[var(--color-status-success)]"
            : "text-[var(--color-status-alert)]",
        )}
      />

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-lg font-mono font-bold leading-none",
            isPositive
              ? "text-[var(--color-status-success)]"
              : "text-[var(--color-status-alert)]",
          )}
        >
          {formatted}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-0.5">
          {label}
        </p>
      </div>

      {showChart && history.length >= 2 && (
        <MiniSparkline history={history} mode={mode} />
      )}

      {trend !== 0 && (
        <div
          className={cn(
            "flex items-center gap-0.5 text-[10px] font-mono shrink-0",
            trend > 0
              ? "text-[var(--color-status-success)]"
              : "text-[var(--color-status-alert)]",
          )}
        >
          <TrendIcon className="w-3 h-3" />
          <span>{Math.abs(Number(trendPercentage))}%</span>
        </div>
      )}
    </div>
  );
};
