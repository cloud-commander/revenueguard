import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SimulationControlsProps {
  onSimulate: (count: number) => void;
  isSimulating: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  onSimulate,
  isSimulating,
}) => {
  const [count, setCount] = React.useState(15);

  return (
    <Card className="border-border/50 bg-card/10 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center">
          <Zap className="w-4 h-4 mr-2 text-yellow-500" />
          Rush Simulation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2">
          <div className="flex-1 space-y-2">
            <Input
              id="rush-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="font-mono min-h-[44px]"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <Button
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0 min-h-[44px]"
                    onClick={() => onSimulate(count)}
                    disabled={isSimulating}
                  >
                    {isSimulating ? "Rushing..." : "Trigger Rush"}
                  </Button>
                </div>
              </TooltipTrigger>
              {isSimulating && (
                <TooltipContent>
                  <p>Wait for the current rush to complete.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
