import { type TelemetryEvent } from "@/hooks/useSimulation";
import { type SimulationConfig } from "@/config/simulationDefaults";

export const TelemetryGenerator = {
  generate: (
    currentTelemetry: TelemetryEvent[],
    activeUsers: number,
    latency: number,
    config: SimulationConfig,
    isLiveEngine: boolean,
  ): TelemetryEvent[] => {
    const newTelemetry = [...currentTelemetry];
    const opCount = Math.min(5, Math.floor(activeUsers / 200) + 1);

    for (let i = 0; i < opCount; i++) {
      const ops: TelemetryEvent["op"][] = ["GET", "SET", "TX", "ALARM"];
      const statuses: TelemetryEvent["status"][] = [
        "OK",
        "FAIL",
        "WAIT",
        "RETRY",
      ];

      const workerSkus = [
        "sku-001",
        "sku-002",
        "sku-003",
        "sku-004",
        "sku-005",
      ];

      const target = isLiveEngine
        ? `EDGE::${workerSkus[Math.floor(Math.random() * workerSkus.length)]}`
        : `SKU-${Math.floor(Math.random() * config.skuCount) + 1}`;

      newTelemetry.unshift({
        id: Math.random().toString(36).substring(7),
        op: ops[Math.floor(Math.random() * ops.length)],
        target,
        latency: Math.floor(latency + (Math.random() * 10 - 5)),
        status:
          Math.random() > 0.95
            ? statuses[Math.floor(Math.random() * statuses.length)]
            : "OK",
        timestamp: Date.now(),
      });
    }
    // Return trimmed list
    return newTelemetry.slice(0, 50);
  },
};
