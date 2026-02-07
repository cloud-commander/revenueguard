# Work Checklist: Critical Gaps Implementation

**Status**: Ready for execution  
**Target**: Feb 28 launch  
**Current Week**: Feb 5-9 (Phase 0)

---

## 📋 What's Missing (Concrete Work Items)

All 10 critical gaps are **documented and mapped**. Now you need to **execute**:

### Phase 0: UI Validation (Week 1, Feb 5-9)

#### Frontend Work

- [ ] **Create Vite project** with React + TypeScript
  - Setup: `npm create vite@latest cf-revenue-guard -- --template react`
  - Install: shadcn/ui, Tailwind, Framer Motion
  - Time: 2 hours

- [ ] **Build component library** (6 components)
  - [ ] `InventoryGrid`: Display grid with allocated/available units
  - [ ] `AllocationPanel`: Allocate button + countdown timer
  - [ ] `SimulationControls`: Safe vs Unsafe mode toggle
  - [ ] `StatusDisplay`: Shows current allocations
  - [ ] `WebSocketStatus`: Real-time connection indicator
  - [ ] `MetricsDisplay`: Shows rate limiting status
  - Time: 16 hours (2.5 days)

- [ ] **Connect to mock API**
  - Create `src/services/mockApi.ts` (returns hardcoded data)
  - Time: 2 hours

- [ ] **Accessibility audit**
  - Tab navigation works (InventoryGrid → AllocationPanel → controls)
  - Color contrast AAA (7:1 ratio)
  - Screen reader compatible (ARIA labels)
  - Use: https://www.tpgi.com/color-contrast-checker/
  - Time: 4 hours

- [ ] **Get product sign-off** ✅ Gate

#### Backend Preparation (No code, just planning)

- [ ] **Design API contracts** with Frontend
  - POST /api/allocate request/response
  - POST /api/reset request/response
  - GET /api/status request/response
  - WebSocket connection (wss://)
  - Time: 2 hours

- [ ] **Review rate limiting spec** (Gap #1)
  - Read: IMPLEMENTATION_PLAN.md Phase 1.1
  - Understand: 1 reset per IP per minute
  - Time: 1 hour

- [ ] **Prepare D1 schema** (Gap #6)
  - Review: IMPLEMENTATION_PLAN.md Phase 1.2
  - Create migration file (not applied yet)
  - Time: 2 hours

#### DevOps Preparation

- [ ] **Confirm Cloudflare account ready**
  - Wrangler authenticated + configured
  - Custom domain registered (or workers.dev fallback)
  - Time: 1 hour

---

### Phase 1: Backend Core (Week 2, Feb 12-16)

#### Rate Limiting (Gap #1)

- [ ] **Create `src/middleware/rateLimit.ts`**

  ```
  1 reset per IP per minute
  Uses Cloudflare KV for counter storage
  Returns 429 (Too Many Requests)
  ```

  - Blocking: Phase 0 must complete first ✅
  - Time: 3 hours
  - Validate: `test/rateLimit.test.ts` - spam 5 resets, verify 429 on 2nd

#### D1 Schema (Gap #6)

- [ ] **Apply D1 migration**

  ```sql
  CREATE TABLE IF NOT EXISTS inventory_allocations (
    id INTEGER PRIMARY KEY,
    sku_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sku_id, user_id)  -- Prevents duplicates
  );
  ```

  - Time: 1 hour
  - Validate: `test/migration.test.ts` - run migration 2x, no errors

#### Durable Objects (Gap #9)

- [ ] **Create `src/durable/InventoryDO.ts`**

  ```
  Maintains consistent state: "exactly 100 allocated" (Safe mode)
  Single-threaded serialization enforces ACID
  ```

  - Time: 4 hours
  - Validate: Load test proves always 100, never 99 or 101

#### Worker Router + Endpoints

- [ ] **Create `src/index.ts`**
  - POST /api/allocate (calls DO)
  - POST /api/reset (rate limited, calls DO)
  - GET /api/status (returns allocations count)
  - WebSocket handler (upgrade)
  - Time: 4 hours

- [ ] **Create `src/services/mockApi.ts`** (for testing safe vs unsafe)
  - POST /api/allocate/unsafe (D1 direct, causes race condition)
  - Time: 1 hour

- [ ] **Integration tests**

  ```
  test/safe.test.ts:    125 reqs → always 100 allocated (via DO)
  test/unsafe.test.ts:  125 reqs → 125+ allocated (via D1 race)
  test/endpoints.test.ts: All endpoints return 200
  ```

  - Time: 4 hours
  - Validate: All tests pass locally + `wrangler dev`

#### Update Spec Documents (Gap #9)

- [ ] **Update `03-api-protocol.md`**
  - Add rate limiting specs (Phase 1.1)
  - Section: "Rate Limiting"
  - Content: 1 reset/min, 429 response
  - Time: 1 hour

- [ ] **Update `04-detailed-logic.md`**
  - Add comments on consistency models (Phase 1.3)
  - Section: "ACID vs BASE"
  - Content: Safe path (DO) vs Unsafe path (D1)
  - Time: 1 hour

- [ ] **Update `README.md`**
  - Add "Safe vs Unsafe" explanation
  - Section: "Running the Demo"
  - Content: How to toggle SAFE_MODE environment variable
  - Time: 1 hour

---

### Phase 2: Observability (Week 3, Feb 19-23)

#### Structured Logging (Gap #4)

- [ ] **Create `src/middleware/logging.ts`**

  ```
  Log format: { timestamp, level, service, message, metadata }
  Fields: request_id, user_id, response_time_ms, status
  Visible in: `wrangler tail`
  ```

  - Time: 3 hours
  - Validate: `wrangler tail` shows JSON logs

#### Metrics Collection (Gap #4)

- [ ] **Create `src/middleware/metrics.ts`**

  ```
  Collect: request count, response time (p50, p99), errors
  Store in: Cloudflare KV or D1 metrics table
  ```

  - Time: 3 hours

- [ ] **Create `/api/metrics` endpoint**

  ```
  Returns: { requests_total, p99_latency_ms, error_rate }
  Time window: Last 1 hour
  ```

  - Time: 2 hours
  - Validate: GET /api/metrics returns valid JSON

#### Cost Controls (Gap #8)

- [ ] **Create auto-cleanup job**

  ```
  Runs: Daily at 2am UTC
  Deletes: Rows older than 7 days
  Verifies: KV quota < 50%
  ```

  - Time: 2 hours
  - Validate: Quota stays < 50% over 1 week

#### Create Monitoring Document

- [ ] **Create `docs/MONITORING.md`**
  - Alert thresholds: Error rate > 1%, p99 > 1000ms, quota > 80%
  - Dashboard setup: Cloudflare Analytics dashboard
  - Time: 2 hours

#### Connect Frontend to Real API

- [ ] **Update `src/services/api.ts`**
  - Change from mock to real Worker URL
  - Time: 1 hour
  - Validate: Frontend connects without errors

#### Integration Testing

- [ ] **Frontend → Backend integration**

  ```
  test/integration.test.ts:
  - Click "Book Now" → real API called
  - WebSocket connects → real updates received
  - Rate limiting triggers → 429 shown to user
  ```

  - Time: 4 hours
  - Validate: All tests pass

---

### Phase 3: Security & Launch (Week 4, Feb 26-28)

#### Load Testing (Gap #7)

- [ ] **Create `test/load.k6.js`**

  ```
  Scenarios:
  - Ramp up: 10 → 100 users over 2 min
  - Sustained: 100 users for 5 min
  - Spike: 500 users for 30s

  Thresholds:
  - p99 latency < 1000ms
  - Error rate < 1%
  ```

  - Tool: k6 (https://k6.io)
  - Time: 3 hours
  - Validate: p99 < 1000ms

- [ ] **Run load test + analyze results**
  - Time: 2 hours
  - Document findings in LOAD_TEST_RESULTS.md

#### Security Sign-Off (Gap #2)

- [ ] **Threat model review** (already documented)
  - Security team reviews: SECURITY_FORMALIZED.md
  - Validates: 8 threats all mitigated
  - Time: 2 hours
  - Validate: Security sign-off obtained

#### Incident Response Validation (Gap #3)

- [ ] **Test runbook procedures** (5 scenarios)
  - Simulate: DO quota exceeded → follow runbook
  - Simulate: D1 connection timeout → follow runbook
  - Simulate: WebSocket disconnection → follow runbook
  - Simulate: Rate limiting spam → follow runbook
  - Simulate: Latency spike → follow runbook
  - Time: 4 hours
  - Validate: Team confirms procedures work

#### Pre-Launch Checklist

- [ ] Code review: All code reviewed + approved
- [ ] All tests pass: 100+ test cases
- [ ] Security review: Approved
- [ ] Performance validated: p99 < 1000ms at 100 users
- [ ] Documentation complete: Spec + runbook + README
- [ ] Team trained: On-call team knows runbooks
- [ ] Monitoring active: Alerts configured + tested

---

## 📊 Summary: What to Do NOW

### This Week (Feb 5-9)

**Time Commitment**: ~40 hours (full team)

| Team     | Task                                   | Hours | Blocker?      |
| -------- | -------------------------------------- | ----- | ------------- |
| Frontend | Build component library (6 components) | 16    | No (parallel) |
| Frontend | Connect to mock API                    | 2     | No            |
| Frontend | Accessibility audit                    | 4     | No            |
| Frontend | Get product sign-off ✅                | 0     | **YES**       |
| Backend  | Design API contracts                   | 2     | No (parallel) |
| Backend  | Review rate limiting spec              | 1     | No            |
| Backend  | Prepare D1 schema                      | 2     | No            |
| DevOps   | Confirm Cloudflare account             | 1     | No (parallel) |

### Next Week (Feb 12-16)

**Time Commitment**: ~50 hours (backend focus)

| Team     | Task                                            | Hours |
| -------- | ----------------------------------------------- | ----- |
| Backend  | Implement rate limiting                         | 3     |
| Backend  | Apply D1 migration                              | 1     |
| Backend  | Create Durable Object handler                   | 4     |
| Backend  | Create Worker router + endpoints                | 4     |
| Backend  | Write integration tests                         | 4     |
| Backend  | Update spec documents                           | 3     |
| Frontend | Continue on mock API (don't switch to real yet) | 10    |
| DevOps   | Prepare deployment environment                  | 8     |

---

## 🎯 Success Criteria

### Phase 0 Gate (Feb 9, Friday 5pm)

- [ ] UI renders without backend errors
- [ ] All 6 components functional
- [ ] Accessibility audit passes (WCAG 2.1 AA)
- [ ] Product approves design
- **If any fails**: Extend Phase 0 by 1 week, don't move to Phase 1

### Phase 1 Gate (Feb 16, Friday 5pm)

- [ ] Rate limiting returns 429 (test by spamming 5 resets)
- [ ] Safe mode always books exactly 20 (via DO)
- [ ] Unsafe mode always books 25+ (via D1 race)
- [ ] All integration tests pass
- [ ] API contracts match Frontend expectations
- **If any fails**: Fix over weekend, delay Phase 2 by 1 week

### Phase 2 Gate (Feb 23, Friday 5pm)

- [ ] Logs visible in `wrangler tail` (JSON format)
- [ ] GET /api/metrics returns valid data
- [ ] Frontend successfully connects to real API
- [ ] WebSocket real-time updates work
- [ ] Cost controls prevent quota exhaustion
- **If any fails**: Fix over weekend, compress Phase 3

### Phase 3 Gate (Feb 28, Friday 5pm)

- [ ] Load test: p99 < 1000ms at 100 concurrent users
- [ ] Threat model approved by security team
- [ ] Runbook procedures validated by team
- [ ] All documentation complete + reviewed
- [ ] Team trained on incident response
- **✅ Launch ready**

---

## 🔗 Cross-References

For detailed implementation guidance, see:

| Gap               | Document               | Section          | Time to Read |
| ----------------- | ---------------------- | ---------------- | ------------ |
| #1: Rate Limiting | IMPLEMENTATION_PLAN.md | Phase 1.1        | 10 min       |
| #2: Security      | SECURITY_FORMALIZED.md | Threat matrix    | 15 min       |
| #3: Runbook       | OPERATIONAL_RUNBOOK.md | All 5 procedures | 20 min       |
| #4: Monitoring    | IMPLEMENTATION_PLAN.md | Phase 2.1-2.3    | 10 min       |
| #5: Bottleneck    | IMPLEMENTATION_PLAN.md | Phase 0 (limits) | 5 min        |
| #6: Migration     | IMPLEMENTATION_PLAN.md | Phase 1.2        | 8 min        |
| #7: Load Test     | IMPLEMENTATION_PLAN.md | Phase 3.4        | 5 min        |
| #8: Cost          | IMPLEMENTATION_PLAN.md | Phase 2.2        | 5 min        |
| #9: Consistency   | IMPLEMENTATION_PLAN.md | Phase 1.3        | 10 min       |
| #10: Dependencies | IMPLEMENTATION_PLAN.md | Timeline + RACI  | 10 min       |

---

## ✅ Status

- [x] Architecture reviewed (6.5/10 → gaps identified)
- [x] 10 gaps documented + mapped to phases
- [x] 4-week phased plan created
- [x] Threat model formalized
- [x] Runbook procedures documented
- [ ] **Actual code implementation (START HERE)**
- [ ] Phase 0: UI validation
- [ ] Phase 1: Backend core
- [ ] Phase 2: Observability
- [ ] Phase 3: Security & launch

**Next Step**: Run this checklist + mark items as complete during weekly standups.

---

**Created**: Feb 5, 2026  
**Last Updated**: Now  
**Owner**: Project Lead  
**Questions?**: See IMPLEMENTATION_PLAN.md or READING_GUIDE.md
