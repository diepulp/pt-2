# GAP-PRD033-PATRON-CASHOUT-UI

## Patron Cash-Out Confirmation Tab — Not Implemented

**Status**: Open
**Created**: 2026-02-17
**Category**: Missing Feature (PRD-033 WS5 incomplete)
**PRD**: PRD-033 — Cashier Workflow MVP
**Workstream**: WS5 (Cashier Console UI)

---

## Problem Statement

The PRD-033 pipeline marked WS5 as "completed" but the **Patron Transactions tab** (`/cashier/patron-transactions`) shipped as a "Coming Soon" placeholder with zero functional code. Two of three Cashier Console tabs are fully operational (Operational Confirmations, Drop Acknowledgements) but the cash-out confirmation flow — a core PRD-033 deliverable — was deferred.

The pipeline checkpoint (`PRD-033.json`) explicitly lists `patron-transactions/page.tsx` as "coming soon placeholder" yet marked WS5 status as `completed`.

---

## Current State

**Implemented (functional):**
- `app/(dashboard)/cashier/operational-confirmations/` — fill/credit fulfillment queue
- `app/(dashboard)/cashier/drop-acknowledgements/` — drop received stamps
- `components/cashier/cashier-tab-nav.tsx` — 3-tab navigation
- `components/cashier/pending-fill-credit-queue.tsx` — inline confirm forms
- `components/cashier/drop-acknowledgement-list.tsx` — single-click stamp action
- `components/cashier/recent-confirmations-list.tsx` — today's confirmations
- `components/cashier/amount-display.tsx` — ADR-031 cents-to-dollars
- `hooks/cashier/use-cashier-operations.ts` — 6 hooks (3 queries + 3 mutations)
- `components/layout/app-sidebar.tsx` — Cashier nav entry with 3 children

**Not implemented (placeholder only):**
- `app/(dashboard)/cashier/patron-transactions/page.tsx` — "Coming Soon" card
- `components/cashier/cash-out-form.tsx` — never created
- `components/cashier/void-confirmation-dialog.tsx` — never created
- `components/cashier/player-visit-search.tsx` — never created

---

## Root Cause

1. **PRD-009 dependency**: Cash-out flow requires `rpc_create_financial_txn` from PlayerFinancialService (PRD-009). While the RPC exists and is deployed, the cashier-specific UI integration was never wired up.
2. **Scope cut during execution**: The pipeline prioritized the two operational tabs that had no external service dependencies, deferring the patron tab which requires cross-context integration with PlayerFinancialService.
3. **Checkpoint gap**: WS5 was marked "completed" despite an acknowledged placeholder, allowing the pipeline to close without the full deliverable set.

---

## Definition of Done (to close this gap)

### Components to create

| Component | Purpose |
|---|---|
| `components/cashier/cash-out-form.tsx` | Cash-out confirmation form: player search, visit selection, amount input (dollars→cents per ADR-031), receipt ref (`external_ref`), double-confirm for large amounts |
| `components/cashier/player-visit-search.tsx` | Player lookup by name/ID/loyalty number, display active visits, select visit for cash-out |
| `components/cashier/void-confirmation-dialog.tsx` | Void + replacement modal: reason code, required note, creates reversal via `related_transaction_id` + `txn_kind='reversal'` |

### Page to replace

| File | Action |
|---|---|
| `app/(dashboard)/cashier/patron-transactions/page.tsx` | Replace placeholder with functional view integrating cash-out form, recent transaction list, and void dialog |

### Service layer integration

- HTTP fetcher for `rpc_create_financial_txn` with `txn_kind = 'CASH_OUT_CONFIRMED'`
- HTTP fetcher for listing recent cash-outs (current cashier, current gaming day)
- HTTP fetcher for void/reversal creation
- Hooks: `useCashOutCreate()`, `useRecentCashOuts()`, `useVoidCashOut()` mutations

### PRD-009 contract prerequisites (must verify)

Per EXECUTION-SPEC-PRD-033 §PRD-009 Dependency Contract:
- [ ] `rpc_create_financial_txn` role-gates `cashier`/`admin` for `CASH_OUT_CONFIRMED`
- [ ] `casino_id` and `gaming_day` derived from `set_rls_context_from_staff()` (no client-supplied values)
- [ ] `external_ref` (receipt/ticket) is supported (nullable)
- [ ] Idempotency enforced via `UNIQUE(casino_id, idempotency_key)` constraint
- [ ] Void/replacement supported via `related_transaction_id` + `txn_kind='reversal'` + `reason_code`

### Acceptance criteria

- [ ] Cashier can search for a player and select an active visit
- [ ] Cashier can create a cash-out confirmation with amount and optional receipt ref
- [ ] Double-confirm dialog for amounts above threshold
- [ ] Recent cash-outs list shows current gaming day transactions
- [ ] Cashier can void a cash-out with reason code and note
- [ ] Void creates a reversal transaction linked to the original
- [ ] All amounts: cents in DB, dollars in UI (ADR-031)
- [ ] `visit_id NOT NULL` enforced — anonymous cash-outs disallowed per MVP decision
- [ ] Idempotency-Key header sent on all mutation requests
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes

---

## References

- EXECUTION-SPEC: `docs/20-architecture/specs/PRD-033/EXECUTION-SPEC-PRD-033.md` (WS5 §Cashier Console UI)
- Pipeline checkpoint: `.claude/skills/prd-pipeline/checkpoints/PRD-033.json`
- PRD-009 dependency contract: EXECUTION-SPEC §PRD-009 Dependency Contract
- ADR-024: Authoritative context derivation
- ADR-031: Cents storage convention
- Anonymous/walk-in policy: EXECUTION-SPEC §Anonymous / Walk-in Policy
