---
doc: "EXEC-SPEC Audit"
target: "EXEC-038-shift-rundown-deltas"
date: "2026-02-24"
status: "Review"
---

# Audit: EXEC-038 — Shift Rundown Deltas

Source: **EXEC-038-shift-rundown-deltas.md** fileciteturn5file0

## Verdict

**Close to ship-ready**. The execution spec is well-structured (WS1→WS6, clear deliverables, DoD tests, security posture), and it aligns with the ADR/PRD intent.  
However, it still contains several **P0 contradictions / drift traps** that will cause mid-implementation rework unless you tighten them now—mainly around **role literals**, **pit_id semantics**, **per-table delta feasibility**, **RLS vs privileges wording**, and **SQL→TS error mapping**.

---

## What’s strong (keep)

- Clear workstreams, outputs, gates, and rollout plan (this is the right “pipeline” shape).
- DB contract consistent with your governance: SECURITY DEFINER + `search_path=''` + context-first + no actor/casino params.
- Correctly carries the key correctness fixes:
  - `session_id` linkage on raw events
  - atomic totals (`col = col + amount`)
  - inline persistence on close
  - late-event handling (`has_late_events` + `audit_log`)
  - UI null semantics (`formatCents(null) => '---'`)
- DoD gate tests are appropriately paranoid and aligned with the invariants.

---

## P0 Issues (must fix)

### 1) Role gate literals are hardcoded and likely wrong

You gate writes on `app.staff_role IN ('pit_boss','admin')` in multiple places. If the canonical enum values differ (very likely), authorization will silently break.

**Fix:**
- Replace literals with a reference to the canonical enum: **`public.staff_role`** (from `database.types.ts`) as source of truth.
- Add an explicit rule: “Role literals MUST match the enum values; update spec if enum changes.”
- (Preferred long-term) capability gate; but minimum: enum reference.

### 2) `pit_id` semantics are contradictory

You define `pit_id UUID -- MVP: MUST be NULL`, but then:
- create `idx_shift_checkpoint_pit` (dead index in MVP),
- talk about per-pit deltas in scope,
- allow checkpoint_scope values `'pit'|'table'` in schema.

**Fix (pick one):**
- **MVP clean:** remove `idx_shift_checkpoint_pit`, and remove “per-pit” from MVP scope. Keep schema extensibility but state: “pit/table scope deferred; pit_id/table_id always NULL in MVP.”
- **Future-proof MVP:** allow pit_id in MVP and define its identity source (what provides pit IDs), then keep index.

Right now it’s both “in schema” and “impossible to use.”

### 3) Per-table deltas may be infeasible as specified

You assume deterministic historical baseline by calling `rpc_shift_table_metrics(window_start, checkpoint.window_end)` and subtracting from current. That only works if the metrics function:
- supports arbitrary historical windows,
- is deterministic for past windows,
- does not depend on volatile “current state” tables.

**Fix:**
- Add a WS1 feasibility gate: validate metrics RPC supports historical windows (and define determinism expectations).
- If it cannot, choose:
  - store per-table snapshots at checkpoint time (scope bump), or
  - drop per-table deltas from MVP (recommended if uncertain).

### 4) RLS wording implies RLS alone enforces write denial

You say “No INSERT/UPDATE/DELETE policies — all mutations via SECURITY DEFINER RPCs,” but your actual posture is **privilege-based** (REVOKE ALL + GRANT SELECT) plus RLS SELECT.

**Fix:**
- Reword to: “authenticated has no write privileges; writes occur only through GRANT EXECUTE on RPCs. RLS is SELECT scoping.”

### 5) SQL error codes vs TypeScript error codes lack an explicit mapping contract

WS1 uses SQL errors like `TBLRUN_ALREADY_FINALIZED`. WS2 exposes TS codes like `TABLE_RUNDOWN_ALREADY_FINALIZED`. You mention “mapped from SQL error strings,” but the mapping rule is underspecified.

**Fix:**
- Add an explicit mapping table and extraction rule:
  - from SQL `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TBLRUN_ALREADY_FINALIZED'` (or your standard),
  - to TS constants.
- Define HTTP status mapping at the same time (409/403/404/503).

---

## P1 Issues (should fix)

### 6) gaming_day derivation is repeated but not standardized as a rule

You derive gaming_day from `session.opened_at` for rundown and `now()` for checkpoints. Make it explicit as a standard rule to avoid later drift:

- Rundown: `gaming_day = compute_gaming_day(session.opened_at)`
- Checkpoint: `gaming_day = compute_gaming_day(now())`

### 7) Money/null semantics need a per-field contract

You specify `table_win_cents` null when drop not posted. Good. But other nullable cents columns exist. Clarify per field whether NULL means:
- unknown/unposted (render '---'),
- or truly zero.

This affects both delta math and UI.

### 8) Latency claim is speculative

“expected < 20ms overhead” is fine as a note, but it reads too confident. Make it “measure and validate” instead of implied guarantee.

---

## P2 Nits (optional)

- `idx_shift_checkpoint_latest` includes `created_at DESC` but you’ll likely query by `(casino_id, checkpoint_scope)` and latest. It’s fine, but ensure query patterns match.
- `NOTIFY pgrst, 'reload schema'` is useful if you rely on PostgREST; if Supabase Edge/JS client, confirm it’s actually necessary in your env.

---

## The decision you still have to make

**Are per-table deltas truly MVP?**  
If yes: prove `rpc_shift_table_metrics` is deterministic for historical windows and add a DoD test.  
If no: cut it from MVP scope and keep only casino-level deltas.

Right now, the spec claims MVP includes per-table deltas without proving the dependency.

---

## Minimal patch list (tight and actionable)

1. Replace hardcoded role strings with a reference to canonical `public.staff_role` enum values (or capability gate).
2. Resolve `pit_id` contradiction: either remove pit concerns from MVP or define pit identity source and allow it.
3. Add feasibility validation + DoD test for historical-window metrics; otherwise drop per-table deltas from MVP.
4. Reword RLS section to “privileges + RLS” (don’t imply RLS alone).
5. Define SQL error → TS error mapping + HTTP status mapping.

---

## Final note

This exec spec is *almost* “engineers can’t screw it up.” The remaining edits are about preventing predictable drift and avoiding spec-implementation contradictions.

