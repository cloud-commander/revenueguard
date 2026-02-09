# GitHub Actions CI/CD Configuration

This project includes two GitHub Actions workflows for automated testing and deployment.

## Workflows

### 1. Build & Test (`build-and-test.yml`)

**Triggers:** Push to `main` or `develop`, Pull Requests

**Steps:**

- ✅ Node.js 20.x setup
- ✅ Dependency installation
- ✅ Type checking (TypeScript)
- ✅ Linting (ESLint)
- ✅ Build verification
- ✅ Test execution
- ✅ Secret scanning (TruffleHog)

**Result:** Passes if build succeeds; tests/linting are non-blocking

---

### 2. Deploy to Production (`deploy.yml`)

**Triggers:** Push to `main` or manual workflow dispatch

**Steps:**

- ✅ Dependency installation
- ✅ Production build
- ✅ Deploy to Cloudflare Workers
- ✅ Health check verification
- ✅ Success/failure notification

**Requirements:** GitHub secrets configured (see below)

---

## GitHub Secrets Setup

Before deploying, configure these secrets in your GitHub repository:

### Deployment Secrets

1. **CLOUDFLARE_API_TOKEN**
   - Get from: Cloudflare Dashboard → My Profile → API Tokens
   - Permissions needed: Edit Workers, Edit KV, Edit D1
   - Set in: GitHub → Settings → Secrets and variables → Actions

2. **CLOUDFLARE_ACCOUNT_ID**
   - Get from: Cloudflare Dashboard → Overview (right sidebar)
   - Example: `a1b2c3d4e5f6g7h8i9j0k1l2`
   - Set in: GitHub → Settings → Secrets and variables → Actions

3. **CLOUDFLARE_WORKER_URL** (optional)
   - Your worker's public URL: `https://your-worker.workers.dev`
   - Used for post-deployment health checks
   - Set in: GitHub → Settings → Secrets and variables → Actions

### How to Set Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `CLOUDFLARE_API_TOKEN`
5. Value: Paste your API token
6. Click "Add secret"
7. Repeat for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKER_URL`

---

## Environment Variables

For additional quota scaling configuration during deployment, you can add environment variables to the GitHub Actions context:

```yaml
# In deploy.yml, add under 'env:' section
env:
  QUOTA_CPU_MS: "30000000"
  QUOTA_SLOW_THRESHOLD: "50"
  QUOTA_CRITICAL_THRESHOLD: "80"
```

See [QUOTA_SCALING.md](../docs/implementation/QUOTA_SCALING.md) for all 9 available configuration options.

---

## Manual Deployment

Trigger the deployment workflow manually without a push:

1. GitHub → Actions → Deploy to Production
2. Click "Run workflow"
3. Select branch (`main`)
4. Click "Run workflow"

---

## Build Status Badge

Add this to your README:

```markdown
[![Build & Test](https://github.com/YOUR_USER/cf-peakpass/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/YOUR_USER/cf-peakpass/actions/workflows/build-and-test.yml)
[![Deploy to Production](https://github.com/YOUR_USER/cf-peakpass/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USER/cf-peakpass/actions/workflows/deploy.yml)
```

Replace `YOUR_USER` with your GitHub username.

---

## Troubleshooting

### Deployment fails with "Unauthorized"

- ✅ Check `CLOUDFLARE_API_TOKEN` is set and valid
- ✅ Verify API token has "Edit Workers" permission
- ✅ Check `CLOUDFLARE_ACCOUNT_ID` is correct

### Build fails on PR

- ✅ Run `npm install && npm run build` locally first
- ✅ Fix TypeScript errors before pushing
- ✅ Check Node.js version matches (20.x)

### Secret scanning blocks deployment

- ✅ Review flagged content in TruffleHog output
- ✅ If false positive, add to `.gitignore` or exclude in workflow
- ✅ Never commit real API keys—always use GitHub secrets

---

## CI/CD Best Practices

1. **Always test locally** before pushing

   ```bash
   npm run build
   npm run test:run
   ```

2. **Use semantic commits** on `main` for clear deployment history

   ```
   feat: Add quota scaling
   fix: Resolve websocket timeout
   ```

3. **Tag releases** for production deployments

   ```bash
   git tag -a v1.0.0 -m "Production release"
   git push origin v1.0.0
   ```

4. **Review deployment logs** after each push to main
   - GitHub → Actions → Latest workflow run

5. **Monitor production** after deployment
   ```bash
   wrangler tail --env production --follow
   ```

---

## Next Steps

- [ ] Set up GitHub secrets (CLOUDFLARE_API_TOKEN, etc.)
- [ ] Enable branch protection on `main`
- [ ] Require passing CI checks before merge
- [ ] Add status badges to README.md
- [ ] Configure automatic deployments for staging branch
