import React from "react";
import { AlertCircle, AlertTriangle, Info, Zap, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { QuotaStatus, ThrottleLevel, SessionPayload } from "@/types";

interface AlertCenterProps {
  guardrailTriggered: boolean;
  session: SessionPayload | null;
  quotaStatus: QuotaStatus | null;
  throttleLevel: ThrottleLevel;
  apiMode: "mock" | "live";
}

export const AlertCenter: React.FC<AlertCenterProps> = ({
  guardrailTriggered,
  session,
  quotaStatus,
  throttleLevel,
  apiMode,
}) => {
  const alerts: Array<{
    id: string;
    severity: "error" | "warning" | "info";
    icon: React.ReactNode;
    title: string;
    description: string;
  }> = [];

  // Guardrail alert
  if (guardrailTriggered) {
    alerts.push({
      id: "guardrail",
      severity: "error",
      icon: <AlertCircle className="h-4 w-4" />,
      title: "Guardrail Triggered",
      description:
        "Revenue protection guardrail has been activated. The simulation has detected a compliance or safety threshold violation.",
    });
  }

  // Quota exhaustion alert
  if (quotaStatus && quotaStatus.percentageUsed >= 100) {
    alerts.push({
      id: "quota-exhausted",
      severity: "error",
      icon: <Zap className="h-4 w-4" />,
      title: "Quota Exhausted",
      description: `Monthly CPU budget ${quotaStatus.cpuLimitMs}ms completely consumed. Preview mode: mock engine locked in.`,
    });
  }

  // Critical throttle alert
  if (throttleLevel === "critical") {
    alerts.push({
      id: "throttle-critical",
      severity: "error",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: "Critical Throttle Active",
      description: `Quota usage at ${quotaStatus?.percentageUsed}%. Rate limits: ${
        apiMode === "live"
          ? "1/min per session, 1/min per IP"
          : "unlimited (mock)"
      }. Consider switching to mock mode.`,
    });
  }

  // Slow throttle warning
  if (throttleLevel === "slow") {
    alerts.push({
      id: "throttle-slow",
      severity: "warning",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: "Slow Throttle Active",
      description: `Quota usage at ${quotaStatus?.percentageUsed}%. Rate limits: ${
        apiMode === "live"
          ? "5/min per session, 2/min per IP"
          : "unlimited (mock)"
      }. Monitor consumption closely.`,
    });
  }

  // Session expiration warning
  if (apiMode === "live" && session) {
    const timeUntilExpiry = session.expiresAt - Date.now();
    const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);

    if (minutesUntilExpiry <= 5) {
      alerts.push({
        id: "session-expiring",
        severity: "warning",
        icon: <Clock className="h-4 w-4" />,
        title: "Session Expiring Soon",
        description:
          minutesUntilExpiry <= 0
            ? "Your session has expired. Please log in again."
            : `Your session expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? "s" : ""}. Please refresh or log in again.`,
      });
    }
  }

  // API mode info
  if (apiMode === "mock") {
    alerts.push({
      id: "api-mode-mock",
      severity: "info",
      icon: <Info className="h-4 w-4" />,
      title: "Mock Mode Active",
      description:
        "Running in simulation mode with unlimited quota. Real inventory data not available. Switch to live mode for production testing.",
    });
  }

  // State to track dismissed alert IDs
  const [dismissedAlerts, setDismissedAlerts] = React.useState<Set<string>>(
    new Set(),
  );

  const handleDismiss = (id: string) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const visibleAlerts = alerts.filter(
    (alert) => !dismissedAlerts.has(alert.id),
  );

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visibleAlerts.map((alert) => (
        <Alert
          key={alert.id}
          variant={
            alert.severity === "error"
              ? "destructive"
              : alert.severity === "warning"
                ? "default"
                : "default"
          }
          className={
            alert.severity === "error"
              ? "border-red-500/50 bg-red-500/10 relative pr-8"
              : alert.severity === "warning"
                ? "border-yellow-500/50 bg-yellow-500/10 relative pr-8"
                : "border-blue-500/50 bg-blue-500/10 relative pr-8"
          }
        >
          <button
            onClick={() => handleDismiss(alert.id)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="sr-only">Dismiss</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="flex gap-3">
            <div
              className={
                alert.severity === "error"
                  ? "text-red-500"
                  : alert.severity === "warning"
                    ? "text-yellow-500"
                    : "text-blue-500"
              }
            >
              {alert.icon}
            </div>
            <div className="flex-1 space-y-1">
              <AlertTitle className="text-sm">{alert.title}</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                {alert.description}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      ))}
    </div>
  );
};
