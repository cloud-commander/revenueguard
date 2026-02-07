# 05. Educational UI Requirements

> **Design Principle:** This is not a booking application—it is a **distributed systems teaching tool**. Every interaction, state transition, and data flow must be self-explanatory, allowing users to understand race conditions, serialization, and consistency guarantees without a live presenter or documentation.

## Explanatory Tooltips for Status Badges

Every UI element representing a system state must have a **persistent, context-sensitive tooltip** that explains "What is happening?" and "Why?"

### Tooltip Specifications

- **Trigger**: Hover (desktop) or long-press (mobile)
- **Delay**: 300ms (fast enough to feel responsive, slow enough to avoid clutter)
- **Duration**: Until user moves away
- **Styling**: Neon accent color (cyan for "Info", red for "Error", green for "Success")
- **Position**: Anchor to element without obscuring critical UI
- **Font**: Small, technical monospace for data; regular sans-serif for explanation

### Tooltip Content Structure

```
[Icon] Status Label
─────────────────────
Human-readable explanation (1-2 lines)
Technical detail (gray, smaller text)
Optional: [Learn More →] link
```

### Tooltip Examples by State

| State                  | Badge              | Tooltip                                                                                  |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| **Empty Unit**         | `●` (Dashed)       | "Available — No allocations yet. Ready to accept a new request."                         |
| **Reading (Unsafe)**   | `◐` (Cyan pulse)   | "Reading current count... Unit availability check in progress. [Why pulsing? → Details]" |
| **Pending Write**      | `◑` (Yellow glow)  | "Writing new count... All 125 requests are attempting to update the database."           |
| **Allocated (Safe)**   | `●` (Solid green)  | "Allocated ✓ — Atomically verified. DO serialization guaranteed this allocation."        |
| **Allocated (Unsafe)** | `●` (Green)        | "Allocated ✓ — Allocation succeeded, but may exceed capacity due to race condition."     |
| **Overflow (Unsafe)**  | `●` (Glitched red) | "❌ OVERFLOW — This allocation should not exist! Unit #101 proves the race condition."   |
| **Rejected (Safe)**    | `X` (Red flash)    | "Rejected — SKU at capacity. DO prevented overallocation. This is correct behavior."     |

---

## Contextual Help Cards (Expandable Deep-Dive Sections)

Learners need **progressive disclosure**: basic understanding at a glance, deeper knowledge on demand.

### Help Card Specifications

- **Trigger**: "Why?" or "Learn More" button (chevron icon, subtle styling)
- **Animation**: Smooth height expansion (150ms), `max-height` CSS transition
- **Layout**: Right-aligned sidebar or modal depending on screen size
- **Dismissal**: Click anywhere outside, ESC key, or explicit close button

### Card 1: "What is a Race Condition?"

```markdown
### 🔄 Race Condition Explained

A race condition occurs when multiple operations access shared data
simultaneously, and the final result depends on timing—not logic.

**In this demo:**

- 125 concurrent requests all read `allocated_units = 99`
- None see each other's updates
- All write: `allocated_units + 1`
- Database ends up with `allocated_units = 125` (incorrect)

**Real-world impact:**

- Overselling of airline tickets
- Double-charging customers
- Inventory discrepancies

[← Collapse] | [View Code] | [Read Blog Post →]
```

### Card 2: "How DO Prevents This"

```markdown
### ✅ Durable Objects = Serialization

Cloudflare Durable Objects are **single-threaded, globally distributed**.
Requests to the same DO instance are processed one-at-a-time.

**The guarantee:**

1. Request 1 checks: `size >= 100?` → False
2. Request 1 allocates: `allocations.add(user-1)`
3. Request 2 checks: `size >= 100?` → False (now size = 1)
4. Request 2 allocates: `allocations.add(user-2)`
   ...
5. Request 100 allocates: `allocations.add(user-100)`
6. Request 101 checks: `size >= 100?` → TRUE → REJECTED ✓

No two requests execute atomically at the same time.

[← Collapse] | [View Pseudocode] | [Cloudflare Docs →]
```

### Card 3: "Why We Use D1 for the Unsafe Path"

```markdown
### ⚠️ Why SQLite Race Conditions Are Realistic

We use D1 (Cloudflare's SQLite) for the "Unsafe" path because:

**Real SQL-based systems suffer from this exact issue:**

- Most ORMs don't enforce atomic transactions by default
- Developers often write: SELECT → App Logic → UPDATE
- This leaves a race window between read and write

**If we used KV instead:**

- Would look contrived (KV is fundamentally designed for this use case)
- Wouldn't match production failures in SQL databases

**The vulnerability in our schema:**

- No `UNIQUE(sku_id, user_id)` constraint
- No `CHECK (allocated_units <= total_stock)` constraint
- These _should_ be there; their absence is intentional

[← Collapse] | [View DB Schema] | [SQLite Lock Modes →]
```

### Card 4: "Understanding Durable Object Storage"

```markdown
### 💾 How DO State Persists

When you allocate a unit in Safe mode:

1. In-memory check: `if (allocations.size >= 100) reject`
2. In-memory update: `allocations.add(user-id)`
3. Persistent write: `await storage.put("state", {...})`
4. Atomicity: Steps 1-3 complete or none do

**Failure scenario:**

- If storage.put fails, we rollback the in-memory state
- This prevents a divergence between what the DO claims and what's stored

**Durability:**

- Cloudflare replicates storage across multiple datacenters
- Your allocation survives DO restart

[← Collapse] | [View Implementation] | [Storage API Docs →]
```

### Card 5: "WebSocket Hibernation & Auto-Cleanup"

```markdown
### 😴 How the Demo Auto-Resets After 60 Seconds

**The problem:** If we don't clean up state, the demo becomes stale.

**Traditional approach:** Server sends `:CLOSE` after timeout.

- Requires active monitoring
- Costs CPU and memory

**Our approach: Durable Object Alarms**

1. Every allocation schedules an alarm for 60 seconds from now
2. When alarm fires, check: "Are there active WebSocket sessions?"
3. If YES: Reschedule (users are watching)
4. If NO: Clear all state (demo is ready for re-run)

**Educational benefit:**

- Shows edge-case handling in distributed systems
- Demonstrates cost-efficient cleanup patterns

[← Collapse] | [Alarm API Docs →]
```

---

## Inline Documentation (Disabled States & Guidance Messages)

When a user cannot perform an action, the UI should **teach them why** and **guide them forward**.

### Disabled State Pattern

```
┌─────────────────────────────────────────────────┐
│ [Button Text] — DISABLED                        │
│                                                 │
│ ⓘ Why is this disabled?                         │
│                                                 │
│ Your reason: "Waiting for previous simulation   │
│ to complete. (2 seconds remaining)"             │
│                                                 │
│ What to do: [Show ongoing simulation] or        │
│ [Interrupt & Reset]                             │
└─────────────────────────────────────────────────┘
```

### Disabled Button Examples

**Reset Button (Mid-Simulation)**:

```
[RESET] ⊘ DISABLED

ⓘ Why? A simulation is in progress. Resetting now would corrupt
  the results and confuse the educational outcome.

What to do? Wait for the current run to complete (~5 seconds),
  or click [Force Reset] to abort immediately.
```

**Switch Mode (During WebSocket Connection)**:

```
[SWITCH TO UNSAFE MODE] ⊘ DISABLED

ⓘ Why? You're currently viewing live updates via WebSocket.
  Switching modes mid-stream would disconnect you.

What to do? Disconnect WebSocket (click 🔌 in the top bar),
  then you can switch modes.
```

---

## Learning Path Progression (State-Based UI)

The interface adapts based on user progress, guiding them through a **natural learning journey**.

### Phase 1: Introduction (First Load)

```
╔═══════════════════════════════════════════════════════╗
║           Welcome to Revenue Guard Demo                  ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║ Let's explore how distributed systems prevent        ║
║ overallocation race conditions.                          ║
║                                                       ║
║ [→ Learn the Basics]    [→ Skip to Demo]             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

### Phase 2: Mode Selection

```
┌─────────────────────────────────────────────────────┐
│ Choose a mode to begin:                             │
│                                                     │
│ [SAFE MODE]              [UNSAFE MODE]             │
│ ✅ Durable Objects       ❌ SQL Race Condition     │
│ Serialized requests      Concurrent requests       │
│ Prevents overallocation     Allows overallocation        │
│                                                     │
│ ℹ️  Pick one to see what happens. You can try      │
│     both and compare!                               │
└─────────────────────────────────────────────────────┘
```

### Phase 3: Pre-Simulation Checklist

```
┌─────────────────────────────────────────────────────┐
│ Mode: SAFE ✓                                        │
│ SKU: SKU-001 ✓                              │
│ Concurrent Requests: 125 ✓                           │
│                                                     │
│ Ready to simulate?                                  │
│                                                     │
│ [← Change Settings]  [INITIATE RUSH →]             │
│                                                     │
│ ℹ️  This will spawn 125 concurrent allocation requests.│
│     Watch the units fill (or overflow)!            │
└─────────────────────────────────────────────────────┘
```

### Phase 4: Live Simulation (With Real-Time Narration)

```
═══ LIVE SIMULATION ═══════════════════════════════════

Phase: READING (1/4)
─────────────────────
🔵 All 125 requests are reading the database...
   Current capacity check: `allocated_units = 99`

   ⏱ This happens in parallel. All 125 see the
     same value at the same millisecond.

[Next Step]  [Pause]  [Speed: 1x ▼]
```

Then:

```
Phase: WRITING (2/4)
─────────────────────
🟡 In Unsafe mode, all 125 requests are writing...
   Each one increments: `allocated_units + 1`

   ⚠️ Problem: There's no atomic check-and-set.
     All 125 updates execute independently.
     Database becomes inconsistent.

[Next Step]  [Pause]  [Speed: 1x ▼]
```

Finally:

```
Phase: RESULT (3/4)
─────────────────────
❌ Data Corruption Detected!

   Expected: 100 allocations
   Actual:   125 allocations

   This is the race condition in action. The
   database now has a constraint violation
   (>100 units in a 100-unit SKU).

[See Code] [Run Safe Mode] [Next Step]
```

### Phase 5: Post-Simulation Comparison

```
╔════════════════════════════════════════════════════╗
║              SIMULATION COMPLETE                   ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║ UNSAFE (D1 SQL):          SAFE (Durable Objects): ║
║ ❌ 125 allocations            ✅ 100 allocations          ║
║ ❌ 0 rejections: NONE     ✅ 25 rejections: YES    ║
║ ❌ Data: CORRUPT          ✅ Data: VALID          ║
║                                                    ║
║ The difference? Serialization.                    ║
║ DO's single-threaded model prevents the race.    ║
║                                                    ║
║ [← Run Again] [Switch Mode] [Share Results]      ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

---

## Accessibility Requirements (WCAG 2.1 AA Compliance)

- **Keyboard Navigation**: All controls accessible via Tab/Shift+Tab/Enter
- **Screen Reader Support**: All tooltips and status changes announced via ARIA live regions
- **Color Contrast**: All text ≥ 4.5:1 ratio against background (including neon accents)
- **Motion**: Animations can be disabled via `prefers-reduced-motion` media query
- **Focus Indicators**: 2px outline on all interactive elements

---

## Metrics Dashboard (Animated, Real-Time)

During simulation, display:

```
┌─────────────────────────────────────────────────────┐
│                LIVE METRICS                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Successful Allocations:  ████████████────  100 / 125  │
│  Failed Allocations:      ─────────────────  25 / 125   │
│  Units Remaining:      ████──────────────  0 / 100   │
│  Avg Response Time:    45.2ms                       │
│  Concurrent Requests:  125 active                    │
│                                                     │
│  [▶ Replay] [⏸ Pause] [↻ Reset]                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Each bar animates in real-time as allocations complete. Successful allocations fill from left (green), failures stack (red).

See [04-detailed-logic.md](04-detailed-logic.md) for the underlying allocation logic that the UI presents.
