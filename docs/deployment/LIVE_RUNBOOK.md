# LIVE_RUNBOOK.md: Deployment to demo.cfdemo.link

**Version**: 1.0  
**Status**: 🚀 PRODUCTION READY  
**Primary Target**: `demo.cfdemo.link`

---

## 1. Prerequisites

- [ ] Cloudflare Account with **Workers Paid Plan** (required for Durable Objects).
- [ ] Node.js 20+ and `npm` installed.
- [ ] Logged into Wrangler: `npx wrangler login`.

---

## 2. Infrastructure Setup (One-Time)

### 2.1 Databases & Namespaces

Run the following commands to initialize the required resources:

```bash
# 1. Create D1 Database
npx wrangler d1 create cf-revenue-guard-db

# 2. Create KV Namespace for Sessions
npx wrangler kv:namespace create REVENUE_GUARD_KV

# 3. Create Analytics Engine Dataset (Automatic on first write)
```

**Note**: Copy the `database_id` and KV `id` into your `wrangler.jsonc` file.

### 2.2 Turnstile Registration

1. Go to **Cloudflare Dashboard** > **Turnstile**.
2. Create a new site for `demo.cfdemo.link`.
3. Set domain to `cfdemo.link`.
4. Copy the **Site Key** and **Secret Key**.
5. Update `wrangler.jsonc` or set as a secret:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

---

## 3. Deployment Steps

### 3.1 Backend (Worker)

```bash
# 1. Initialize D1 Schema (Local for verification)
npx wrangler d1 execute cf-revenue-guard-db --local --file=src/worker/db/schema.sql

# 2. Deploy Migrations (Production)
npx wrangler d1 execute cf-revenue-guard-db --remote --file=src/worker/db/schema.sql

# 3. Deploy Worker
npx wrangler deploy
```

### 3.2 Frontend (Pages)

1. Build the project:
   ```bash
   npm run build
   ```
2. Deploy to Cloudflare Pages (via Dashboard or Wrangler):
   ```bash
   npx wrangler pages deploy dist --project-name peakpass-frontend
   ```

---

## 4. Security & WAF Configuration

Manual steps required in the Cloudflare Dashboard:

### 4.1 Custom WAF Rules

1. **Brute-Force Guard**:
   - Expression: `(http.request.uri.path eq "/api/auth/login")`
   - Action: **Managed Challenge**.
2. **Global Rate Limit**:
   - Expression: `(http.request.uri.path starts_with "/api/demo/")`
   - Action: **Rate Limit** (Threshold: 100 requests / 1 minute).

### 4.2 CORS Policies

Ensure the Worker returns correct headers for your Pages domain:

- `Access-Control-Allow-Origin: https://demo.cfdemo.link`

---

## 5. Verification Checklist

- [ ] Visit `https://demo.cfdemo.link`.
- [ ] Verify Turnstile widget appears on login.
- [ ] Complete login → Verify `sess_*` token in LocalStorage.
- [ ] Perform "Safe" allocation → Verify real-time updates via WebSockets.
- [ ] Verify Analytics Engine data:
  ```bash
  npx wrangler analytics-engine dataset cf_revenue_guard_events
  ```
- [ ] Trigger the virtual guardrail (allocate until the 100-unit window trips), confirm `/api/ws` now returns 403 (guardrail triggered) and the WebSocket stream closes, and look for a `VIRTUAL_GUARDRAIL_TRIGGERED` row in the analytics dataset for the sessionId.

---

## 6. Rollback Procedure

### 6.1 Worker Rollback

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to specific ID
npx wrangler rollback [DEPLOYMENT_ID]
```

### 6.2 Frontend Rollback

1. Go to **Cloudflare Pages Dashboard**.
2. Select previous successful deployment.
3. Click **Rollback to this deployment**.

---

## 7. Troubleshooting

- **500 Errors**: Check logs with `npx wrangler tail`.
- **D1 Quota**: Clear old sessions: `npx wrangler d1 execute cf-revenue-guard-db --remote --command "DELETE FROM sessions WHERE expires_at < ..."`
- **WebSocket Failures**: Verify `Upgrade` header is allowed and DO is active.

## 8. Guardrail Telemetry & Runbook Alignment

- **Guardrail Dataset**: Analytics Engine now receives `VIRTUAL_GUARDRAIL_TRIGGERED` events with `blobs: [sessionId, ip, "VIRTUAL_GUARDRAIL_TRIGGERED", skuId]` and `doubles: [virtualCosts, units, latencyMs]`. If you need to inspect them, run `npx wrangler analytics-engine query cf_revenue_guard_events --limit 5` and filter by `sessionId`.
- **Operational Signal**: The Worker stores `guardrailTriggered` on each session and rejects `/api/ws` upgrades once it is true, so live dashboards stop receiving telemetry after the auto-stop. Use the `/api/demo/reset` command to clear the flag before re-testing guardrail behavior.
- **Docs Synchronization**: Keep this runbook and [EDGE_API_SPEC.md Conformance](../implementation/EDGE_API_SPEC_CONFORMANCE.md) aligned—update both whenever the guardrail, WebSocket, or telemetry flows change so operators know what to monitor and expect.
