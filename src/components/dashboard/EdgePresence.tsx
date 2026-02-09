import { motion, AnimatePresence } from "framer-motion";
import { Globe, Database, MapPin, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulationMode } from "@/hooks/useSimulation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const EdgePresence = ({ mode }: { mode: SimulationMode }) => {
  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Globe
            className={cn(
              "w-4 h-4",
              mode === "safe"
                ? "text-[var(--color-status-success)]"
                : "text-muted-foreground",
            )}
          />
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Round Trip Data Path
          </h3>
        </div>

        <div className="relative h-24 bg-muted/30 rounded-lg border border-border/50 p-4 flex flex-col overflow-hidden">
          {/* Tier 1: Distance/Latency Labels (Aligned with Track) */}
          <div className="h-1/2 flex items-start pt-1 relative gap-4 px-2 pointer-events-none">
            {/* Spacer to match LHR Icon width */}
            <div className="w-12 shrink-0" />

            {/* Label Container - Mirrors Track Width */}
            <motion.div
              layout
              className={cn(
                "relative flex items-center justify-center",
                mode === "eventual" ? "flex-1" : "w-12",
              )}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <motion.div
                layout
                className="z-30 flex flex-col items-center gap-0.5 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-border shadow-sm min-w-[140px]"
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={cn(
                      "text-[10px] font-mono font-bold leading-none",
                      mode === "eventual"
                        ? "text-[var(--color-status-alert)]"
                        : "text-[var(--color-status-success)]",
                    )}
                  >
                    {mode === "eventual"
                      ? "11,200 KM / 7,000 MI"
                      : "30 KM / 18 MI"}
                  </motion.span>
                </AnimatePresence>
                <span className="text-[7px] font-bold uppercase text-muted-foreground whitespace-nowrap leading-none mt-1">
                  {mode === "eventual"
                    ? "Total Round-Trip Journey"
                    : "Local Edge Round-Trip"}
                </span>
              </motion.div>
            </motion.div>
          </div>

          {/* Tier 2: Icons & Track */}
          <div className="h-1/2 flex items-center relative gap-4 px-2">
            {/* Background Track Line */}
            <div className="absolute top-1/2 left-8 right-8 h-[1px] bg-border/20 -translate-y-1/2 z-0" />

            {/* User Icon (LHR) */}
            <div className="flex flex-col items-center gap-1 z-10 w-12 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/30 shadow-sm cursor-help">
                    <MapPin className="w-4 h-4 text-blue-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] font-mono">
                  LHR: London Heathrow (Edge POP)
                </TooltipContent>
              </Tooltip>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                LHR (Edge)
              </span>
            </div>

            {/* Animated Track Space */}
            <motion.div
              layout
              className={cn(
                "h-full relative flex items-center",
                mode === "eventual" ? "flex-1" : "w-12",
              )}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              {/* Travelling Data Packet */}
              <motion.div
                layoutId="packet"
                className={cn(
                  "w-1.5 h-1.5 rounded-full absolute z-20 shadow-[0_0_8px_currentColor]",
                  mode === "eventual"
                    ? "text-[var(--color-status-alert)] bg-current"
                    : "text-[var(--color-status-success)] bg-current",
                )}
                animate={{
                  left:
                    mode === "eventual"
                      ? ["0%", "100%", "0%"]
                      : ["10%", "90%", "10%"],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{
                  duration: mode === "eventual" ? 4 : 0.8,
                  repeat: Infinity,
                  times: [0, 0.45, 0.5, 0.55, 1],
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Server/DO Icon */}
            <motion.div
              layout
              className="flex flex-col items-center gap-1 z-10 shrink-0"
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border transition-all shadow-sm cursor-help",
                      mode === "eventual"
                        ? "bg-background border-border"
                        : "bg-[var(--color-status-success)]/10 border-[var(--color-status-success)]/30",
                    )}
                  >
                    <Database
                      className={cn(
                        "w-4 h-4",
                        mode === "eventual"
                          ? "text-muted-foreground"
                          : "text-[var(--color-status-success)]",
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] font-mono">
                  {mode === "eventual"
                    ? "JFK: John F. Kennedy Int'l (US-EAST Origin)"
                    : "Local Edge Runtime (Durable Objects)"}
                </TooltipContent>
              </Tooltip>
              <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap uppercase tracking-tight">
                {mode === "eventual" ? "JFK (Origin)" : "Edge (Atomic)"}
              </span>
            </motion.div>

            {/* Atomic Spacer (Grows to push server left) */}
            <motion.div
              layout
              className={cn(
                "h-full transition-all",
                mode === "eventual" ? "w-0" : "flex-1",
              )}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />

            {/* Mode Legend (Right Side) */}
            <div className="w-12 shrink-0 flex flex-col items-center">
              <div
                className={cn(
                  "text-[8px] font-bold uppercase p-1 rounded border",
                  mode === "eventual"
                    ? "text-amber-500 border-amber-500/20"
                    : "text-[var(--color-status-success)] border-[var(--color-status-success)]/20",
                )}
              >
                {mode === "eventual" ? "Slow" : "Fast"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-muted/40 p-2 rounded-lg border border-border/50">
          <div className="flex items-center gap-2 group">
            {mode === "safe" ? (
              <div className="w-3.5 h-3.5 rounded-full bg-[var(--color-status-success)]/20 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-success)] shadow-[0_0_5px_var(--color-status-success)]" />
              </div>
            ) : (
              <Info className="w-3.5 h-3.5 text-amber-500 opacity-70" />
            )}
            <p className="text-[9px] text-muted-foreground leading-tight italic">
              {mode === "eventual"
                ? "Every 100ms of round-trip network travel equals 1% lost revenue."
                : "Transactions are finalised locally, securing revenue before the user can blink."}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-border/20">
            <Globe className="w-3 h-3 text-muted-foreground opacity-50" />
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-tighter font-mono">
              Topology nodes identified by IATA (Airport) codes per industry
              standard.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
