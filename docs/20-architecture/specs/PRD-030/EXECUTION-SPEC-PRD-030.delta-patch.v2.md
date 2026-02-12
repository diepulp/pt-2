---
title: "EXECUTION-SPEC PRD-030 — Delta Patch (Audit Pass 3)"
doc_type: "patch"
source_spec: "EXECUTION-SPEC-PRD-030.md"
version: "0.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "proposed"
---

# Delta Patch: EXECUTION-SPEC-PRD-030 (Audit Pass 3)

This patch is a **small cleanup pass** after Patch v1 was applied. It removes stale wording, resolves minor inconsistencies, and hardens DoD/tests to match the intended posture.

---

## 1) Fix stale uniqueness wording in WS2 persistence model

### Patch location
WS2 → “Data persistence model” (Step 3 / Tables)

### Replace
Any phrasing like:
- “Upsert with uniqueness on `(casino_id, label)`”

### With
- “Upsert with uniqueness on `(casino_id, label_normalized)` (case/whitespace-safe). Conflict target: `casino_id,label_normalized`.”

**Acceptance**
- No text in the spec suggests `(casino_id,label)` is sufficient.

---

## 2) Clarify “no new tables” vs “schema changes”

### Patch location
Scope / Non-goals / DoD language where it implies “no schema changes”

### Add / replace wording
- “No new database tables.”
- “Schema alteration to `gaming_table` (generated `label_normalized` + unique index) is **in scope** to guarantee idempotent table creation.”

**Acceptance**
- Reviewers do not misread “no new tables” as “no migrations.”

---

## 3) Return stored timestamps from `rpc_complete_casino_setup` (avoid `now()` drift)

### Patch location
WS1 → Step 10/11 (DB implementation for `rpc_complete_casino_setup`)

### Replace
Return payload fields using fresh `now()` (or reconstructed values)

### With
Use `RETURNING` for updated rows, and direct select for idempotent path:

**Proposed pseudocode**
```sql
-- if status = ready
SELECT setup_status, setup_completed_at, setup_completed_by
INTO v_status, v_at, v_by
FROM casino_settings
WHERE casino_id = p_casino_id;

IF v_status = 'ready' THEN
  RETURN ok(v_status, v_at, v_by);
END IF;

UPDATE casino_settings
SET setup_status = 'ready',
    setup_completed_at = now(),
    setup_completed_by = current_setting('app.actor_id', true)::uuid
WHERE casino_id = p_casino_id
RETURNING setup_status, setup_completed_at, setup_completed_by
INTO v_status, v_at, v_by;

RETURN ok(v_status, v_at, v_by);
```

**Acceptance**
- Tests can assert returned timestamps equal stored values.
- No mismatches due to double `now()` calls.

---

## 4) Strengthen Skip Setup E2E to assert empty-state safety

### Patch location
WS5 → Tests → “Skip Setup flow”

### Add assertions
After redirect to `/pit` (or equivalent):
- The dashboard renders without runtime errors.
- Empty-state UI appears (e.g., “No tables yet” + “Continue Setup” CTA).
- A “Continue Setup” action navigates back into wizard per resume-step rules.

**Acceptance**
- Skip does not create a broken tenant experience.

---

## 5) Make admin-only enforcement mechanism explicit for server actions

### Patch location
WS2 → Security/Authorization for server actions (`createGameSettingsSeedAction`, `createGamingTableAction`, `updateTableParTargetsAction`)

### Add
One explicit enforcement statement (choose one approach; do not mix silently):

**Option A (recommended): Role gate in middleware**
- “Each server action MUST assert `staff_role === 'admin'` (exact enum value) prior to DB calls.”

**Option B: RLS-only with explicit test**
- “RLS is the enforcement layer; actions do not role-gate in app code. Tests must prove non-admin cannot mutate via actions.”

**Acceptance**
- There is no ambiguity on whether app code or RLS enforces admin-only.

---

## 6) Make duplicate-label migration behavior a required outcome (not just a risk note)

### Patch location
WS1 → Step 4 (Migration) + WS1 DoD

### Add required behavior
Before adding the unique index on `(casino_id, label_normalized)`:
- If duplicates exist, migration must either:
  - **Fail fast** with an actionable error listing offending `casino_id,label` groups, OR
  - Perform deterministic dedup (specify rule) and log changes.

**Recommended for MVP:** fail fast.

**Acceptance**
- Migration outcome is deterministic; no “surprise index creation failure” in prod.

---

## 7) Resolve Step 4 optionality vs Step 5 availability wording

### Patch location
WS3 → Resume step algorithm and Step 5 “available when…” line

### Replace
- “Step 5 becomes available when steps 1–4 are satisfied”

### With
- “Step 5 becomes available when steps 1–3 are satisfied. Step 4 (Par Targets) is recommended but optional.”

**Acceptance**
- Spec is internally consistent: par optional ≠ gating completion.

---

## Drop-in checklist
- [ ] All uniqueness references use `(casino_id, label_normalized)`
- [ ] Scope clarifies migrations are in scope (no new tables ≠ no schema changes)
- [ ] Completion RPC returns stored values via `RETURNING`/select
- [ ] Skip E2E asserts empty-state safety + “Continue Setup” CTA works
- [ ] Admin-only enforcement mechanism is explicit (app role gate OR RLS-only + tests)
- [ ] Duplicate labels handled deterministically in migration (fail fast or dedup)
- [ ] Step 4 optionality matches Step 5 gating language

