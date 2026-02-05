import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

interface SimulationControlsProps {
  onSimulate: (count: number) => void;
  isSimulating?: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  onSimulate,
  isSimulating,
}) => {
  const [count, setCount] = React.useState(25);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Zap className="w-5 h-5 mr-2 text-yellow-500" />
          Rush Simulation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rush-count">Concurrent Requests</Label>
          <div className="flex space-x-2">
            <Input
              id="rush-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="font-mono"
            />
            <Button
              className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0"
              onClick={() => onSimulate(count)}
              disabled={isSimulating}
            >
              {isSimulating ? "Rushing..." : "Trigger Rush"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Spawns {count} parallel requests server-side to bypass browser
            limits.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
