# PRD-033 Audit Patch — Second Pass Corrections v0.2

**Applies to:** `EXECUTION-SPEC-PRD-033.md`  
**Goal:** Fold second-pass audit corrections so the spec is executable (not aspirational) and avoids runtime faceplants.

---

## Summary (What Still Needs Fixing)

You made real progress (dependency contract, gaming_day indexing, clearer validation), but PRD-033 still has **three high-probability failure modes**:

1) **Cashier pending queues will be blank/403** due to RLS mismatch (cashier can’t read requested rows).
2) **Idempotency is not actually enforced** (header required, but no DB/service mechanism defined).
3) **Immutability is not enforced** (spec says “immutable,” DB likely still allows UPDATE).

Plus a few scope/consistency items:
- Anonymous policy rationale is inverted (telemetry completeness vs audit purity).
- WS5 can creep into a generalized “txn console” unless constrained to cash-outs only.
- “rpc_current_gaming_day()” is a dangling function name unless defined.

---

## Patch Instructions (Concrete Inserts / Edits)

### 1) Fix Cashier Pending Queue Reads (RLS mismatch)

**Problem:** PRD-033 adds GET endpoints that query pending fills/credits/drops directly. If cashier lacks read access under current RLS, the cashier console will show nothing even though confirmations work.

**Required change:** Make pending queue reads go through SECURITY DEFINER RPCs (preferred), OR explicitly change RLS to allow cashier to read only pending rows.

#### Option 1A (Preferred): RPC-based list endpoints (SECURITY DEFINER)
Add these RPCs (names illustrative; align to your naming):

- `rpc_list_pending_fill_requests(p_gaming_day date)`
- `rpc_list_pending_credit_requests(p_gaming_day date)`
- `rpc_list_unacknowledged_drops(p_gaming_day date)`

**Rules:**
- Gate: `staff_role in ('cashier','admin')`
- Scope: derived `casino_id` only
- Filter: `gaming_day = p_gaming_day` and pending condition
- Return: minimal DTO fields required by UI (ids, table, amount, created_at, requested_by)

**Update WS4/WS5:**
- Replace direct table reads in GET endpoints with calls to these RPCs.
- Keep the API shape identical; only implementation source changes.

#### Option 1B: RLS carve-out for pending reads (not preferred)
If you do this, state explicitly:
- Cashier role may SELECT rows where `status='requested'` (fills/credits) and `cage_received=false` (drops) scoped by casino_id+gaming_day.

**Caution:** This enlarges policy surface area; RPC approach is tighter.

---

### 2) Make Idempotency Real (or stop requiring it)

**Problem:** Routes require `Idempotency-Key`, but the spec doesn’t define how it’s stored/enforced. “Return existing confirmed row” is not idempotency for retries/races.

**Required change:** Choose one and make it explicit.

#### Option 2A (Recommended): DB-level idempotency constraints
Add `idempotency_key text not null` where needed, plus unique constraints:

- For fill/credit confirmation:
  - Include `idempotency_key` in confirm RPC input.
  - Add unique constraint like:
    - `unique (casino_id, fill_slip_id, idempotency_key)`
    - `unique (casino_id, credit_slip_id, idempotency_key)`
- For drop acknowledgement:
  - `unique (casino_id, drop_event_id, idempotency_key)`

**Behavior:**
- Duplicate submits return the original response (RPC catches unique violation and SELECTs existing).

#### Option 2B: Service-layer idempotency store
Add an `idempotency` table keyed by `(casino_id, idempotency_key, operation)` storing the response payload.
- Define retention (e.g., 7 days).
- RPCs consult/store this record.

#### Option 2C: Remove header requirement (MVP-minimal)
If you refuse to implement enforcement, do not pretend it exists:
- Remove “Idempotency-Key required” from routes/DoD.
- Keep “return existing if already confirmed” as best-effort.

---

### 3) Enforce Immutability (DB/privileges, not vibes)

**Problem:** “Confirmed is immutable” is only a convention unless DB/RLS/privileges enforce it.

**Required change:** Pick one and write it into WS1/WS2.

#### Option 3A (Preferred): Privilege + RLS enforcement
- Ensure app roles have no direct UPDATE/DELETE on these tables.
- Default RLS denies updates.
- Only SECURITY DEFINER RPCs may perform:
  - `requested → confirmed`
  - `cage_received=false → true`

Add spec text:
> “No direct updates are permitted by application roles; state transitions occur only via SECURITY DEFINER RPCs.”

#### Option 3B: Trigger-based immutability
Add triggers that reject UPDATE once:
- fills/credits: `status='confirmed'`
- drops: `cage_received_at is not null`

---

### 4) Fix the Anonymous / Walk-in Policy Rationale

**Problem:** If you disallow anonymous, telemetry completeness decreases; you’re choosing audit purity.

**Required change:** Keep your choice if you want, but rewrite the rationale honestly and add mitigation.

Insert under Patron Transactions:
- “MVP policy: cashier must bind cash-out to player+visit. If player cannot be found, PT-2 will not record the cash-out; telemetry will be incomplete by design.”
- Add a “Phase 1.5” note: allow anonymous with required `external_ref`+notes.

---

### 5) Constrain WS5 to Prevent Scope Creep into “Mini Accounting”

**Problem:** A general “Patron Transactions” console tends to accrete transaction types.

**Required change:** Explicitly constrain WS5 to:
- Only `CASH_OUT_CONFIRMED` create/list/void (per PRD-009),
- No other transaction kinds in PRD-033.

Add a “Non-goal” bullet:
- “WS5 will not support generalized financial txn entry beyond cash-out confirmation.”

---

### 6) Resolve the “rpc_current_gaming_day()” Naming Gap

**Problem:** Spec references `rpc_current_gaming_day()` but it may not exist (you likely have `compute_gaming_day`).

**Required change:** Do one:
- Replace references with the canonical existing function (`compute_gaming_day`) **or**
- Define `rpc_current_gaming_day()` in WS2 migrations and document it.

---

## Updated DoD (Replace / Amend)

**Must ship:**
- Cashier can see pending fill/credit/drop queues (via RPC list endpoints or explicit RLS carve-out).
- Confirmations are idempotent **in a real enforced way** (DB constraint or idempotency store), or the header requirement is removed.
- Confirmed records are immutable **enforced by DB/RLS/privileges**.
- UI defaults filter to current gaming_day and pending-only.

**Must NOT ship:**
- Drawer balancing, reconciliation, cage close, denomination breakdowns, GL posting.
- Generalized “transaction console” beyond cash-outs for PRD-033.

---

## Minimal “Do This or It Breaks” Checklist

- [ ] Implement cashier-readable pending queues (RPC list endpoints preferred)
- [ ] Implement real idempotency or remove the header requirement
- [ ] Enforce immutability via privileges/RLS or triggers
- [ ] Clarify anonymous policy rationale + phase path
- [ ] Lock WS5 to cash-outs only
- [ ] Fix/define the current gaming day function reference

---

**End state:** PRD-033 stops relying on implicit assumptions (RLS, idempotency, immutability) and becomes a clean, MVP-safe cashier telemetry feature.
