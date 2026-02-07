# 10. Non-Functional Requirements

## Scalability Analysis

**Primary Bottleneck**: WebSocket connections per Durable Object instance

- Cloudflare limit: ~1000 concurrent connections per DO
- Current design: 5 DO instances (one per SKU)
- **Safe capacity**: 5,000 concurrent viewers

**Secondary Bottleneck**: D1 database throughput

- SQLite is single-writer (but very fast)
- Estimated capacity: 10,000 writes/second (not a practical limit here)

### Scaling Strategy for 10,000 Concurrent Viewers

1. Deploy 2 Worker instances (different regions)
2. Each manages different set of SKUs
3. Total capacity: 10,000 viewers × 1000 = unlimited growth
4. No cross-region sync needed (independent demos)

---

## Reliability Targets

**MTTR/MTBF Goals**:

- **MTTR** (Mean Time To Repair): < 5 minutes
- **MTBF** (Mean Time Between Failures): > 720 hours (30 days)
- **Target Availability**: 99.5% (allowing ~3.6 hours downtime/month)

### Failover Mechanisms

- **DO instance crash**: Auto-restart by Cloudflare (RTO: ~30 seconds)
- **D1 database failure**: Restore from latest snapshot (RTO: ~5 minutes)
- **Network partition**: Requests fail gracefully, user retries (idempotent allocation API)
- **WebSocket disconnect**: Client auto-reconnects with exponential backoff

---

## Observability & SLOs

### Structured Logging (JSON format with all requests)

```json
{
  "timestamp": "2026-02-04T10:30:00Z",
  "request_id": "abc123xyz",
  "level": "INFO",
  "component": "InventoryDO",
  "message": "Allocation confirmed",
  "duration_ms": 45,
  "metadata": {
    "sku_id": "sku-001",
    "user_id": "sim-user-x",
    "allocated_units": 15,
    "available_units": 85,
    "mode": "safe"
  }
}
```

### SLI/SLO Targets

| Service Level Indicator      | Target  | Measurement                 | Alert Threshold   |
| ---------------------------- | ------- | --------------------------- | ----------------- |
| API latency (p99)            | < 500ms | Per /api/allocate request   | > 800ms for 2 min |
| DO availability              | 99.5%   | Uptime / total time         | < 99% for 1 hour  |
| Allocation success rate      | > 99%   | Successful / total attempts | < 98% for 2 min   |
| WebSocket connection success | 99%     | Connected / total attempts  | < 97% for 2 min   |
| Error rate (5xx)             | < 1%    | 5xx responses / total       | > 2% for 2 min    |

### Monitoring Stack

- Log aggregation: `wrangler tail --follow` (development)
- Distributed tracing: OpenTelemetry (future enhancement)
- Metrics: Prometheus-compatible /metrics endpoint (future)
- Alerting: PagerDuty (critical errors only)

---

See [04-detailed-logic.md](04-detailed-logic.md) for the implementation that these SLOs cover.
