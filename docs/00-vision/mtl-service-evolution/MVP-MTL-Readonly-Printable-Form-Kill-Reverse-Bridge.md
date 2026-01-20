---
title: "MVP Decision: Keep MTL Form as Read-Only Printable View (Kill Reverse Bridge)"
date: "2026-01-20"
status: "draft"
scope: "PT-2 pilot"
audience: ["engineering", "compliance-ops"]
---

## Decision

Keep the **MTL Entry Form layout** as a **read-only, printable view** of derived MTL entries.

- **Do not allow manual creation or editing** of slip-impacting MTL entries (`buy_in`, `cash_out`).
- **Finance (`player_financial_transaction`) remains the single source of truth** for rating slip totals and cashflow.
- **Remove the reverse bridge** (`mtl_entry → player_financial_transaction`) from MVP scope.

This preserves the operational UX (view/print) without reintroducing a competing ledger.

## Rationale

### Why kill the reverse bridge

A reverse bridge exists only because `mtl_entry` is being treated as a writable ledger that can influence rating slip totals. That creates:

- Two write paths for the same monetary fact (drift risk)
- Update/mapping complexity (requires stable transaction linkage)
- Regression surface disproportionate to MVP value

### What already works

- **MTL immutability** is already enforced (REVOKE UPDATE/DELETE + `trg_mtl_entry_no_update`)
- **Forward bridge works:** `player_financial_transaction → mtl_entry` (derived, `fin:` idempotency)
- **Adjustment workflow exists:** `createFinancialAdjustment()` RPC + `AdjustmentModal` UI

Given the above, manual MTL writes are unnecessary for pilot and actively harmful.

## UX Design

### MtlEntryForm becomes a View-Only Report

**Default mode from Compliance Dashboard: View Mode**

- Open form with `mtlEntryId` (existing entry)
- Render all fields **read-only**
- Provide:
  - **Print** button (e.g. `window.print()` + print CSS)
  - **Adjust** button (opens existing AdjustmentModal)
  - **Add note** (writes to `mtl_audit_note` or equivalent notes mechanism)

**No Create Mode from Compliance Dashboard in MVP**

- Compliance Dashboard must not create `mtl_entry` directly
- Buy-ins and cash-outs originate from rating slip / finance canonical path

### Correction rules

- **Monetary corrections**: AdjustmentModal → creates finance adjustment transaction → forward bridge updates derived MTL projection
- **Compliance narrative corrections**: add an audit note (do not modify monetary fields)

## Database Guardrails

### 1) Keep immutability (already present)

- REVOKE UPDATE/DELETE on `public.mtl_entry`
- `trg_mtl_entry_no_update` blocks updates/deletes (immutable log semantics)

### 2) Prevent manual slip-impacting MTL inserts

Slip-impacting types: `buy_in`, `cash_out`

Require that these entries are **derived** (identified by `idempotency_key` prefix).

```sql
ALTER TABLE public.mtl_entry
ADD CONSTRAINT mtl_buyin_cashout_must_be_derived
CHECK (
  txn_type NOT IN ('buy_in','cash_out')
  OR (idempotency_key IS NOT NULL AND idempotency_key LIKE 'fin:%')
);
```

This blocks any UI or API regression from creating a competing ledger in MTL for buy-ins/cash-outs.

### 3) Remove the reverse bridge from MVP

- Migration: `DROP TRIGGER trg_derive_finance_from_mtl ON public.mtl_entry;`
- Deprecate/remove `fn_derive_finance_from_mtl()` (or leave but unreachable, and clearly marked deprecated)
- Grep/cleanup any code paths that insert MTL with `mtl:` idempotency (should be dead after removal)

## Implementation Plan (MVP)

| # | Task | Scope | Complexity |
|---:|------|-------|------------|
| 1 | Drop reverse bridge trigger | Migration removes `trg_derive_finance_from_mtl` | Low |
| 2 | Add DB constraint | Enforce derived-only for `buy_in/cash_out` MTL | Low |
| 3 | Repurpose MtlEntryForm to View Mode | Disable inputs, remove submit/mutation in dashboard flow | Medium |
| 4 | Expose correction workflow | Add **Adjust** button → existing AdjustmentModal | Medium |
| 5 | Add print support | `@media print` + Print button | Low |

## Acceptance Criteria

- Compliance Dashboard can open the MTL form for **viewing and printing** ✅
- No ability to **create** `buy_in/cash_out` MTL entries from Compliance Dashboard ✅
- No ability to **edit** MTL monetary fields (`amount`, `direction`, `occurred_at`, `txn_type`) ✅
- Corrections happen via **AdjustmentModal** (finance adjustments) ✅
- Reverse bridge is removed and cannot silently reappear ✅
- DB constraint blocks manual `buy_in/cash_out` MTL inserts (derived-only) ✅

## Notes / Future (Post-MVP)

If future requirements demand bidirectional editing:

- Introduce stable linkage `mtl_entry.financial_txn_id` (FK to `player_financial_transaction.id`)
- Implement amendment/adjustment semantics (do not overwrite money records)
- Re-evaluate whether MTL should ever be a writable ledger vs a projection
