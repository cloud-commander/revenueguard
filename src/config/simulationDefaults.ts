export type StandardArchitecture =
  | "sql"
  | "redis"
  | "queue"
  | "crdt"
  | "sticky";

export interface SimulationConfig {
  baseTraffic: number;
  skuCount: number;
  chaosLevel: number;
  refreshRate: number;
  latencyInjectionMs: number;
  payloadSizeBytes: number;
  degradedDemo: boolean;
  standardArchitecture: StandardArchitecture;
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_CONFIG = {
  baseTraffic: num(import.meta.env.VITE_SIM_BASE_TRAFFIC, 850),
  skuCount: num(import.meta.env.VITE_SIM_SKU_COUNT, 48),
  chaosLevel: num(import.meta.env.VITE_SIM_CHAOS_LEVEL, 1),
  refreshRate: num(import.meta.env.VITE_SIM_REFRESH_RATE, 100),
  latencyInjectionMs: num(import.meta.env.VITE_SIM_LATENCY_MS, 0),
  payloadSizeBytes: num(import.meta.env.VITE_SIM_PAYLOAD_BYTES, 50),
  degradedDemo: false,
  standardArchitecture: "sql" as StandardArchitecture,
};

export const BILLING_SCALE = num(
  import.meta.env.VITE_SIM_BILLING_SCALE,
  0.0001,
);

export const SIMULATION_LIMITS = {
  ALERT: num(import.meta.env.VITE_SIM_ALERT_LIMIT, 500_000),
  HARD_LIMIT: num(import.meta.env.VITE_SIM_HARD_LIMIT, 1_000_000),
  MAX_CONCURRENT_USERS: 100,
} as const;

export const DISABLE_LIVE_ENGINE =
  import.meta.env.VITE_DISABLE_LIVE_ENGINE === "true";

// --- SIMULATION PHYSICS CONSTANTS (BENCHMARK ALIGNED 2024/2025) ---
export const SIMULATION_CONSTANTS = {
  // Regional Latency Bases (ms)
  // Cross-continent RTT benchmarks:
  // - US-East to London: ~75ms (one-way) -> 150ms RTT
  // - US-East to Singapore: ~120ms (one-way) -> 240ms RTT
  LATENCY: {
    LONDON_RTT: 152,
    SINGAPORE_RTT: 245,
    NEW_YORK_RTT: 12,
    GLOBAL_AVG: 110,
    BASE_JITTER: 15,
    EDGE_BASELINE: 14, // Cloudflare Workers P50 benchmark
  },

  // Architecture-specific Overheads (ms)
  ARCHITECTURE: {
    SQL_LOCK_ACQUISITION: 85, // Transactional lock wait baseline
    REDIS_SERIALISATION: 140, // Redlock + JSON overhead
    QUEUE_PROCESSING_LAG: 4500, // End-to-end event visibility lag
    CRDT_CONVERGENCE: 220, // Region sync window
    AURORA_REPLICA_LAG_BASE: 100, // AWS CloudWatch benchmark standard
  },

  // Throughput
  RPS: {
    LIMIT_PER_DO: 1000,
    POLL_RATE_MS: 100,
  },

  // Costs
  COSTS: {
    OVERBOOKING_PENALTY: 50, // $50 per overbooking
    UNIT_PRICE: 150, // $150 per unit revenue
  },

  // Timeouts
  IDLE_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
} as const;
