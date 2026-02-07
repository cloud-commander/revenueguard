> **Purpose**: This folder contains the Revenue Guard High-Level Design (HLD) split into 15 focused, digestible chunks suitable for AI agents and human readers.

## Complete Navigation

| #   | File                                                         | Purpose                                                             | Coverage                  |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------- |
| 1   | [01-executive-summary.md](01-executive-summary.md)           | Overview, architecture diagram, success metrics                     | Core value proposition    |
| 2   | [02-data-models.md](02-data-models.md)                       | InventoryState interface, D1 schema, type definitions               | Data structures           |
| 3   | [03-api-protocol.md](03-api-protocol.md)                     | HTTP endpoints (/api/allocate, /api/reset, /api/ws), WebSocket spec | API contract              |
| 4   | [04-detailed-logic.md](04-detailed-logic.md)                 | Safe path (DO serialization), Unsafe path (D1 race condition)       | Core algorithm            |
| 5   | [05-educational-ui.md](05-educational-ui.md)                 | Tooltips, help cards, accessibility, learning phases                | UI/UX specifications      |
| 6   | [06-infrastructure.md](06-infrastructure.md)                 | Migrations, wrangler.jsonc, CORS configuration                      | Infrastructure setup      |
| 7   | [07-architecture-decisions.md](07-architecture-decisions.md) | ADR-001 through ADR-004 with trade-offs                             | Design decisions          |
| 8   | [08-finops.md](08-finops.md)                                 | Cost breakdown (~$0.0015/month), scaling scenarios                  | Economics & growth        |
| 9   | [09-migration.md](09-migration.md)                           | Deployment checklist, data migration, rollback procedures           | Deployment process        |
| 10  | [10-nonfunctional.md](10-nonfunctional.md)                   | Scalability analysis, SLOs, observability targets                   | Performance & reliability |
| 11  | [11-security-threat.md](11-security-threat.md)               | Threat matrix (6 threats), encryption, rate limiting                | Security posture          |
| 12  | [12-risk-assessment.md](12-risk-assessment.md)               | Risk register (9 risks), technical debt, RACI matrix                | Risk & dependencies       |
| 13  | [13-deployment.md](13-deployment.md)                         | CI/CD pipeline, operational runbooks, incident response             | Operations playbook       |
| 14  | [14-simulation-testing.md](14-simulation-testing.md)         | Simulation logic, expected outcomes, visualization                  | Testing & validation      |
| 15  | [15-quick-reference.md](15-quick-reference.md)               | Architecture diagram, cost summary, files overview                  | Quick lookup              |

**Total**: ~2,800 lines across 15 focused, independently readable files

---

## How to Use This Documentation

### For AI Agents (Recommended Reading Path)

**Core Understanding** (Foundation):

1. [01-executive-summary.md](01-executive-summary.md) — What & why
2. [02-data-models.md](02-data-models.md) — Data structures
3. [03-api-protocol.md](03-api-protocol.md) — API contract

**Implementation Details** (How it works): 4. [04-detailed-logic.md](04-detailed-logic.md) — Core algorithm 5. [06-infrastructure.md](06-infrastructure.md) — Infrastructure

**Operational Knowledge** (Production concerns): 6. [13-deployment.md](13-deployment.md) — Operations playbook 7. [10-nonfunctional.md](10-nonfunctional.md) — SLOs & scaling

**Strategic Context** (Business decisions): 8. [07-architecture-decisions.md](07-architecture-decisions.md) — Why these choices 9. [08-finops.md](08-finops.md) — Cost analysis 10. [12-risk-assessment.md](12-risk-assessment.md) — Risk register

**Optional Deep-Dives**:

- [05-educational-ui.md](05-educational-ui.md) — UI/UX specifics
- [11-security-threat.md](11-security-threat.md) — Threat model
- [09-migration.md](09-migration.md) — Deployment details
- [14-simulation-testing.md](14-simulation-testing.md) — Testing & validation

### For Human Readers (Role-Based)

**Sales/Marketing**:

1. [01-executive-summary.md](01-executive-summary.md)
2. [05-educational-ui.md](05-educational-ui.md)
3. [08-finops.md](08-finops.md)

**Backend Engineers**:

1. [04-detailed-logic.md](04-detailed-logic.md)
2. [03-api-protocol.md](03-api-protocol.md)
3. [07-architecture-decisions.md](07-architecture-decisions.md)

**DevOps/SRE**:

1. [06-infrastructure.md](06-infrastructure.md)
2. [13-deployment.md](13-deployment.md)
3. [10-nonfunctional.md](10-nonfunctional.md)
4. [12-risk-assessment.md](12-risk-assessment.md)

**Security**:

1. [11-security-threat.md](11-security-threat.md)
2. [12-risk-assessment.md](12-risk-assessment.md)

**Product Managers**:

1. [01-executive-summary.md](01-executive-summary.md)
2. [08-finops.md](08-finops.md)
3. [12-risk-assessment.md](12-risk-assessment.md)
4. [05-educational-ui.md](05-educational-ui.md)

---

## Key Concepts Quick Reference

### Architecture Pattern

- **Safe Path**: Durable Objects (serialized, atomic, prevents overallocation)
- **Unsafe Path**: D1 SQLite (concurrent, demonstrates race condition)
- **Real-Time Updates**: WebSocket with Hibernation API (cost-efficient)

### Technologies

- Cloudflare Workers (edge compute)
- Durable Objects (distributed coordination)
- D1 Database (SQLite)
- Vite + React (frontend)
- TypeScript (implementation language)
- Bun (package manager)

### Key Metrics

- **Monthly Cost**: $0.0015 (less than one penny)
- **Concurrent Capacity**: 5,000 viewers (at current scale)
- **MTTR**: < 5 minutes
- **Availability Target**: 99.5%
- **Success Rate**: >99% allocation success

---

## Cross-File Navigation

Files use consistent cross-referencing for easy navigation:

- [02-data-models.md](02-data-models.md) → Explains types used in [03-api-protocol.md](03-api-protocol.md)
- [03-api-protocol.md](03-api-protocol.md) → Shows how endpoints use [02-data-models.md](02-data-models.md)
- [04-detailed-logic.md](04-detailed-logic.md) → Demonstrates algorithms called by [03-api-protocol.md](03-api-protocol.md)
- [05-educational-ui.md](05-educational-ui.md) → Visualizes outcomes from [04-detailed-logic.md](04-detailed-logic.md)

Each file includes "See also" and "Cross-References" sections pointing to related documents.

---

## Source Documentation

- **Monolithic HLD**: [../revenue-guard.md](../revenue-guard.md) — Complete document (source of truth)
  - Use this if you need to verify any section or understand the full context
  - This split was created by extracting sections while preserving all content

---

## Document Quality Standards

Each file includes:

- ✅ **Clear section headings** (hierarchical with ##, ###, ####)
- ✅ **Code examples** (TypeScript, SQL, JSON where relevant)
- ✅ **Tables** (for comparisons, matrices, quick reference)
- ✅ **Diagrams** (ASCII art for architecture, flows, state diagrams)
- ✅ **Cross-references** (links to related sections using markdown)
- ✅ **Consistent formatting** (Markdown + code blocks)
- ✅ **Context for AI** (clear problem statements, solution explanations)

---

## File Maintenance

When updating the HLD:

1. Update both [../revenue-guard.md](../revenue-guard.md) (source of truth) AND the corresponding split file
2. Use exact line numbers from revenue-guard.md for audit trail
3. Keep cross-references synchronized across files
4. Update this README if file purposes change

---

**Last Updated**: 2026-02-04  
**Version**: 1.0 (All 15 files complete and cross-referenced)  
**Status**: ✅ Ready for AI agent consumption

**Workflow**:

1. Read this README to understand the structure
2. Pick the chunk you need to work on
3. Use the line references to validate against the source document
4. Make changes and update the corresponding section in `revenue-guard.md`

---

## Source Document

All content originates from `/revenue-guard.md`. If a line reference is stale, re-check the source.

---

## Status

- **Architecture**: ✅ Complete
- **API Spec**: ✅ Complete
- **Educational UI Requirements**: ✅ Complete (Section 5.5)
- **ADRs & Governance**: ✅ Complete
- **FinOps Analysis**: ✅ Complete
- **Security & Risk**: ✅ Complete
- **Deployment & Operations**: ✅ Complete
- **Frontend Design**: ✅ Complete
- **Testing & Validation**: ⚠️ Needs automated test scaffolding
