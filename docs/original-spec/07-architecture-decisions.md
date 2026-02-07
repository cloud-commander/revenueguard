# 07. Architecture Decision Records (ADRs)

> **Purpose**: Document critical decisions and their trade-offs, capturing organizational knowledge and preventing revisiting decisions.

## ADR-001: Why Durable Objects instead of Workers + External Coordination?

**Status**: ACCEPTED  
**Date**: 2026-02-04

### Context

- Need strong consistency for preventing overallocation (no double-allocations allowed)
- Distributed systems typically require external consensus mechanisms (Zookeeper, Redis, Consul)
- Cloudflare offers Durable Objects as a first-party alternative
- Teams unfamiliar with distributed systems often resort to "eventual consistency with hope"

### Decision

Use Durable Objects for the "Safe" path, not external coordination or KV-based eventual consistency.

### Consequences

**Positive**:

- Guaranteed atomicity via single-threaded serialization (no compare-and-swap needed)
- Zero operational complexity (no external service to manage)
- Cloudflare-managed replication for durability
- Latency: ~50-200ms (acceptable for allocation API)
- Cost: Negligible for this demo scale

**Negative**:

- Throughput bottleneck: ~1000 requests/second max per DO instance
  - Mitigation: Shard by SKU ID (5 instances = 5000 req/s capacity)
- Learning curve: Team must understand DO single-threaded model
- Cloudflare lock-in: API not available on other platforms
- Latency: 50-200ms vs 5ms direct database access (trade-off for correctness)

### Alternatives Considered

1. **Pure KV with eventual consistency**: Simpler, but doesn't prevent overallocation
2. **Workers + Redis**: Strong consistency, but adds external dependency
3. **D1 with database locks**: Possible, but SQL locking is database-specific and complex

---

## ADR-002: Why D1 (SQLite) for Unsafe Path Instead of KV?

**Status**: ACCEPTED  
**Date**: 2026-02-04

### Context

- Need to demonstrate realistic production failure pattern
- Most race conditions in production occur in SQL-based systems
- KV is fundamentally eventual consistent (by design)
- D1 was chosen to match real-world SQL failures developers encounter

### Decision

Use D1 with explicit non-atomic read-check-write pattern for the "Unsafe" path.

### Consequences

**Positive**:

- Realistic (matches actual production bugs in Rails, Django, Node.js apps)
- Educational (demonstrates TOCTOU: Time-of-Check to Time-of-Use race)
- Illustrates SQL-specific problems (no atomic compare-and-swap)
- Developers recognize the pattern from their own code

**Negative**:

- Could use KV instead (simpler, also shows race condition)
- Adds another Cloudflare binding (complexity)
- SQL-specific (doesn't generalize to all databases)
- Intentional vulnerability (must add comments preventing future "fixes")

### Alternatives Considered

1. **KV with optimistic locking**: Simpler, but less realistic to actual production failures
2. **Memory-based counter**: Fast, but unrealistic (no persistence)
3. **PostgreSQL**: More realistic, but not available in Cloudflare

---

## ADR-003: Why WebSocket Hibernation API?

**Status**: ACCEPTED  
**Date**: 2026-02-04

### Context

- Need to keep demo running for 20+ concurrent viewers without draining resources
- Traditional WebSocket: each connection consumes CPU, memory (costs $$)
- Demo runs frequently (sales demos, customer onboarding)
- Alternative: traditional heartbeat + cleanup (complex, error-prone)

### Decision

Use WebSocket Hibernation API with DO alarm-based cleanup.

### Consequences

**Positive**:

- Near-zero cost for idle connections (suspended, not running)
- Automatic cleanup after 60s (prevents zombie DO instances)
- Cloudflare-managed (no custom timeout logic needed)
- Scales to 1000+ concurrent connections per DO instance

**Negative**:

- Requires understanding Hibernation API (new for most engineers)
- Cloudflare-specific feature (not portable to other platforms)
- Debugging hibernated connections is non-obvious
- Must disable hibernation during local development (wrangler limitation)

### Alternatives Considered

1. **Traditional heartbeat + server cleanup**: Works, but complex to maintain
2. **Hard timeout on connection**: Simple, but abruptly disconnects users
3. **No cleanup (zombie instances)**: Cheap, but pollutes operational state

---

## ADR-004: Why Zero Authentication for the Demo?

**Status**: ACCEPTED (with caveats)  
**Date**: 2026-02-04

### Context

- Demo is for internal sales & educational use only
- Adding OAuth2/OIDC adds 40% complexity (credential management, token refresh, RBAC)
- Goal is to teach race conditions, not authentication
- Anyone resetting the demo is a feature, not a bug (enables rapid re-runs)

### Decision

Implement zero authentication (anyone can allocate/reset without credentials).

### Consequences

**Positive**:

- Minimal complexity (pure demo focus)
- Instant access (no login friction during sales presentations)
- Rapid replay (no need to log in again between runs)
- Easier onboarding for first-time users

**Negative**:

- Not suitable for production use (security issue)
- No audit trail (can't track who reset the demo)
- No RBAC (can't give viewers read-only access)
- Potential for accidental resets by curious users

### Mitigation for Production

- Implement OAuth2 via Auth0 or Okta
- Add role-based access (["demo", "presenter", "admin"])
- Log all resets with timestamps and user IDs
- Use Cloudflare Workers KV for rate-limiting reset endpoint

---

See [04-detailed-logic.md](04-detailed-logic.md) and [03-api-protocol.md](03-api-protocol.md) for how these decisions are implemented.
