---
title: AUDIT — GAP-CASHIN-ADJUSTMENT-MTL-SYNC.md
date: 2026-02-17
auditor: ChatGPT
status: audit_complete
scope: Data/UX consistency for cash-in adjustments across Rating Slip + MTL dashboard
---

# Audit: GAP-CASHIN-ADJUSTMENT-MTL-SYNC.md

## What’s solid (keep it)
- Clear symptom + scope separation: **data correctness (DB)** vs **UI staleness (cache)**.
- Root-cause hierarchy is mostly right: **GAP-1** is primary (no `mtl_entry` → MTL cannot become correct).
- Concrete file pointers/line ranges (actionable).
- You explicitly rule out RLS (avoids wasted debugging cycles).

## Critical gaps / ambiguities (fix before shipping)

### 1) “Bi-directional sync” is underspecified at the data contract level
Right now it reads like “any adjustment from either UI updates both UIs,” but it does not explicitly define the authoritative write path.

**Doc patch (add a short Contract section):**
- **Write SSoT:** `player_financial_transaction` only (no direct writes to `mtl_entry`)
- **Derivations:**
  - `visit_financial_summary` derived from finance
  - `mtl_entry` derived from finance via trigger
- **UI freshness rule:** both UIs must invalidate the same key scopes after successful finance writes

This turns “bi-directional” from a vibe into a guarantee.

### 2) GAP-1 mixes `txn_kind` and `tender_type` without defining which is the gate
The doc notes the trigger fires for `tender_type IN ('cash','chips')`, but adjustments use `tender_type='adjustment'`.
Then the plan says “handle `txn_kind='adjustment'`” and “widen WHEN clause to include `txn_kind IN ('adjustment','reversal')`”.

That is terminology drift and can cause widening the *wrong* predicate.

**Doc patch (add a Field taxonomy table):**
- `tender_type`: instrument (`cash`, `chips`, …?) vs `adjustment`
- `txn_kind`: semantic kind (`buy_in`, `cash_out`, `adjustment`, `reversal`, …)

**Then specify explicitly:**
- The trigger gates on **semantic kind (txn_kind)** *or* **instrument (tender_type)** — but do not muddle both.

### 3) Reversals are acknowledged but not defined (duplications/missing compensations risk)
Including reversals is correct, but the doc must define how reversals are represented and how `mtl_entry` records them.

**Doc patch (add Reversal semantics):**
- Reversal representation (choose one and state it):
  - A) new `player_financial_transaction` row with `txn_kind='reversal'` referencing original txn id (preferred)
  - B) update original row (riskier)
- Trigger behavior:
  - insert negative delta (or equivalent) `mtl_entry`
  - deterministic idempotency key pattern: e.g. `fin:<reversal_txn_id>`

### 4) GAP-3 (frontend invalidation) needs an explicit product intent: “all movements” vs “reportable subset”
The doc argues invalidation is incorrectly gated on `thresholdResult?.shouldCreateMtl`, because the DB trigger creates MTL entries regardless of threshold.

This is only correct if **MTL is intended to show all movements** (ledger) rather than **only reportable items** (subset).

**Doc patch (clarify):**
- `mtl_entry` is:
  - **A ledger of all movements**, or
  - **A compliance-only subset**  
Pick one and align DB trigger + UI invalidation semantics to it.

### 5) GAP-4 key mismatch: consolidation needs a prevention guardrail
Making `hooks/player-financial/keys.ts` canonical is fine, but you need a mechanism to prevent future split imports.

**Doc patch (Prevention):**
- Remove `services/player-financial/keys.ts` **or** make it a thin re-export
- Add ESLint rule or TS path alias to disallow non-canonical imports

### 6) Missing concurrency/ordering risk: cross-screen races
Even with correct triggers and invalidations, multi-tab/multi-screen use can produce brief inconsistency.

**Doc patch (Freshness guarantee note):**
- After mutation success, invalidate + refetch in deterministic order for the visible screen.
- Consider optimistic UI only if derived data is stable.

## Implementation plan audit (tighten it)

### Fix 1 (DB): correct priority, but incomplete without backfill/repair
Specify the exact changes:
- Trigger predicate includes adjustment-related values (per the authoritative field definition).
- Trigger function maps adjustment deltas into the `mtl_entry` schema consistently.

**Missing: backfill/repair**
If this bug existed historically, you likely have adjustments where:
- `visit_financial_summary` is correct
- `mtl_entry` is missing rows

**Doc patch (add Repair step):**
- One-time, idempotent SQL backfill to derive missing adjustment-derived `mtl_entry` rows for existing txns  
OR explicitly accept history stays wrong (usually unacceptable for compliance).

### Fix 2–3 (Frontend invalidation): define minimum key scopes per mutation
Add a table mapping each mutation to invalidations.

Example (shape):
- **create adjustment**
  - invalidate: visit summary, rating slip, shift dashboard, **mtl entries**, **mtl gaming day summary**, patron daily total (if used)
- **save buy-in**
  - invalidate: same set (or subset) **unconditionally** if DB creates entries unconditionally

### Fix 4 (Key consolidation): enforce with delete/re-export
Make the duplicate file either removed or a strict re-export to avoid regression.

## Verification plan audit (add missing cases)

Your E2E flow is good but incomplete. Add:
1) Positive and negative adjustments from both entry points
2) Two adjustments in a row (aggregation + idempotency)
3) Reversal scenario (if supported): adjust then reverse; verify summary returns
4) Cross-tab: rating slip + MTL open simultaneously; mutate in one; verify the other updates after invalidation
5) Backfill validation (if implemented): historical visit with adjustment becomes consistent after repair

**Light automated invariant (suggested):**
- For seeded visit: `sum(finance cash-in delta) == sum(mtl_entry cash-in delta)` after adjustment.

## Severity justification (tighten one sentence)
Add: **“MTL dashboard totals can be wrong vs the finance ledger, which is a compliance/reporting integrity breach.”**

## Verdict
Close to shippable, but three clarifications are required to avoid a botched fix:
1) Define `txn_kind` vs `tender_type` gating
2) Define reversal semantics (representation + idempotency)
3) Add backfill/repair for historical adjustments
