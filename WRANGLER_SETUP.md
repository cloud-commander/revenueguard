# Wrangler Configuration Guide

**This guide covers local development, production deployment, and quota scaling configuration.**

## Quick Navigation

- **New to the project?** → Start with [Development Environment](#development-environment)
- **Deploying to production?** → Jump to [Production Environment](#production-environment)
- **Cost control on $5 plan?** → See [Quota Scaling](#quota-scaling-configuration)
- **Troubleshooting?** → Check [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting, you'll need:

- ✅ **Node.js** 20+ and npm (run: `node --version`)
- ✅ **Cloudflare account** (with billing enabled for production)
- ✅ **Wrangler CLI** (installed via `npm install` in this project)
- ✅ **Domain** (for production routing; can use `*.workers.dev` initially)

For production, also gather (don't need yet):

- Cloudflare API token (from Cloudflare Dashboard)
- (Optional) Turnstile secret for CAPTCHA protection

---

## Development Environment

### Quick Start (Local Testing)

**Option A: Run everything together**

```bash
npm run dev:full
# Starts: React frontend (port 5173) + Worker (port 8787)
```

**Option B: Run worker only**

```bash
npm run dev:worker
# Starts: Worker backend (port 8787)
# Frontend: Run `npm run dev` in another terminal
```

### Configuration (Development)

- **D1 Database**: SQLite on disk (stored in `.wrangler/`)
- **KV Namespace**: In-memory (cleared on restart)
- **Durable Objects**: Local storage
- **Turnstile**: Uses `DEBUG_TOKEN` (always passes, no real CAPTCHA)
- **Costs**: Free (100% simulated, `BILLING_SCALE=0.0001`)

### First Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Start development environment
npm run dev:full

# 3. Open browser
# Frontend: http://localhost:5173
# Worker API: http://localhost:8787
```

### Data Persistence in Development

- **D1 (Database)**: Stored in `.wrangler/` on disk—persists between runs
- **KV (Cache)**: In-memory only—cleared when worker restarts
- **Reset local DB** (if data is corrupted):
  ```bash
  rm -rf .wrangler/
  npm run dev:worker  # Creates fresh DB with schema
  ```

---

## Production Environment

### Step-by-Step Deployment

> **⏱️ Estimated time:** 10 minutes

#### Step 1: Create D1 Database

```bash
wrangler d1 create cf-revenue-guard-db
```

**Output will show:**

```
✓ Successfully created DB
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Action:** Copy the `database_id` value. You'll use it in Step 4.

---

#### Step 2: Create KV Namespace

```bash
wrangler kv:namespace create REVENUE_GUARD_KV
```

**Output will show:**

```
id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
preview_id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
```

**Action:** Copy both `id` and `preview_id` values. You'll use them in Step 4.

---

#### Step 3: Configure Secrets (Optional)

**Only if using Turnstile CAPTCHA:**

```bash
wrangler secret put TURNSTILE_SECRET --env production
```

When prompted, paste your Turnstile secret key from Cloudflare dashboard.

**Verify it was saved:**

```bash
wrangler secret list --env production
```

---

#### Step 4: Update `wrangler.jsonc`

Open `wrangler.jsonc` and update the `env.production` section with IDs from Steps 1–2:

```jsonc
"production": {
  "d1_databases": [
    {
      "database_id": "<paste ID from Step 1>"
    }
  ],
  "kv_namespaces": [
    {
      "id": "<paste id from Step 2>",
      "preview_id": "<paste preview_id from Step 2>"
    }
  ],
  "routes": [
    {
      "pattern": "revenue-guard.your-domain.com/*",  // ← Change to your domain
      "zone_name": "your-domain.com"                 // ← Change to your domain
    }
  ]
}
```

**Note:** Routes are optional for testing. You can use the `*.workers.dev` domain initially.

---

#### Step 5: Deploy to Production

```bash
npm run deploy:worker
```

Or manually:

```bash
wrangler deploy --env production
```

**Output will show:**

```
✓ Deployed to https://cf-peakpass.your-account.workers.dev
```

---

#### Step 6: Verify Deployment

**Test the login endpoint:**

```bash
curl -X POST https://cf-peakpass.your-account.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"mock-token-123"}'
```

**Expected response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_...",
    "expiresAt": 1707432000000,
    "throttleLevel": "normal",
    "forcesMockOnly": false
  }
}
```

---

## Configuration Reference

### Environment Variables (Dev vs. Production)

| Variable           | Development   | Production |                   Purpose                   |
| :----------------- | :------------ | :--------- | :-----------------------------------------: |
| `BILLING_SCALE`    | `0.0001`      | `0.0001`   |  Simulated cost multiplier (10^-4 = free)   |
| `TURNSTILE_SECRET` | `DEBUG_TOKEN` | Your key   |         CAPTCHA secrets (optional)          |
| `DEMO_COST_LIMIT`  | `1000000`     | `1000000`  |        Hard cutoff after N requests         |
| `ALERT_THRESHOLD`  | `500000`      | `500000`   | Warning when reaching this cost %(optional) |

### Getting Resource IDs (If You Need to Look Them Up Later)

```bash
# List D1 databases
wrangler d1 list

# List KV namespaces
wrangler kv:namespace list

# Search wrangler.jsonc
grep -A 5 'database_id\|kv_namespaces' wrangler.jsonc
```

---

## Common Tasks

### Run Both Frontend & Backend Locally

```bash
# Single command (recommended - runs both in parallel)
npm run dev:full
```

Then open: http://localhost:5173

**Or manually in separate terminals:**

```bash
# Terminal 1:
npm run dev          # Vite frontend on :5173

# Terminal 2:
npm run dev:worker   # Worker backend on :8787
```

**Toggle between live/mock mode:**

- Open browser console (F12)
- Run: `localStorage.setItem('demo-api-mode', 'live');` (or change to `'mock'`)
- Refresh page

---

### Test Production Build (Without Deploying)

```bash
# Check TypeScript compilation
npm run build

# Or preview production deployment (no actual deploy)
wrangler deploy --env production --dry-run
```

---

### View Production Logs

```bash
# Stream logs in real-time
wrangler tail --env production --follow

# Or view a specific deployment
wrangler deployments list --env production
```

---

### Reset Production Data (⚠️ Destructive)

```bash
# Delete all inventory and session data
wrangler d1 execute cf-revenue-guard-db --env production --command \
  "DELETE FROM inventory; DELETE FROM sessions;"
```

Use only if data is corrupted or you need a fresh start.

---

### Verify Quota Tracking Is Active

After logging in to your live session, check quota status:

```bash
# First, get a session ID by logging in
SESSION=$(curl -s -X POST https://your-worker.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"mock-token"}' | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)

# Then check quota
curl -H "Authorization: Bearer $SESSION" \
  https://your-worker.workers.dev/api/quota/status
```

**Expected response:**

```json
{
  "success": true,
  "data": {
    "cpuUsedMs": 100000,
    "cpuRemainingMs": 29900000,
    "cpuLimitMs": 30000000,
    "throttleLevel": "normal",
    "percentageUsed": 0
  }
}
```

✅ If you see this, quota scaling is working!

---

## Quota Scaling Configuration

Dynamic quota throttling ensures the demo stays within the $5/month Workers plan budget during 24/7 operation. Configure these optional environment variables in `wrangler.jsonc`:

### Default Configuration (30M CPU-ms budget)

No changes needed—defaults are pre-optimized for:

- **Single session**: ~7–8% CPU consumption (24/7)
- **3 concurrent sessions**: ~19–22% CPU consumption (24/7)

### Custom Examples

#### Scenario 1: Conservative (Shared Plan)

If the Workers plan is shared across multiple applications, reduce the budget:

```jsonc
"env": {
  "production": {
    "vars": {
      "QUOTA_CPU_MS": "15000000",           // 15M CPU-ms (50% of plan)
      "QUOTA_SLOW_THRESHOLD": "0.60",       // Slow at 60% (9M consumed)
      "QUOTA_CRITICAL_THRESHOLD": "0.85"    // Critical at 85% (12.75M consumed)
    }
  }
}
```

**Effect**: Throttling engages earlier, preserving quota for other apps.

---

#### Scenario 2: Aggressive (Dedicated Plan + Unbound)

For high-concurrency deployments on Workers Unbound (higher quota):

```jsonc
"env": {
  "production": {
    "vars": {
      "QUOTA_CPU_MS": "50000000",           // 50M CPU-ms (Unbound tier)
      "QUOTA_SLOW_THRESHOLD": "0.45",       // Slow at 45% (22.5M consumed)
      "QUOTA_CRITICAL_THRESHOLD": "0.75"    // Critical at 75% (37.5M consumed)
    }
  }
}
```

**Effect**: More lenient thresholds allow higher concurrency before throttling.

---

#### Scenario 3: Peak Hours Pause

Automatically pause allocations during business hours when quota is low:

```jsonc
"env": {
  "production": {
    "vars": {
      "QUOTA_PEAK_HOURS_ENABLED": "true",
      "QUOTA_PEAK_HOURS_START": "9",        // 9 AM
      "QUOTA_PEAK_HOURS_END": "17",         // 5 PM
      "QUOTA_PEAK_HOURS_PAUSE_THRESHOLD": "0.60",  // Pause when > 60% used
      "QUOTA_PEAK_HOURS_TIMEZONE": "America/New_York"
    }
  }
}
```

**Effect**: Demo operations pause during business hours if budget is depleted, preserving quota for other times.

---

### CPU Estimate Overrides

Fine-tune how much CPU each operation "costs" (for simulation purposes):

```jsonc
"vars": {
  "QUOTA_CPU_LOGIN_MS": "50",       // CPU cost per login
  "QUOTA_CPU_ALLOCATE_MS": "50",    // CPU cost per allocation
  "QUOTA_CPU_STATE_MS": "20"        // CPU cost per state fetch
}
```

### Polling Frequency Overrides

Adjust how often the client polls quota status (useful for high-latency networks):

```jsonc
"vars": {
  "QUOTA_POLL_INTERVAL_NORMAL": "10",     // Poll every 10s when normal
  "QUOTA_POLL_INTERVAL_SLOW": "5",        // Poll every 5s when throttled
  "QUOTA_POLL_INTERVAL_CRITICAL": "3"     // Poll every 3s when critical
}
```

### Future Enhancements Configuration

Once implemented, these will be available:

```jsonc
// Webhooks (for Slack/Teams alerts)
"QUOTA_WEBHOOK_URL": "https://hooks.slack.com/services/...",
"QUOTA_WEBHOOK_SECRET": "sk_test_xyz",

// Regional failover
"QUOTA_FAILOVER_ENABLED": "true",
"QUOTA_PRIMARY_REGION": "us-west",
"QUOTA_FALLBACK_REGION": "eu-west",

// Admin dashboard
"ADMIN_KEY": "sk_admin_xyz"
```

### Deployment

Apply configuration via CLI:

```bash
# Deploy with custom quota settings
wrangler deploy --env production --define QUOTA_CPU_MS:15000000 QUOTA_SLOW_THRESHOLD:0.60

# Or update wrangler.jsonc and deploy normally
npx wrangler deploy --env production
```

### Verification

Check that quota tracking is active:

```bash
# Query quota status (replace TOKEN with a valid session ID)
curl -H "Authorization: Bearer SESSION_TOKEN" \
  https://revenue-guard.example.com/api/quota/status
```

Expected response:

```json
{
  "success": true,
  "data": {
    "cpuUsedMs": 2400000,
    "cpuRemainingMs": 27600000,
    "cpuLimitMs": 30000000,
    "throttleLevel": "normal",
    "percentageUsed": 8
  }
}
```

---

## Troubleshooting

### "database_id: REPLACE_WITH_PRODUCTION_DB_ID"

**Problem:** Deployment fails or shows this placeholder in error message.

**Solution:** You haven't created a D1 database yet. Run:

```bash
wrangler d1 create cf-revenue-guard-db
```

Copy the `database_id` from the output, then update `wrangler.jsonc`:

```jsonc
"env": {
  "production": {
    "d1_databases": [{
      "binding": "REVENUE_GUARD_DB",
      "database_id": "YOUR_ID_HERE",  // ← Paste it here
      "database_name": "cf-revenue-guard-db"
    }]
  }
}
```

---

### "Cannot find module '@cloudflare/workers-types'" or TypeScript errors

**Problem:** Build fails with missing module or type errors.

**Solution:** Install dependencies:

```bash
npm install
```

If that doesn't work, clean and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

---

### "Local binding 'REVENUE_GUARD_KV' not found" (Development)

**Problem:** Worker startup fails when you run `npm run dev:worker`.

**Solution:** You're trying to reference production bindings locally. This is expected—use the correct dev command:

```bash
# Correct
npm run dev:worker

# Or explicitly
wrangler dev --env development
```

The development environment has mocked KV/D1 automatically.

---

### Development Worker Won't Start or Hangs

**Problem:** `npm run dev:worker` doesn't finish, or exits immediately.

**Solution:**

1. **Kill any existing process on port 8787:**

   ```bash
   lsof -i :8787 | grep -v PID | awk '{print $2}' | xargs kill -9
   ```

2. **Try again:**

   ```bash
   npm run dev:worker
   ```

3. **If it still doesn't work**, check for TypeScript errors:
   ```bash
   npm run build
   ```
   Fix any errors, then retry.

---

### D1 Migrations Don't Apply Automatically (Production)

**Problem:** Production deployment succeeds but tables don't exist; queries fail with "no such table".

**Solution:** Apply migrations manually (rare—they usually auto-apply on first deploy):

```bash
wrangler d1 migrations apply cf-revenue-guard-db --env production
```

---

### Production Deployment Hangs or Times Out

**Problem:** `wrangler deploy --env production` doesn't finish after 5+ minutes.

**Solution:**

1. **Cancel (Ctrl+C) and check your network:**

   ```bash
   # Ensure you're connected
   ping 1.1.1.1
   ```

2. **Retry with verbose output:**

   ```bash
   wrangler deploy --env production -v
   ```

3. **If still hanging, update Wrangler:**

   ```bash
   npm install -g @cloudflare/wrangler@latest
   ```

4. **Last resort:** Clear Wrangler cache and try again:
   ```bash
   rm -rf ~/.wrangler
   wrangler deploy --env production
   ```

---

### CAPTCHA/Turnstile Not Working

**Problem:** Login always fails with CAPTCHA error.

**Solution:**

**Development:** Use `DEBUG_TOKEN` as your Turnstile token—it always passes without real CAPTCHA validation.

**Production:** If login fails after deployment:

1. Go to Cloudflare Dashboard → **Turnstile**
2. Copy your site's **secret key** (NOT the site key)
3. Store it securely using Wrangler:
   ```bash
   wrangler secret put TURNSTILE_SECRET --env production
   # Paste your secret when prompted
   ```
4. Redeploy:
   ```bash
   wrangler deploy --env production
   ```

⚠️ **Never hardcode secrets in `wrangler.jsonc`—always use `wrangler secret put`.**

---

### Quota Not Tracking (Shows 0%)

**Problem:** `/api/quota/status` always shows 0% CPU used despite making requests.

**Solution:**

1. **Quota tracking is asynchronous.** Wait 3–5 seconds after making requests.

2. **Verify KV storage is working:**

   ```bash
   wrangler kv:key list --namespace-id YOUR_KV_ID | grep quota
   ```

3. **Trigger a manual CPU recording by making a request:**

   ```bash
   # 1. Get a session
   SESSION=$(curl -s -X POST https://your-worker.workers.dev/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"turnstileToken":"DEBUG_TOKEN"}' | jq -r '.sessionId')

   # 2. Make an allocation request
   curl -X POST https://your-worker.workers.dev/api/demo/allocate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $SESSION" \
     -d '{"skuId":"sku-001","mode":"live","units":1}'

   # 3. Wait 5 seconds
   sleep 5

   # 4. Check quota
   curl https://your-worker.workers.dev/api/quota/status
   ```

4. **Check KV value directly:**
   ```bash
   # Use KV Dashboard in Cloudflare console
   # Look for key: quota:2024-01 (where 2024-01 is current month)
   ```

---

### "Unauthorized" Error on Protected Endpoints

**Problem:** `/api/demo/allocate`, `/api/demo/state` return 401 error.

**Solution:** You need a valid session ID. Get one:

```bash
# Step 1: Login to get session
curl -X POST https://your-worker.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"DEBUG_TOKEN"}' | jq .

# Step 2: Copy sessionId from response
# Step 3: Use it in protected endpoint
curl -X GET https://your-worker.workers.dev/api/demo/state \
  -H "Authorization: Bearer YOUR_SESSION_ID"
```

---

### Frontend Not Connecting to Worker Backend

**Problem:** Frontend shows "Unable to connect" or network errors in browser console.

**Solution:**

1. **Check that worker is running:**

   ```bash
   curl http://localhost:8787/health
   ```

2. **Verify correct URLs in frontend config** (`src/config/`):
   - Dev: `http://localhost:8787` or `http://127.0.0.1:8787`
   - Production: `https://your-worker.workers.dev`

3. **Check browser console for CORS errors.** If present, ensure Worker has:
   ```typescript
   c.header("Access-Control-Allow-Origin", "*");
   ```

---

## Next Steps

✅ **Local Development?**

- Run: `npm run dev:full`
- Open: http://localhost:5173
- API requests to: http://localhost:8787

✅ **Production Deployment?**

- Follow [Step-by-Step Deployment](#step-by-step-deployment) above
- Configure [Quota Scaling](#quota-scaling-configuration) for cost control

✅ **Monitor Production?**

```bash
wrangler tail --env production --follow
```

✅ **Need More Help?**

- Full API reference: [LIVE_WORKER_GUIDE.md](docs/implementation/LIVE_WORKER_GUIDE.md)
- Cost analysis: [QUOTA_SCALING.md](docs/implementation/QUOTA_SCALING.md)
