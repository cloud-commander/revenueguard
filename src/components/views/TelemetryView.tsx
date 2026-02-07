import { motion, AnimatePresence } from "framer-motion";
import { type TelemetryEvent } from "@/hooks/useSimulation";
import {
  Database,
  Cpu,
  Activity,
  Clock,
  Terminal,
  ShieldCheck,
  Zap,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TelemetryViewProps {
  telemetry: TelemetryEvent[];
  skuCount: number;
}

export const TelemetryView = ({ telemetry, skuCount }: TelemetryViewProps) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono uppercase tracking-widest">
            <Cpu className="w-3 h-3" />
            Active Actors
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {skuCount}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              Durable Objects
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-status-success)] font-mono">
            <ShieldCheck className="w-3 h-3" />
            100% Single-Threaded Isolation
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono uppercase tracking-widest">
            <Database className="w-3 h-3" />
            State Persistence
          </div>
          <div className="text-2xl font-bold tracking-tight">
            Atomic{" "}
            <span className="text-sm font-normal text-muted-foreground">
              Writes
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-mono">
            <Zap className="w-3 h-3" />
            Implicit Ordering Active
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono uppercase tracking-widest">
            <Radio className="w-3 h-3" />
            Broadcasting
          </div>
          <div className="text-2xl font-bold tracking-tight">
            Real-time{" "}
            <span className="text-sm font-normal text-muted-foreground">
              Signals
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-orange-400 font-mono">
            <Activity className="w-3 h-3" />
            Edge Mesh Propagation
          </div>
        </div>
      </div>

      {/* Log Console */}
      <div className="bg-black/95 rounded-2xl border border-border overflow-hidden flex flex-col h-[500px]">
        <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Edge Telemetry Stream
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-status-success)] animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground">
                CONNECTED
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-[11px] selection:bg-white/20">
          <AnimatePresence initial={false}>
            {telemetry.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="group flex items-start gap-4 hover:bg-white/5 px-2 py-0.5 rounded transition-colors"
              >
                <div className="text-muted-foreground/40 w-20 shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                  .{String(event.timestamp % 1000).padStart(3, "0")}
                </div>

                <div
                  className={cn(
                    "w-12 shrink-0 font-bold",
                    event.op === "TX"
                      ? "text-purple-400"
                      : event.op === "SET"
                        ? "text-blue-400"
                        : event.op === "ALARM"
                          ? "text-orange-400"
                          : "text-green-400",
                  )}
                >
                  {event.op}
                </div>

                <div className="w-24 shrink-0 text-muted-foreground">
                  [{event.target}]
                </div>

                <div className="flex-1 text-foreground/80 break-all">
                  {event.op === "TX" &&
                    `Atomic update for allocation request from edge_node_active`}
                  {event.op === "SET" &&
                    `Persistently flushing state to Durable Storage (Size: ~124b)`}
                  {event.op === "GET" &&
                    `Reading cached state from memory heap (In-Memory Hot)`}
                  {event.op === "ALARM" &&
                    `Scheduled recovery alarm triggered periodically`}
                </div>

                <div
                  className={cn(
                    "w-20 text-right shrink-0 font-mono",
                    event.latency > 100
                      ? "text-orange-400"
                      : "text-[var(--color-status-success)]",
                  )}
                >
                  {event.latency}ms
                </div>

                <div
                  className={cn(
                    "w-12 text-right shrink-0",
                    event.status === "OK"
                      ? "text-muted-foreground"
                      : "text-orange-400",
                  )}
                >
                  {event.status}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {telemetry.length === 0 && (
            <div className="text-muted-foreground/40 italic py-4 text-center">
              Waiting for edge operations...
            </div>
          )}
        </div>

        <div className="bg-muted/30 px-4 py-2 border-t border-border flex items-center justify-between text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
          <div>Simulation Loop: Active</div>
          <div className="flex items-center gap-4">
            <span>Buffer: 50 Events</span>
            <span>Source: /api/telemetry (Mock-Injected)</span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-muted/40 border border-border">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold">Why show the stream?</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              In a regular D1/SQL architecture, you'd see high latency
              fluctuations and lock-wait retries. Here, you can observe the
              single-threaded nature of Durable Objects: even under high
              contention, operations are serialized and processed with sub-10ms
              logic time, avoiding the "lock tax" entirely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
