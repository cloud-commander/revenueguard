# 14. Simulation Logic & Testing

## Client Simulation Logic

### The "Trigger" Flow

1. **User Click**: "Start Flash Sale" button in UI
2. **Request**: `POST /api/simulate-rush` with `{ skuId, mode, count: 125 }`
3. **Server Processing**: Worker spawns 125 concurrent allocation attempts
4. **Visuals**:
   - **Safe Mode**:
     - WebSocket receives `UPDATE` messages as DO processes requests sequentially
     - Units fill one-by-one (smooth, controlled)
     - Exactly 100 succeed, 25 are rejected
   - **Unsafe Mode**:
     - All 125 requests return `200 OK` (race condition allows all through)
     - UI polls `GET /api/state` after 1s
     - Database shows `allocated_units: 125` (overallocation proven)
     - Visual: 100 green units + 25 red "OVERFLOW" indicators
5. **The Reveal**: Side-by-side comparison shows DO correctness vs D1 race condition

---

## Expected Outcomes

| Mode   | Concurrent Requests | Successful Allocations | Database State | Result           |
| ------ | ------------------- | ---------------------- | -------------- | ---------------- |
| Safe   | 125                 | 100                    | 100 records    | ✅ Correct       |
| Unsafe | 125                 | 125                    | 125 records    | ❌ Overallocated |

---

## The "Explainer Panel"

**Location**: Fixed panel on the right side of the screen (or collapsible overlay).

**Purpose**: Provides live narration of what's happening during each phase of the simulation.

### Example Messages by Phase

```typescript
const EXPLAINER_CONTENT = {
  idle: {
    title: "Ready to Simulate",
    description:
      "Click 'Impact Load' to spawn 125 concurrent allocation requests.",
    technicalDetail:
      "This simulates real-world traffic spikes (e.g., concert ticket drops).",
  },

  racing_unsafe: {
    title: "⚠️ Race Condition in Progress",
    description:
      "All 125 requests read 'allocated_units = 99' at the same time.",
    technicalDetail:
      "200ms delay ensures concurrent reads complete before any writes.",
  },

  racing_safe: {
    title: "✅ Serialization Active",
    description: "Durable Object processes requests one-by-one in FIFO order.",
    technicalDetail:
      "Single-threaded execution guarantees atomic check-and-set operations.",
  },

  complete: {
    title: "Simulation Complete",
    description: "Compare the results side-by-side to see the difference.",
    technicalDetail: "Unsafe: Data corruption. Safe: Perfect consistency.",
  },
};
```

---

## Visual Annotations on Seat Grid

**Unit States with Explanations**:

| State                      | Visual               | Tooltip                                                   |
| -------------------------- | -------------------- | --------------------------------------------------------- |
| **Empty Unit**             | Dashed border        | "Available - No allocations yet"                          |
| **Reading State (Unsafe)** | Pulsing cyan border  | "Request reading current count: ${count}"                 |
| **Pending Write (Unsafe)** | Yellow glow          | "Writing new count: ${count + 1}"                         |
| **Booked (Safe)**          | Solid green fill     | "Allocated by ${userId} - Atomically verified"            |
| **Overflow (Unsafe)**      | Red fill with glitch | "OVERFLOW: Allocation #${index} - This should not exist!" |
| **Rejected (Safe)**        | Brief red flash      | "Request rejected - SKU full"                             |

---

## Side-by-Side Comparison Mode

**Layout**: Split screen showing Safe and Unsafe modes simultaneously.

**Synchronized Triggers**: When "Impact Load" is clicked, both modes execute in parallel.

**Counter Display**:

```
┌─────────────────────┬─────────────────────┐
│   SAFE (DO)         │   UNSAFE (D1)       │
├─────────────────────┼─────────────────────┤
│ Allocated: 100/100 ✅    │ Allocated: 125/100 ❌    │
│ Rejected: 25         │ Rejected: 0         │
│ Data State: Valid   │ Data State: Corrupt │
└─────────────────────┴─────────────────────┘
```

---

## Key Metrics Dashboard

**Display During Simulation**:

```
┌─────────────────────────────────────────┐
│ 🔬 Race Condition Metrics               │
├─────────────────────────────────────────┤
│ Concurrent Reads:        125             │
│ Read Value (Unsafe):     99 (same!)     │
│ Successful Writes:       125             │
│ Expected Writes:         100             │
│ Overflow:                +25 ❌          │
│                                         │
│ Race Window:             200ms          │
│ Requests in Window:      125/125          │
│ Collision Probability:   100%           │
└─────────────────────────────────────────┘
```

---

## Technical Deep-Dive

```typescript
// ❌ UNSAFE (D1)
const current = await db.query(
  "SELECT allocated_units FROM inventory WHERE id = ?",
);
await sleep(200); // ⚠️ Race window
if (current.allocated_units < 100) {
  await db.execute(
    "UPDATE inventory SET allocated_units = allocated_units + 1",
  );
  // 👆 No atomic check - all 125 requests pass this and increment
}

// ✅ SAFE (DO)
if (this.allocations.size >= 100) {
  return "FULL"; // Atomic check in single thread
}
this.allocations.add(userId);
await this.ctx.storage.put("allocations", Array.from(this.allocations));
// 👆 Sequential execution guarantees exactly 100 allocations
```

---

## Animation Timing for Educational Flow

- **Request Spawn**: 50ms per request (stagger for visibility)
- **Read Phase**: Hold for 500ms with "All reading '99'" label
- **Write Phase**: 100ms per write, with counter incrementing visually
- **Reveal**: 1000ms pause before showing final state
- **Comparison Highlight**: 2000ms with blinking indicators

**Adjustable Speed**: Include playback controls (0.5x, 1x, 2x speed).

---

See [05-educational-ui.md](05-educational-ui.md) for detailed UI/UX specifications.
