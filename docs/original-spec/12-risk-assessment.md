# 12. Risk Assessment

## Risk Scoring (Probability × Impact)

**Risk Matrix Visualization**:

```
IMPACT
↑
│ HIGH │      R4 (Data Loss)    R1 (Total Outage)
│      │      R6 (Virus)        R7 (Breach)
│ MED  │   R2 (Performance)     R3 (Availability)
│      │   R5 (Memory Leak)
│ LOW  │  R8 (UI Bug)           R9 (Typo)
│      │
└──────┴─────────────────────────────────────
       LOW        MED        HIGH
       PROBABILITY
```

---

## Detailed Risk Register

| Risk ID | Risk                                       | Probability | Impact                     | Score        | Mitigation                                          | Owner    | Due Date   |
| ------- | ------------------------------------------ | ----------- | -------------------------- | ------------ | --------------------------------------------------- | -------- | ---------- |
| **R1**  | DO instance crashes repeatedly             | 5%          | High (demo unavailable)    | **HIGH**     | Auto-restart by CF, alert on 5+ crashes/day         | SRE      | 2026-02-10 |
| **R2**  | D1 quota exceeded                          | 1%          | Medium (reset fails)       | **MEDIUM**   | Monitor quota, alert at 80%, cleanup job            | Database | 2026-02-15 |
| **R3**  | WebSocket disconnect storms                | 10%         | Low (user refreshes)       | **LOW**      | Auto-reconnect with backoff, logging                | Frontend | 2026-02-20 |
| **R4**  | Security breach (SQL injection)            | <0.1%       | Critical (data loss)       | **CRITICAL** | Parameterized queries, WAF, code review             | Security | 2026-02-07 |
| **R5**  | Memory leak in DO                          | 2%          | Medium (OOM after days)    | **MEDIUM**   | Implement cleanup alarms, test with loadgen         | Backend  | 2026-02-25 |
| **R6**  | Cloudflare API deprecation                 | 5%          | High (refactor needed)     | **HIGH**     | Monitor CF changelog, maintain vendor relationships | Arch     | Ongoing    |
| **R7**  | Unauthorized API access                    | 15%         | Low (open demo acceptable) | **LOW**      | Rate limiting, IP whitelisting for prod             | Security | 2026-02-28 |
| **R8**  | User education gap (don't understand demo) | 20%         | Low (just explain again)   | **LOW**      | Improve tooltips, add video guide                   | Product  | 2026-03-15 |
| **R9**  | Browser compatibility issue                | 10%         | Low (works on fallback)    | **LOW**      | Test on Chrome, Firefox, Safari monthly             | QA       | Ongoing    |

---

## Intentional Technical Debt

| Item                             | Reason                 | Payoff Date                | Risk                             |
| -------------------------------- | ---------------------- | -------------------------- | -------------------------------- |
| **Fixed capacity (100 units)**   | Simplicity for demo    | Post-launch (v2)           | Won't scale to dynamic inventory |
| **No authentication**            | Open demo, fast access | Before monetization        | Not suitable for sensitive data  |
| **No audit log**                 | Ephemeral demo state   | Before handling PII        | Can't investigate incidents      |
| **Hardcoded race delay (200ms)** | Reproducibility        | Enhancement (nice-to-have) | Doesn't test variable latency    |
| **No persistent storage**        | Cost optimization      | Post-launch (v2)           | Results disappear after 60s      |

---

## Cross-Team Dependencies

### Dependencies Matrix

| Dependency                    | Owner     | Type       | Timeline | Blocking | Status      |
| ----------------------------- | --------- | ---------- | -------- | -------- | ----------- |
| **CF Account Setup**          | DevOps    | Infra      | Week 1   | YES      | Not started |
| **D1 Database Creation**      | DevOps    | Infra      | Week 1   | YES      | Not started |
| **Worker Deployment Creds**   | DevOps    | Infra      | Week 1   | YES      | Not started |
| **DNS Configuration**         | DevOps    | Infra      | Week 2   | NO       | Not started |
| **Security Threat Review**    | Security  | Governance | Week 1   | YES      | Not started |
| **WAF Rule Approval**         | Security  | Governance | Week 2   | NO       | Not started |
| **Demo Script & Messaging**   | Marketing | Content    | Week 1   | YES      | Not started |
| **Sales Enablement Training** | Sales     | Training   | Week 2   | YES      | Not started |
| **Analytics Event Schema**    | Analytics | Data       | Week 1   | NO       | Not started |
| **Dashboard Creation**        | Analytics | Data       | Week 2   | NO       | Not started |

### Dependency Blocking Tree

```
LAUNCH (Week 2)
├─ Week 1 Critical
│  ├─ DevOps: CF account + D1 setup
│  │  └─ Blocks: Worker deployment
│  ├─ Security: Threat model review
│  │  └─ Blocks: Launch approval
│  └─ Marketing: Demo script
│     └─ Blocks: Sales training
│
└─ Week 2 Execution
   ├─ Backend: Integration testing
   ├─ Frontend: Final QA
   ├─ Sales: Team training
   └─ Launch!
```

### RACI Matrix

| Activity              | Backend | Frontend | DevOps  | Security | Marketing | Sales | Analytics |
| --------------------- | ------- | -------- | ------- | -------- | --------- | ----- | --------- |
| Design Architecture   | **R**   | C        | C       | C        | I         | I     | I         |
| Implement Backend     | **R/A** | -        | C       | C        | -         | -     | -         |
| Implement Frontend    | -       | **R/A**  | -       | -        | C         | -     | -         |
| Deploy Infrastructure | -       | -        | **R/A** | C        | -         | -     | -         |
| Security Review       | C       | C        | **R**   | **A**    | -         | -     | -         |
| Create Demo Script    | C       | C        | -       | -        | **R/A**   | C     | -         |
| Sales Training        | I       | I        | -       | -        | **R**     | **A** | -         |
| Launch Demo           | **A**   | **A**    | **R**   | **A**    | I         | I     | C         |

---

See [11-security-threat.md](11-security-threat.md) for the detailed threat model that these risks are based on.
