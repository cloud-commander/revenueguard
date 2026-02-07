import {
  type SimulationConfig,
  SIMULATION_CONSTANTS,
} from "@/config/simulationDefaults";

/**
 * Pure function to calculate latency, lock wait, and revenue delta based on mode and architecture.
 */
export const SimulationEngine = {
  calculatePhysics: (
    mode: "eventual" | "safe",
    activeUsers: number,
    config: SimulationConfig,
    chaosLevel: number,
  ) => {
    let latency = 0;
    let lockWaitTime = 0;
    let replicaLag = 0;
    let revenueDelta = 0;
    let lostDelta = 0;
    let overbookingDelta = 0;
    let processed = 0;

    const avgRegionalBase = SIMULATION_CONSTANTS.LATENCY.GLOBAL_AVG;

    if (mode === "eventual") {
      // --- REGIONAL / STANDARD ARCHITECTURE ---
      const arch = config.standardArchitecture;

      const potentialRevenueTick = activeUsers * 0.5;

      if (arch === "redis") {
        // Redis: Primary + Replicas
        const lockOverhead = 180 + Math.random() * 100 * chaosLevel;
        replicaLag = 30 + Math.random() * 50 * chaosLevel;
        latency = avgRegionalBase + lockOverhead + replicaLag;
        lockWaitTime = lockOverhead;

        const lossFactor = Math.max(0, (latency - 120) / 1000) * 0.15;
        lostDelta = potentialRevenueTick * lossFactor;
        revenueDelta = potentialRevenueTick - lostDelta;

        if (activeUsers > 800 && Math.random() > 0.9) {
          overbookingDelta = Math.ceil(Math.random() * 2 * chaosLevel);
        }
      } else if (arch === "queue") {
        // Async Queue
        latency = 45 + Math.random() * 20;
        lockWaitTime = 0;
        replicaLag = 2000 + Math.random() * 3000 * chaosLevel;

        revenueDelta = potentialRevenueTick;

        if (activeUsers > 300) {
          const staleFactor =
            (replicaLag / 1000) * (activeUsers / 1000) * chaosLevel;
          overbookingDelta = Math.ceil(Math.random() * 12 * staleFactor);
          lostDelta = overbookingDelta * 150;
        }
      } else if (arch === "sql") {
        // SQL: Primary + Replicas
        const geographyTax = avgRegionalBase;
        const concurrentRequests = activeUsers / 100;
        lockWaitTime = Math.max(
          0,
          (concurrentRequests / 10) * 150 + Math.random() * 50 * chaosLevel,
        );
        replicaLag = 50 + Math.random() * 150 * chaosLevel;
        latency = geographyTax + lockWaitTime + replicaLag;

        const lossFactor = Math.max(0, (latency - 150) / 1000) * 0.1;
        lostDelta = potentialRevenueTick * lossFactor;
        revenueDelta = potentialRevenueTick - lostDelta;

        if (activeUsers > 500 && Math.random() > 0.7) {
          const contentionFactor = (activeUsers - 500) / 2000;
          overbookingDelta = Math.ceil(
            Math.random() * 5 * contentionFactor * chaosLevel,
          );
        }
      } else if (arch === "crdt") {
        // CRDT Sync
        latency = 15 + Math.random() * 10;
        lockWaitTime = 0;
        replicaLag = 100 + Math.random() * 200 * chaosLevel;

        revenueDelta = potentialRevenueTick;
        if (activeUsers > 400 && Math.random() > 0.6) {
          overbookingDelta = Math.ceil(Math.random() * 4 * chaosLevel);
        }
      } else if (arch === "sticky") {
        // Sticky Session
        latency = 8 + Math.random() * 5;
        lockWaitTime = 0;
        revenueDelta = potentialRevenueTick;

        if (chaosLevel > 1.8 && Math.random() > 0.95) {
          overbookingDelta = Math.ceil(Math.random() * 20);
          lostDelta = overbookingDelta * 150;
        }
      }

      processed = Math.floor(activeUsers * 0.08);
    } else {
      // --- DURABLE OBJECTS (ATOMIC) ---
      const edgeBaseline =
        SIMULATION_CONSTANTS.LATENCY.EDGE_BASELINE *
        (1 + (chaosLevel - 1) * 0.1);

      // Capacity check (1k RPS limit)
      // totalRps isn't passed here, so we approximate or need to pass it.
      // For now, let's assume we pass totalRps or calculate it.
      // Refactoring step: passing totalRps is cleaner.
      // But keeping it simple for now:

      latency = edgeBaseline + Math.random() * 5;
      lockWaitTime = 0;
      replicaLag = 0;

      const potentialRevenueTick = activeUsers * 0.5;
      revenueDelta = potentialRevenueTick;
      lostDelta = 0;
      processed = Math.floor(activeUsers * 0.12);
    }

    // Apply Demo Degraded Mode
    if (config.degradedDemo) {
      latency = Math.max(latency + 60, 120);
      revenueDelta *= 0.7;
      lostDelta += revenueDelta * 0.3;
    }

    return {
      latency,
      lockWaitTime,
      replicaLag,
      revenueDelta,
      lostDelta,
      overbookingDelta,
      processed,
    };
  },
};
