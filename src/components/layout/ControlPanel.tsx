import { SimulationControls } from "@/components/dashboard/SimulationControls";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SimulationConfig } from "@/config/simulationDefaults";

interface ControlPanelProps {
  config: SimulationConfig;
  onUpdate: (config: Partial<SimulationConfig>) => void;
  activeScenario: string;
  onScenarioChange: (id: string) => void;

  onResetSimulation: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  touchInteraction?: () => void;
  className?: string; // For desktop positioning
}

export const ControlPanel = ({
  config,
  onUpdate,
  activeScenario,
  onScenarioChange,

  onResetSimulation,
  mobileOpen,
  onMobileOpenChange,
  touchInteraction,
  className,
}: ControlPanelProps) => {
  const content = (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-1">
        <SimulationControls
          config={config}
          onUpdate={onUpdate}
          activeScenario={activeScenario}
          onScenarioChange={onScenarioChange}
          onResetSimulation={onResetSimulation}
          touchInteraction={touchInteraction}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Static Sidebar */}
      <aside
        className={cn(
          "hidden lg:block w-[340px] h-full border-l border-border bg-card p-6 overflow-hidden",
          className,
        )}
      >
        {content}
      </aside>

      {/* Mobile: Bottom Sheet */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[80vh] rounded-t-2xl px-6 pt-10"
        >
          <SheetHeader className="mb-6 text-left">
            <SheetTitle>Simulation Lab</SheetTitle>
            <SheetDescription>
              Adjust traffic patterns and chaos levels in real-time.
            </SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    </>
  );
};
