import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionPayload, ThrottleLevel } from "@/types";

interface SessionInfoProps {
  session: SessionPayload | null;
  throttleLevel: ThrottleLevel;
  apiMode: "mock" | "live";
  isLive: boolean;
}

export const SessionInfo: React.FC<SessionInfoProps> = ({
  session,
  throttleLevel,
  apiMode,
  isLive,
}) => {
  if (!session) return null;

  const timeUntilExpiry = session.expiresAt - Date.now();
  const minutesRemaining = Math.round(timeUntilExpiry / 60000);
  const secondsRemaining = Math.round((timeUntilExpiry % 60000) / 1000);

  const getThrottleColor = (level: ThrottleLevel) => {
    switch (level) {
      case "normal":
        return "bg-green-500/20 text-green-700 border-green-500/50";
      case "slow":
        return "bg-yellow-500/20 text-yellow-700 border-yellow-500/50";
      case "critical":
        return "bg-red-500/20 text-red-700 border-red-500/50";
    }
  };

  const getThrottleLabel = (level: ThrottleLevel) => {
    switch (level) {
      case "normal":
        return "Normal";
      case "slow":
        return "Slow";
      case "critical":
        return "Critical";
    }
  };

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Session Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Session ID */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Session ID</span>
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            {session.sessionId.substring(0, 12)}...
          </code>
        </div>

        {/* API Mode */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">API Mode</span>
          <div className="flex gap-2">
            <Badge
              variant={apiMode === "live" ? "default" : "secondary"}
              className={apiMode === "live" ? "bg-blue-600" : ""}
            >
              {apiMode === "live"
                ? "🟢 Live"
                : `🟡 ${apiMode.charAt(0).toUpperCase() + apiMode.slice(1)}`}
            </Badge>
            {isLive && <Badge variant="outline">Active</Badge>}
          </div>
        </div>

        {/* Throttle Level */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Throttle Level</span>
          <Badge
            variant="outline"
            className={`${getThrottleColor(throttleLevel)} font-mono`}
          >
            {getThrottleLabel(throttleLevel)}
          </Badge>
        </div>

        {/* Session Expiration */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Expires In</span>
          <span
            className={`text-xs font-mono ${
              apiMode === "mock"
                ? "text-muted-foreground"
                : minutesRemaining <= 2
                  ? "text-red-500"
                  : minutesRemaining <= 5
                    ? "text-yellow-500"
                    : "text-green-500"
            }`}
          >
            {apiMode === "mock"
              ? "Unlimited"
              : `${minutesRemaining}m ${secondsRemaining}s`}
          </span>
        </div>

        {/* IP Address (if available) */}
        {session.ipAddress && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">IP Address</span>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
              {session.ipAddress}
            </code>
          </div>
        )}

        {/* Throttle Details */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2">Rate Limits</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Per Session:</span>
              <span className="font-mono">
                {throttleLevel === "normal"
                  ? "30/min"
                  : throttleLevel === "slow"
                    ? "5/min"
                    : "1/min"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Per IP:</span>
              <span className="font-mono">
                {throttleLevel === "normal"
                  ? "10/min"
                  : throttleLevel === "slow"
                    ? "2/min"
                    : "1/min"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
