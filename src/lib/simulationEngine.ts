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
    const archConst = SIMULATION_CONSTANTS.ARCHITECTURE;

    if (mode === "eventual") {
      // --- REGIONAL / STANDARD ARCHITECTURE ---
      const arch = config.standardArchitecture;
      const potentialRevenueTick = activeUsers * 0.5;

      if (arch === "redis") {
        // Redis: Regional ElastiCache/Redis instance + Regional App Server
        // Benchmark: Serialisation (JSON) + Net roundtrip + Redlock acquisition
        const lockOverhead =
          archConst.REDIS_SERIALISATION + Math.random() * 40 * chaosLevel;
        replicaLag = 20 + Math.random() * 30 * chaosLevel; // Near-instant in-region
        latency = avgRegionalBase + lockOverhead;
        lockWaitTime = lockOverhead;

        const lossFactor = Math.max(0, (latency - 120) / 1000) * 0.15;
        lostDelta = potentialRevenueTick * lossFactor;
        revenueDelta = potentialRevenueTick - lostDelta;

        // Collision probability on hot key
        if (activeUsers > 600 && Math.random() > 0.85) {
          overbookingDelta = Math.ceil(Math.random() * 2 * chaosLevel);
        }
      } else if (arch === "queue") {
        // Async Queue (SQS/Kafka) - Return 'Accepted' instantly
        latency = 35 + Math.random() * 15; // Local pop/app server resp
        lockWaitTime = 0;
        // The real lag is end-to-end visibility:
        replicaLag =
          archConst.QUEUE_PROCESSING_LAG + Math.random() * 2000 * chaosLevel;

        revenueDelta = potentialRevenueTick;

        // Massive drift on flash sales
        if (activeUsers > 200) {
          const staleFactor =
            (replicaLag / 1000) * (activeUsers / 500) * chaosLevel;
          overbookingDelta = Math.ceil(Math.random() * 15 * staleFactor);
          lostDelta = overbookingDelta * 150;
        }
      } else if (arch === "sql") {
        // SQL: Aurora/RDS Primary + Read Replicas
        const geographyTax = avgRegionalBase;
        const concurrentRequests = activeUsers / 50;
        lockWaitTime =
          archConst.SQL_LOCK_ACQUISITION +
          (concurrentRequests / 5) * 40 +
          Math.random() * 60 * chaosLevel;

        replicaLag =
          archConst.AURORA_REPLICA_LAG_BASE + Math.random() * 250 * chaosLevel;
        latency = geographyTax + lockWaitTime; // Standard: read stays at origin

        const lossFactor = Math.max(0, (latency - 150) / 1000) * 0.12;
        lostDelta = potentialRevenueTick * lossFactor;
        revenueDelta = potentialRevenueTick - lostDelta;

        if (activeUsers > 400 && Math.random() > 0.65) {
          const contentionFactor = (activeUsers - 400) / 1000;
          overbookingDelta = Math.ceil(
            Math.random() * 8 * contentionFactor * chaosLevel,
          );
        }
      } else if (arch === "crdt") {
        // CRDT Sync (Multi-Master)
        latency = 20 + Math.random() * 15;
        lockWaitTime = 0;
        replicaLag =
          archConst.CRDT_CONVERGENCE + Math.random() * 300 * chaosLevel;

        revenueDelta = potentialRevenueTick;
        if (activeUsers > 350 && Math.random() > 0.55) {
          overbookingDelta = Math.ceil(Math.random() * 5 * chaosLevel);
        }
      } else if (arch === "sticky") {
        // Sticky Session (Affinity)
        latency = 12 + Math.random() * 8;
        lockWaitTime = 0;
        revenueDelta = potentialRevenueTick;

        if (chaosLevel > 1.5 && Math.random() > 0.9) {
          // Rebalancing / Split Brain
          overbookingDelta = Math.ceil(Math.random() * 15);
          lostDelta = overbookingDelta * 150;
        }
      }

      processed = Math.floor(activeUsers * 0.08);
    } else {
      // --- DURABLE OBJECTS (ATOMIC) ---
      // Benchmark: 0ms cold starts, <15ms execution at LHR/JFK
      const edgeBaseline =
        SIMULATION_CONSTANTS.LATENCY.EDGE_BASELINE +
        Math.random() * 8 * (1 + (chaosLevel - 1) * 0.2);

      latency = edgeBaseline;
      lockWaitTime = 0;
      replicaLag = 0;

      const potentialRevenueTick = activeUsers * 0.55;
      revenueDelta = potentialRevenueTick;
      lostDelta = 0;
      processed = Math.floor(activeUsers * 0.14);
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
