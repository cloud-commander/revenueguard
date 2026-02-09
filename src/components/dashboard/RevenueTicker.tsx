import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface RevenueChartProps {
  history: { actual: number; potential: number }[];
  mode: "eventual" | "safe";
}

const RevenueChart = ({ history, mode }: RevenueChartProps) => {
  if (!history || history.length === 0) return null;

  const maxVal = Math.max(...history.map((h) => h.potential), 10);
  const width = 280;
  const height = 40;
  const padding = 2;

  const pointsActual = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - (h.actual / maxVal) * (height - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(" ");

  const pointsPotential = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * width;
      const y =
        height - (h.potential / maxVal) * (height - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-3 w-full max-w-[280px] h-10 relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        preserveAspectRatio="none"
      >
        {/* Potential Revenue (Dashed) */}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3,3"
          className="text-muted-foreground/30"
          points={pointsPotential}
        />
        {/* Actual Revenue (Solid) */}
        <motion.polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            mode === "safe"
              ? "text-[var(--color-status-success)]"
              : "text-[var(--color-status-alert)]",
          )}
          points={pointsActual}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
        />
      </svg>
      <div className="flex justify-between mt-1 text-[8px] font-mono text-muted-foreground uppercase tracking-widest leading-none">
        <span>60s Window</span>
        <span
          className={cn(
            mode === "safe"
              ? "text-[var(--color-status-success)]/80"
              : "text-[var(--color-status-alert)]/80",
          )}
        >
          {mode === "safe" ? "Atomic Delivery" : "Revenue Gap"}
        </span>
      </div>
    </div>
  );
};

interface RevenueTickerProps {
  value: number;
  mode: "eventual" | "safe";
  label?: string;
  history?: { actual: number; potential: number }[];
}

const Digit = ({ value }: { value: string }) => {
  return (
    <div className="relative w-5 h-8 md:w-6 md:h-10 bg-card rounded-lg overflow-hidden border border-border shadow-lg shadow-black/10 dark:shadow-black/50 shrink-0">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={value}
          initial={{ y: -20, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: 20, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.15, ease: "circOut" }}
          className="absolute inset-0 flex items-center justify-center text-lg md:text-xl font-mono font-bold text-card-foreground"
        >
          {value}
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/10 dark:bg-black/60 z-10" />
    </div>
  );
};

export const RevenueTicker = ({
  value,
  mode,
  label = "Revenue Secured",
  history = [],
}: RevenueTickerProps) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(displayValue);

  const chars = formatted.split("");

  return (
    <div className="flex flex-col items-center p-2">
      <div
        className={cn(
          "text-xs font-bold uppercase tracking-widest mb-1 transition-colors duration-500",
          mode === "safe"
            ? "text-[var(--color-status-success)]"
            : "text-[var(--color-status-alert)]",
        )}
      >
        {label}
      </div>
      <div className="flex gap-1 mb-2">
        {chars.map((char, i) => (
          <Digit key={`${i}-${char}`} value={char} />
        ))}
      </div>

      <RevenueChart history={history} mode={mode} />
    </div>
  );
};
