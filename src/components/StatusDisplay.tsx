import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatusDisplayProps {
  totalBookings: number;
  totalCapacity: number;
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  totalBookings,
  totalCapacity,
}) => {
  const percent = (totalBookings / totalCapacity) * 100;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold">
            Total Occupancy
          </p>
          <p className="text-2xl font-mono font-bold tracking-tight">
            {totalBookings}{" "}
            <span className="text-muted-foreground text-base">
              / {totalCapacity}
            </span>
          </p>
        </div>
      </div>
      <Badge
        variant="outline"
        className="text-xs border-primary/20 bg-primary/5"
      >
        {percent.toFixed(0)}% FULL
      </Badge>
    </Card>
  );
};
