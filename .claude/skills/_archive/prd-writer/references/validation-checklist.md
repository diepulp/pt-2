# PRD Validation Checklist

Use this checklist before submitting a PRD for review. All items should be checked.

---

## Pre-Submission Checklist

### Metadata & Format

- [ ] **YAML frontmatter present** with all required fields:
  - [ ] `id`: PRD-XXX format
  - [ ] `title`: Human-readable title
  - [ ] `owner`: Product | Lead Architect | Engineering
  - [ ] `status`: Draft | Proposed | Accepted
  - [ ] `affects`: Array of related doc IDs
  - [ ] `created`: YYYY-MM-DD format
  - [ ] `last_review`: YYYY-MM-DD format
- [ ] **PRD ID follows convention**: `PRD-XXX-description`
- [ ] **File location correct**: `docs/10-prd/PRD-XXX-description.md`

### Section Completeness (9 Required Sections)

- [ ] **Section 1: Overview**
  - [ ] Owner specified
  - [ ] Status specified
  - [ ] Summary is 3-5 sentences
  - [ ] Summary explains what, who, and why now

- [ ] **Section 2: Problem & Goals**
  - [ ] Problem statement is 1-2 paragraphs
  - [ ] 3-5 goals listed
  - [ ] Each goal is observable and testable
  - [ ] Non-goals explicitly listed (3+ items)

- [ ] **Section 3: Users & Use Cases**
  - [ ] Primary users/roles identified
  - [ ] 2-4 jobs per primary user
  - [ ] Jobs follow "As a [role], I need [job] so that [outcome]" format
  - [ ] Jobs are at "job" level, not UI widget level

- [ ] **Section 4: Scope & Feature List**
  - [ ] 5-15 testable feature bullets
  - [ ] Features grouped by theme if needed
  - [ ] Each bullet is binary testable (yes/no answerable)
  - [ ] Out of scope section present

- [ ] **Section 5: Requirements**
  - [ ] Functional requirements present (clear sentences)
  - [ ] Non-functional requirements present (binding constraints)
  - [ ] References ARCH/SRM docs instead of duplicating

- [ ] **Section 6: UX / Flow Overview**
  - [ ] 3-7 flow bullets or numbered steps
  - [ ] Describes journey, not UI details
  - [ ] Links to design artifacts if applicable

- [ ] **Section 7: Dependencies & Risks**
  - [ ] Dependencies listed (what must exist first)
  - [ ] Risks identified with mitigation notes
  - [ ] Open questions have owners/deadlines

- [ ] **Section 8: Definition of Done**
  - [ ] 5-12 checkbox items
  - [ ] All 6 categories covered:
    - [ ] Functionality
    - [ ] Data & Integrity
    - [ ] Security & Access
    - [ ] Testing
    - [ ] Operational Readiness
    - [ ] Documentation
  - [ ] Each item is binary (done/not done)

- [ ] **Section 9: Related Documents**
  - [ ] Links to Vision/Strategy
  - [ ] Links to Architecture/SRM
  - [ ] Links to Schema/Types
  - [ ] Links to Security/RLS
  - [ ] Links to QA/Test Plan
  - [ ] Links to prerequisite PRDs

---

## Anti-Pattern Checks

### Scope Validation

- [ ] **NOT an "Everything PRD"**
  - Scope is limited to one release/phase/problem area
  - Does not cover entire product across many phases
  - Does not include all bounded contexts at once

### Content Separation

- [ ] **NOT an Architecture Spec**
  - No detailed service layout or folder structure
  - No class diagrams embedded
  - Architecture details are referenced, not embedded

- [ ] **NOT a QA Standard**
  - No coverage percentage requirements
  - No test tool configurations
  - No full testing pyramid details
  - Testing requirements are minimal and appropriate

- [ ] **NOT a Traceability Matrix**
  - No manual story-to-service-to-table-to-test mapping
  - Only key stories mapped to features if needed

### Goal Quality

- [ ] **Goals are NOT vague**
  - No "better UX" without specifics
  - No "more consistent" without measurement
  - Each goal has an observable signal

---

## Cross-Reference Validation

### Linked Documents Exist

- [ ] All `affects` documents exist
- [ ] All Related Documents links are valid
- [ ] SRM sections referenced exist
- [ ] ADR references are valid

### Consistency Checks

- [ ] PRD ID matches filename
- [ ] Title in frontmatter matches H1 heading
- [ ] Status in frontmatter matches Overview status
- [ ] Owner in frontmatter matches Overview owner

---

## Quality Checks

### Clarity

- [ ] Problem statement is clear and specific
- [ ] Goals are actionable and measurable
- [ ] Requirements are unambiguous
- [ ] Flows are understandable

### Completeness

- [ ] All user roles have use cases
- [ ] All features have corresponding DoD items
- [ ] All dependencies are identified
- [ ] All major risks are documented

### Alignment

- [ ] Goals align with Vision document
- [ ] Scope aligns with MVP roadmap phase
- [ ] Requirements align with SRM ownership
- [ ] Security requirements align with SEC docs

---

## Final Submission Checklist

Before marking as Proposed:

- [ ] All sections complete
- [ ] All anti-patterns avoided
- [ ] All cross-references valid
- [ ] Spell check passed
- [ ] Reviewed by at least one other team member
- [ ] Added to `docs/INDEX.md`
- [ ] Updated `last_review` date in frontmatter
- [ ] Changed status from Draft to Proposed
