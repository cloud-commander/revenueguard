import React from "react";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WebSocketStatusProps {
  connected: boolean;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({
  connected,
}) => {
  return (
    <div className="flex items-center space-x-2">
      <Badge
        variant="outline"
        className={cn(
          "transition-colors duration-500 flex items-center gap-1.5 py-1 px-3",
          connected
            ? "border-green-500/50 bg-green-500/10 text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]"
            : "border-destructive/50 bg-destructive/10 text-destructive",
        )}
      >
        {connected ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        <span className="text-xs font-mono font-bold">
          {connected ? "LIVE" : "DISCONNECTED"}
        </span>
      </Badge>
    </div>
  );
};
