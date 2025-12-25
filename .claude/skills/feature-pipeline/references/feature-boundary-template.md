# Feature Boundary Statement Template

> Copy this template to `docs/20-architecture/specs/{FEATURE-ID}/FEATURE_BOUNDARY.md`

---

## Template

```markdown
# Feature Boundary Statement: {Feature Name}

> **Ownership Sentence:** This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **{PrimaryService}** — {responsibility}
  - **{SecondaryService}** — {responsibility} (if applicable)

- **Writes:**
  - `{table_1}` ({purpose})
  - `{table_2}` ({purpose})

- **Reads:**
  - `{table_1}`, `{table_2}` (via DTOs)

- **Cross-context contracts:**
  - `{DTO_Name}` — {purpose}
  - `{Service}.{method}()` — {purpose}

- **Non-goals (top 5):**
  1. {Explicit exclusion 1}
  2. {Explicit exclusion 2}
  3. {Explicit exclusion 3}
  4. {Explicit exclusion 4}
  5. {Explicit exclusion 5}

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-{ID})

---

## Goal

{One sentence: What outcome exists after shipping that did not exist before?}

## Primary Actor

**{Role}** ({description of who triggers the feature})

## Primary Scenario

{One sentence describing the main use case}

## Success Metric

{One measurable outcome that proves the feature works}

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **ADR-{ID}** | Durable architectural decisions (frozen) | `docs/80-adrs/ADR-{ID}_DECISIONS.md` |
| **EXEC-SPEC-{ID}** | Implementation details (mutable) | `docs/20-architecture/specs/{FEATURE-ID}/EXEC-SPEC-{ID}.md` |
| **DOD-{ID}** | Executable gate checklist | `docs/20-architecture/specs/{FEATURE-ID}/DOD-{ID}.md` |
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/{FEATURE-ID}/FEATURE_BOUNDARY.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
```

---

## Example: Player Identity Enrollment

```markdown
# Feature Boundary Statement: Player Identity Enrollment (ADR-022)

> **Ownership Sentence:** This feature belongs to **PlayerService** (identity artifacts) and **CasinoService** (enrollment relationship). PlayerService writes to `player`, `player_identity`; CasinoService writes to `player_casino`. Cross-context needs go through **PlayerEnrollmentDTO** and **PlayerIdentityDTO**.

---

## Feature Boundary Statement

- **Owner services:**
  - **PlayerService** — identity artifacts (`player`, `player_identity`)
  - **CasinoService** — enrollment relationship (`player_casino`)

- **Writes:**
  - `player` (core patron record)
  - `player_identity` (ID document metadata)
  - `player_casino` (enrollment relationship)

- **Reads:**
  - `player`, `player_identity`, `player_casino` (via DTOs)

- **Cross-context contracts:**
  - `PlayerEnrollmentDTO` — enrollment status
  - `PlayerIdentityDTO` — identity read projection
  - `CasinoService.enrollPlayer()` — enrollment RPC

- **Non-goals (top 5):**
  1. Tax identity storage (SSN/TIN) — deferred to post-MVP
  2. ID scanner integration — manual entry only for MVP
  3. Compliance role gating — not needed until tax features
  4. CTR threshold enforcement — Finance/MTL owns this
  5. Document encryption (Vault/pgsodium) — deferred with tax identity

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-022)

---

## Goal

Enable floor supervisors to enroll patrons into the player tracking system by capturing basic identity information from government-issued ID documents.

## Primary Actor

**Pit Boss** (floor supervisor with enrollment authority)

## Primary Scenario

Pit boss scans or manually enters patron ID, system creates player record and casino enrollment, identity metadata is attached to enrollment.

## Success Metric

Enrollment workflow completes in < 30 seconds with correct RLS enforcement and actor binding.
```

---

## Validation Checklist

Before passing the `srm-ownership` gate:

- [ ] Ownership sentence is clear and specific
- [ ] All tables written are listed
- [ ] Cross-context contracts are identified
- [ ] Non-goals explicitly exclude 5+ items
- [ ] Primary actor is a specific role
- [ ] Success metric is measurable
