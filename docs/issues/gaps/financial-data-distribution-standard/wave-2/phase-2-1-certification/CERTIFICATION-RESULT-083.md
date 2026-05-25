# PRD-084 Phase 2.1 Certification Result

**Date:** 2026-05-18  
**Run ID:** cert-1779127587926  
**Script:** `scripts/outbox-proof/phase-2-1-adjustment-certification.ts`  
**Environment:** Local Supabase (http://127.0.0.1:54321), all Wave 2 migrations applied  

---

## Certification Invariant

> An ADR-057-eligible financial adjustment emits exactly one `adjustment.recorded` outbox row
> atomically with its PFT row through the governed SECURITY DEFINER helper, while ineligible
> adjustments remain valid PFT writes with zero outbox emission, direct authenticated table
> insertion remains denied, and previously proven exemplar producers still emit successfully.

**Verdict: CERTIFIED ✅** — 20/20 cases pass.

---

## Section A — Adjustment I1 Live Proof

| Case | Result | Detail |
|------|--------|--------|
| A1 | ✅ PASS | 1 adj PFT + 1 outbox row; all envelope fields correct |
| A2 | ✅ PASS | cross-casino poisoned slip: guard rejects adj PFT, 0 adj PFT rows, 0 outbox rows |
| A3 | ✅ PASS | unlinked adjustment: valid PFT, no outbox row |
| A4 | ✅ PASS | excluded original (source=cage): valid PFT, no outbox row |
| A5 | ✅ PASS | RPC-created original with poisoned slip: exception, 0 adj PFT, 0 outbox rows |

**A1** proves the happy path: eligible adjustment produces exactly one outbox row with `event_type=adjustment.recorded`, `fact_class=ledger`, `origin_label=actual`, `table_id` present, `player_id` present, `aggregate_id = adj PFT id`.

**A2/A5** prove rollback atomicity: when the inherited `rating_slip_id` cannot resolve to a same-casino table anchor, the adj PFT INSERT is rejected (guard trigger raises `RATING_SLIP_NOT_FOUND`) and the entire transaction rolls back — 0 adj PFT rows, 0 outbox rows. A2 uses a service-role-created slip that is then cross-casino poisoned; A5 uses an RPC-created original (distinct creation path) with the same poison mechanism.

**A3** proves the unlinked path: no `p_original_txn_id` → valid adj PFT, zero outbox emission (FR-1 unlinked exclusion).

**A4** proves the excluded path: original with `source='cage'` fails ADR-057 criteria → valid adj PFT, zero outbox emission (FR-1 eligibility exclusion).

---

## Section B — Option A Security Live Proof

| Case | Result | Detail |
|------|--------|--------|
| B1 | ✅ PASS | authenticated direct insert denied (adjustment.recorded) |
| B2 | ✅ PASS | authenticated direct insert denied (adjustment.recorded) — forged aggregate |
| B3 | ✅ PASS | authenticated direct insert denied (buyin.recorded) |
| B4 | ✅ PASS | authenticated direct insert denied (forge.event) |
| B5 | ✅ PASS | helper-backed producer succeeds; outbox row inserted through governed helper |

All four direct-insert attempts by authenticated role receive `permission denied for table finance_outbox`. B5 confirms the SECURITY DEFINER helper path (`fn_finance_outbox_emit`) works correctly.

---

## Section C — Idempotency / Concurrency Live Proof

| Case | Result | Detail |
|------|--------|--------|
| C1 | ✅ PASS | sequential retry: 1 PFT, 1 outbox row(s) |
| C2 | ✅ PASS | concurrent retry: ≤1 PFT, ≤1 outbox row; pooler may serialize — see C3 for structural guarantee |
| C3 | ✅ PASS | uq_finance_outbox_aggregate_event structurally verified; deduplication enforced at DB level |

**C1** proves sequential idempotency: two calls with the same `idempotency_key` produce at most 1 PFT and at most 1 outbox row. Root cause of prior C1 failure was `fn_finance_outbox_emit` lacking `ON CONFLICT DO NOTHING` — the `IF NOT EXISTS` guard in the SECURITY INVOKER RPC could not see existing outbox rows (authenticated role has no SELECT grant on `finance_outbox`). Fixed in migration `20260518105926`.

**C2** proves concurrent safety: two simultaneous calls with the same key produce at most 1 PFT. Structural guarantee is at DB level (C3).

**C3** proves the `uq_finance_outbox_aggregate_event` unique constraint fires on duplicate `(aggregate_id, event_type)` direct inserts — the structural deduplication guarantee backing C2.

---

## Section D — Payload Contract Live Proof

| Case | Result | Detail |
|------|--------|--------|
| D1 | ✅ PASS | amount=50, pft_direction=in, delta_direction=increase, reason_code present, note absent |
| D2 | ✅ PASS | amount=-25, pft_direction=in, delta_direction=decrease, reason_code present, note absent |

FR-10 payload contract verified: `amount` (signed delta), `pft_direction`, `delta_direction` (increase/decrease), `reason_code` present; `note` omitted (may be sensitive).

---

## Section E — Exemplar Regression Smoke

| Case | Result | Detail |
|------|--------|--------|
| E1 | ✅ PASS | Class A exemplar still emits buyin.recorded after helper refactor |
| E2 | ✅ PASS | Class B exemplar still emits grind.observed after helper refactor |

Both PRD-082-certified exemplar producers continue to emit correctly after the Option A helper refactor. No regressions.

---

## Section F — Relay Compatibility Smoke

| Case | Result | Detail |
|------|--------|--------|
| F1 | ✅ PASS | adjustment.recorded row claimed; all DTO fields present; delivery_attempts incremented |
| F2 | ✅ PASS | relay processes row; duplicate delivery returns 'duplicate' safely |
| F3 | ✅ PASS | consumer failure: processed_at IS NULL; delivery_attempts incremented (14 → 15) |

`adjustment.recorded` conforms to the PRD-082-certified relay contract. `rpc_claim_outbox_batch` returns the row with all required DTO fields. `rpc_commit_consumer_receipt` handles first delivery and duplicate delivery correctly. Failed consumer leaves row retryable with incremented `delivery_attempts`.

---

## Infrastructure Fixes Applied During Certification

### Migration 20260518105926 — `fn_finance_outbox_emit` idempotency fix

**Root cause:** `rpc_create_financial_adjustment` is `SECURITY INVOKER`. The `authenticated` role has no `SELECT` grant on `finance_outbox` (only `service_role` does, per migration `20260511134129`). The `IF NOT EXISTS` guard in the RPC always evaluated `TRUE` because the authenticated role could not see existing rows, causing a second call to attempt a duplicate INSERT that hit `uq_finance_outbox_aggregate_event`.

**Fix:** Added `ON CONFLICT (aggregate_id, event_type) DO NOTHING` to the INSERT in `fn_finance_outbox_emit`. The SECURITY DEFINER helper now owns the idempotency guarantee entirely, independent of the caller's visibility of existing rows.

---

## Summary

```
Total: 20 | Pass: 20 | Fail: 0
```

All 14 boolean conditions from PRD-084 §9 pass gate satisfied:

- [x] A1 — eligible adjustment emits exactly 1 outbox row atomically
- [x] A1 — outbox row has correct envelope (event_type, fact_class, origin_label, table_id, player_id, aggregate_id)
- [x] A2 — unresolvable table anchor → full transaction rollback (0 adj PFT, 0 outbox)
- [x] A3 — unlinked adjustment → valid PFT, 0 outbox rows
- [x] A4 — excluded original (cage source) → valid adj PFT, 0 outbox rows
- [x] B1–B4 — direct authenticated INSERT denied (REVOKE enforced)
- [x] B5 — SECURITY DEFINER helper path produces outbox row
- [x] C1 — sequential idempotent retry: ≤1 PFT, ≤1 outbox row
- [x] C3 — `uq_finance_outbox_aggregate_event` structurally verified
- [x] D1/D2 — FR-10 payload contract (amount, pft_direction, delta_direction, reason_code, note absent)
- [x] E1 — buyin.recorded exemplar unaffected
- [x] E2 — grind.observed exemplar unaffected
- [x] F1 — adjustment.recorded conforms to relay DTO contract
- [x] F2/F3 — relay idempotency and retry semantics correct
