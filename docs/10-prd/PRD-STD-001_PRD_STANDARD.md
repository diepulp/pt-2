
# PRD-STD-001 — Product Requirements Document Standard

> **Purpose:** Define how we write PRDs so they stay small, concrete, and shippable, and do **not** turn into architecture bibles or endless wishlists.

---

## 1. What a PRD Is (and Is Not)

### 1.1. Definition

A **Product Requirements Document (PRD)** describes a *specific, bounded slice* of the product:
- The **problem** it solves.
- **Who** it is for.
- **What** must exist for this slice to be called “done”.
- **How we will know** it worked (success criteria).

It is an **alignment artifact**, not a dumping ground for every detail.

### 1.2. A PRD is **not**

A PRD must *not* attempt to be any of the following:

- **Architecture spec** (service layout, transport rules, code structure).
- **QA / testing standard** (coverage mandates, test tooling details).
- **Traceability matrix** (full mapping of stories → services → tables → tests).
- **Org-wide SDLC playbook** (TDD rituals, CI steps, etc.).
- **Full product vision** for the entire multi-year roadmap.

Those belong in **other documents** and are referenced by the PRD, not embedded in it.

---

## 2. PRD Scope Rules

### 2.1. Levels of documentation

We operate with three levels:

1. **Product Vision / Strategy**
   - Long-lived, project-wide.
   - Why the product exists, who it serves, and the high-level roadmap.
   - Lives in a separate “Vision / Strategy” document.

2. **Release / Phase PRD** (recommended scope for PRDs)
   - One PRD per **release**, **phase**, or **coherent problem area**.
   - Example scopes:
     - “MVP Pilot – Table & Rating Core”
     - “Phase 2 – Loyalty & Mid-Session Rewards”
   - This is usually the *right* granularity: big enough to matter, small enough to ship.

3. **Feature / Design Specs**
   - Per feature or bounded context (e.g., “Rating Slip Flow v1”, “Visit Lifecycle & Gaming Day”).
   - UX details, technical flows, interaction specs.
   - These **hang off** a PRD; they do not replace it.

### 2.2. What a single PRD may cover

A single PRD **may** cover:

- One **release** (MVP Pilot, v1.1, v2, etc.), or
- One **bounded problem area** (e.g., “Player Intake + Eligibility Checks”), or
- One **cohesive phase** cutting across several bounded contexts, *if* it can still be shipped as a unit.

A PRD **must not** attempt to cover:

- The **entire product** across many phases, or
- Every bounded context and subsystem at once (e.g., Casino + Table + Rating + Loyalty + Finance + MTL all in one).

If scope feels like “the whole casino,” split it into **multiple PRDs**.

---

## 3. Required PRD Sections

Every PRD **must** follow this shape (names can vary, purpose cannot).

### 3.1. Overview

- **Name:** Human-readable release name.
- **Owner:** Single accountable person/role.
- **Status:** Draft / In Review / Approved.
- **Summary (3–5 sentences):**
  - What we are building in this slice.
  - Who it is for.
  - Why now.

### 3.2. Problem & Goals

- **Problem statement:**
  - One or two clear paragraphs describing the pain or gap.
- **Goals (3–5 bullets):**
  - Each goal should be observable and testable.
  - Example: “Supervisors can track visit duration and theoretical win per player per table.”
- **Non-goals (Out of scope):**
  - Explicitly list what we **will not** do in this PRD, even if it is tempting.
  - Example: “No financial settlement or chip inventory in this phase.”

If you cannot clearly write the **problem** and **3–5 goals**, the PRD is not ready.

### 3.3. Users & Use Cases

Describe who uses the slice and for what:

- **Primary users:** Roles/personas.
- For each primary user, 2–4 jobs:
  - “As a [role], I need to [job] so that [outcome].”

Stay at the level of **jobs**, not UI widgets or database fields.

### 3.4. Scope & Feature List

- **In-scope features / capabilities:** 5–15 short, testable bullets.
- Group by theme if needed (e.g., “Table Ops”, “Rating Ops”, “Player Search”).

Each bullet should be something you can concretely answer “yes, we did that” or “no, we did not.”

### 3.5. Requirements (What must exist)

- **Functional requirements:**
  - Behaviors that must be possible, written in short, clear sentences.
  - Example: “A supervisor can open a table, start a rating for a seated player, pause/resume, and close it.”
- **Non-functional requirements (for this slice):**
  - Only those that are **meaningfully binding** on this release.
  - Examples: latency budgets for critical screens, basic reliability constraints, minimal accessibility expectations.

**Do not** restate the entire architecture, SRM, or schema here. Instead, reference them:

> “Relevant domains and tables: see SRM vX.Y, sections 2.1–2.3.”  
> “Schema details: see `types/database.types.ts` (generated on YYYY-MM-DD).”

### 3.6. UX / Flow Overview

High-level description of how the slice is experienced:

- 3–7 bullets or a simple flow:
  - “Open Floor View → Select table → Open Rating Panel → Fill slip → Save.”
- Optionally, link to Figma or other design artifacts.

The PRD should answer “What is the journey?”, not “What exact padding is on this button?”.

### 3.7. Dependencies & Risks

- **Dependencies:** Things that must exist or land first.
  - E.g., schema migrations, platform features, external tools.
- **Risks & open questions:**
  - Unknowns that could materially affect scope, timeline, or feasibility.
  - Each risk should have a short note on how it will be addressed (spike, decision owner, deadline).

### 3.8. Definition of Done (DoD) for This PRD

See Section 4 for the pattern. This is essential and **must be present**.

### 3.9. Related Documents

A short curated list of other artifacts:

- Vision / strategy doc.
- Architecture / SRM references.
- API surface doc.
- Test plan / QA standard.
- Observability / SLO spec.

The PRD **links to** these; it does not absorb their content.

---

## 4. Definition of Done (DoD) Standard

Every PRD must include a **clear, minimal, release-specific Definition of Done**.

### 4.1. DoD Principles

- **Small and concrete:** It must describe a state that can realistically be reached in the near term.
- **Observable:** Every bullet must be answerable in binary form: done or not.
- **Behavior-first:** Focus on working behavior in the real environment, not just code structure.
- **Test-light but meaningful for early phases:** The first release DoD should be rigorous yet *not* equivalent to a full enterprise maturity standard.

### 4.2. Recommended DoD structure

A DoD should be 5–12 bullets across these categories:

1. **Functionality**
   - All “must-have” user stories for this PRD work end-to-end in the target environment.
   - Critical edge cases are handled (or documented as explicit post-PRD backlog).

2. **Data & Integrity**
   - Data remains consistent across a full realistic usage scenario (e.g., one shift).
   - No orphaned or stuck records for key flows.

3. **Security & Access**
   - Minimal role/permission model enforced for this slice.
   - No known “obvious” privilege escalation paths for core flows.

4. **Testing**
   - At least one unit or integration test per critical service or flow.
   - At least one “happy path” end-to-end test for the main journey.

   > Note: Full coverage targets, test matrices, and performance testing live in QA standards, not here.

5. **Operational Readiness**
   - Key logs/metrics exist to debug failures in this slice.
   - A simple rollback or mitigation path is defined.

6. **Documentation**
   - User-facing snippets or internal runbooks updated for this slice (where applicable).
   - Known limitations are documented.

### 4.3. Anti-patterns for DoD

DoD **must not**:

- Require “90%+ coverage on all services” for an MVP-level slice.
- Enumerate every test tool, CI step, or coverage report format.
- Require completion of all future phases (e.g., demanding Loyalty and Finance for a Table/Rating pilot).

Those belong in global **QA standards** or later-phase PRDs.

---

## 5. Common PRD Anti-Patterns & How to Avoid Them

### 5.1. “Everything PRD”

**Smell:** PRD scope reads like the whole system: multiple bounded contexts, all cross-cutting concerns, all future phases.

**Impact:** No realistic initial release feels legitimate; everything looks incomplete.

**Avoid by:**

- Limiting PRD scope to one release / phase / problem area.
- Explicitly marking other domains as **out of scope** or “future PRDs”.

---

### 5.2. Architecture Spec Crammed into PRD

**Smell:** Detailed sections on service layout, transport decisions, folder structure, and class diagrams.

**Impact:** Implementation choices feel frozen; changing them looks like “breaking the PRD”. The doc becomes heavy and hard to maintain.

**Avoid by:**

- Moving architecture detail to separate **ARCH** docs.
- Leaving only 2–3 high-level bullets in the PRD and a link to the canonical ARCH file.

---

### 5.3. QA / Testing Standard in PRD

**Smell:** TDD rituals, coverage numbers, test tool configurations, full testing pyramid, detailed RLS test matrices inside the PRD.

**Impact:** The bar for “done” becomes unattainable early on; shipping a thin walking skeleton feels impossible.

**Avoid by:**

- Keeping QA guidance in dedicated **QA-0xx** documents.
- In PRD DoD, requiring only minimal testing commitments (per Section 4) appropriate to the phase.

---

### 5.4. Manual Traceability Matrix in PRD

**Smell:** Long tables mapping every user story to every service, table, RPC, and test, maintained by hand inside the PRD.

**Impact:** Changing anything in the system requires tedious updates; the PRD becomes brittle and discourages iteration.

**Avoid by:**

- Keeping traceability in a separate doc or, where possible, generating it.
- In the PRD, keeping only a small table mapping **key stories to features**.

---

### 5.5. Vague Goals / No Success Criteria

**Smell:** High-level aspirations (“better UX”, “more consistent operations”) with no way to know if they happened.

**Impact:** Difficult prioritization, endless “almost done” feeling, and scope creep.

**Avoid by:**

- Mandating at least 3–5 **clear goals** with observable signals.
- Including at least 2–3 basic metrics or qualitative checks (even if not fully instrumented yet).

---

## 6. How to Use This Standard

### 6.1. When to create a new PRD

Create a new PRD when:

- There is a **new release or phase** with distinct value and target users, or
- A new **problem area** requires focused work for several weeks+.

Do **not** append everything to a single “mega PRD.”

### 6.2. Versioning and evolution

- Each PRD has a **version** and **status**.
- Minor edits (clarifications, risk updates) do not change the PRD scope.
- Major changes to scope or DoD require a new version (or a new PRD) and a short changelog.

### 6.3. Integration with other docs

PRDs should:

- **Reference**, not duplicate, the canonical:
  - Vision / strategy docs.
  - Architecture / SRM.
  - Schema / type system.
  - API surface docs.
  - QA / observability standards.
- Serve as an entry point: if someone reads only the PRD, they should understand:
  - Why this slice exists.
  - What “done” means.
  - Where to look next for implementation details.

---

## 7. Minimal PRD Template (Copy-Paste Ready)

```md
# [PRD ID] — [Release / Phase Name]

## 1. Overview
- **Owner:** 
- **Status:** Draft / In Review / Approved
- **Summary:** 3–5 sentences describing the slice, users, and why now.

## 2. Problem & Goals
### 2.1 Problem
[Short problem statement]

### 2.2 Goals
- [Goal 1]
- [Goal 2]
- [Goal 3]

### 2.3 Non-Goals
- [Explicitly out of scope]

## 3. Users & Use Cases
- **Primary users:** [roles]

**Top Jobs:**
- As a [role], I need to [job] so that [outcome].
- ...

## 4. Scope & Feature List
- [Feature / capability 1]
- [Feature / capability 2]
- ...

## 5. Requirements
### 5.1 Functional Requirements
- [Requirement 1]
- [Requirement 2]

### 5.2 Non-Functional Requirements
- [Requirement 1]
- [Requirement 2]

> Details of architecture, schema, and API live in ARCH/SRM/schema docs and are not repeated here.

## 6. UX / Flow Overview
[Brief high-level flows; link to design where applicable.]

## 7. Dependencies & Risks
### 7.1 Dependencies
- [Dependency 1]
- [Dependency 2]

### 7.2 Risks & Open Questions
- [Risk / question 1]
- [Risk / question 2]

## 8. Definition of Done (DoD)
The release is considered **Done** when:

**Functionality**
- [...]

**Data & Integrity**
- [...]

**Security & Access**
- [...]

**Testing**
- [...]

**Operational Readiness**
- [...]

**Documentation**
- [...]

## 9. Related Documents
- Vision / Strategy: [...]
- Architecture / SRM: [...]
- Schema / Types: [...]
- API Surface: [...]
- QA / Test Plan: [...]
- Observability / SLOs: [...]
```
