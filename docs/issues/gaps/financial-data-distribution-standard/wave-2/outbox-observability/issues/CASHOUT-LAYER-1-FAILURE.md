# CASHOUT Layer 1 Failure — Investigation Record

**Gap ID:** W2-OBS-CASHOUT-PRODUCER-001  
**Full specification:** `wave-2/outbox-observability/issues/W2-OBS-CASHOUT-PRODUCER-001.yaml`  
**Opened:** 2026-05-21  
**Status:** Confirmed — Layer 1 producer implementation gap

---

## Summary

`cashout.recorded` has no active producer path. Triggering a cashout workflow through
the application produces a PFT row and succeeds from the operator's perspective, but
zero rows are written to `finance_outbox`. The observability surface stays silent —
which is the failure mode, not normal behavior.

This is a category-separate gap from `adjustment.recorded` (W2-OBS-ANCHOR-COVERAGE-001).
That gap is a missing argument to an otherwise-capable RPC. This gap is a missing branch
in the RPC itself: `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no check
on `p_direction`.

---

## Three-Fact Proof

**Fact 1 — The session-close path never reaches `finance_outbox`.**  
`RatingSlipModal "Close Session"` → `useCloseWithFinancial` → `rpc_create_pit_cash_observation`.
That RPC writes to `pit_cash_observation` only. No outbox emission at any step.

**Fact 2 — `rpc_create_financial_txn` is direction-blind.**  
Migration `20260517234015_wave2_adj_producer_ext.sql` line 299 and all prior versions
hardcode `'buyin.recorded'`. There is no `CASE WHEN v_row.direction = 'out'` branch.
A cage cashout (no `rating_slip_id`) returns early at the ADR-057 eligibility check.
A pit cashout with a `rating_slip_id` would emit `'buyin.recorded'` — semantic mislabeling,
not the intended event type.

**Fact 3 — The projection consumer knew before the operational loop did.**  
Migration `20260519184708_create_rpc_process_class_a_projection.sql`:
> `cashout.recorded: not yet a distinct outbox producer; handled defensively below`
> `cashout.recorded: total_out += amount (future; not yet an active producer)`

---

## Catalog Correction

The rollout map (line 144) states:
> Class A: `rpc_create_financial_txn` → `buyin.recorded` / `cashout.recorded`

This claim is false. `cashout.recorded` was never produced. The exemplar pair certified
in Phase 2.0 covers `buyin.recorded` only. The rollout map has been corrected (2026-05-21).

The operational loop previously classified `cashout.recorded` as **Category C — certifiable
HEALTHY via UI**. It has been moved to **Category D — Known Layer 1 gap** to match the
actual state. See `CORE-OPERATIONAL-LOOP.md` Phase 1 producer table and Phase 5 trust gate.

---

## Remediation

One CASE expression in `rpc_create_financial_txn`:

```sql
PERFORM public.fn_finance_outbox_emit(
  public.generate_uuid_v7(),
  CASE WHEN v_row.direction = 'out' THEN 'cashout.recorded' ELSE 'buyin.recorded' END,
  'ledger',
  'actual',
  v_table_id,
  v_row.player_id,
  v_row.id,
  jsonb_build_object('amount', v_row.amount, 'tender_type', v_row.tender_type)
);
```

Prerequisite: confirm the rating-slip cashout workflow passes `p_rating_slip_id`. The cage
cashout path (direction='out', source='cage', no `rating_slip_id`) correctly returns early
per ADR-057 — no change needed there.

Full remediation spec is in `W2-OBS-CASHOUT-PRODUCER-001.yaml`.
