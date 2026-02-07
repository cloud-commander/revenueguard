# Documentation Update Guide: Revenue Guard (formerly Revenue Guard)

**Purpose**: Systematic guide for updating all project documentation from "Revenue Guard" (gym booking simulator) to "Revenue Guard" (inventory allocation & revenue protection simulator).

**Key Instructions**:

- ✅ Read each document thoroughly before making changes
- ✅ Update context and examples, not just terminology
- ✅ Maintain technical accuracy and consistency
- ✅ Review for artifacts from old scope
- ❌ Do NOT do mass find-and-replace across all files
- ❌ Do NOT rename files unless explicitly listed

**Scope**: 18 documentation files across 3 directories (planning, operational, original-spec)

---

## Update Priority & Sequence

**Phase 1 (Critical - Update First)**

1. [ROOT] README.md
2. [planning] INDEX.md
3. [planning] revenue-guard.md → Rename to revenue-guard.md (ONLY FILE RENAME)
4. [planning] DELIVERABLES.md
5. [planning] READING_GUIDE.md

**Phase 2 (Secondary - Update Second)** 6. [implementation] IMPLEMENTATION_STATUS.md 7. [implementation] IMPLEMENTATION_PLAN.md 8. [implementation] CRITICAL_GAPS_FIXES.md 9. [implementation] WORK_CHECKLIST.md 10. [operational] SECURITY_FORMALIZED.md

**Phase 3 (Tertiary - Update Last)** 11. [operational] OPERATIONAL_RUNBOOK.md 12. [original-spec] 01-executive-summary.md 13. [original-spec] 02-data-models.md 14. [original-spec] 03-api-protocol.md 15. [original-spec] 04-detailed-logic.md 16. [original-spec] 05-educational-ui.md 17. [original-spec] 06-infrastructure.md 18. [original-spec] 07-architecture-decisions.md

(Plus any remaining spec files: 08-15)

---

## Global Terminology Mapping

**Use this mapping consistently across ALL documents:**

| Old Term                     | New Term                         | Context            |
| ---------------------------- | -------------------------------- | ------------------ |
| Revenue Guard                    | Revenue Guard                    | Project name       |
| Gym class / Class            | SKU / Product / Inventory item   | Target entity      |
| Class booking / Seat booking | Inventory allocation             | Transaction type   |
| unitsBooked / unitsRemaining | allocatedUnits / availableUnits  | State fields       |
| capacity / Class capacity    | totalStock / Available inventory | Constraint         |
| RevenueGuardDO                   | InventoryDO                      | Durable Object     |
| Boredom threshold            | Operational threshold            | UI/UX context      |
| "Monday 09:00 AM" example    | "Product SKU-001" example        | Specific reference |
| Flash sale / Drop            | Flash sale / High-demand release | Event context      |
| User → Gym member            | User → Customer / Shopper        | Actor context      |

**Preserve these (no change needed)**:

- "Cloudflare Durable Objects" (always "DO")
- "D1 Database" / "D1"
- "Race condition" (technical term)
- "Atomic transaction" / "Atomic guarantee"
- "Legacy SQL" + "Atomic Shield" (mode names in UI - OK to keep)

---

## Document-by-Document Update Instructions

---

### Phase 1: Critical Updates

#### 1. ROOT: README.md

**Current State**: Generic Vite/React template documentation (not project-specific)

**Action Required**:

- [ ] Replace entire content
- [ ] Structure: Title → What it does → Quick start → Architecture → Documentation links
- [ ] Include one code example showing types.ts changes
- [ ] Add link to DOCUMENTATION_REVIEW.md for full scope details
- [ ] Reference both mock UI status and future backend integration

**Key Updates**:

- Title: "Revenue Guard Command Center"
- Subtitle: "High-Concurrency Inventory Allocation Simulator | Cloudflare Durable Objects"
- Explain: This simulates protecting revenue during high-demand product releases by demonstrating atomic inventory allocation vs. race conditions
- Mention: Mock UI currently operational, backend integration planned
- Add quick commands: `npm run dev`, `npm run build`

**Validation**:

- [ ] README clearly explains project purpose
- [ ] No gym/booking terminology remains
- [ ] Architecture section mentions SKUs and allocation, not classes and bookings
- [ ] Links to docs/ files are correct

---

#### 2. PLANNING: docs/planning/INDEX.md

**Current State**: Navigation hub with "Revenue Guard" references

**Action Required**:

- [ ] Update intro section: Replace "Revenue Guard" with "Revenue Guard" (3 occurrences)
- [ ] Update all H2/H3 section titles that reference Revenue Guard
- [ ] Review "Document Relationships" diagram comments - replace gym booking examples with inventory examples
- [ ] Ensure all file paths are accurate
- [ ] Update status/date references if stale

**Specific Changes**:

- Line ~5: "Revenue Guard" → "Revenue Guard"
- Line ~20: Any reference to "gym" → "inventory" or "revenue"
- Section headers: Replace booking-specific titles with allocation-specific
- Mermaid diagram: If present, make sure it shows DO and D1 with allocation flows, not booking

**Validation**:

- [ ] All cross-references work
- [ ] No "product deal" language
- [ ] Diagram reflects inventory/allocation architecture

---

#### 3. PLANNING: docs/planning/revenue-guard.md → Rename to revenue-guard.md

**This is the ONLY file that should be renamed.**

**Current State**: 2,800+ line technical design document for Revenue Guard

**Action Required**:

- [ ] Rename file: `revenue-guard.md` → `revenue-guard.md`
- [ ] Update file: This is the most comprehensive update
- [ ] Review ENTIRE document (likely 2,800+ lines) section by section:

**Section-by-Section Guide**:

**Section 1: Title & IMPORTANT box**

- [ ] Title: "Revenue Guard: Technical Design Document"
- [ ] Update tags: "Project Status", "Goal"
  - Old: "Comparative simulation of distributed race conditions (D1 SQLite vs Durable Objects) during a high-concurrency Flash Sale"
  - New: "Comparative simulation of inventory allocation under high-concurrency conditions, demonstrating atomic guarantees of Cloudflare Durable Objects vs. race conditions in traditional SQL"

**Section 2: Executive Summary**

- [ ] Replace "Revenue Guard" with "Revenue Guard"
- [ ] Update scenario:
  - Old: "5 high-demand products... each with 20 units... Black Friday"
  - New: Keep this but emphasize REVENUE PROTECTION, not just inventory
  - Focus: Preventing overbooking = preventing refunds/chargebacks = protecting revenue
- [ ] Update success metrics:
  - Old: "oversell", "orders"
  - New: "overallocate", "allocation requests"

**Section 3: System Architecture**

- [ ] Mermaid diagram: Replace any gym/class references with SKU/product
- [ ] Component names: `RevenueGuardDO` → `InventoryDO` or `SKU-DO`
- [ ] API endpoints: `/api/book` → `/api/allocate` or `/api/reserve`
- [ ] Data layer descriptions: Replace "units" with "units" or "inventory"

**Section 4 onward**:

- [ ] Any data model references: ProductId → SKUId, capacity → totalStock, unitsBooked → allocatedUnits
- [ ] Example data: "Monday 09:00" → "SKU-001-Premium-Tier" or similar
- [ ] Database schema: bookings_table → allocations_table, class_id → sku_id, units_booked → units_allocated
- [ ] Error codes: "FULL" → "OUT_OF_STOCK", "INVALID_CLASS" → "INVALID_SKU"
- [ ] Simulation scenario: racing to book a product deal → racing to allocate limited inventory

**Full Document Validation**:

- [ ] All gym terminology replaced (search for "gym", "class", "unit", "booking" - should be ~0 matches)
- [ ] All allocation/inventory terminology in place
- [ ] Durable Object semantics still accurate
- [ ] D1 race condition scenario still makes sense
- [ ] Code examples updated (if any)
- [ ] Success metrics updated

---

#### 4. PLANNING: docs/planning/DELIVERABLES.md

**Current State**: List of deliverables with Revenue Guard context

**Action Required**:

- [ ] Update heading: "Revenue Guard" → "Revenue Guard Command Center"
- [ ] Review each deliverable item:
  - If it mentions "gym booking" or "unit", replace with "inventory allocation" or "unit allocation"
  - If it lists success criteria related to "overbooking prevention", ensure it's still correct
- [ ] Update any UI examples: Replace gym-specific UI descriptions with inventory/revenue UI descriptions
- [ ] Update phase deliverables: E.g., "Phase 0 UI with mock product deales" → "Phase 0 UI with mock SKU inventory"

**Specific Checks**:

- [ ] Title/subtitle reflect Revenue Guard
- [ ] Success metrics mention "inventory correctness", "revenue protection"
- [ ] No references to "gym fitness" or "class scheduling"
- [ ] Timeline/phases still make sense (no gym-specific timing constraints)

**Validation**:

- [ ] Each deliverable can be understood without gym context
- [ ] Revenue/inventory focus is clear
- [ ] Estimated effort/timeline makes sense

---

#### 5. PLANNING: docs/planning/READING_GUIDE.md

**Current State**: Role-based reading guide with Revenue Guard examples

**Action Required**:

- [ ] Update intro: Replace "Revenue Guard" with "Revenue Guard"
- [ ] Review each role section (Engineering, Product, Security, DevOps, etc.):
  - If examples mention "gym", replace with inventory/product example
  - If success criteria mention "units", replace with "units"
  - If it mentions "booking limits", replace with "allocation limits" or "inventory caps"
- [ ] Update "What you'll learn" sections to focus on revenue protection, not unit bookings
- [ ] Ensure technical depth is appropriate for each role

**Example Updates**:

- For **Product Manager**: Old might say "ensure users can't book beyond units" → New: "ensure customers can't trigger unintended allocations or overbooking"
- For **Engineer**: Old might say "implement booking atomicity" → New: "implement allocation atomicity to prevent race conditions"
- For **DevOps**: Old might say "monitor class session load" → New: "monitor SKU allocation requests during peak traffic"

**Validation**:

- [ ] Each role can follow the guide without gym knowledge
- [ ] Examples are realistic for e-commerce/inventory scenario
- [ ] Links to other docs are correct

---

### Phase 2: Secondary Updates

#### 6. IMPLEMENTATION: docs/implementation/IMPLEMENTATION_STATUS.md

**Current State**: Overview of what was delivered (Phase 0 plan, etc.)

**Action Required**:

- [ ] Update all references to "Revenue Guard" (find all occurrences)
- [ ] Update context: If it mentions "product deal simulation", replace with "inventory allocation simulation"
- [ ] If it describes "Phase 0 UI with mock product deales", describe it as "Phase 0 UI with mock SKU inventory"
- [ ] Check: Does the status make sense for Revenue Guard? (Likely yes, just terminology change)
- [ ] Update any examples: E.g., "20 units in Monday 09:00 class" → "100 units of SKU-001"

**Key Areas**:

- [ ] Project description at top
- [ ] Phase descriptions (do they still make sense?)
- [ ] Metrics/KPIs (do they reflect inventory correctness, not just booking?)
- [ ] Success criteria for each phase

**Validation**:

- [ ] Status is clear without gym context
- [ ] Phases map to inventory challenges, not gym scheduling
- [ ] Dates/timeline are still valid

---

#### 7. IMPLEMENTATION: docs/implementation/IMPLEMENTATION_PLAN.md

**Current State**: 4-week phased implementation plan with gym references

**Action Required**:

- [ ] Review ENTIRE document (3,500+ lines)
- [ ] For each phase (0-4):
  - [ ] Update title: "Phase X: [Objective]" - replace Revenue Guard/gym language
  - [ ] Update deliverables list: Replace booking with allocation
  - [ ] Update acceptance criteria: Ensure they reflect inventory correctness
  - [ ] Update risk items: If gym-specific, make them inventory-scenario-specific
  - [ ] Update backend API specs: If they list `/api/book`, update to `/api/allocate`

**Section Guide**:

- **Phase 0**: "UI Validation with Mock Data"
  - Update descriptions: Instead of "mock 5 product deales", say "mock 24 SKUs"
  - Update UI mockups: Instead of "class grid", say "inventory grid" or "product allocation grid"
- **Phase 1**: "Durable Object Implementation"
  - Update DO documentation: Instead of "RevenueGuardDO manages units", say "InventoryDO manages allocated units"
  - Update error types: "FULL" → "OUT_OF_STOCK"
- **Phase 2**: "D1 Integration"
  - Update schema: bookings_table → allocations_table
  - Update race condition description: Instead of "double-booking", say "double-allocation" or "overallocation"
- **Phase 3**: "WebSocket & Real-time"
  - Update events: Instead of "unit booked", say "units allocated"
- **Phase 4**: "Testing & Deployment"
  - Update test scenarios: Instead of "simulate rush to book", say "simulate rush to allocate"

**Full Document Validation**:

- [ ] No gym booking language in deliverables
- [ ] All API/data models updated
- [ ] Acceptance criteria make sense for inventory allocation
- [ ] Risk assessments are still valid
- [ ] Timeline/effort estimates unchanged

---

#### 8. IMPLEMENTATION: docs/implementation/CRITICAL_GAPS_FIXES.md

**Current State**: 2,000+ line document mapping gaps to fixes

**Action Required**:

- [ ] Review gaps: Do they apply to inventory allocation scenario?
  - If gap is "no automated booking conflict detection", it might be "no automated allocation overallocation detection"
  - Update language accordingly
- [ ] For each gap/fix pair:
  - [ ] Replace gym-specific terminology
  - [ ] Ensure fix still addresses the gap in inventory context
  - [ ] Update validation procedures: If they test "booking limits", update to "allocation limits"

**Example**:

- Old gap: "No race condition demonstration in booking flow"
- New gap: "No race condition demonstration in allocation flow"
- This is just terminology, substance stays the same

**Validation**:

- [ ] All 10 gaps are still relevant to Revenue Guard
- [ ] Fixes are coherent without gym context
- [ ] Validation procedures can be executed by an engineer unfamiliar with gym booking

---

#### 9. IMPLEMENTATION: docs/implementation/WORK_CHECKLIST.md

**Current State**: Week-by-week checklist with Revenue Guard tasks

**Action Required**:

- [ ] For each week:
  - [ ] Update task descriptions: Replace "gym" → "inventory"
  - [ ] Replace "book" → "allocate" in task names
  - [ ] Ensure acceptance criteria are testable for allocation scenario
- [ ] Example updates:
  - Old: "✓ Implement RevenueGuardDO setup"
  - New: "✓ Implement InventoryDO setup"
  - Old: "✓ Test: 5 concurrent bookings don't exceed class capacity"
  - New: "✓ Test: 5 concurrent allocations don't exceed inventory"

**Validation**:

- [ ] Every task is checkable without gym knowledge
- [ ] Timeline still realistic
- [ ] Dependencies between tasks still valid

---

#### 10. OPERATIONAL: docs/operational/SECURITY_FORMALIZED.md

**Current State**: 2,000+ line security threat model for Revenue Guard

**Action Required**:

- [ ] Update intro: "Revenue Guard" → "Revenue Guard"
- [ ] Review threat model:
  - Most threats are infrastructure-level (DO crashes, D1 quota, etc.) - these don't change
  - If any threat mentions "booking fraud" → update to "allocation fraud"
  - If mitigation mentions "unit limit enforcement", update to "inventory limit enforcement"
- [ ] Review encryption/compliance sections:
  - If they mention "customer booking PII", update to "customer purchase/allocation data"
  - Data classification should still work (allocation data = PII equivalent)

- [ ] Update examples:
  - If threat scenario involves "user books multiple units", replace with "user allocates multiple units" or "user triggers double allocation"

**Validation**:

- [ ] Threats are still valid for inventory allocation scenario
- [ ] Mitigations haven't changed (still Cloudflare security features)
- [ ] Compliance requirements still appropriate
- [ ] No booking-specific PII issues (unless they also apply to allocation data)

---

### Phase 3: Tertiary Updates

#### 11. OPERATIONAL: docs/operational/OPERATIONAL_RUNBOOK.md

**Current State**: Incident procedures for Revenue Guard

**Action Required**:

- [ ] Update intro: "Revenue Guard" → "Revenue Guard"
- [ ] For each incident type (DO crash, D1 quota, rate limit, WebSocket, latency):
  - [ ] If symptoms mention "bookings failing", update to "allocations failing"
  - [ ] Root cause analysis: Still valid (DO and D1 are the same), just update terminology
  - [ ] Resolution steps: If they reference booking-specific operations, update to allocation equivalents
- [ ] Update diagnostic commands:
  - If they query "SELECT \* FROM bookings", update to query allocations table
  - If they check "active class sessions", check "active SKU allocation processes"

**Validation**:

- [ ] Each incident can be diagnosed without gym knowledge
- [ ] Commands/queries are updated
- [ ] Escalation paths are reasonable

---

#### 12-18. ORIGINAL SPEC: docs/original-spec/[01-15]

**Current State**: Detailed specifications with gym booking focus

**Action Required for Each**:

- [ ] Read document title and content
- [ ] If title mentions "Booking", consider renaming to "Allocation" equivalent (but only if titles are in the list below):
  - 04 might be "Allocation Logic" instead of "Booking Logic"
  - Otherwise, leave titles as-is
- [ ] For each section:
  - Replace "product deal" with "product SKU" or "inventory item"
  - Replace "booking" with "allocation"
  - Replace "capacity" with "total stock"
  - Replace "units" with "units"
  - Ensure the logic still makes sense

**Detailed Checklist for Each**:

**01-executive-summary.md**:

- [ ] Title update: "Booking Engine" → "Allocation Engine" (if present)
- [ ] Core Success Metric: Update oversell/overbooking to overallocation
- [ ] System Architecture diagram: Update entity names
- [ ] Scenario description: Update from "flash sale of product deales" to "flash sale of limited products"

**02-data-models.md**:

- [ ] ProductEvent type → InventoryItem type
- [ ] All field renames (units → units, capacity → totalStock, etc.)
- [ ] ProductId type → SKUId type
- [ ] Example data: "Monday 09:00" → "SKU-001"
- [ ] Docstring updates

**03-api-protocol.md**:

- [ ] Endpoint renames: `/api/book` → `/api/allocate`
- [ ] Request/response body updates: booking → allocation data
- [ ] Example requests: "book class" → "allocate SKU"
- [ ] Error responses: "FULL" → "OUT_OF_STOCK"

**04-detailed-logic.md**:

- [ ] Logic flow: Booking rite → Allocation flow (data/concepts same, language updated)
- [ ] Race condition scenario: Double-book → double-allocate
- [ ] Atomic guarantee explanation: Still valid, just updated language

**05-educational-ui.md**:

- [ ] Component descriptions: "ClassGrid" might stay as-is (it's a component name), but behavior described as product allocation
- [ ] Tooltip/Help content: Update from "product deal" context to "product/SKU" context
- [ ] Narrative text shown in UI: Update to reflect revenue protection mindset
- [ ] Educational messages: Explain allocation failures in terms of lost revenue, not missed bookings

**06-infrastructure.md**:

- [ ] Deployment diagram: Update entity labels
- [ ] Scaling discussion: If it mentions "class sessions", update to "SKU allocation pools"
- [ ] Cost analysis: If it calculates cost per booking, recalculate for allocation (numbers might change)

**07-architecture-decisions.md**:

- [ ] Decision rationale: Still valid, just update terminology
- [ ] Trade-off discussions: If they mention "user experience of getting a class", update to "success of purchasing limited product"

**[08-15]: [Other original-spec files]**:

- Apply same logic: Update terminology, ensure examples make sense, don't change substantive content

---

## Validation Checklist (Post-Update)

After completing all 18 documents, run through this validation:

### Terminology Consistency

- [ ] No unintended "gym", "class", or "unit" references in non-code blocks
- [ ] All "booking" → "allocation" (or "reserve" if context requires)
- [ ] All "capacity" → "total stock" (or "inventory")
- [ ] All "unitsRemaining" → "availableUnits" (or "units_available")

### Cross-Document Consistency

- [ ] Definitions of terms in 01-executive-summary.md match their usage in later docs
- [ ] Data model names (SKUId, InventoryItem) consistent across all docs
- [ ] API endpoint names consistent (all `/api/allocate`, not mixed)
- [ ] Error codes consistent (all "OUT_OF_STOCK", not mixed with "FULL")

### Technical Accuracy

- [ ] Durable Object behavior still correctly described (unchanged technology)
- [ ] D1 race condition still correctly described (unchanged technology)
- [ ] Philosophy of atomic vs. eventual consistency still clear
- [ ] Simulation scenario makes sense (limited inventory, high demand, race conditions)

### User/Developer Readability

- [ ] Could a new engineer unfamiliar with "Revenue Guard" understand each document?
- [ ] Are examples realistic for e-commerce/inventory scenario?
- [ ] Do links between documents still work?
- [ ] Is there any confused/mixed language (half-gym, half-inventory)?

### Code Samples

- [ ] Any code examples updated to match new types (SKUId, InventoryItem, AllocationResponse)
- [ ] Pseudocode updated from booking flow to allocation flow
- [ ] Error handling examples use new error codes

---

## Special Notes for AI Agent

1. **No Rushing**: Take time to read each document section before updating.
2. **Context Matters**: Understand WHY something is written (not just changing words), then rewrite meaningfully.
3. **Examples**: If you see "Monday 09:00 AM class", replace with "SKU-001" or "Premium Product Tier", not random inventory terms.
4. **Numbers**: If docs cite "5 product deales with 20 units", you might reasonably update to "24 SKUs with 100 units" (to match the frontend mockup), but call this out if unsure.
5. **Preserve Links**: Cross-references between docs must still work after updates.
6. **Consistency**: Use the terminology mapping table above for every term.
7. **Validation**: After each phase, run through phrase searches to catch stray old terminology.

---

## Quick Phrase Search (Validation)

After completing all updates, search documents for these phrases (should find ~0 results):

- "gym"
- "class booking" or "booking a class"
- "fitness" or "gym member"
- "unit" or "units booked"
- "Monday", "Tuesday", etc. (class examples)
- "Revenue Guard" (except in historical notes, if any)

Expected to find (frequent):

- "allocation"
- "inventory"
- "SKU" or "sku"
- "revenue"
- "overallocation" or "overbooking" (technical explanation of race condition)
- "Revenue Guard"

---

## Summary

This guide provides detailed, section-by-section instructions for updating all 18 documents from Revenue Guard (gym booking) to Revenue Guard (inventory allocation). Follow the phases in order, use the terminology mapping consistently, and validate frequently. The substantive content and architecture remain unchanged; this is a **terminology and context update, not a feature redesign**.
