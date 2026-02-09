import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SCENARIOS } from "@/config/scenarios";

interface LogItem {
  id: string;
  sku: string;
  action: string;
  status: "locked" | "resolved" | "failed";
  timestamp: number;
}

interface ConflictLogProps {
  mode: "eventual" | "safe";
  transactions: number; // Use to trigger updates
  activeScenario?: string;
}

export const ConflictLog = ({
  mode,
  transactions,
  activeScenario = "auction",
}: ConflictLogProps) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const scenario = SCENARIOS[activeScenario] || SCENARIOS.auction;

  useEffect(() => {
    // Simulate log stream based on transactions
    if (transactions === 0) return;

    const newLog: LogItem = {
      id: Math.random().toString(36).substr(2, 9),
      sku: scenario.getProductName(Math.floor(Math.random() * 24)),
      timestamp: Date.now(),
      action:
        mode === "eventual"
          ? "Lock acquisition attempt..."
          : `${scenario.actionLabel} (Safe)`,
      status:
        mode === "eventual"
          ? Math.random() > 0.7
            ? "locked"
            : Math.random() > 0.8
              ? "failed"
              : "resolved"
          : "resolved",
    };

    setLogs((prev) => [newLog, ...prev].slice(0, 8)); // Keep last 8
  }, [transactions, mode, scenario]);

  return (
    <div className="bg-card p-4 rounded-xl border border-border h-full overflow-hidden flex flex-col">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
        Transaction Stream
      </h3>
      <div className="flex-1 space-y-2 relative">
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              layout
              key={log.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "text-xs font-mono p-2 rounded border-l-2",
                log.status === "resolved" &&
                  "border-[var(--color-status-success)] bg-[var(--color-status-success)]/10 text-[var(--color-status-success)]",
                log.status === "locked" &&
                  "border-[var(--color-status-pending)] bg-[var(--color-status-pending)]/10 text-[var(--color-status-pending)]",
                log.status === "failed" &&
                  "border-[var(--color-status-alert)] bg-[var(--color-status-alert)]/10 text-[var(--color-status-alert)]",
              )}
            >
              <div className="flex justify-between">
                <span>{log.sku}</span>
                <span className="opacity-70">
                  {new Date(log.timestamp).toLocaleTimeString().split(" ")[0]}
                </span>
              </div>
              <div className="opacity-80">
                {log.action} {log.status === "locked" && "(WAITING)"}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {/* Fade out bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
      </div>
    </div>
  );
};
