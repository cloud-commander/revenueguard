import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { EducationalTooltip } from "./EducationalTooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { THRESHOLDS } from "@/config/thresholds";
import { StatusUtils } from "@/utils/statusUtils";

interface SystemHealthProps {
  latency: number;
  lockWaitTime: number;
  mode: "eventual" | "safe";
}

export const SystemHealth = ({
  latency,
  lockWaitTime,
  mode,
}: SystemHealthProps) => {
  const isCritical = latency > THRESHOLDS.LATENCY.CRITICAL;

  return (
    <Card className="border-border">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          System Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-4 space-y-4">
        {/* Latency Meter */}
        <EducationalTooltip
          title="User Wait Time"
          explanation="The actual time a user waits for the page to load. 99% of users experience this speed or faster."
          technicalDetail={
            isCritical
              ? "High p99 Latency (>1s) causes users to abandon their carts."
              : "Low p99 Latency (<100ms) feels instant to the user."
          }
          status={isCritical ? "alert" : "success"}
        >
          <div className="space-y-2 w-full">
            <div className="flex justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-bold text-foreground">
                  Request Duration
                </span>
                <span className="text-[10px] text-muted-foreground opacity-70">
                  (p99 Latency)
                </span>
              </div>
              <span
                className={cn(
                  "font-mono font-bold text-base mt-1",
                  StatusUtils.getLatencyColor(latency),
                )}
              >
                {Math.round(latency)}ms
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn("h-full", StatusUtils.getLatencyBg(latency))}
                animate={{ width: `${Math.min(100, latency / 30)}%` }} // 3000ms max scale
                transition={{ type: "spring", stiffness: 50 }}
              />
            </div>
          </div>
        </EducationalTooltip>

        {/* Database Queue Meter */}
        <EducationalTooltip
          title="Database Queue"
          explanation={
            mode === "eventual"
              ? "The time spent verifying state consistency against a regional database source."
              : "Zero waiting. The Edge processes the transaction atomically."
          }
          technicalDetail={
            mode === "eventual"
              ? "Centralised lock acquisition can create sequential processing queues under high load."
              : "Atomic operation requires no external lock, eliminating synchronisation delay entirely."
          }
          status={mode === "eventual" ? "pending" : "success"}
        >
          <div className="space-y-2 w-full">
            <div className="flex justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-bold text-foreground">
                  Database Queue
                </span>
                <span className="text-[10px] text-muted-foreground opacity-70">
                  (Lock Wait Time)
                </span>
              </div>
              <span
                className={cn(
                  "font-mono font-bold text-base mt-1",
                  mode === "eventual"
                    ? "text-[var(--color-status-pending)]"
                    : "text-muted-foreground",
                )}
              >
                {mode === "eventual"
                  ? `${Math.round(lockWaitTime)}ms`
                  : "0ms (Instant)"}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[var(--color-status-pending)]"
                animate={{ width: `${Math.min(100, lockWaitTime / 20)}%` }}
                transition={{ type: "spring", stiffness: 50 }}
              />
            </div>
          </div>
        </EducationalTooltip>
      </CardContent>
    </Card>
  );
};
