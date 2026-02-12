---
title: "PRD-030 Setup Wizard v0 — Delta Patch (Audit Fixes)"
doc_type: "patch"
source_prd: "PRD-030-setup-wizard-v0.md"
version: "0.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "proposed"
---

# Delta Patch: PRD-030 Setup Wizard (v0)

This patch is a **surgical addendum** to remove implementation ambiguity and align the PRD with PT‑2 realities (Inventory Count model, matrix-first/RLS posture). It is written to be applied manually or used as a checklist for editing `PRD-030-setup-wizard-v0.md`.

> Scope note: This patch **does not expand** feature scope; it clarifies semantics, idempotency, role identifiers, and the `game_type` vs `game_settings` mismatch.

---

## 1) Clarify write model per step (no “draft-only” steps)

### Add to **Requirements → Functional Requirements**

**FR-9 Wizard Step Persistence Model (New)**  
- Each step that captures data MUST persist changes on “Next” (server write), not only at final completion.
- Persistence is **idempotent** and safe under refresh / back / re-entry.
- Concrete semantics:
  - **Step 2 (Game Settings Seed)**: inserts/upserts seeded `game_settings` for `casino_id` (no duplicates on re-run).
  - **Step 3 (Tables)**: upserts `gaming_table` rows (create/update), with unique constraint semantics (see §5).
  - **Step 4 (Par Targets)**: updates existing `gaming_table` rows with `par_total_cents` and audit stamps (if present).
  - **Step 5 (Complete Setup)**: only flips `casino_settings.setup_status` and `setup_completed_at/by`.

### Edit **Step 3** copy (Tables)
Replace any wording implying “client draft” with:

- “On **Next**, tables are **saved (upserted)** to the database. Refresh/re-entry does not create duplicates.”

### Edit **Step 4** copy (Par Targets)
Replace “collected” ambiguity with:

- “On **Next**, par targets are **persisted** to the database for the selected tables.”

---

## 2) Resolve `game_type` enum vs seeded `game_settings` “variant list” mismatch

### Replace in **Step 3 (Tables)**
Current concept: “type dropdown populated from seeded game_settings”

**Replace with (MVP-clean):**
- Table “Type” dropdown is populated from `Enums.game_type` (canonical list).
- `game_settings` seeding in Step 2 is **required** for downstream calculations, but **Step 3 does not select a variant**.

### Add a note under Step 2 (Game Settings Seed)
- “Seeding provides default metadata per `game_type` (house edge, decisions/hr, seats, etc.). Variant selection (e.g., ‘BJ 6D Lucky Ladies’) is **out of scope** for this PRD unless a first-class FK (`gaming_table.game_settings_id`) is introduced.”

> If you intend variants now, stop being coy: add `gaming_table.game_settings_id` (or code) and update the PRD accordingly. This patch assumes **type-only** for v0.

---

## 3) Make `rpc_complete_casino_setup()` idempotent (return success when already ready)

### Replace Appendix B section for `rpc_complete_casino_setup`

**Existing behavior (problematic):**
- “If no row updated: return error (already completed or not found).”

**Replace with (idempotent):**

- The RPC MUST be idempotent.
- Behavior:
  1. If `casino_settings` row missing for `casino_id`: return `error_code = 'NOT_FOUND'`.
  2. If `setup_status = 'ready'`: return `ok = true` with current completion metadata.
  3. Else update `setup_status = 'ready'`, set `setup_completed_at = now()`, `setup_completed_by = actor_id`, then return `ok = true`.

**Return payload (recommended):**
```json
{
  "ok": true,
  "casino_id": "uuid",
  "setup_status": "ready",
  "setup_completed_at": "timestamp",
  "setup_completed_by": "uuid"
}
```

---

## 4) Gate “Skip Setup” or add a mandatory empty-state UX + DoD checks

### Amend **FR-7 Skip Setup (and/or Add FR-10)**
Add one of the following (choose now, don’t ship ambiguity):

**Option A (recommended for MVP safety): Feature flag**
- “Skip Setup is available only when `NEXT_PUBLIC_ENABLE_SKIP_SETUP=true` (or equivalent server-side feature flag).”

**Option B: Must support empty-tenant UX**
- If Skip is allowed in production, the app MUST provide:
  - A stable empty-state for pit/table dashboards with “No tables yet” messaging
  - A prominent “Continue Setup” CTA
  - No runtime errors from missing configuration

### Add to **Definition of Done**
- “Dashboards that reference tables must render correctly with **zero tables** and with `setup_status != ready`.”

---

## 5) Add explicit table uniqueness + no-duplication rule for Step 3

### Add to **Backend Scope** (under createGamingTableAction / Step 3)
- Tables are upserted using a deterministic uniqueness rule.
- Required uniqueness for v0:
  - `gaming_table(casino_id, label)` must be unique (case-insensitive recommended).
- On conflict:
  - Update mutable fields: `type`, `pit_id`, `status` (as allowed)
  - Never create duplicates for same casino + label.

### Add to **Testing**
- “Re-run Step 3 multiple times; verify no duplicates are created.”

---

## 6) Schema gate for `par_updated_at/by` (avoid surprise breakage)

### Add to **Appendix A (Schema References)** or DoD
- “Verify `gaming_table.par_updated_at` and `gaming_table.par_updated_by` exist in canonical schema; if absent, store only `par_total_cents` and omit audit stamps (or add a migration explicitly).”

---

## 7) Replace role prose with canonical enum identifiers

### Add a small section **Authorization**
**Allowed roles** MUST reference exact `Enums.staff_role` values used in PT‑2.

- Replace ambiguous prose like “admin/manager” with:
  - “Allowed roles: `<exact enum values>`.”

> If you don’t know the exact values, **derive them from `database.types.ts`** and paste them here. Don’t leave it to vibes.

---

## 8) Terminology tweak: stop calling it “need” in the UI

### Edit Step 4 UI labels
Replace:
- “Target Need (Par)”

With:
- **“Target Bankroll (Par)”**  
  Helper: “Used for fill pressure + variance reporting; not accounting truth in Inventory Count.”
  "What is the intended bankroll baseline for this table"

Keep the term “need” only as an internal computation term if necessary.

---

## 9) Add two missing high-value tests (RLS + re-entry)

### Add to **Testing** section
1. **RLS Isolation Test**
   - Staff from casino A cannot mutate casino B setup state or tables (including calling completion RPC).
2. **Wizard Re-entry / Refresh Test**
   - Refresh mid-wizard and re-enter; previously saved state loads and does not duplicate rows.

---

## Suggested insertion points (for quick manual edit)

- FR-9: after FR-8 (if present) or after FR-6 completion rules.
- `game_type` clarification: Step 3 section (replace dropdown text).
- RPC idempotency: Appendix B.
- Skip gating: FR-7 and DoD.
- Uniqueness: Backend Scope + Testing.
- Terminology: Step 4 UI spec.

---

## Acceptance Checklist (post-patch)
- [ ] Step 3 writes tables; refresh does not duplicate.
- [ ] Step 3 selects `game_type` (enum), not seeded variant list.
- [ ] `rpc_complete_casino_setup` returns success when already ready.
- [ ] Skip Setup is feature-flagged **or** empty-tenant UX is in DoD + tested.
- [ ] Uniqueness rule is enforced (`casino_id + label`).
- [ ] RLS cross-casino mutation tests exist.
- [ ] UI says “Target Bankroll (Par)”, not “need”.
