# Definition of Done (DoD) Guide

Every PRD must include a clear, minimal, release-specific Definition of Done.

## DoD Principles

1. **Small and concrete** — Describes a state reachable in the near term
2. **Observable** — Every bullet is binary: done or not done
3. **Behavior-first** — Focus on working behavior, not code structure
4. **Phase-appropriate** — First release DoD is rigorous but not enterprise-mature

## DoD Structure

A well-formed DoD has 5-12 bullets across these categories:

### 1. Functionality
- All "must-have" user stories work end-to-end in target environment
- Critical edge cases handled (or documented as explicit post-PRD backlog)

### 2. Data & Integrity
- Data remains consistent across a full realistic usage scenario (e.g., one shift)
- No orphaned or stuck records for key flows

### 3. Security & Access
- Minimal role/permission model enforced for this slice
- No known "obvious" privilege escalation paths for core flows

### 4. Testing
- At least one unit or integration test per critical service or flow
- At least one "happy path" end-to-end test for the main journey

> Note: Full coverage targets, test matrices, and performance testing live in QA standards, not here.

### 5. Operational Readiness
- Key logs/metrics exist to debug failures in this slice
- A simple rollback or mitigation path is defined

### 6. Documentation
- User-facing snippets or internal runbooks updated for this slice (where applicable)
- Known limitations are documented

---

## DoD Anti-Patterns

DoD **must not**:

- Require "90%+ coverage on all services" for an MVP-level slice
- Enumerate every test tool, CI step, or coverage report format
- Require completion of all future phases (e.g., demanding Loyalty and Finance for a Table/Rating pilot)

Those belong in global **QA standards** or later-phase PRDs.

---

## DoD Examples by Phase

### MVP / Pilot Phase DoD
```markdown
**Functionality**
- [ ] Supervisor can open table, start rating, pause/resume, close
- [ ] Player search returns results within 2 seconds
- [ ] Rating slip saves and displays correctly

**Data & Integrity**
- [ ] No duplicate ratings created for same player/table/session
- [ ] Closed ratings cannot be reopened

**Security & Access**
- [ ] Only authenticated supervisors can access rating functions
- [ ] Players cannot see other players' data

**Testing**
- [ ] Integration tests cover rating lifecycle
- [ ] E2E test covers open-rate-close flow

**Operational Readiness**
- [ ] Errors logged with correlation IDs
- [ ] Migration rollback script tested

**Documentation**
- [ ] README updated with setup instructions
- [ ] Known issues documented in CHANGELOG
```

### Growth Phase DoD
```markdown
**Functionality**
- [ ] All Phase 2 user stories work E2E
- [ ] Multi-table sessions work correctly
- [ ] Loyalty points calculated and displayed

**Data & Integrity**
- [ ] Points calculations match business rules
- [ ] Concurrent edits handled gracefully

**Security & Access**
- [ ] Role-based access enforced per bounded context
- [ ] Audit trail for sensitive operations

**Testing**
- [ ] Unit tests for calculation logic
- [ ] Integration tests for cross-service flows
- [ ] Load test: 50 concurrent users

**Operational Readiness**
- [ ] Alerts configured for critical paths
- [ ] Runbook for common failure scenarios

**Documentation**
- [ ] API docs updated
- [ ] Deployment guide revised
```

---

## Writing Effective DoD Items

### Good DoD Items
- "Supervisor can open a table, start a rating, pause/resume, and close it"
- "No duplicate ratings created for same player/table combination"
- "At least one E2E test covers the main rating flow"

### Bad DoD Items
- "Code quality is good" (subjective)
- "All edge cases handled" (unbounded)
- "100% test coverage" (over-scoped for MVP)
- "Performance is acceptable" (unmeasurable)

### Transformation Examples

| Bad | Good |
|-----|------|
| "System is reliable" | "Key flows work without errors for 1-hour test session" |
| "Good test coverage" | "At least one test per critical service function" |
| "Secure access" | "Only authenticated users with supervisor role can access rating" |
| "Documentation complete" | "README and CHANGELOG updated for this release" |
