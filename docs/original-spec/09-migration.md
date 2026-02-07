# 09. Migration & Transition Plan

## Current State → Target State

**CURRENT STATE** (Pre-Deployment):

- No database
- No Durable Objects
- No Worker code
- No demo infrastructure

**TRANSITION PHASE** (Deploy):

1. Create D1 database
2. Run migrations (create schema)
3. Deploy Worker code
4. Initialize DO bindings
5. Seed 5 SKU records

**TARGET STATE** (Post-Deployment):

- ✓ Worker running on Cloudflare edge
- ✓ D1 database with 5 SKUs seeded
- ✓ 5 DO instances ready for requests
- ✓ WebSocket route configured
- ✓ Demo accessible at `https://revenue-guard.*.workers.dev`

---

## Pre-Deployment Checklist

```markdown
- [ ] npm install && npm run build succeeds
- [ ] npm run lint has no errors
- [ ] npm run test passes all test cases
- [ ] wrangler.jsonc has correct schema
- [ ] D1 database_id populated in wrangler.jsonc
- [ ] RACE_DELAY_MS set to 200ms (or acceptable value)
- [ ] CORS headers configured for dev (localhost:5173)
- [ ] SSL certificate valid (automatic via CF)
- [ ] Environment variables set in wrangler.toml
- [ ] GitHub Actions workflow passing
- [ ] Staging deployment successful
- [ ] Production rollback plan documented
```

---

## Data Migration Strategy

### Step 1: Create Database

```bash
wrangler d1 create revenue-guard-db
# Copy database_id from output to wrangler.jsonc
```

### Step 2: Run Migrations

```bash
# Local testing
wrangler d1 execute revenue-guard-db --local --file=migrations/0001_create_schema.sql

# Production
wrangler d1 execute revenue-guard-db --remote --file=migrations/0001_create_schema.sql
```

### Step 3: Verify Seeding

```bash
wrangler d1 execute revenue-guard-db --remote --command "SELECT * FROM inventory"
# Expected output: 5 rows (sku-001, sku-002, sku-003, sku-004, sku-005)
```

---

## Rollback Procedures

**If Worker Code Has Bugs**:

```bash
# Immediate: Revert to previous version
git revert <current-commit>
wrangler deploy
# Estimated RTO: 2 minutes
```

**If D1 Data is Corrupted**:

```bash
# Option 1: Use /api/reset endpoint
curl -X POST https://revenue-guard.*.workers.dev/api/reset

# Option 2: Restore from snapshot
wrangler d1 execute revenue-guard-db --remote --file=backups/snapshot-2026-02-04.sql

# Estimated RTO: 5 minutes
```

**If Durable Object is Stuck**:

```bash
# DO auto-restarts on next request
# Or force deletion:
wrangler d1 execute revenue-guard-db --remote --command "DELETE FROM allocations"
# Estimated RTO: 30 seconds (CF handles auto-restart)
```

---

See [06-infrastructure.md](06-infrastructure.md) for infrastructure configuration details.
