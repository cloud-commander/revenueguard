import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface RevenueTickerProps {
  value: number;
  mode: "eventual" | "safe";
  label?: string;
}

const Digit = ({ value }: { value: string }) => {
  return (
    <div className="relative w-6 h-10 md:w-8 md:h-12 bg-card rounded-lg overflow-hidden border border-border shadow-lg shadow-black/10 dark:shadow-black/50 shrink-0">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={value}
          initial={{ y: -20, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: 20, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.15, ease: "circOut" }}
          className="absolute inset-0 flex items-center justify-center text-2xl font-mono font-bold text-card-foreground"
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
}: RevenueTickerProps) => {
  const [displayValue, setDisplayValue] = useState(value);

  // Smooth catchup for big jumps (optional, keeping it simple for now)
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(displayValue);

  // Split into chars, keeping $ etc
  const chars = formatted.split("");

  return (
    <div className="flex flex-col items-center p-4">
      <div
        className={cn(
          "text-xs font-bold uppercase tracking-widest mb-2 transition-colors duration-500",
          mode === "safe"
            ? "text-[var(--color-status-success)]"
            : "text-[var(--color-status-alert)]",
        )}
      >
        {label}
      </div>
      <div className="flex gap-1">
        {chars.map((char, i) => (
          <Digit key={`${i}-${char}`} value={char} />
        ))}
      </div>
    </div>
  );
};
