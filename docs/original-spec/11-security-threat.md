# 11. Security & Threat Modeling

## Threat Model Matrix

| Threat ID | Threat                 | Attack Vector                         | Probability | Impact   | Severity    | Mitigation                                     | Status        |
| --------- | ---------------------- | ------------------------------------- | ----------- | -------- | ----------- | ---------------------------------------------- | ------------- |
| **T1**    | DoS via reset spam     | Attacker calls `/api/reset` 1000x/sec | Medium      | High     | 🔴 CRITICAL | Rate-limit: 1 reset/min per IP                 | ❌ TODO       |
| **T2**    | Duplicate allocations  | Forge userID in POST /api/allocate    | Low         | Medium   | 🟠 HIGH     | Validate userID format (UUID v4), dedupe at DO | ✅ Protected  |
| **T3**    | WebSocket hijacking    | MITM intercepts WS upgrade            | Low         | Medium   | 🟠 HIGH     | Use WSS (HTTPS only), Cloudflare mTLS          | ✅ Protected  |
| **T4**    | API enumeration        | Brute-force valid skuIDs              | Medium      | Low      | 🟡 MEDIUM   | No mitigation (open demo), document acceptable | ⚠️ Acceptable |
| **T5**    | SQL injection          | Attacker submits `"; DROP TABLE;--"`  | Very Low    | Critical | 🔴 CRITICAL | Parameterized queries (prepared statements)    | ✅ Protected  |
| **T6**    | Storage race condition | Concurrent storage.put calls          | Very Low    | Critical | 🔴 CRITICAL | DO serialization prevents concurrent execution | ✅ Protected  |

---

## Encryption Strategy

### HTTPS/TLS (In Transit)

- ✅ All traffic encrypted (TLS 1.3 via Cloudflare)
- ✅ No plaintext HTTP allowed
- ✅ HSTS headers enabled (force HTTPS)

### Storage at Rest

- ✅ DO storage encrypted with Cloudflare's default key
- ✅ D1 database encrypted by Cloudflare
- ⚠️ Future: Customer-managed encryption keys (CMK)

### API Keys/Secrets

- ✓ No API keys required (zero-auth demo)
- ✓ D1 credentials managed by Cloudflare IAM
- Future: If adding external integrations, store in Cloudflare Secrets

---

## Rate Limiting & DDoS Protection

### Cloudflare Edge Protection (Always-on)

- ✅ L3/L4 DDoS mitigation (automatic)
- ✅ WAF rules for common attacks (SQL injection, XSS)
- ✅ IP reputation filtering

### Application-Level Rate Limiting

```
POST /api/allocate:        200 req/min per IP
POST /api/reset:       1 req/min per IP (prevent spam)
POST /api/simulate-rush: 10 req/min per IP (prevent load testing)
GET /api/state:        1000 req/min per IP (allow polling)
```

---

See [02-data-models.md](02-data-models.md) for how parameterized queries protect against SQL injection.
