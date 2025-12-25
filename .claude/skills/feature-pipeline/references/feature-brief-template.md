# Feature Brief Template (1 Page)

> Copy this template to `docs/20-architecture/specs/{FEATURE-ID}/FEATURE_BRIEF.md`

---

## Purpose

Prevent scope creep by declaring intent + non-goals up front.

**Rule:** No implementation detail here. The brief is a 1-page alignment document.

---

## Template

```markdown
# Feature Brief: {Feature Name}

**ID:** {FEATURE-ID}
**Date:** YYYY-MM-DD
**Author:** {name}
**Status:** Draft | Proposed | Approved

---

## Goal

{One sentence: What outcome exists after shipping that did not exist before?}

---

## Primary Actor

**{Role}** — {Brief description of who triggers the feature}

---

## Primary Scenario

{One sentence describing the main use case}

---

## Success Metric

{One measurable outcome that proves the feature works}

---

## Bounded Context

| Aspect | Details |
|--------|---------|
| **Owner Service(s)** | {PrimaryService}, {SecondaryService} |
| **Writes** | `{table_1}`, `{table_2}` |
| **Reads** | `{table_1}`, `{table_2}` (via DTOs) |
| **Cross-Context Contracts** | `{DTO}`, `{RPC}` |

---

## Non-Goals (5+ Explicit Exclusions)

1. **{Non-goal 1}** — {Why it's out of scope}
2. **{Non-goal 2}** — {Why it's out of scope}
3. **{Non-goal 3}** — {Why it's out of scope}
4. **{Non-goal 4}** — {Why it's out of scope}
5. **{Non-goal 5}** — {Why it's out of scope}

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| {PRD/Service} | Required / Optional | Implemented / Planned |

---

## Risks / Open Questions

| Risk / Question | Impact | Mitigation / Answer Needed |
|-----------------|--------|---------------------------|
| {risk_1} | High/Med/Low | {mitigation or question} |

---

## Next Steps

1. [ ] Feature Boundary Statement approved
2. [ ] PRD drafted
3. [ ] SEC note reviewed
4. [ ] ADR created (if durable decisions exist)
5. [ ] EXEC-SPEC + DoD generated

---

**Gate:** If you can't list 5+ non-goals, you're about to overbuild.
```

---

## Example: Player Identity Enrollment

```markdown
# Feature Brief: Player Identity Enrollment

**ID:** ADR-022
**Date:** 2025-12-24
**Author:** Lead Architect
**Status:** Approved

---

## Goal

Enable floor supervisors to enroll patrons into the player tracking system by capturing basic identity information from government-issued ID documents.

---

## Primary Actor

**Pit Boss** — Floor supervisor with authority to enroll new patrons

---

## Primary Scenario

Pit boss manually enters patron's government ID information, system creates player record, establishes casino enrollment, and attaches identity metadata.

---

## Success Metric

Enrollment workflow completes in < 30 seconds with correct RLS enforcement and actor attribution.

---

## Bounded Context

| Aspect | Details |
|--------|---------|
| **Owner Service(s)** | PlayerService (identity), CasinoService (enrollment) |
| **Writes** | `player`, `player_identity`, `player_casino` |
| **Reads** | All three via DTOs |
| **Cross-Context Contracts** | `PlayerEnrollmentDTO`, `CasinoService.enrollPlayer()` |

---

## Non-Goals (5+ Explicit Exclusions)

1. **Tax identity storage (SSN/TIN)** — Requires encryption infrastructure not available for MVP
2. **ID scanner integration** — Manual entry only; scanner hardware integration deferred
3. **Compliance role gating** — Not needed until tax features are implemented
4. **CTR threshold enforcement** — Owned by Finance/MTL, not PlayerService
5. **Document encryption (Vault/pgsodium)** — Deferred with tax identity
6. **Player matching/merge workflow** — MVP accepts potential duplicates

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| CasinoService | Required | Implemented |
| PlayerService (core) | Required | Implemented |
| ADR-015 (RLS Pattern C) | Required | Implemented |

---

## Risks / Open Questions

| Risk / Question | Impact | Mitigation / Answer Needed |
|-----------------|--------|---------------------------|
| Duplicate player records | Medium | Accept for MVP; add merge workflow post-MVP |
| Document number breach | High | Store as hash + last4 only |

---

## Next Steps

1. [x] Feature Boundary Statement approved
2. [x] PRD drafted
3. [x] SEC note reviewed
4. [x] ADR created and frozen
5. [x] EXEC-SPEC + DoD generated
```

---

## Validation Checklist

Before passing the `brief-approved` gate:

- [ ] Goal is one clear sentence
- [ ] Primary actor is a specific role
- [ ] Primary scenario is one sentence
- [ ] Success metric is measurable
- [ ] Bounded context identifies owner(s), writes, reads, contracts
- [ ] 5+ non-goals are listed with justification
- [ ] Dependencies are identified with status
- [ ] Risks/open questions are documented
- [ ] No implementation detail (no SQL, no code, no triggers)
