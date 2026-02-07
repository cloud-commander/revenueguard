export const THRESHOLDS = {
  // Latency (ms)
  LATENCY: {
    CRITICAL: 1000,
    WARNING: 500,
  },

  // Replication Lag (ms)
  REPLICA_LAG: {
    BREACH: 500,
    WARNING: 100,
  },

  // Load Percentage (%)
  LOAD: {
    CRITICAL: 90,
    WARNING: 70,
  },
} as const;
