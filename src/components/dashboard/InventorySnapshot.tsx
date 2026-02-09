import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types";
import { Card, CardContent } from "@/components/ui/card";

interface InventorySnapshotProps {
  inventory: InventoryItem[];
  loading: boolean;
  error: string | null;
  apiMode: "mock" | "live";
}

export const InventorySnapshot = ({
  inventory,
  loading,
  error,
  apiMode,
}: InventorySnapshotProps) => {
  const totalItems = inventory.length;
  const totalAvailable = inventory.reduce(
    (sum, item) => sum + item.availableUnits,
    0,
  );
  const lowStockCount = inventory.filter(
    (item) => item.availableUnits <= 5,
  ).length;
  const summaryLabel =
    lowStockCount === 0
      ? "All SKUs healthy"
      : `${lowStockCount} low-stock SKU${lowStockCount === 1 ? "" : "s"}`;
  const sortedInventory = [...inventory].sort(
    (a, b) => a.availableUnits - b.availableUnits,
  );
  const featuredItems = sortedInventory.slice(0, 4);
  const pillLabel = apiMode === "live" ? "Live Worker" : "Mock Engine";

  return (
    <Card className="w-full rounded-2xl border border-border bg-card">
      <CardContent className="p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
              Inventory Snapshot
            </p>
            <p className="text-lg font-semibold text-foreground">
              {apiMode === "live"
                ? "Live Worker Inventory"
                : "Mock Distribution"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {totalItems} SKU{totalItems === 1 ? "" : "s"} · {totalAvailable}{" "}
              units available · {summaryLabel}
            </p>
          </div>
          <span
            className={cn(
              "px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] rounded-full border",
              apiMode === "live"
                ? "border-[var(--color-engine-accent)] text-[var(--color-engine-accent)]"
                : "border-border text-muted-foreground",
            )}
          >
            {pillLabel}
          </span>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`skeleton-${index}`} className="space-y-2">
                <div className="h-3 rounded-full bg-border/60" />
                <div className="h-2 rounded-full bg-border/40" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="mt-6 text-sm text-destructive">{error}</p>
        ) : featuredItems.length ? (
          <div className="mt-6 space-y-4">
            {featuredItems.map((item) => {
              const denominator = Math.max(1, item.totalStock);
              const utilization = Math.min(
                100,
                (item.allocatedUnits / denominator) * 100,
              );
              const barColor =
                item.availableUnits <= 3
                  ? "bg-[var(--color-status-destructive)]"
                  : "bg-[var(--color-status-success)]";

              return (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    <span>{item.id}</span>
                    <span>
                      {item.availableUnits} available · $
                      {item.unitPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.category}
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-mono text-muted-foreground">
                      <p>Allocated</p>
                      <p className="font-semibold text-foreground">
                        {item.allocatedUnits}/{item.totalStock}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/30">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        barColor,
                      )}
                      style={{ width: `${utilization}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Inventory snapshot pending. Toggle a scenario or wait for the worker
            to respond.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
