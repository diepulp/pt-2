# PRD Template

Copy this template when creating a new PRD. Replace all bracketed placeholders.

```markdown
# [PRD-XXX] — [Release / Phase Name]

## 1. Overview
- **Owner:** [Single accountable person/role]
- **Status:** Draft / In Review / Approved
- **Summary:** [3–5 sentences describing the slice, users, and why now]

## 2. Problem & Goals

### 2.1 Problem
[One or two clear paragraphs describing the pain or gap]

### 2.2 Goals
- [Goal 1 - observable and testable]
- [Goal 2 - observable and testable]
- [Goal 3 - observable and testable]

### 2.3 Non-Goals
- [Explicitly out of scope item 1]
- [Explicitly out of scope item 2]

## 3. Users & Use Cases
- **Primary users:** [roles/personas]

**Top Jobs:**
- As a [role], I need to [job] so that [outcome].
- As a [role], I need to [job] so that [outcome].
- As a [role], I need to [job] so that [outcome].

## 4. Scope & Feature List
- [Feature / capability 1]
- [Feature / capability 2]
- [Feature / capability 3]
- ...

## 5. Requirements

### 5.1 Functional Requirements
- [Behavior that must be possible - clear, short sentence]
- [Behavior that must be possible - clear, short sentence]

### 5.2 Non-Functional Requirements
- [Meaningfully binding constraint for this release]
- [Meaningfully binding constraint for this release]

> Details of architecture, schema, and API live in ARCH/SRM/schema docs and are not repeated here.

## 6. UX / Flow Overview
[Brief high-level flows - 3-7 bullets or simple flow description]
- [Step 1 → Step 2 → Step 3]

[Link to Figma or design artifacts if applicable]

## 7. Dependencies & Risks

### 7.1 Dependencies
- [Dependency 1 - what must exist or land first]
- [Dependency 2]

### 7.2 Risks & Open Questions
- [Risk / question 1] — [How it will be addressed]
- [Risk / question 2] — [How it will be addressed]

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

## 9. Related Documents
- Vision / Strategy: [link or path]
- Architecture / SRM: [link or path]
- Schema / Types: [link or path]
- API Surface: [link or path]
- QA / Test Plan: [link or path]
- Observability / SLOs: [link or path]
```

## PRD ID Convention

Use the pattern: `PRD-XXX-description` where:
- `XXX` is a sequential number (001, 002, etc.)
- `description` is a short kebab-case name

Examples:
- `PRD-001-mvp-table-rating`
- `PRD-002-loyalty-rewards`
- `PRD-003-player-intake`
