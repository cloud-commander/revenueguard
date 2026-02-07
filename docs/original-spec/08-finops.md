# 08. FinOps: Cost & Resource Analysis

## Detailed Cost Breakdown

**Assumptions**:

- Light demo usage (40-50 runs per month)
- Each run: 1 simulation with 125 concurrent requests
- 5 concurrent viewers per run (watching WebSocket updates)
- Audience: Sales demos, customer onboarding, internal presentations

### Monthly Cost Estimate

**Durable Objects**:

- Pricing: $0.15 per million requests
- Usage: 5 instances × 250 requests/month = 1250 requests/month
- **Cost**: (1250 / 1,000,000) × $0.15 = **$0.00019 / month**

**D1 Database**:

- Pricing: $0.25 per million database operations
- Usage: ~125 queries per demo × 40 demos = 5,000 ops/month
  - SELECT allocated_units: 125 ops
  - UPDATE allocated_units: 125 ops
  - INSERT allocations: 125 ops
  - Reset (DELETE + UPDATE): 2 ops per reset
- **Cost**: (5,000 / 1,000,000) × $0.25 = **$0.00125 / month**

**Workers Requests**:

- Pricing: Free tier includes 100,000 requests/day (3M/month)
- Usage: (40 demos × 125 requests) + (5 viewers × 30min × 10 msgs/sec) = ~400K ops/month
- **Cost**: FREE (well under limit)

**Bandwidth**:

- Pricing: Free tier includes 1 TB egress/month
- Usage: ~3.5MB total
- **Cost**: FREE (well under limit)

**TOTAL ESTIMATED MONTHLY COST: $0.0015** (less than one penny)

---

## Cost Controls & Monitoring

**Prevent Runaway Costs**:

```markdown
1. **Rate Limiting**:
   - /api/reset: Max 1 per minute per IP (prevent accidental spam)
   - /api/allocate: Max 200 per minute per IP (normal allocations)
   - /api/simulate-rush: Max 10 per minute per IP (prevent load testing)

2. **Connection Limits**:
   - WebSocket connections: 1000 per DO instance
   - Session timeout: 1 hour (force reconnect for stale connections)
   - Max active demos: 5 concurrent (warn at 4, block at 5)

3. **Database Quotas**:
   - D1 row limit: Monitor at 1M rows, alert at 800K rows
   - Table cleanup: Auto-delete allocations older than 30 days
   - Backup: Daily snapshot to external storage

4. **Monitoring**:
   - Alert if error rate > 1% for 2 minutes
   - Alert if DO crashes > 3 times per day
   - Alert if D1 quota > 80%
   - Daily cost report (automated)
```

---

## Scaling Scenarios

**Scenario 1: Heavy Demo Usage (500 demos/month)**

- Monthly cost: ~$0.003 (still negligible)
- Bottleneck: DO throughput (1000 req/s per instance)
- Solution: Shard to 5 DO instances per SKU (already designed)

**Scenario 2: Customer Self-Service (1000+ concurrent viewers)**

- Monthly cost: ~$0.01
- Bottleneck: WebSocket connections per DO (1000 limit)
- Solution: Deploy to 5 regions, shard viewers by geography

**Scenario 3: High-Frequency Load Testing (10,000 reqs/month)**

- Monthly cost: ~$0.0015
- Bottleneck: D1 disk space (not request limit)
- Solution: Implement hourly cleanup, use separate D1 instance

---

## Cost vs. Alternative Approaches

| Approach                  | Cost/Month | Consistency | Latency  | Operational Burden   |
| ------------------------- | ---------- | ----------- | -------- | -------------------- |
| **Current (DO + D1)**     | $0.0015    | Strong      | 50-200ms | None (fully managed) |
| KV + eventual consistency | $0.0001    | Weak        | 5ms      | None                 |
| Workers + Redis           | $0.50+     | Strong      | 50ms     | Redis ops overhead   |
| EC2 + PostgreSQL          | $50+       | Strong      | 10ms     | Full ops team        |
| Managed PostgreSQL        | $20+       | Strong      | 10ms     | Credential mgmt      |

**Conclusion**: Durable Objects provide the best cost-to-consistency ratio for this use case.

---

See [07-architecture-decisions.md](07-architecture-decisions.md) for related trade-off analysis.
