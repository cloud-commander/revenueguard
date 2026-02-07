import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SimulationMode } from "@/hooks/useSimulation";
import type { SimulationConfig } from "@/config/simulationDefaults";
import { NARRATIVE_DATA } from "@/config/narrativeData";
import { Card, CardContent } from "@/components/ui/card";

interface SimulationNarrativeProps {
  mode: SimulationMode;
  latency: number;
  lockWaitTime: number;
  activeScenario?: string;
  config: SimulationConfig;
  error?: string | null;
}

export const SimulationNarrative = ({
  mode,
  config,
  error,
}: SimulationNarrativeProps) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    // Rotate messages every 5 seconds
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const getNarration = () => {
    if (error) {
      const isBudget =
        error.toLowerCase().includes("budget") ||
        error.toLowerCase().includes("limit") ||
        error.toLowerCase().includes("cost");

      // Use helper to return consistent shape
      return {
        ...(isBudget ? NARRATIVE_DATA.GUARDRAIL : NARRATIVE_DATA.SYSTEM_ERROR),
        text: error,
      };
    }

    if (config.degradedDemo) {
      return NARRATIVE_DATA.DEGRADED;
    }

    if (mode === "eventual") {
      const arch = config.standardArchitecture || "sql";
      const data = NARRATIVE_DATA.REGIONAL[arch];

      // Safety fallback
      if (!data)
        return {
          phase: NARRATIVE_DATA.REGIONAL.sql.phase,
          status: NARRATIVE_DATA.REGIONAL.sql.status,
          ...NARRATIVE_DATA.REGIONAL.sql.messages[0],
        };

      const message = data.messages[msgIndex % data.messages.length];

      return {
        phase: data.phase,
        status: data.status,
        ...message,
      };
    } else {
      // Safe Mode
      const data = NARRATIVE_DATA.SAFE;
      const message = data.messages[msgIndex % data.messages.length];

      return {
        phase: data.phase,
        status: data.status,
        ...message,
      };
    }
  };

  const { phase, text, subtext, status } = getNarration();

  return (
    <Card className="border-border rounded-2xl p-0 backdrop-blur-sm overflow-hidden relative">
      <CardContent className="p-6 space-y-3">
        <div
          className={cn(
            "absolute top-0 left-0 w-1 h-full",
            status === "alert"
              ? "bg-[var(--color-status-alert)]"
              : status === "pending"
                ? "bg-[var(--color-status-pending)]"
                : "bg-[var(--color-status-success)]",
          )}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={text} // Key by text to trigger animation on message change
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  status === "alert"
                    ? "bg-[var(--color-status-alert)]"
                    : status === "pending"
                      ? "bg-[var(--color-status-pending)]"
                      : "bg-[var(--color-status-success)]",
                )}
              />
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {phase}
              </span>
            </div>

            <h4 className="text-sm md:text-base font-bold text-foreground leading-snug">
              {text}
            </h4>

            <p className="text-xs text-muted-foreground font-medium">
              {subtext}
            </p>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};
