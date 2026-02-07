export const NARRATIVE_DATA = {
  // Error / Guardrails
  GUARDRAIL: {
    phase: "GUARDRAIL TRIGGERED",
    status: "alert" as const,
    subtext:
      "Hard cost lock activated: BILLING_SCALE=1e-9 and DEMO_COST_LIMIT=0.0 prevented any billable events.",
  },
  SYSTEM_ERROR: {
    phase: "SYSTEM ERROR",
    status: "alert" as const,
    subtext:
      "The Edge Worker returned an error. Replay with mock mode to compare behaviours.",
  },

  // Degraded Mode
  DEGRADED: {
    phase: "DEGRADED (SIMULATED)",
    status: "pending" as const,
    text: "SLO breach simulated: routing stays on demo path, banner shows degraded mode without touching SQL.",
    subtext:
      "Use this to narrate fail-open behaviour and alerting without incurring real fallback costs.",
  },

  // Safe Mode (Reference)
  SAFE: {
    phase: "SAFE (ATOMIC)",
    status: "success" as const,
    messages: [
      {
        text: "Safe mode = atomic: Durable Objects serialise per session/SKU, so oversellDelta stays at zero.",
        subtext: "Edge-based state removes central lock waits; p99 stays low.",
      },
      {
        text: "Every seat is its own Durable Object—thousands of bookings in parallel, no global lock.",
        subtext:
          "Think of it as thousands of tiny databases instead of one hot row.",
      },
      {
        text: "Bids settle in-place at the edge; high bidders update instantly without central contention.",
        subtext:
          "Horizontal scaling emerges from isolation: one DO per hot key.",
      },
    ],
  },

  // Regional Architectures
  REGIONAL: {
    sql: {
      phase: "REGIONAL SQL (SHARED)",
      status: "alert" as const,
      messages: [
        {
          text: "Hot rows experience contention during the 'Window of Conflict'.",
          subtext:
            "Standard primary/replica sync delays (100ms+) can result in duplicate bookings for limited inventory.",
        },
        {
          text: "Replica lag is a common trade-off in distributed relational systems.",
          subtext:
            "Maintaining global transactional consistency often requires trading off either performance or data locality.",
        },
      ],
    },
    redis: {
      phase: "REGIONAL CACHE (SERIALISED)",
      status: "alert" as const,
      messages: [
        {
          text: "Centralised locks can impact latency as every request must verify state against a single global source.",
          subtext:
            "This architectural pattern prioritises a single source of truth over edge-native processing speeds.",
        },
        {
          text: "Increased load can lead to higher wait times due to the physics of centralised state management.",
          subtext:
            "Durable Objects provide an alternative by decentralising state to the user's nearest point of presence.",
        },
      ],
    },
    queue: {
      phase: "ASYNC PATTERN (DEFERRED)",
      status: "pending" as const,
      messages: [
        {
          text: "Async patterns provide high throughput but can introduce inventory drift.",
          subtext:
            "The system optimises for user experience speed, which may lead to inventory reconciliations occurring post-transaction.",
        },
        {
          text: "Inventory updates are queued, which may result in checkout confirmations based on slightly aged state.",
          subtext:
            "This is an intentional design choice to maintain site responsiveness under extreme traffic spikes.",
        },
      ],
    },
    crdt: {
      phase: "MULTI-MASTER (SYNC)",
      status: "alert" as const,
      messages: [
        {
          text: "Multi-master sync patterns (e.g. Azure Cosmos / GCP Spanner) provide scale through eventual consistency.",
          subtext:
            "Concurrent updates in separate regions can lead to complex merge scenarios for exact inventory counts.",
        },
        {
          text: "While highly resilient, multi-master systems often require additional logic to handle concurrent inventory decrements.",
          subtext:
            "Durable Objects offer a localised alternative that avoids the complexities of global merge logic.",
        },
      ],
    },
    sticky: {
      phase: "REGIONAL STICKY (AFFINITY)",
      status: "alert" as const,
      messages: [
        {
          text: "Sticky session patterns (standard on AWS/Regional clouds) rely on consistent routing to specific cache nodes.",
          subtext:
            "Scaling events or node rebalancing can sometimes disconnect a user's session from their local cached state.",
        },
        {
          text: "State affinity can be challenging to maintain during rapid cluster expansion in a flash sale.",
          subtext:
            "Durable Objects simplify this by migrating state dynamically to follow the user across the global network.",
        },
      ],
    },
  },
};
