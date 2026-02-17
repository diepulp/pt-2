# PRD-033 Audit Patch — Final Pass Corrections v0.3

**Applies to:** `EXECUTION-SPEC-PRD-033.md`  
**Intent:** Fold the final audit pass into concrete, minimal edits so the spec is **implementation-ready**.

---

## Final Blockers to Fix (3)

1) **`rpc_current_gaming_day()` referenced but not defined**
2) **WS1 indexes assume `casino_id` exists on `table_fill` / `table_credit`**
3) **Idempotency language overclaims enforcement for confirmations**

Plus two process brittleness cleanups:
- Add a “safety valve” for future RLS changes to pending queue reads.
- Remove or implement “SRM updated” in DoD (currently untracked).

---

## Patch Instructions (Concrete Edits)

## A) Resolve `rpc_current_gaming_day()` (Pick ONE)

### Option A1 (Preferred): Replace with existing canonical function
If you already have `compute_gaming_day` (or equivalent), replace all references of:

- `rpc_current_gaming_day()`

with:

- `compute_gaming_day(now(), casino_settings.gaming_day_start, casino_settings.timezone)`  
  *(or your actual signature; keep consistent with your canonical function)*

**Edit locations:**
- WS4 “Default filters”
- Any route acceptance criteria mentioning `rpc_current_gaming_day()`
- Any UI behavior spec that uses TEMP-003

### Option A2: Define `rpc_current_gaming_day()` in WS2
If you want a convenience wrapper, add a WS2 migration:

- `rpc_current_gaming_day()` returns a `date` gaming_day derived from:
  - `casino_settings.timezone`
  - `casino_settings.gaming_day_start`
  - `now()`

Also document:
- Security: `SECURITY DEFINER`, `SET search_path=public`
- Casino context derived via `set_rls_context_from_staff()`

**Do not ship with dangling references.**

---

## B) Fix WS1 Pending-Queue Indexes to Match Real Schema

**Problem:** WS1 creates indexes on `(casino_id, status)` for `table_fill` / `table_credit`, but many TableContext designs only store `table_id` and derive casino via join.

### Option B1 (Robust, no schema changes): Index on `table_id` + `status`
Replace WS1 index DDL with:

- `CREATE INDEX idx_table_fill_pending ON public.table_fill (table_id, status) WHERE status = 'requested';`
- `CREATE INDEX idx_table_credit_pending ON public.table_credit (table_id, status) WHERE status = 'requested';`

And ensure the pending queue query:
- filters by `gaming_day`
- joins `gaming_table` to scope by derived `casino_id`

### Option B2 (If `casino_id` truly exists): Assert it explicitly
If `table_fill` / `table_credit` already include `casino_id`, add a statement in WS1:

> “`table_fill` and `table_credit` are casino-scoped tables and include a stored `casino_id` column.”

Then keep the existing index DDL.

**Do not leave this ambiguous** — otherwise migrations may fail at deploy time.

---

## C) Make Idempotency Language Consistent With Actual Enforcement

Right now the spec mixes:
- “Header required”
- “Natural idempotency”
- “DB uniqueness” (only clearly true for PRD-009 cash-outs)

Choose and make the text consistent.

### Option C1 (Honest MVP — Recommended if you’re not implementing new infra)
Keep requiring `Idempotency-Key` header but rewrite:

- For fills/credits/drops:
  - Idempotency enforcement is by **resource-id + state**:
    - Confirm RPC returns existing result if already confirmed/ack’d
    - Repeat PATCH is a no-op after confirmation
  - `Idempotency-Key` is **logged** for traceability, not enforced.

Update DoD to say:
- “Cash-out idempotency enforced by PRD-009 constraints; confirmations are naturally idempotent via state transitions.”

### Option C2 (Real idempotency for confirmations — More work)
Implement:
- `idempotency_key` storage
- unique constraints or idempotency table
- wire header → RPC input

If you pick this, add a WS2/WS3 deliverable for schema + RPC input changes, and update route handlers accordingly.

---

## D) Add a Safety Valve for Future RLS Hardening (Tiny but important)

Add a note under WS4/WS5 pending queue reads:

> “If RLS policies later introduce staff_role gating that prevents cashier reads, replace direct SELECT-based GET endpoints with SECURITY DEFINER list RPCs (`rpc_list_pending_*`).”

This prevents the spec from becoming brittle as RLS evolves.

---

## E) Fix SRM “Updated” Claim (Pick ONE)

### Option E1: Add SRM update as an explicit deliverable
Add to WS6 (or WS0):

- `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` — updated to reflect Cashier Workflow MVP ownership boundaries and new RPCs

### Option E2: Remove SRM line from DoD
If you’re not updating SRM in this PRD, delete the DoD bullet.

---

## Updated “Ship-Ready” Checklist

- [ ] `rpc_current_gaming_day()` is either defined or replaced with canonical function
- [ ] WS1 indexes match the real columns on `table_fill`/`table_credit`
- [ ] Idempotency wording matches the enforcement you actually implement
- [ ] Pending queue reads include an RLS safety valve
- [ ] SRM update is either explicitly delivered or removed from DoD

---

**After these edits:** PRD-033 is implementation-ready with no obvious migration/runtime traps and no overpromises.
