# 13. Deployment & Operational Plan

## CI/CD Pipeline

**GitHub Actions Workflow** (`deploy.yml`):

```yaml
name: Deploy Revenue Guard
on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint
      - run: bun run test
      - run: bun run type-check

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      - run: echo "✅ Deployed to production"
```

---

## Operational Runbook

### Issue: DO instance crashes repeatedly

```
Symptom: Users can't allocate, wrangler tail shows durable_object_error
Root causes: Memory leak, infinite loop, storage corruption

Resolution:
  1. Check recent commits: git log --oneline -10
  2. Check logs: wrangler tail --format pretty
  3. Force restart: Calls to DO trigger auto-restart
  4. If persists: Delete DO instance (CF will recreate on next request)
     wrangler do delete <instance-id>
  5. Reset state: POST /api/reset

Escalation: Page on-call SRE if >5 crashes/day
Prevention: Monitor crash rate hourly, alert at >2/hour
```

### Issue: D1 database quota exceeded

```
Symptom: Error "database quota exceeded" in /api/allocate responses
Root causes: Too many allocations (> quota), large transaction log

Resolution:
  1. Check quota: wrangler d1 info revenue-guard-db
  2. Clear old data: DELETE FROM allocations WHERE created_at < (now - 30 days)
  3. Run VACUUM: VACUUM
  4. Upgrade plan if needed: Contact Cloudflare sales

Prevention: Monitor usage hourly, alert at 80% quota
Alternative: Implement hourly cleanup job
```

### Issue: WebSocket connections dropping

```
Symptom: Users see "Connection lost" message, need to refresh
Root causes: Network timeout, DO hibernation waking badly, client crash

Resolution:
  1. Check network tab in DevTools
  2. Check browser console for errors
  3. Client auto-reconnects (should be transparent)
  4. If persists: Clear browser cache, hard refresh (Ctrl+Shift+R)

Prevention: Monitor WebSocket error rate, alert if >1%
Logs: wrangler tail --format pretty | grep WebSocket
```

### Issue: High latency (>1 second)

```
Symptom: POST /api/allocate taking 1-2 seconds
Root causes: DO under load, D1 slow query, network congestion

Resolution:
  1. Check concurrent allocations: wrangler tail | grep "allocatedUnits"
  2. Monitor DO CPU: Cloudflare dashboard
  3. Profile D1 query: Check slow query log
  4. Shard more DO instances if needed

Prevention: Set alert if p99 latency > 500ms for >2 minutes
Metrics: Collect latency histogram, review monthly
```

---

## Database Migration Strategy During Deployment

### Safe Migration Pattern (zero downtime)

**Adding a new field**:

1. Create migration: `ALTER TABLE allocations ADD COLUMN source TEXT`
2. Deploy migration (new field is NULL for existing rows)
3. Deploy code that reads/writes new field (handles NULL gracefully)
4. No downtime, no blocking calls ✓

**Removing a field (dangerous)**:

1. ❌ DON'T: Delete column in one step (old code breaks)
2. ✓ DO: Step 1 - Deploy code that ignores the field
3. ✓ DO: Step 2 - Wait 24 hours for all requests to use new code
4. ✓ DO: Step 3 - Deploy migration that deletes field
5. Zero downtime, safe rollback ✓

---

## Alerting & Incident Response

### Alert Rules (in Datadog or PagerDuty)

```
🔴 CRITICAL (Page on-call):
  - Error rate > 5% for 2+ minutes
  - Latency p99 > 2 seconds for 5+ minutes
  - DO crash count > 5 in 1 hour
  - D1 quota > 90%

🟠 WARNING (Slack #incidents):
  - Error rate > 1% for 5+ minutes
  - Latency p99 > 500ms for 5+ minutes
  - WebSocket disconnect rate > 5%
  - DO memory usage > 70%

🟡 INFO (Auto-escalate):
  - DO instance restarted
  - WebSocket timeout
  - Cache miss spike
```

### Incident Response SOP

1. Alert received → Acknowledge in PagerDuty
2. Assess severity (is demo down? Is data corrupted?)
3. Implement immediate mitigation (restart, rollback, reset)
4. Root cause analysis (review logs, commit history)
5. Implement permanent fix (code change, config update)
6. Post-mortem (document lessons learned)

---

See [09-migration.md](09-migration.md) for pre-deployment checklist and rollback procedures.
