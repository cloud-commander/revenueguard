import React from "react";
import type { BookingMode } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RotateCcw, Shield, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BookingPanelProps {
  mode: BookingMode;
  setMode: (mode: BookingMode) => void;
  onReset: () => void;
  isResetting?: boolean;
}

export const BookingPanel: React.FC<BookingPanelProps> = ({
  mode,
  setMode,
  onReset,
  isResetting,
}) => {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Control Panel</span>
          <Badge
            variant={mode === "safe" ? "default" : "destructive"}
            className="uppercase tracking-widest"
          >
            {mode} Mode
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
          <div className="space-y-1">
            <Label className="text-base font-medium flex items-center">
              {mode === "safe" ? (
                <Shield className="w-4 h-4 mr-2 text-primary" />
              ) : (
                <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
              )}
              Consistency Mode
            </Label>
            <p className="text-xs text-muted-foreground">
              {mode === "safe"
                ? "Durable Objects guarantees exactly 20 seats."
                : "D1 (SQLite) allows overbooking via race conditions."}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Label
              htmlFor="mode-toggle"
              className="text-xs uppercase font-bold text-muted-foreground"
            >
              Unsafe
            </Label>
            <Switch
              id="mode-toggle"
              checked={mode === "safe"}
              onCheckedChange={(checked) =>
                setMode(checked ? "safe" : "unsafe")
              }
              className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-destructive"
            />
            <Label
              htmlFor="mode-toggle"
              className="text-xs uppercase font-bold text-primary"
            >
              Safe
            </Label>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={onReset}
          disabled={isResetting}
        >
          <RotateCcw
            className={`w-4 h-4 mr-2 ${isResetting && "animate-spin"}`}
          />
          Reset Simulation
        </Button>
      </CardContent>
    </Card>
  );
};
