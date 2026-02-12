---
title: "EXECUTION-SPEC PRD-030 — Delta Patch (Audit Pass 2)"
doc_type: "patch"
source_spec: "EXECUTION-SPEC-PRD-030.md"
version: "0.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "proposed"
---

# Delta Patch: EXECUTION-SPEC-PRD-030 (Audit Pass 2)

This patch addresses remaining implementation landmines found in the second audit pass:
- overly strict setup completion transition guard
- table label duplication due to case/whitespace variance
- enum drift risk from hard-coded Zod lists
- ambiguous “resume step” algorithm
- “need” terminology ban too rigid for ops language

> Scope note: This patch stays within the current v0 posture (Inventory Count model, type-only table creation).

---

## 1) Make `rpc_complete_casino_setup` transition guard future-proof

### Patch location
WS1 → Step 10 (DB Implementation) → `rpc_complete_casino_setup`

### Replace
- `UPDATE ... WHERE setup_status = 'not_started'`
- “If 0 rows affected: raise CONFLICT (already completed or not found)”

### With (idempotent + non-ready transition)
- If row missing: `NOT_FOUND`
- If already `ready`: return success (idempotent)
- Else transition to `ready` from **any non-ready** state

**Proposed pseudocode**
```sql
-- Precondition: RLS context set; caller authorized
SELECT setup_status INTO v_status
FROM casino_settings
WHERE casino_id = p_casino_id;

IF NOT FOUND THEN
  RETURN error('NOT_FOUND');
END IF;

IF v_status = 'ready' THEN
  RETURN ok(current_row);
END IF;

UPDATE casino_settings
SET setup_status = 'ready',
    setup_completed_at = now(),
    setup_completed_by = current_setting('app.actor_id', true)::uuid
WHERE casino_id = p_casino_id;

RETURN ok(updated_row);
```

**Acceptance**
- calling Complete twice returns `ok=true`
- new intermediate statuses (future) don’t break completion

---

## 2) Enforce case/whitespace-safe uniqueness for table labels (prevent duplicate tables)

### Patch location
WS1 → Step 4 (Migrations) and WS2 → Step 4 (Upsert Tables)

### Add/replace requirements
The current spec’s `onConflict: 'casino_id,label'` is insufficient because humans type inconsistent case/spacing.

**Choose one of the following approaches (A recommended):**

### A) Normalized label column (recommended)
Add to migration:
- `label_normalized text generated always as (lower(trim(regexp_replace(label, '\s+', ' ', 'g')))) stored`
- unique index: `(casino_id, label_normalized)`

Update upsert:
- conflict target: `casino_id,label_normalized`

### B) `citext` for label
- change `label` type to `citext`
- unique index: `(casino_id, label)`

**Acceptance**
- “BJ-01” and “bj-01” conflict, not duplicate
- “BJ  01” and “BJ 01” conflict, not duplicate

---

## 3) Remove enum drift risk: stop hardcoding `game_type` lists in Zod schemas

### Patch location
WS2 → Step 3 (Schema Validation) → `createGamingTableSchema`

### Replace
Hard-coded list like:
- `z.enum(['blackjack','poker','roulette',...])`

### With (source of truth)
- Use `database.types.ts` `Enums['game_type']` as the canonical source.
- Derive the Zod enum dynamically from that generated type list (build-time constant), OR validate as string + runtime guard against DB enum values.

**Spec language (add)**
- “Wizard must not duplicate enum catalogs in code. All enum constraints must be sourced from `types/database.types.ts` to prevent drift.”

**Acceptance**
- adding a new `game_type` in DB does not require hunting down string arrays in the wizard

---

## 4) Define deterministic “Resume Step” algorithm for re-entry

### Patch location
WS3 → Wizard Behavior or add a dedicated section: “Re-entry & Resume Rules”

### Add
**Resume Step Rules (New)**

If `casino_settings.setup_status = 'ready'`:
- redirect to app home/pit dashboard

Else determine current step using server-fetched state (single source of truth):
1. If casino basics incomplete (casino/casino_settings missing required values): **Step 1**
2. Else if required seeded `game_settings` count = 0: **Step 2**
3. Else if `gaming_table` count = 0: **Step 3**
4. Else: **Step 4**
5. Step 5 (Review/Complete) becomes available when steps 1–4 satisfied

**Tie-breakers**
- If Step 3 has tables but Step 2 not seeded: route to **Step 2** (seed first).
- If Step 4 par values are missing, do not block progress; par is optional but recommended.

**Acceptance**
- Refresh mid-wizard lands user on correct step without duplicates
- Re-entry behavior is consistent across environments

---

## 5) Clarify “Linear stepper” vs “Skip Setup” semantics

### Patch location
WS3 → UX notes for the stepper

### Add/replace wording
- “No forward step jumping within the stepper.”
- “Skip Setup exits the wizard early (feature-flag gated) by marking setup ready and redirecting to the app.”

**Acceptance**
- reviewers don’t keep misreading “Skip” as “jump to Step 5”

---

## 6) Allow ops vernacular: keep label clean, allow ‘need’ in helper text

### Patch location
WS3 → Step 4 (Par Targets) UI copy

### Replace
- “Label MUST NOT use the word need”

### With
- Primary label: **Target Bankroll (Par)**
- Helper/tooltip: “Sometimes called the table’s *need baseline* (not live fill need). Used for variance + fill-pressure heuristics in Inventory Count.”

**Acceptance**
- operators recognize the concept (“need”) without confusing it with live fill need

---

## 7) Add acceptance tests for the above changes

### Patch location
WS4 → Testing / DoD

### Add tests
- **Case-insensitive label uniqueness**: attempt to create two tables with same label different case/spacing; second upsert updates, no new row.
- **Enum drift test**: schema generation + typecheck ensures wizard enum constraints compile without hard-coded lists.
- **Resume-step determinism**: simulate each partial state; wizard lands on expected step.

---

## Drop-in checklist
- [ ] Completion RPC transitions from any non-ready state and is idempotent
- [ ] Table label uniqueness is case/space safe
- [ ] No hard-coded `game_type` list exists in Zod
- [ ] Resume-step algorithm is defined and implemented
- [ ] “Linear stepper” wording clarified
- [ ] ‘Need’ allowed in helper text, not as primary label
- [ ] Tests cover all above

