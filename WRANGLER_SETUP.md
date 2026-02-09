# Wrangler Configuration Guide

## Overview

`wrangler.jsonc` now has clear **development** and **production** environment sections. This allows you to:

- **Development** (`--env development`): Local testing with in-memory/SQLite services
- **Production** (`--env production`): Real Cloudflare resources (D1, KV, DO, Analytics)

---

## Development Environment

### Usage

```bash
# Default (uses development env)
npm run dev:worker
# Equivalent to: wrangler dev

# Explicit
wrangler dev --env development
```

### Configuration

- **D1 Database**: `dev-local` (SQLite on disk)
- **KV Namespace**: `dev-local` (in-memory)
- **Durable Objects**: Local storage
- **Turnstile Secret**: `DEBUG_TOKEN` (bypass verification for testing)
- **Billing Scale**: `0.000000001` (zero-cost)
- **Cost Limit**: `0.0` (hard block)

### First Time Setup

```bash
# 1. Ensure dependencies are installed
npm install

# 2. Start dev worker (creates local DB/KV automatically)
npm run dev:worker

# 3. In another terminal, test endpoints
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"DEBUG_TOKEN"}'
```

### Persistent Local Data

By default, D1 data is stored in `.wrangler/` and persists between runs.

To reset local database:

```bash
rm -rf .wrangler/
npm run dev:worker  # Creates fresh DB with schema
```

---

## Production Environment

### Usage

```bash
# Deploy to production
wrangler deploy --env production

# Check deployment
wrangler deployments list --env production
```

### How to Set Up

#### 1. Create D1 Database

```bash
# Create database (may take a moment)
wrangler d1 create cf-revenue-guard-db

# Copy the database_id from the output
# Update wrangler.jsonc:
#   env.production.d1_databases[0].database_id = "<ID from above>"
```

#### 2. Create KV Namespace

```bash
# Create main namespace
wrangler kv:namespace create REVENUE_GUARD_KV

# Copy the id from the output
# Update wrangler.jsonc:
#   env.production.kv_namespaces[0].id = "<ID from above>"

# Create preview namespace (optional, for wrangler preview)
wrangler kv:namespace create REVENUE_GUARD_KV --preview

# Copy preview_id
# Update wrangler.jsonc:
#   env.production.kv_namespaces[0].preview_id = "<preview_id from above>"
```

#### 3. Configure Secrets

```bash
# Turnstile secret (from Cloudflare dashboard)
wrangler secret put TURNSTILE_SECRET --env production
# Paste your production Turnstile secret key

# Verify
wrangler secret list --env production
```

#### 4. Update wrangler.jsonc

Replace placeholders in the `env.production` section:

```jsonc
"production": {
  "d1_databases": [
    {
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← Replace
    },
  ],
  "kv_namespaces": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",           // ← Replace
      "preview_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   // ← Replace
    },
  ],
  "vars": {
    "TURNSTILE_SECRET": "REPLACE_WITH_PRODUCTION_SECRET",      // ← Use wrangler secret instead
    // ... other vars are fine as-is
  },
  "routes": [
    {
      "pattern": "revenue-guard.example.com/*",                // ← Update domain
      "zone_name": "example.com",                              // ← Update zone
    },
  ],
},
```

#### 5. Apply Migrations

```bash
# Migrations are applied automatically on first deploy to new D1
# But you can manually apply if needed:
wrangler d1 migrations apply cf-revenue-guard-db --env production
```

#### 6. Deploy

```bash
npm run deploy:worker
# Or: wrangler deploy --env production
```

#### 7. Verify

```bash
# Test endpoints
D1_PROD_URL="https://your-worker-url.com"

curl -X POST $D1_PROD_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"turnstileToken":"<real-turnstile-token>"}'
```

---

## Environment Variables Reference

| Variable           | Dev Value     | Prod Value  | Purpose                                       |
| ------------------ | ------------- | ----------- | --------------------------------------------- |
| `BILLING_SCALE`    | `0.0001`      | `0.0001`    | Real charges multiplier (10^-4)               |
| `TURNSTILE_SECRET` | `DEBUG_TOKEN` | Your secret | Turnstile site verification                   |
| `DEMO_COST_LIMIT`  | `1000000`     | `1000000`   | Hard request limit (blocks if exceeded)       |
| `ALERT_THRESHOLD`  | `500000`      | `500000`    | Guardrail alert threshold (simulated traffic) |

---

## Resource IDs Quick Reference

Run these commands to get resource IDs:

```bash
# Get D1 ID (production)
wrangler d1 list

# Get KV ID (production)
wrangler kv:namespace list

# Get Durable Object ID (auto-generated from class name)
# No action needed; uses env.production config
```

---

## Common Tasks

### Run Locally (mock + dev worker)

```bash
# Terminal 1: React app
npm run dev

# Terminal 2: Worker
npm run dev:worker

# Then toggle API mode in browser console:
localStorage.setItem('demo-api-mode', 'live');
location.reload();
```

### Dry-run Production Build

```bash
npm run build:worker
# Or: wrangler deploy --env production --dry-run
```

### View Production Logs

```bash
wrangler tail --env production

# Subscribe to logs and follow in real-time
wrangler tail --env production --format pretty
```

### Clear Production D1

```bash
# WARNING: Destructive; use only if needed
wrangler d1 execute cf-revenue-guard-db --env production --command "DELETE FROM inventory; DELETE FROM sessions;"
```

---

## Troubleshooting

### "database_id: REPLACE_WITH_PRODUCTION_DB_ID"

You haven't created or linked a D1 database yet. Run:

```bash
wrangler d1 create cf-revenue-guard-db
# Copy ID → update wrangler.jsonc
```

### "Local binding 'REVENUE_GUARD_KV' not found"

Development is trying to use production config. Ensure you're running:

```bash
npm run dev:worker
# NOT: wrangler deploy
```

### D1 migrations don't apply automatically

Apply manually:

```bash
wrangler d1 migrations apply cf-revenue-guard-db --env production
```

### Can't create Turnstile token

In dev, use `DEBUG_TOKEN`. In production:

1. Get real token from Cloudflare Turnstile dashboard
2. Use `wrangler secret put TURNSTILE_SECRET --env production`
3. Don't hardcode secrets in wrangler.jsonc

---

## Next Steps

1. **Develop locally**: `npm run dev:full`
2. **Test endpoints**: Use curl commands from LIVE_WORKER_GUIDE.md
3. **Deploy**: Follow "Create D1 Database" → "Create KV Namespace" → "Deploy"
4. **Monitor**: `wrangler tail --env production`
