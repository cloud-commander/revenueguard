# Evidence Validation Status

**Document**: BUSINESS_CASE.md  
**Generated**: February 5, 2026  
**Purpose**: Track which claims are evidence-backed vs. require validation

---

## Summary

✅ **Evidence-Backed Claims** (Safe to present to customers):

- Performance characteristics (measured in lab)
- Vendor pricing (sourced from official pages)
- Technical architecture (designed from first principles)
- Cost comparison methodology (transparent calculation)

⚠️ **Assumption-Based Claims** (Clearly marked; require validation):

- Overbooking cost ($75/unit)
- Overbooking frequency (25%)
- Peak traffic (50k concurrent)
- Conversion lift (1.8%)

🚫 **Not Yet Validated** (Must complete before board approval):

- Compliance clearance (GDPR, HIPAA, SOC2)
- Actual production overbooking losses
- Your specific customer latency sensitivity
- Realistic implementation timeline for your team

---

## Claim-by-Claim Breakdown

### ✅ HIGH CONFIDENCE (80%+)

| Claim                           | Source                      | Confidence | Evidence                                      |
| ------------------------------- | --------------------------- | ---------- | --------------------------------------------- |
| **DO latency: 12-25ms**         | 🔬 Measured lab test        | 90%        | Test procedure in Appendix B; repeatable      |
| **SQL latency: 87-450ms**       | 🔬 Measured lab test        | 90%        | Same test methodology; industry standard      |
| **AWS RDS cost: $7.65/hour**    | 📊 AWS pricing page         | 95%        | Official pricing (Feb 2026); verifiable       |
| **DO pricing: $0.50/M req**     | 📊 Cloudflare pricing       | 95%        | Official pricing; transparent/simple          |
| **DO has zero race conditions** | 🔬 Architectural guarantee  | 95%        | Single-threaded serialization by design       |
| **SQL has race condition risk** | 🔬 Documented vulnerability | 95%        | Test-verified; inherent to async architecture |

### ⚠️ MODERATE CONFIDENCE (50-70%)

| Claim                              | Source                                      | Confidence | Next Step                                                                |
| ---------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| **Conversion lift: 1% per 100ms**  | 📖 Industry rule (Amazon 2006, Akamai 2009) | 60%        | **MUST**: A/B test or historical correlation analysis for YOUR customers |
| **Global latency baseline: 150ms** | 📊 RDS architecture                         | 60%        | **MUST**: Measure actual p50/p95 latency from US, EU, APAC, Japan        |
| **DevOps burden: 20 hrs/month**    | ⚠️ Industry estimate                        | 60%        | **MUST**: Audit actual your team's database management time              |
| **Implementation: 5-6 weeks**      | ⚠️ Engineering estimate                     | 60%        | **MUST**: Get realistic estimate from your engineering team              |

### 🔴 LOW CONFIDENCE (20-40%)

| Claim                            | Source                 | Confidence | Risk         | Validation Required                                           |
| -------------------------------- | ---------------------- | ---------- | ------------ | ------------------------------------------------------------- |
| **Overbooking cost: $75/unit**   | 🔴 Industry guess      | 20%        | **CRITICAL** | Finance audit of last 12 months chargebacks/refunds           |
| **Overbooking rate: 25%**        | 🔴 Lab test only       | 30%        | **HIGH**     | Measure actual overbooking in production (last 3 peak events) |
| **Peak traffic: 50k concurrent** | 🔴 Assumption          | 40%        | **HIGH**     | Extract peak concurrent users from production logs            |
| **AWS cost comparison fair**     | ⚠️ Provisioned pricing | 50%        | **MEDIUM**   | Show AWS with Provisioned Concurrency for fair comparison     |

### 🚫 ZERO CONFIDENCE (0%)

| Claim                                    | Reason            | Board Approval Impact                                  |
| ---------------------------------------- | ----------------- | ------------------------------------------------------ |
| **Compliance cleared**                   | NOT YET ASSESSED  | **BLOCKER**: Cannot present to board without clearance |
| **Your specific conversion sensitivity** | No data collected | Decision risky without this                            |
| **Your actual overbooking losses**       | Not measured      | ROI case collapses if losses are 50% lower             |

---

## Pre-Board Approval Checklist

**MUST COMPLETE BEFORE PRESENTING TO BOARD**:

- [ ] **Finance**: Audit past 12 months for actual overbooking costs
  - Run queries in Appendix F
  - Compare to assumed $75/unit
  - Impact if assumption is 50% wrong: ROI drops to 8.7x (still positive)
- [ ] **Operations**: Peak concurrency from production logs
  - Extract p95/p99 concurrent users from last 3 major events
  - Impact if lower than 50k: Revenue loss estimates drop 50%
- [ ] **Legal/Security**: Cloudflare compliance assessment
  - GDPR, HIPAA, SOC2, data residency
  - Impact if blocked: Project goes no-go
- [ ] **Product**: Measure latency sensitivity (A/B test OR historical correlation)
  - Validate the "1% conversion per 100ms" rule for YOUR customers
  - Impact if ratio is 50% lower: Conversion benefit drops $900k/year
- [ ] **Engineering**: Realistic implementation timeline
  - Task-by-task estimate (not ballpark)
  - Add 25% buffer for unknowns
  - Impact if 10 weeks instead of 5: Still break-even in Q1 2027
- [ ] **Finance**: Sensitivity analysis
  - Model: What if overbooking cost is $20/unit (not $75)?
  - Model: What if peak traffic is 25k (not 50k)?
  - Model: What if conversion lift is 0.5% (not 1.8%)?
  - ROI still > 2x even with all three wrong? → **Safe to proceed**

---

## Risk Matrix

```
HIGH IMPACT     │ Compliance blocked    │ Overbooking cost 50% lower
                │ (PROJECT BLOCKER)     │ (ROI: 8.7x → still good)
                │                       │
MEDIUM IMPACT   │ Peak traffic 50% lower│ Conversion lift 50% lower
                │ (ROI: 15x → 7x)       │ (ROI: 15x → 10x)
                │                       │
LOW IMPACT      │ Timeline 10 weeks     │ DevOps estimate wrong
                │ (Still profitable)    │ (Minor variance)
```

---

## How to Use This Document

**For Customer Skepticism**:

1. Reference this document to show which claims are backed by evidence
2. For each unvalidated claim, explain what data you'll collect before final approval
3. Use the Pre-Board Approval Checklist to show you're validating assumptions systematically

**For Internal Discussions**:

1. Focus validation efforts on HIGH IMPACT items first (compliance, actual overbooking costs)
2. Use sensitivity analysis to show ROI is robust even if assumptions are off
3. Don't present optimistic scenario; use realistic with downside clearly visible

**For Board Presentation**:

1. Lead with ✅ HIGH CONFIDENCE claims (performance, pricing, architecture)
2. For each ⚠️ MODERATE claim, show your validation plan and timeline
3. Be transparent about 🔴 UNKNOWN claims; articulate what data will resolve them
4. Show 🚫 blockers (compliance) with mitigation plan

---

## Evidence Quality Ratings

### 🥇 Gold Standard Evidence

- Measured in production environment
- Repeated 10+ times with consistent results
- Third-party verification (published research, vendor docs)
- Example: AWS pricing (official, transparent, verifiable)

### 🥈 Silver Standard Evidence

- Measured in realistic lab environment
- Repeated 3-5 times with 95%+ consistency
- Limitations documented
- Example: Performance tests with known limitations

### 🥉 Bronze Standard Evidence

- Industry benchmark or published research
- Applied to your specific context (may differ)
- Requires validation against your data
- Example: "1% conversion per 100ms" rule

### ⚪ No Evidence (Assumption)

- Used for planning only
- Must be validated before committing budget
- Example: Assumed $75 overbooking cost

---

## Document Certification

**BEFORE SIGNING OFF**, reviewers must confirm:

- [ ] All HIGH CONFIDENCE claims have evidence citations (yes/no: \_\_\_)
- [ ] All MODERATE confidence claims have validation timelines (yes/no: \_\_\_)
- [ ] All LOW confidence claims are clearly marked as assumptions (yes/no: \_\_\_)
- [ ] Board will NOT see zero-confidence claims without caveats (yes/no: \_\_\_)
- [ ] Pre-board validation checklist is assigned to responsible parties (yes/no: \_\_\_)

**Prepared by**: ************\_************  
**Date**: ******\_\_\_\_******

**Reviewed by**:

- Finance (overbooking validation): ************\_************
- Engineering (timeline validation): ************\_************
- Legal/Security (compliance): ************\_************
- Product (conversion sensitivity): ************\_************
