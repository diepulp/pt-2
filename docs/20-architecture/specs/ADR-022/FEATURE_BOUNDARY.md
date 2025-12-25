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

- **DoD gates:** 5 categories, ~45 executable tests (see DOD-022)
  - A: Functional (schema, enrollment flow, hash storage)
  - B: Security (role matrix, actor binding, isolation, immutability, delete denial, SLAD)
  - C: Data Integrity (constraints, triggers)
  - D: Operability (error handling, audit trail)
  - E: Connection Pooling (production pooling mode)

---

## Goal

Enable floor supervisors to enroll patrons into the player tracking system by capturing basic identity information from government-issued ID documents.

## Primary Actor

**Pit Boss** (floor supervisor with enrollment authority)

## Primary Scenario

Pit boss scans or manually enters patron ID, system creates player record and casino enrollment, identity metadata is attached to enrollment.

## Success Metric

Enrollment workflow completes in < 30 seconds with correct RLS enforcement and actor binding.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **ADR-022** | Durable architectural decisions (frozen) | `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md` |
| **EXEC-SPEC-022** | Implementation details (mutable) | `docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md` |
| **DOD-022** | Executable gate checklist | `docs/20-architecture/specs/ADR-022/DOD-022.md` |
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/ADR-022/FEATURE_BOUNDARY.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
