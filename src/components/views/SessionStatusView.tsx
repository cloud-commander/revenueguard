import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SessionInfo } from "@/components/dashboard/SessionInfo";
import { QuotaMonitor } from "@/components/dashboard/QuotaMonitor";
import { SIMULATION_LIMITS } from "@/config/simulationDefaults";
import type { SimulationMode } from "@/hooks/useSimulation";
import type { SimulationConfig } from "@/config/simulationDefaults";
import type {
  SessionPayload,
  QuotaStatus,
  ThrottleLevel,
  InventoryItem,
} from "@/types";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface SessionStatusViewProps {
  state: {
    revenue: number;
    revenueLost: number;
    latency: number;
    lockWaitTime: number;
    activeUsers: number;
    transactionsProcessed: number;
    totalRequests: number;
    replicaLag: number;
    mode: SimulationMode;
    timestamp: number;
    config: SimulationConfig;
    activeScenario: string;
    error?: string | null;
    cumulativeSavings: number;
    telemetry: unknown[];
    apiMode: "mock" | "live";
    history: { actual: number; potential: number }[];
    inventorySnapshot: InventoryItem[];
    inventoryLoading: boolean;
    inventoryError: string | null;
    guardrailTriggered: boolean;
    session: SessionPayload | null;
    quotaStatus: QuotaStatus | null;
    throttleLevel: ThrottleLevel;
    isLive: boolean;
  };
}

export const SessionStatusView = ({ state }: SessionStatusViewProps) => {
  const {
    activeUsers,
    totalRequests,
    config,
    apiMode,
    guardrailTriggered,
    session,
    quotaStatus,
    throttleLevel,
    isLive,
  } = state;

  const [sessionCountdown, setSessionCountdown] = useState(
    session ? Math.max(0, session.expiresAt - Date.now()) : 0,
  );

  useEffect(() => {
    if (!session) {
      setSessionCountdown(0);
      return;
    }

    const updateCountdown = () => {
      setSessionCountdown(Math.max(0, session.expiresAt - Date.now()));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const sessionCountdownLabel =
    sessionCountdown > 0 ? formatDuration(sessionCountdown) : "Expired";
  const sessionExpiryTime = session
    ? new Date(session.expiresAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const guardrailLimit = SIMULATION_LIMITS.HARD_LIMIT;
  const requestsRemaining = Math.max(0, guardrailLimit - totalRequests);
  const rpsPerUser = 1000 / Math.max(1, config.refreshRate);
  const estimatedRps = Math.max(1, activeUsers * rpsPerUser);
  const secondsRemaining = requestsRemaining / estimatedRps;
  const guardrailProgress = Math.min(
    100,
    Math.max(0, (totalRequests / guardrailLimit) * 100),
  );
  const guardrailStatusLabel = guardrailTriggered
    ? "Auto-stop engaged"
    : apiMode === "mock"
      ? "Guardrail Disabled"
      : requestsRemaining <= SIMULATION_LIMITS.ALERT
        ? "Guardrail warning"
        : "Operating under budget";
  const guardrailSubtext = guardrailTriggered
    ? "Simulation halted to protect the virtual budget."
    : apiMode === "mock"
      ? "Unlimited requests in Mock Engine mode."
      : `${Math.max(1, Math.ceil(secondsRemaining))}s at ${numberFormatter.format(
          Math.round(estimatedRps),
        )} req/s until auto-stop`;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border border-border bg-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
                Session status
              </p>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.3em]",
                  apiMode === "live"
                    ? "text-[var(--color-engine-accent)]"
                    : "text-muted-foreground",
                )}
              >
                {apiMode === "live" ? "Live Worker" : "Mock Engine"}
              </span>
            </div>
            {session ? (
              <>
                <p className="text-2xl font-semibold text-foreground">
                  {apiMode === "mock"
                    ? "Unlimited Duration"
                    : sessionCountdownLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {apiMode === "mock"
                    ? "Mock sessions do not expire."
                    : `Expires at ${sessionExpiryTime}`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Session ID {session.sessionId.slice(0, 8)}…
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Authenticate to keep the live worker session active.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
                Guardrail
              </p>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.3em]",
                  guardrailTriggered
                    ? "text-destructive"
                    : requestsRemaining <= SIMULATION_LIMITS.ALERT
                      ? "text-orange-500"
                      : "text-[var(--color-status-success)]",
                )}
              >
                {guardrailStatusLabel}
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {apiMode === "mock"
                ? "Unlimited"
                : requestsRemaining > 0
                  ? `${numberFormatter.format(requestsRemaining)} requests left`
                  : "Auto-stop engaged"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {guardrailSubtext}
            </p>
            <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  guardrailTriggered
                    ? "bg-destructive"
                    : requestsRemaining <= SIMULATION_LIMITS.ALERT
                      ? "bg-gradient-to-r from-[var(--color-status-alert)] to-[var(--color-status-destructive)]"
                      : "bg-gradient-to-r from-[var(--color-status-success)] to-[var(--color-status-pending)]",
                )}
                style={{
                  width: `${apiMode === "mock" ? 0 : guardrailProgress}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {session && (
          <SessionInfo
            session={session}
            throttleLevel={throttleLevel}
            apiMode={apiMode}
            isLive={isLive}
          />
        )}

        {isLive && quotaStatus && (
          <div className="lg:col-span-1">
            <QuotaMonitor
              quotaStatus={quotaStatus}
              throttleLevel={throttleLevel}
              isLive={isLive}
            />
          </div>
        )}
      </div>
    </div>
  );
};
