import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EducationalTooltip } from "./EducationalTooltip";
import { SCENARIOS } from "@/config/scenarios";

// Generate some mock SKUs
interface ContentionGridProps {
  mode: "eventual" | "safe";
  activeUsers: number;
  timestamp: number;
  skuCount?: number;
  activeScenario?: string;
}

export const ContentionGrid = ({
  mode,
  activeUsers,
  timestamp,
  skuCount = 24,
  activeScenario = "retail",
}: ContentionGridProps) => {
  const scenario = SCENARIOS[activeScenario] || SCENARIOS.retail;

  // Generate mock SKUs dynamically if count changes
  const products = Array.from({ length: skuCount }, (_, i) => ({
    id: i,
    name: scenario.getProductName(i),
  }));

  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-3 p-4 bg-card rounded-xl border border-border backdrop-blur-sm">
      {products.map((prod) => {
        const isHighDemand = scenario.isHighDemand(prod.id);

        // Pseudo-random contention for this specific SKU based on time
        // High demand items always have higher base contention + spikes
        const baseNoise = Math.sin(timestamp / (500 + prod.id * 100)) + 1; // 0 to 2
        const popularityMultiplier = isHighDemand ? 2.5 : 0.8;

        const contentionLevel =
          (activeUsers / 1000) * baseNoise * popularityMultiplier;

        const isHot = contentionLevel > 0.8 && mode === "eventual";

        const tooltipProps =
          mode === "safe"
            ? {
                title: "Atomic Resolution",
                explanation:
                  "Requests are processed one-at-a-time via Durable Objects.",
                technicalDetail: "Serialization prevents all race conditions.",
                status: "success" as const,
              }
            : isHot
              ? {
                  title: "Centralized Row Lock",
                  explanation:
                    "This item is experiencing high contention. Requests await synchronization with the regional database.",
                  technicalDetail: `Synchronization delay: ${Math.round(contentionLevel * 150)}ms`,
                  status: "alert" as const,
                }
              : {
                  title: `Available ${scenario.itemLabel}`,
                  explanation: "No active contention. Database reads are fast.",
                  technicalDetail: "Normal operation state.",
                  status: "info" as const,
                };

        const ariaLabel = `${prod.name} ${isHighDemand ? "high demand" : "standard"} — ${
          mode === "eventual"
            ? isHot
              ? "contention high, potential lock wait"
              : "contention low"
            : "atomic resolution"
        }`;

        return (
          <EducationalTooltip key={prod.id} {...tooltipProps}>
            <motion.button
              type="button"
              layout
              aria-label={ariaLabel}
              className={cn(
                "relative aspect-square w-full rounded-lg flex items-center justify-center text-[10px] md:text-xs font-mono border transition-all duration-500 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-status-success)] focus-visible:ring-offset-background",
                mode === "eventual"
                  ? "bg-muted border-border"
                  : "bg-accent border-accent",
              )}
              animate={{
                boxShadow:
                  mode === "eventual"
                    ? `0 0 ${contentionLevel * 15}px ${contentionLevel * 5}px color-mix(in oklab, var(--color-status-alert), transparent ${Math.max(0, 100 - contentionLevel * 50)}%)`
                    : `0 0 0px 0px transparent`,
                scale: isHot ? 1.05 : 1,
              }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <div className="z-10 text-muted-foreground font-bold flex flex-col items-center gap-1">
                {isHighDemand && (
                  <span className="text-[8px] uppercase tracking-widest text-[var(--color-status-pending)]">
                    HOT
                  </span>
                )}
                {prod.name}
              </div>
              {mode === "eventual" && (
                <div
                  className="absolute inset-0 bg-[var(--color-status-alert)] blur-xl opacity-0 transition-opacity duration-300"
                  style={{ opacity: Math.min(0.6, contentionLevel * 0.5) }}
                />
              )}
            </motion.button>
          </EducationalTooltip>
        );
      })}
    </div>
  );
};
