# Live Worker Implementation Guide

## Overview

The Cloudflare Worker implementation is now **fully scaffolded** with all required endpoints:

- ✅ `/api/auth/login` - Turnstile verification + KV session storage
- ✅ `/api/auth/me` - Session validation (NEW)
- ✅ `/api/demo/allocate` - Atomic allocations (safe mode via DO, eventual mode via D1)
- ✅ `/api/demo/reset` - Inventory reset
- ✅ `/api/demo/state` - Inventory state query
- ✅ **InventoryGuard** - Durable Object for atomic operations

## Architecture

### Authentication Flow

```
Client → login(turnstileToken) → POST /api/auth/login
         ↓
         Turnstile verification (challenges.cloudflare.com)
         ↓
         Generate sessionId → KV storage (1200s TTL)
         ↓
         Return {success, data: {sessionId, expiresAt, ipAddress}, meta}

Later:
Client → getCurrentSession() → GET /api/auth/me (with Authorization: Bearer <sessionId>)
         ↓
         KV lookup + TTL validation
         ↓
         Return {success, data: {sessionId, expiresAt, ipAddress}, meta}
```

### Allocation Flow (Safe Mode - Atomic)

```
Client → allocateSafe(skuId, units) → POST /api/demo/allocate
         {skuId, units, mode: "safe"}
         ↓
         Session validation (via KV)
         ↓
         Rate limiting check (KV counter: 200/min per session)
         ↓
         Cost guardrails: real_cost + session.costs ≤ DEMO_COST_LIMIT (0.0)
         ↓
         DO call: InventoryGuard.fetch() → /allocate
         ↓
         Atomic check: available_units >= requested_units
         ↓
         If safe: inventory.allocated += units → storage → return success
         If fail: return OUT_OF_STOCK
         ↓
         Update session costs in KV
         ↓
         Write Analytics Engine event (ALLOCATION_SUCCESS_SAFE)
         ↓
         Return {success, data: {unitsAvailable, totalAllocated, revenueGenerated}, meta}
```

### Allocation Flow (Eventual Mode - Race Condition Demonstrator)

```
Client → allocateEventual(skuId, units) → POST /api/demo/allocate
         {skuId, units, mode: "eventual"}
         ↓
         Session validation + cost guardrails (same as safe)
         ↓
         D1 operations (demonstrating race condition):
         1. READ: SELECT allocated, total_stock FROM inventory WHERE session_id=?, sku_id=?
         2. SIMULATE LATENCY: await 100ms
         3. WRITE: UPDATE inventory SET allocated = allocated + ?
         ↓
         Overselling possible during latency window (intentional demo)
         ↓
         Return {success, data: {..., oversellDelta}, meta}
```

## Local Development Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm i wrangler@latest -g` or use local `npm run dev:worker`)
- Cloudflare account (for real Turnstile verification; use `DEBUG_TOKEN` for dev)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create or verify `.env` file:

```env
VITE_API_MODE=mock
VITE_API_BASE_URL=http://localhost:8787
```

For live mode during testing, temporarily override:

```env
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:8787
```

### 3. Set Up Wrangler Configuration

Edit `wrangler.jsonc` and replace placeholders:

#### Option A: Development (Local/In-Memory)

```bash
# Wrangler handles this automatically with --local flag
# Uses SQLite for D1, memory-based KV, and local DO storage
npm run dev:worker
```

#### Option B: Cloudflare Development Account

```bash
# Create D1 database
wrangler d1 create cf-revenue-guard-db

# Create KV namespace
wrangler kv:namespace create REVENUE_GUARD_KV

# Get IDs from output and update wrangler.jsonc:
wrangler d1 list
wrangler kv:namespace list

# Update wrangler.jsonc with real IDs:
# - d1_databases[0].database_id = "xxxxxxxx-xxxx-..."
# - kv_namespaces[0].id = "xxxxxxxx-xxxx-..."
```

Set Turnstile credentials in `wrangler.jsonc`:

```jsonc
"vars": {
  "TURNSTILE_SECRET": "your_turnstile_secret_key_here"
}
```

### 4. Run Locally

#### Mock Mode Only (No Worker)

```bash
npm run dev
# Visit http://localhost:5173
# Uses in-memory mock API (no Turnstile needed)
```

#### With Live Worker (Recommended for Testing)

Terminal 1: React app

```bash
npm run dev
```

Terminal 2: Wrangler Worker (local)

```bash
npm run dev:worker
```

Then update `.env` to:

```env
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:8787
```

Or toggle in browser dev console:

```javascript
// Access localStorage
localStorage.setItem("demo-api-mode", "live");
location.reload();
```

### 5. Run Both Simultaneously (Optional)

```bash
npm install -D concurrently
npm run dev:full
```

## Testing Checklist

### Mock Mode (No Worker Required)

- [ ] UI loads without errors
- [ ] Can click "Login demo user" → session stored in localStorage
- [ ] Allocate safe/eventual buttons work → inventory updates in real-time
- [ ] Reset button clears inventory
- [ ] Session countdown timer shows 20 minutes
- [ ] Guardrail banner appears when approaching virtual limit ($100)

### Live Mode (With Worker)

#### 1. Authentication

```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"DEBUG_TOKEN"}'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_...",
    "expiresAt": 1704528000000,
    "ipAddress": "127.0.0.1"
  },
  "meta": {
    "requestId": "req_...",
    "timestamp": 1704527400000
  }
}
```

#### 2. Session Validation

```bash
SESSIONID="sess_..."
curl -X GET http://localhost:8787/api/auth/me \
  -H "Authorization: Bearer $SESSIONID"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_...",
    "expiresAt": 1704528000000,
    "ipAddress": "127.0.0.1"
  },
  "meta": {
    "requestId": "req_...",
    "timestamp": 1704527400000
  }
}
```

#### 3. Safe Allocation (Atomic via DO)

```bash
curl -X POST http://localhost:8787/api/demo/allocate \
  -H "Authorization: Bearer $SESSIONID" \
  -H "Content-Type: application/json" \
  -d '{"skuId":"sku-001","units":10,"mode":"safe"}'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "unitsAvailable": 990,
    "totalAllocated": 10,
    "revenueGenerated": 0.0000000000015 // 10 * 150 * 0.000000001
  },
  "meta": {
    "requestId": "req_...",
    "timestamp": 1704527400000,
    "guardrailTriggered": false,
    "virtualCosts": 1500 // 10 units * $150/unit
  }
}
```

#### 4. Eventual Allocation (Race Condition Demo)

```bash
curl -X POST http://localhost:8787/api/demo/allocate \
  -H "Authorization: Bearer $SESSIONID" \
  -H "Content-Type: application/json" \
  -d '{"skuId":"sku-001","units":500,"mode":"eventual"}'
```

Expected response (may oversell):

```json
{
  "success": true,
  "data": {
    "unitsAvailable": 490,
    "totalAllocated": 510,
    "revenueGenerated": 0.000000000075,
    "oversellDelta": 10 // 10 units oversold (race condition)
  },
  "meta": {
    "guardrailTriggered": true,
    "virtualCosts": 76500
  }
}
```

#### 5. Reset Inventory

```bash
curl -X POST http://localhost:8787/api/demo/reset \
  -H "Authorization: Bearer $SESSIONID"
```

Expected response:

```json
{
  "success": true,
  "data": { "success": true },
  "meta": {
    "requestId": "req_...",
    "timestamp": 1704527400000
  }
}
```

## Guardrails & Safety

### Real Billing Protection (Hard Lock)

- **BILLING_SCALE**: `0.000000001` (10^-9)
  - Real units calculation: `units * price * BILLING_SCALE`
  - Example: 10 units × $150/unit × 10^-9 = $0.0000000015 ≈ $0
- **DEMO_COST_LIMIT**: `0.0`
  - Rejects any allocation if `session.costs + totalCost > 0.0`
  - Prevents accidental billing

### Virtual Demo Limit (Gamification)

- **VIRTUAL_LIMIT**: 100 virtual dollars
- Counts `units * $150/unit` (without scaling)
- Triggers guardrail UI alert, but doesn't block allocation
- Demonstrates cost accumulation without real spending

### Rate Limiting

- **Login**: 10/min per IP
- **Allocate**: 200/min per session
- **Reset**: 1/min per IP
- Implemented via KV counters with 60s TTL

### Session Management

- **TTL**: 1200 seconds (20 minutes)
- **Storage**: KV (in-memory during dev, persistent on Cloudflare)
- **Validation**: /auth/me checks expiration

## Deployment to Cloudflare

### 1. Prepare Production Configuration

```jsonc
{
  "vars": {
    "BILLING_SCALE": "0.000000001",
    "DEMO_COST_LIMIT": "0.0",
    "ALERT_THRESHOLD": "0.0",
    "TURNSTILE_SECRET": "production_secret_key",
  },
}
```

### 2. Create Resources

```bash
# Create D1 database
wrangler d1 create cf-revenue-guard-db --remote

# Update wrangler.jsonc with production database_id

# Create KV namespace
wrangler kv:namespace create REVENUE_GUARD_KV --remote

# Update wrangler.jsonc with production KV id
```

### 3. Deploy Worker

```bash
npm run deploy:worker
```

### 4. Update Frontend .env

```env
VITE_API_MODE=live
VITE_API_BASE_URL=https://cf-revenue-guard-worker.{account}.workers.dev
```

## Troubleshooting

### "Cannot find module 'cloudflare:workers'"

- Ensure `@cloudflare/workers-types` is installed: `npm install`
- Check `tsconfig.app.json` includes worker files or create `tsconfig.worker.json`

### Turnstile verification fails

- In dev, use token: `DEBUG_TOKEN`
- In production, ensure `TURNSTILE_SECRET` is set correctly in wrangler.jsonc
- Verify CORS: check `ALLOWED_ORIGINS` in `src/worker/index.ts`

### D1 queries fail ("no such table")

- Migrations must be run: `wrangler d1 migrations apply cf-revenue-guard-db --local`
- Or deploy runs migrations automatically

### KV get returns null

- In local mode (`--local`), KV is memory-based and persists only during session
- After restart, data is lost (expected for dev)
- Use `--persist` flag: `wrangler dev --local --persist`

### Session expires immediately

- Check KV TTL: should be 1200s
- Check `expiresAt` returned from login: should be `Date.now() + 20*60*1000`

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Project Spec](../../docs/original-spec/EDGE_API_SPEC.md)
