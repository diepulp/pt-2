# PRD Template

Copy this template when creating a new PRD. Replace all bracketed placeholders.

---

```markdown
---
id: PRD-XXX
title: [Human-readable title]
owner: [Product | Lead Architect | Engineering]
status: Draft
affects: [ARCH-XXX, ADR-XXX, SEC-XXX, PRD-XXX]
created: YYYY-MM-DD
last_review: YYYY-MM-DD
phase: [Phase N (Phase Name)]
pattern: [A | B | C]
http_boundary: [true | false]
---

# PRD-XXX — [Release / Phase Name]

## 1. Overview

- **Owner:** [Single accountable person/role]
- **Status:** Draft
- **Summary:** [3-5 sentences describing the slice, users, and why now]

---

## 2. Problem & Goals

### 2.1 Problem

[One or two clear paragraphs describing the pain or gap]

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: [Goal description] | [How we know it's achieved] |
| **G2**: [Goal description] | [How we know it's achieved] |
| **G3**: [Goal description] | [How we know it's achieved] |

### 2.3 Non-Goals

- [Explicitly out of scope item 1]
- [Explicitly out of scope item 2]
- [Explicitly out of scope item 3]

---

## 3. Users & Use Cases

- **Primary users:** [roles/personas]

**Top Jobs:**

- As a **[Role]**, I need to [job] so that [outcome].
- As a **[Role]**, I need to [job] so that [outcome].
- As a **[Role]**, I need to [job] so that [outcome].

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**[Theme 1]:**
- [Feature / capability 1]
- [Feature / capability 2]

**[Theme 2]:**
- [Feature / capability 3]
- [Feature / capability 4]

### 4.2 Out of Scope

- [Future feature 1]
- [Future feature 2]

---

## 5. Requirements

### 5.1 Functional Requirements

- [Behavior that must be possible - clear, short sentence]
- [Behavior that must be possible - clear, short sentence]
- [Behavior that must be possible - clear, short sentence]

### 5.2 Non-Functional Requirements

- [Meaningfully binding constraint for this release]
- [Meaningfully binding constraint for this release]

> Architecture details: See [SRM reference], [SLAD reference], [Schema reference]

---

## 6. UX / Flow Overview

**Flow 1: [Flow Name]**
1. [Step 1]
2. [Step 2]
3. [Step 3]
4. [Step 4]

**Flow 2: [Flow Name]**
1. [Step 1]
2. [Step 2]
3. [Step 3]

[Link to Figma or design artifacts if applicable]

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **[Dependency]** - [What must exist or land first]
- **[Dependency]** - [What must exist or land first]

### 7.2 Risks & Open Questions

- **[Risk / question 1]** — [How it will be addressed]
- **[Risk / question 2]** — [How it will be addressed]

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All must-have user stories work end-to-end in target environment
- [ ] Critical edge cases handled or documented as backlog

**Data & Integrity**
- [ ] Data remains consistent across realistic usage scenario
- [ ] No orphaned or stuck records for key flows

**Security & Access**
- [ ] Minimal role/permission model enforced for this slice
- [ ] No known privilege escalation paths for core flows

**Testing**
- [ ] At least one unit/integration test per critical service
- [ ] At least one happy-path E2E test for main journey

**Operational Readiness**
- [ ] Key logs/metrics exist for debugging failures
- [ ] Simple rollback or mitigation path defined

**Documentation**
- [ ] User-facing snippets or runbooks updated
- [ ] Known limitations documented

---

## 9. Related Documents

- **Vision / Strategy**: [link or path]
- **Architecture / SRM**: [link or path]
- **Schema / Types**: `types/database.types.ts`
- **Security / RLS**: [link or path]
- **QA / Test Plan**: [link or path]
- **Observability / SLOs**: [link or path]
- **Prerequisite PRDs**: [link or path]

---

## Appendix A: Schema Reference

[SQL snippets verified against database.types.ts]

```sql
-- Table schema
CREATE TABLE [table_name] (
  -- columns
);

-- RLS policies
CREATE POLICY [policy_name] ON [table]
  FOR [SELECT|INSERT|UPDATE|DELETE]
  USING ([condition]);
```

---

## Appendix B: Implementation Plan

### WS1: [Workstream Name] (P0) - [Timeline]

- [ ] [Task 1]
- [ ] [Task 2]

### WS2: [Workstream Name] (P0) - [Timeline]

- [ ] [Task 1]
- [ ] [Task 2]

### WS3: [Workstream Name] (P1) - [Timeline]

- [ ] [Task 1]
- [ ] [Task 2]

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**[Domain] Domain**
- `[ERROR_CODE]` (HTTP status)
- `[ERROR_CODE]` (HTTP status)

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | YYYY-MM-DD | [Author] | Initial draft |
```

---

## PRD ID Convention

Use the pattern: `PRD-XXX-description` where:
- `XXX` is a sequential number (000, 001, 002, etc.)
- `description` is a short kebab-case name

**Examples:**
- `PRD-000-casino-foundation`
- `PRD-001-mvp-table-rating`
- `PRD-002-loyalty-rewards`
- `PRD-003-player-visit-management`
- `PRD-HZ-001-gate0-horizontal-infrastructure` (horizontal/infrastructure PRDs)

---

## Status Values

| Status | Meaning |
|--------|---------|
| Draft | Initial creation, not yet reviewed |
| Proposed | Ready for review, pending approval |
| Accepted | Approved for implementation |
| Superseded | Replaced by newer PRD |
| Deprecated | No longer relevant |

---

## Service Pattern Values

| Pattern | Description |
|---------|-------------|
| A | Full HTTP boundary service (Route Handlers + service layer) |
| B | Internal service (service layer only, no direct HTTP) |
| C | Lightweight utility service (helpers, no persistence) |
