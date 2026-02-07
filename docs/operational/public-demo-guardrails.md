# Public Demo + Guardrails (No Auth Gate)

## Strategy

The demo is **open to anyone without login** (protected by Turnstile), following the technical requirements in [EDGE_API_SPEC_CONFORMANCE.md](../implementation/EDGE_API_SPEC_CONFORMANCE.md).

1. **Server-side rate limits** on control-plane actions (auth/me, reset).
2. **Per-IP session caps** to prevent parallel demo spam.
3. **Cost guardrails** (Zero-Impact `BILLING_SCALE`, alert/auto-stop, hard-lock).
4. **Session tracking** for support and abuse detection in Cloudflare KV.

## Architecture

### Control-Plane Rate Limits (per IP/Session)

- `POST /api/auth/login`: 10/min per IP (Starts a new KV session)
- `GET /api/auth/me`: 60/min per session (Validates heartbeat)
- `POST /api/demo/allocate`: 30/min per session (Core demo action)
- `POST /api/demo/reset`: 1/min per IP (Clears isolated state)
- Default: return 429 "Too Many Requests" if limit exceeded.

### Session Management

- Session ID: generated server-side on start; returned in response and stored in session storage.
- Session state: one per IP; cannot start a new session if one is already active (within cooldown window, e.g., 30s).
- Session expiry: 30 min of inactivity or explicit reset; auto-cleared when cost limit is hit.
- Concurrent session cap: 1 per IP (no parallel demos).

### Cost Guardrails (enforced server-side for live slice)

- **Billed fraction**: 0.1% (hard-locked in code).
- **Alert threshold**: ~15% of included Workers budget; emit event + log.
- **Auto-stop threshold**: ~20% of included Workers budget; stop live requests + emit event + log.
- **Kill-switch**: if alert is triggered twice in 1 hour, auto-ban IP for 1 hour (optional, stricter variant).

### Per-IP Abuse Detection (optional)

- Track starts/resets/toggles per IP over 1-minute windows.
- Log anomalies (e.g., >50 starts in 1 min).
- Consider temporary IP throttle (e.g., 1/min for 10 min) after threshold.

## UI Changes

- **Status bar**: show current IP, session ID, and cooldown remaining (if any).
- **Rate-limit warning**: "Your IP has made 8/10 starts this minute. 1 remaining."
- **Session cap warning**: "Another demo is already running on your IP. Wait 30s or reset."
- **Cost-guard banner**: "Alert: You've used 15% of demo allowance. Next 5% triggers auto-stop."
- **Demo script**: intentionally trigger alert/auto-stop to show guardrails work.

## Observability

- Log: IP, session ID, action (start/reset/toggle), timestamp, rate-limit status, cost counters.
- Metrics: starts/min per IP, sessions created, rate-limit 429s, cost-guard alerts/stops, per-IP usage.
- Dashboard: heatmap of IPs, alert/stop counts, top abuse sources.

## Rollout

1. Deploy control-plane rate limits + session tracking first (simple, low-risk).
2. Enable cost guardrails (already in simulator; wire to live slice).
3. Add UI cues for rate limits and session cap.
4. Monitor for false positives; adjust limits if needed.
5. Optional: enable stricter IP ban if abuse is detected.

## Example Responses

```
// 429: rate limit
HTTP/1.1 429 Too Many Requests
{ "error": "Rate limit exceeded. 2/10 starts remaining this minute. Retry in 60s." }

// 409: session already active
HTTP/1.1 409 Conflict
{ "error": "Session already running on your IP (IP: 203.0.113.42). Reset or wait 30s." }

// 200: success with session ID
HTTP/1.1 200 OK
{ "sessionId": "sess_abc123xyz", "message": "Demo started. Your IP: 203.0.113.42" }

// Alert triggered
HTTP/1.1 200 OK with event
{ "event": "ALERT", "message": "You've used 15% of demo allowance.", "remainingBudget": "85%" }
```
