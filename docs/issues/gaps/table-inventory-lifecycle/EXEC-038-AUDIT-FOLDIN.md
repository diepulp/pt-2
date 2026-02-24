---
doc: "EXEC-SPEC Audit Fold-in"
target: "EXEC-038-shift-rundown-deltas"
audit_source: "EXEC-038-AUDIT.md"
date: "2026-02-24"
status: "Resolved"
passes: 2
---

# Audit Fold-in: EXEC-038 — Shift Rundown Deltas

## Pass 1 Summary

All 5 P0 findings and 3 P1 findings from initial `EXEC-038-AUDIT.md` resolved.

## Pass 2 Summary

5 additional findings (2 P0, 3 P1, 2 P2) from second audit pass. All resolved.

---

## Pass 1 Resolutions

### P0-1: Role gate literals hardcoded

**Resolution:** Added "Role Gate Contract" section to Architecture Context:
- Canonical source: `public.staff_role` enum (`"dealer" | "pit_boss" | "cashier" | "admin"`)
- Verified literals match enum (confirmed via `database.types.ts` line 4856)
- Added invariant: "If enum evolves, gate defaults to deny."
- Added DoD gate C4: "Role gate literals match canonical `public.staff_role` enum"

### P0-2: `pit_id` semantics contradictory (pass 1)

**Resolution (partial):** MVP clean approach started:
- `idx_shift_checkpoint_pit` deferred (commented out)
- Added MVP constraint callout

### P0-3: Per-table deltas feasibility

**Resolution:** Proven feasible. Added determinism pinned dependency with constraint:
- "If any source table gains UPDATE or DELETE semantics, determinism must be revalidated"

### P0-4: RLS wording implies RLS alone enforces write denial

**Resolution:** Reworded to "privileges + RLS two-layer defense" throughout.

### P0-5: SQL->TS error mapping underspecified

**Resolution:** Added explicit mapping contract with stable encoding convention.

### P1-6 through P1-8: Gaming day rules, null semantics, latency claim

**Resolution:** All three patched (see details below in pass 2 tightening).

---

## Pass 2 Resolutions

### P0-1 (pass 2): pit_id contradiction still present in multiple locations

**Finding:** Despite pass 1 fix, spec still said "per-table/per-pit deltas" in Scope, WS5, and data flow while also saying "pit/table scope deferred."

**Resolution:** Made a clear decision — **Option A: MVP is casino-scope only:**
- Removed "per-table deltas" from In Scope; moved to Out of Scope
- WS5 frontmatter description: removed "per-table deltas in MetricsTable"
- WS5 Section 5 (MetricsTable per-table deltas): marked as "vNext" with deferred note
- Delta badge acceptance criterion: prefixed with "Casino-scope"
- All remaining "per-table/per-pit" mentions are either "Out of Scope", "vNext", or future constraints

### P0-2 (pass 2): idx_shift_checkpoint_pit inconsistently deferred

**Finding:** Both commented-out and un-commented versions existed.

**Resolution:** Verified only the commented-out version remains (lines 407-408). No un-commented `CREATE INDEX idx_shift_checkpoint_pit` anywhere in the spec.

### P1-1 (pass 2): Error mapping extraction rule brittle

**Finding:** "First token before colon/whitespace" is fragile.

**Resolution:** Changed to stable encoding convention:
- SQL: `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TBLRUN_ALREADY_FINALIZED', DETAIL='...'`
- TS: `error.message` IS the code (not a substring). Exact match against mapping table.
- Unrecognized codes fall through to generic 500.

### P1-2 (pass 2): Determinism claim needs constraint, not just history

**Finding:** Citing a migration as verification isn't a spec guarantee.

**Resolution:** Added explicit constraint:
- "If any source table gains UPDATE or DELETE semantics in a future migration, per-table delta determinism must be revalidated and the DoD determinism test becomes a blocking gate"

### P1-3 (pass 2): Residual "No INSERT/UPDATE/DELETE policies" language

**Finding:** Line 516 still had old wording.

**Resolution:** Changed to "Privileges deny writes (`REVOKE ALL` + `GRANT SELECT`); RLS scopes reads (Pattern C SELECT only)". Verified no other instances remain (grep returned 0 matches).

### P2 (pass 2): Latency numeric expectation, role enum verification

- "< 20ms" was already patched in pass 1 — verified no remaining numeric claims
- Role enum values confirmed matching `database.types.ts` line 4856: `"dealer" | "pit_boss" | "cashier" | "admin"`

---

## Final Consistency Verification

| Check | Result |
|-------|--------|
| "per-table/per-pit" in Scope | Only in "Out of Scope" or "vNext" |
| `idx_shift_checkpoint_pit` | Commented out only (lines 407-408) |
| "No INSERT/UPDATE/DELETE policies" | Zero matches |
| Role literals match canonical enum | Confirmed (`database.types.ts:4856`) |
| Error mapping extraction rule | Stable convention (exact match, not tokenization) |
| "< 20ms" or "expected overhead" | Zero matches (replaced with "measure and validate") |

---

## Files Modified (cumulative)

- `docs/21-exec-spec/EXEC-038-shift-rundown-deltas.md` — 14 patches (8 pass 1 + 6 pass 2)
- `docs/20-architecture/specs/shift-rundown-deltas/DOD-shift-rundown-deltas.md` — 3 patches (pass 1)
