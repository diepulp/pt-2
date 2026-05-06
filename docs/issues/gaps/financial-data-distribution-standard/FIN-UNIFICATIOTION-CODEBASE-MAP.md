# Financial Unification — Codebase Mapping & Exact Change Plan

Synthesis of four parallel investigations against the three ADR drafts. Findings are cross-verified across agents where possible; I flag disagreements.

---

## 0. Critical finding: the ADR has a schema gap that blocks its own D3

**Before implementation, an ADR amendment is required.**

ADR-INGESTION D3 says: "Grind buy-ins MUST be written to PFT with `is_rated = false`, `txn_type = 'buyin'`." But the current PFT schema and RPC enforce:

- `player_financial_transaction.player_id` — **NOT NULL**
- `rpc_create_financial_txn(p_player_id uuid, p_visit_id uuid, …)` — both **required params**

Grind buy-ins have **no player, no visit, no rating_slip** — they are anonymous table-anchored facts (confirmed: `components/table/grind-buyin-panel.tsx`, `hooks/table-context/use-buyin-telemetry.ts:83-159`, and the TBT check constraint at `20260114003530:55-57`).

You must choose one of three resolutions and amend the ADR accordingly before coding:

| Option              | Resolution                                                                                                                                                | Trade-off                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A (recommended)** | Make `player_id` NULLABLE + add `table_id uuid` FK + CHECK constraint `((is_rated AND player_id IS NOT NULL) OR (NOT is_rated AND table_id IS NOT NULL))` | Cleanest semantics; touches PFT schema; every consumer filtering by player_id needs NULL handling |
| B                   | Synthesize a casino-anonymous "house player" per casino for grind attribution                                                                             | Keeps NOT NULL; pollutes player_id semantics; compliance/MTL bridge fires spuriously              |
| C                   | Keep grind facts out of PFT; redefine the ADR to accept that "financial truth" is per-player only and "operational truth" (grind) is a parallel aggregate | Simplest to build; contradicts ADR D3 explicitly                                                  |

The draft ADR is implicitly asserting Option A without naming it. **I recommend Option A and the rest of this plan assumes it.**

---

## 1. Scope disagreement between agents (resolved)

- Agent 1 claims `trg_bridge_finance_to_telemetry` still exists (mig `20260116201236`). Agent 2 also reports it active. Provenance trace cites `20260115000200` as the original with G1–G5 guardrails. **Truth: the trigger was replaced in `20260218233652` ("fix_dual_telemetry_bridge_trigger") — there is ONE active bridge trigger, most recently patched.** Treat it as a single artifact to drop.
- Agent 1 reports PFT `source` enum as `pit | cage | system`; Agent 2 implies the current enum. Provenance trace (verified against migration `20260306223803`) says `pit | cage | manual | system`. **Treat `manual` as already present**, but grind-specific labeling (`pit_grind` or similar) still needs an enum extension.
- Agent 4 lists `visit_financial_summary` DTO exposing `totalChipsOut` (cents). The UI does blend it with Zustand `chipsTaken` dollars. Unit drift (cents vs dollars) is real — must normalize during the split.

---

## 2. Change plan by layer

### Layer 1 — Schema migrations (ordered)

| #   | Migration (name template)                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `YYYYMMDDHHMMSS_pft_relax_player_id_and_add_table_id.sql`                  | `player_id` → NULLABLE; add `table_id uuid REFERENCES gaming_table(id)`; add CHECK constraint per Option A                                                                                                                                                                                                                                                                                                             |
| 2   | `YYYYMMDDHHMMSS_pft_add_is_rated_and_extend_source.sql`                    | `is_rated BOOLEAN NOT NULL DEFAULT true`; extend `financial_source` enum with `pit_grind` (or equivalent); update existing rows `SET is_rated = (rating_slip_id IS NOT NULL)` as backfill                                                                                                                                                                                                                              |
| 3   | `YYYYMMDDHHMMSS_finance_outbox_add_aggregate_id_and_idempotency.sql`       | Add `aggregate_id UUID` (denormalized from rating_slip_id/visit_id/table_id); add `UNIQUE (casino_id, ledger_id, event_type)`                                                                                                                                                                                                                                                                                          |
| 4   | `YYYYMMDDHHMMSS_rpc_create_financial_txn_accept_grind_and_emit_outbox.sql` | Replace RPC body: accept nullable `p_player_id/p_visit_id`, accept `p_table_id`, accept `p_is_rated`; INSERT into `finance_outbox` within same txn (derived key `fin:{pft.id}`, ON CONFLICT DO NOTHING)                                                                                                                                                                                                                |
| 5   | `YYYYMMDDHHMMSS_rpc_create_financial_adjustment_emit_outbox.sql`           | Same outbox-emit addition; event_type `adjustment.created` or `adjustment.void`                                                                                                                                                                                                                                                                                                                                        |
| 6   | `YYYYMMDDHHMMSS_drop_bridge_rated_buyin_trigger.sql`                       | Drop `trg_bridge_rated_buyin_telemetry` + function                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | `YYYYMMDDHHMMSS_rebuild_table_buyin_telemetry_as_projection.sql`           | Either (a) convert TBT to view over PFT (simplest), or (b) keep table as a materialized read-model written by the outbox consumer. **Recommend (a) for pilot** — drop INSERT RLS on TBT entirely; view definition: `SELECT … FROM pft WHERE txn_kind='buyin' AND direction='in'` with `telemetry_kind = CASE WHEN is_rated THEN 'RATED_BUYIN' ELSE 'GRIND_BUYIN' END`, joining `rating_slip` for `table_id` when rated |
| 8   | `YYYYMMDDHHMMSS_drop_rpc_log_table_buyin_telemetry.sql`                    | RPC becomes unreachable post-UI redirect                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | `YYYYMMDDHHMMSS_visit_financial_summary_remove_pit_cash_union.sql`         | Recreate view from PFT only; preserve existing column names (`total_in`, `total_out`, `net_amount`, `event_count`)                                                                                                                                                                                                                                                                                                     |
| 10  | `YYYYMMDDHHMMSS_create_visit_cash_observation_summary.sql`                 | New sibling view for pit_cash_observation with explicit `observed_out_total`, `observation_count`, `confirmed_count`, `estimate_count` columns                                                                                                                                                                                                                                                                         |
| 11  | `YYYYMMDDHHMMSS_grant_finance_outbox_select_to_authenticated.sql`          | If Realtime subscription is chosen as consumer, RLS SELECT for outbox must be reachable by the channel subscriber                                                                                                                                                                                                                                                                                                      |

**KEEP (do not touch):**
- `trg_fin_gaming_day`, `trg_mtl_entry_gaming_day`, `trg_pit_cash_observation_gaming_day` — gaming_day derivation
- `trg_mtl_entry_no_update/delete`, PFT append-only RLS, pit_cash_observation immutable triggers
- `fn_derive_mtl_from_finance` — compliance canonical projection. ADR C2 ("no hidden triggers") arguably covers this, but MTL is a canonical ledger, not a derived side-effect. **Defer** the decision; document as ADR-pending. Adding MTL derivation to the outbox consumer can happen in a later migration without breaking correctness.
- `mtl_gaming_day_summary`, `measurement_*_v` views

### Layer 2 — RPC body changes (exact insertion points)

**`rpc_create_financial_txn`** — mig `20260306223803_prd044_d3d4_remove_p_casino_id.sql:20-127`:
- Line 16-17: relax `p_player_id`, `p_visit_id` to `DEFAULT NULL`
- Add params: `p_table_id uuid DEFAULT NULL`, `p_is_rated boolean DEFAULT true`
- Insertion point: after line 123 `RETURNING t.* INTO v_row;`, before `RETURN v_row;` — insert outbox emit (agent 3 §3 has the full SQL block, copy it verbatim with idempotency-key derivation `'fin:' || v_row.id`)
- Event type selector: `buyin.created` / `cashout.recorded` / `marker.issued` based on `(direction, source, tender_type)` tuple

**`rpc_create_financial_adjustment`** — same migration, lines 150-289:
- Line ~247-285 INSERT block followed by outbox emit at line ~285. Event type: `adjustment.created` or `adjustment.void` per `reason_code`

**`rpc_log_table_buyin_telemetry`** — `20260114004141` + patches through `20260219235612`:
- Drop after UI redirect lands. No refactor needed.

### Layer 3 — Service & HTTP layer

- `services/player-financial/schemas.ts`: update `createFinancialTxn*Schema` variants — add `is_rated`, `table_id`, relax `player_id`/`visit_id` to optional. Role rules:
  - `pit_boss`: may submit with `{is_rated: false, table_id, player_id: null, visit_id: null, source: 'pit_grind'}` OR the current rated shape
  - `cashier`: unchanged (always player-attributed cage events)
- `services/player-financial/crud.ts:141-191`: wire the new params through `rpc_create_financial_txn` call
- `services/player-financial/mappers.ts` + `dtos.ts`: add `is_rated`, `table_id` to `PlayerFinancialTransactionDTO`; `VisitFinancialSummaryDTO` stays (view still exposes same columns)
- `services/table-context/shift-metrics/service.ts`: the RPC `rpc_shift_table_metrics` now reads the TBT view; no service-layer change if view preserves `telemetry_kind` semantics

### Layer 4 — Hook redirect (the actual UI wiring change)

| File                                         | Line  | Current                                                                                     | Change                                                                                                                                                                                                                         |
| -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/table-context/use-buyin-telemetry.ts` | 94    | `rpc_log_table_buyin_telemetry({p_telemetry_kind:'GRIND_BUYIN', p_source:'pit_manual', …})` | `rpc_create_financial_txn({is_rated:false, table_id, direction:'in', source:'pit_grind', amount: amountCents, player_id:null, visit_id:null, rating_slip_id:null, idempotency_key})`                                           |
| `hooks/table-context/use-buyin-telemetry.ts` | 136   | `rpc_log_table_buyin_telemetry({p_amount_cents: -amountCents, p_source:'pit_manual_undo'})` | `rpc_create_financial_adjustment` with `delta_amount: -amountCents`, `reason_code: 'pit_correction'` (new enum value — needs mig) anchored to original PFT id; OR keep as negative-amount PFT row if ADR permits signed deltas |
| `hooks/table-context/use-buyin-telemetry.ts` | 25-63 | `useGrindBuyinTotal` reads TBT directly                                                     | Point at rebuilt TBT view — no signature change                                                                                                                                                                                |

### Layer 5 — UI split-brain fix (P0-2, independent of outbox)

`components/modals/rating-slip/rating-slip-modal.tsx:554-735`:

```
// current (line 557-561)
const computedChipsOut = modalData
  ? (modalData.financial.totalChipsOut + pendingChipsTaken * 100) / 100
  : 0;
// — blends server cents + unsaved Zustand dollars
```

Required change: display two separate numbers with distinct labels per ADR fact-model D5 — `authoritativeChipsOut` (from PFT-only view) and `estimatedChipsOutPending` (local form). Do not arithmetic-blend them in the displayed "net position"; compute two nets and label the estimated one.

Also needed and independent:
- `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx:59` — `mtlEntries={}` is hardcoded empty. Add `useMtlEntries()` and pass the result. (GAP-U1 from provenance trace — confirmed broken by agent 4.)

### Layer 6 — Outbox consumer (the ADR's D4/D5 requirement)

**Mechanism choice (pg_cron is banned per your pilot containment memory):**

| Option                                                    | Fit                           | Recommendation                                                                                                                  |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Realtime subscription on `finance_outbox` INSERT | Good for UI refresh freshness | **Use for pilot UI layer** — one hook `useFinanceOutboxSubscription(filter)` that invalidates React Query keys on INSERT events |
| Vercel Cron + poller route handler                        | Good for backend side-effects | Defer until backend consumers exist (e.g., migrating MTL bridge off trigger)                                                    |
| LISTEN/NOTIFY                                             | Not aligned with stack        | Skip                                                                                                                            |

Pilot scope: producer only. UI uses Realtime subscription to invalidate. No separate worker process. Mark outbox rows `processed_at` from the subscription handler if the UI successfully invalidates, OR leave them unprocessed and treat outbox as an audit trail (simplest; aligned with "at-least-once, idempotent consumers").

---

## 3. Tests that must be rewritten

- `__tests__/services/table-context/shift-metrics.int.test.ts` lines 303, 314, 328, 339, 349, 363, 378, 438, 441 — all setup uses `rpc_log_table_buyin_telemetry`; switch to `rpc_create_financial_txn` with `is_rated:false`
- `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts` lines 448, 464, 480, 499 — same
- New test: `services/player-financial/__tests__/finance-outbox-contract.int.test.ts` modeled after `services/loyalty/__tests__/promo-outbox-contract.int.test.ts`
- Seed file `supabase/seed.sql:953+` — rewrite grind seed rows as PFT inserts with `is_rated:false`

---

## 4. Recommended execution sequence

1. **Amend the ADR** — pick Option A/B/C above; add a §5.2a "Schema amendment: player_id nullability + table_id anchor + is_rated flag" section to `ADR-FINANCIAL-EVENT-INGESTION-UNIFICATION.md`. **Blocking — do not proceed without this.**
2. **Phase 1 — Schema + RPC** (migrations 1-5 above). Deploy. CI green. No UI change yet; RPC accepts new shape but old shape still works.
3. **Phase 2 — Outbox producer live** (part of migration 4/5). Verify outbox rows appear on every PFT write via integration test.
4. **Phase 3 — UI redirect** (hook changes layer 4) + TBT-view rebuild (migrations 6-8). Delete `rpc_log_table_buyin_telemetry`. Rewrite tests.
5. **Phase 4 — Projection split** (migrations 9-10) + rating-slip modal fix (layer 5). Compliance panel mtlEntries wiring (layer 5 second bullet).
6. **Phase 5 — Outbox consumer subscription** (layer 6). Swap 5+ manual `invalidateQueries` calls for one subscription hook.
7. **Phase 6 (deferred, post-pilot)** — decide whether to route `fn_derive_mtl_from_finance` through the outbox.

---

## 5. Items not covered by ADRs — flag before shipping

- **pit_cash_observation classification** — draft ADR fact model D4 says "observational data" but the current UNION is in production. Migration 9 removes the UNION; operators who currently see "chips out includes observations" will see a smaller number. UX surface change; should be announced.
- **`direction='in'` semantic collapse** (P1-5 from trace) — marker issuance currently counts as a buy-in in aggregates. Not addressed by any draft ADR. Would require either per-event_type aggregation or a separate buy-in-only view.
- **Loyalty redemption RPC missing** (GAP-L1) — orthogonal to these ADRs but still unresolved. Call out in follow-up.
- **cents/dollars unit contract** (§5 Rule C3) — no ADR forces a single unit. Worth an ADR of its own if not already covered.

---

## Bottom line

The three ADRs form a coherent target topology (single ingestion → single fact model → outbox propagation), but the ingestion ADR as drafted is **incomplete on grind anchoring** — you must amend it with Option A before implementation starts. All four investigations converged on the same concrete change set: ~11 migrations, one RPC body rewrite in two functions, two hook redirects, one UI split fix, one new subscription hook, ~15 test rewrites. Risk is low because DB is pre-production (your ADR notes no backfill required). The highest-leverage standalone improvements — independent of the outbox work — are the compliance-panel `mtlEntries` wiring (1h) and the rating-slip modal split-brain display fix (3-4h).