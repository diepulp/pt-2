---
title: "Audit & Improvement Suggestions — EXECUTION-SPEC-GAP-SETUP-WIZARD"
doc_type: "audit"
version: "v1.0"
status: "draft"
created_at: "2026-02-16"
timezone: "America/Los_Angeles"
source:
  - "EXECUTION-SPEC-GAP-SETUP-WIZARD.md"
---

# Audit & Improvement Suggestions — EXECUTION-SPEC-GAP-SETUP-WIZARD

This audit reviews **EXECUTION-SPEC-GAP-SETUP-WIZARD.md** for robustness, internal consistency, and “can it actually deliver what it promises” risk.

---

## What’s solid

- **Workstreams are coherent** and dependency ordering is mostly sane (e.g., WS5 depends on WS2; WS3 depends on WS2).
- Centralizing rules into **`wizard-validation.ts`** is the correct direction: it prevents drift across step gating, review audit, and stepper navigation.
- Scope boundaries are *mostly* clear: poker fee-model deferred; roulette removed from wizard UI while remaining in DB enums.

---

## Primary risks (robustness cracks)

### 1) “Frontend-only” scope conflicts with promises that require server guarantees

The spec states **no new server actions / API / migrations**, yet it promises outcomes that typically need server/DB enforcement:

- **Idempotency** (“Generate from games is idempotent”)
- **Reload/resume lands on earliest step with blockers**
- **Poker table gating** (“can only be created if custom poker game setting exists”)

These can be approximated client-side, but **robust behavior** generally needs at least one of:
- server-side validation before writes
- DB constraints
- server action wrappers enforcing invariants

**Suggestion (pick one, but make it explicit):**
- **Option A (keep frontend-only):** downgrade language to “client prevents invalid progression and avoids duplicates in a single session/state,” and explicitly list what is **not** guaranteed without server support.
- **Option B (recommended):** allow minimal server hardening: one “validate + upsert” server action that enforces idempotency via deterministic keys (e.g., `(casino_id, game_settings_id, label)`).

---

### 2) Validation semantics are underspecified (blocker vs warning is vague)

You introduce `severity: 'blocker' | 'warning'`, but do not define the canonical issue catalog by step.

**Suggestion:** add a **Validation Contract** table in the spec (and implement it in `wizard-validation.ts`) that pins the exact rules. Example for Step 2:

| Rule | Severity | Condition |
|---|---|---|
| Must have ≥1 table | blocker | `tables.length === 0` |
| Table must link to variant when multiple variants exist | blocker | `game_settings_id == null` AND `variantsForType > 1` |
| Unlinked table when only one variant exists | warning | `game_settings_id == null` AND `variantsForType == 1` |
| Duplicate table labels in same area/type | warning (or blocker if required) | label collision |

This prevents “random” warnings and makes the wizard deterministic.

---

### 3) “Auto-clear errors without useEffect” is easy to implement incorrectly

If `validationIssues` are stored in state, they won’t truly auto-clear unless revalidated on every edit/render.

**Suggestion:**
- Don’t store issues as the source of truth.
- Store only a `showErrors`/`lastAttemptedStep` flag.
- Derive issues from current state on render via `validateStep()`.

If you must persist anything, persist **dismissals** (`dismissedIssueIds`) not the issue list.

---

### 4) Client-side “idempotency” is not real idempotency

“Check existing rows before insert” only prevents duplicates **within a single loaded state** and can fail across:
- multiple tabs
- race conditions
- retries

**Suggestion:** if DB/actions are out of scope, rename to **client-idempotent** and restrict the acceptance criteria accordingly.

If server-side is allowed:
- implement `INSERT ... ON CONFLICT DO NOTHING` (or equivalent) via a minimal server action, or
- add a unique constraint to support real idempotency.

---

### 5) Line-number references will rot

Referencing exact line ranges is brittle and guarantees the spec becomes stale.

**Suggestion:** replace line refs with stable anchors:
- component names
- function names
- section headers

---

## Medium issues / inconsistencies

- The spec references **OPEN‑10 to OPEN‑12**, but does not restate them in brief. Execution specs should stand alone.
- “React 19 compliance: no useEffect sync, no unnecessary memoization” is an **implementation guideline**, not a correctness gate. If you keep it, move under “Implementation Guidelines” so it doesn’t block shipping.
- Roulette compatibility: the spec notes keeping enum compatibility, but it should explicitly define handling of **existing roulette records**:
  - hidden from UI?
  - shown with warning?
  - excluded from review?

---

## Hardening improvements (practical, not cosmetic)

### 1) Add a Validation Contract section (ship this)

- Define per-step **blockers** and **warnings** precisely.
- Define skip semantics (e.g., Step 3 “skipped” is persisted as explicit user choice).

### 2) Add a micro Test Workstream (worth it)

- Unit tests for `validateStep()` and `validateAllSteps()`.
- This is cheap and prevents regression as the wizard evolves.

### 3) Define deterministic resume-step logic

Add a simple algorithm:

- `resumeStep = first step with blockers`
- else `resumeStep = lastVisitedStep` (if stored)
- else `resumeStep = 0`

If you cannot store `lastVisitedStep` without adding a session table, **remove that promise** from acceptance criteria.

### 4) Step 2 edge-case list

Include explicit behaviors for:
- No game settings but user navigates to Step 2
- Multiple variants and user clears variant link to None
- Variant deleted/changed after tables exist
- Duplicate labels
- Existing roulette data in DB

### 5) Tighten acceptance criteria to match scope reality

If frontend-only:
- Replace “idempotent” with “no duplicates within current fetched state/session.”
- Replace “reload/resume lands on earliest step with blockers” with “wizard initializes to earliest step with blockers based on fetched state.”

If minimal server support is allowed:
- keep strong idempotency wording and enforce it.

---

## Recommended spec edits (high impact)

1) **Introduce “Scope vs Guarantees” block**
   - explicitly distinguish client guarantees vs server/DB guarantees
2) **Add Validation Contract table**
3) **Add Resume algorithm**
4) **Remove line-number references**
5) **Add small test workstream**
6) **Clarify roulette legacy behavior**

---

## Bottom line

Right now the spec has good direction, but it **over-promises** under a “frontend-only” constraint. Harden it by:
- making validation a formal contract
- making resume deterministic
- aligning acceptance criteria with what you can actually enforce
- avoiding brittle references
- adding minimal tests

If you want, I can also output a **patched EXECUTION-SPEC** that incorporates these changes while keeping the same scope (or a variant that allows a minimal server action for real idempotency).
