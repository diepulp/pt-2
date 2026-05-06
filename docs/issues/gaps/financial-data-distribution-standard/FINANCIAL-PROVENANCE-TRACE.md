---
title: Financial Provenance Trace — PT-2 System-Wide Audit
date: 2026-04-22
author: Claude Code (6-agent parallel trace + reconciliation)
status: Draft v1 — foundational input for Financial Data Distribution Standard
scope: System-of-record audit; NOT remediation. Read-only discovery.
corpus:
  - services/**
  - app/api/v1/**
  - supabase/migrations/** (283 migrations)
  - components/**, hooks/**
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md (v4.13.0+)
---

# Financial Provenance Trace

> Every financial value must answer: *"Where did this number come from, exactly?"*
> If it can't be answered deterministically, it is flagged `split-brain` or `undefined provenance`.

---

## 0. Executive Framing

PT-2 has **three active financial ledgers**, **two operational telemetry surfaces** that silently feed canonical views, and **a chip-custody audit trail**. The system-of-record picture is:

| Surface | Role | Authoritative? |
|---|---|---|
| `player_financial_transaction` (PFT) | Per-player financial events (buy-in, cash-out, adjustment) | **YES** — finance canonical |
| `mtl_entry` | Compliance cash-movement log (CTR/SAR) | **YES** — compliance canonical (independent of PFT) |
| `loyalty_ledger` | Points accrual/redemption | **YES** — loyalty canonical |
| `pit_cash_observation` | Operational telemetry (floor estimates / cage-confirmed cash-out) | **NO** — non-authoritative per PRD-OPS-CASH-OBS-001 |
| `table_buyin_telemetry` | Per-table buy-in telemetry; RATED (bridged from PFT) + GRIND (direct RPC, anonymous) | **NO** — schema comment: "Telemetry-only (not accounting data)" |
| `table_fill` / `table_credit` / `table_drop_event` | Chip custody attestation (PRD-033) | **Operational**, not financial ledger |

**Principal finding:** `visit_financial_summary` (the primary aggregation presented to rating slip modal and beyond) **UNIONs PFT and pit_cash_observation** and treats every `pit_cash_observation` row as a canonical `direction='out'` financial event. A telemetry record is thus elevated to a financial number with no semantic fence. This is the single highest-risk split-brain in the current architecture (§7, P0-1).

**Secondary finding:** Grind (unrated) buy-ins exist **only** in `table_buyin_telemetry` and feed `estimated_drop_*_cents` on the shift dashboard. They have **no PFT, no MTL, no visit** — there is no patron to attribute to. Rated buy-ins live in both PFT and telemetry (via trigger bridge `fn_bridge_finance_to_telemetry`), but per-visit financial views cannot see grind, and per-table drop estimates mix rated + grind silently (§7, P1-7).

**Tertiary finding:** `finance_outbox` (Nov 2025) has **no producer**. Async side-effects downstream of PFT mutations have no reliable event stream; consumers must poll PFT directly (§9, GAP-F1).

**Quaternary finding:** Three facts — MTL entries, PFT rows, and pit_cash_observation — are written by **independent paths with no reconciliation contract**. When they disagree, there is no defined precedence rule (§7, P1-2).

---

## 1. Source Inventory

Every origin point where financial intent enters the system.

### 1.1 Player Financial Transactions (PFT — canonical ledger)

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.1a | Rating-slip modal buy-in (pit boss) | `hooks/rating-slip-modal/use-save-with-buyin.ts:122-133` | Save buy-in | `amount` (cents, ×100 from dollars), direction=`in`, source=`pit`, tender=`cash`\|`chips`, visit_id, rating_slip_id, player_id | POST `/api/v1/financial-transactions` → `rpc_create_financial_txn` → `player_financial_transaction` |
| 1.1b | Cashier patron cash-out | `hooks/cashier/use-patron-transactions.ts:*` + `services/player-financial/http.ts:59-70` | Patron cash-out form | `amount` (cents), direction=`out`, source=`cage`, tender=`cash`\|`check`\|`wire`\|`marker`, visit_id | Same RPC path, role-scoped via `createFinancialTxnCashierSchema` |
| 1.1c | Admin direct entry | Same HTTP path, `createFinancialTxnAdminSchema` (unrestricted) | Admin adjustment | Any enum combination | Same RPC |
| 1.1d | Financial adjustment (correction/void) | `services/player-financial/http.ts:178-259` | Adjustment UI | `delta_amount` (signed), reason_code (enum), note (≥10 chars), original_txn_id | `rpc_create_financial_adjustment` → PFT row with `txn_kind='adjustment'`, `related_transaction_id=original` |
| 1.1e | Seed / demo scripts | `supabase/seed.sql:668,676,687,696`; `seed-timeline-demo.sql:132,154,176` | Test setup | Direct INSERT (bypasses RPC) | PFT (non-production only) |

**Canonical RPC signature** (`supabase/migrations/20260306223803_prd044_d3d4_remove_p_casino_id.sql:108-120`):
```sql
rpc_create_financial_txn(
  p_player_id uuid, p_visit_id uuid, p_amount numeric,
  p_direction financial_direction, p_source financial_source,
  p_created_by_staff_id uuid, p_tender_type text DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL, p_related_transaction_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_created_at timestamptz DEFAULT now(),
  p_external_ref text DEFAULT NULL
) RETURNS player_financial_transaction
```

### 1.2 MTL Entries (compliance ledger — independent)

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.2a | MTL entry form (pit boss / cashier / admin) | `app/api/v1/mtl/entries/route.ts:124-128` → `services/mtl/crud.ts:192-196` | Submit MTL | patron_uuid, casino_id, staff_id, rating_slip_id, visit_id, amount, direction, txn_type, source, area, occurred_at, idempotency_key | Authenticated client `INSERT INTO mtl_entry` (no RPC wrapper) |
| 1.2b | Audit note annotation | `app/api/v1/mtl/entries/[entryId]/audit-notes/route.ts` → `services/mtl/crud.ts:241-249` | Add note | mtl_entry_id, staff_id, note | `INSERT INTO mtl_audit_note` |

**Important:** MTL writes use **direct table INSERTs** gated by RLS, not an RPC. This is a deliberate architectural choice per ADR-025. It means MTL has no SECURITY DEFINER surface and no idempotency wrapper beyond a `(casino_id, idempotency_key)` partial unique index.

### 1.3 Pit Cash Observations (operational telemetry)

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.3a | Rating-slip modal "chips taken" (save) | `hooks/rating-slip-modal/use-save-with-buyin.ts:158-177` | Save with chips-taken | `amount` (**dollars**), rating_slip_id, visit_id, source=`walk_with`, idempotency_key=`chips-taken-save-{slipId}-{timestamp}` | `rpc_create_pit_cash_observation` |
| 1.3b | Rating-slip modal "chips taken" (close) | `hooks/rating-slip-modal/use-close-with-financial.ts:100-121` | Close slip | `amount` (dollars), idempotency_key=`chips-taken-{slipId}` (one observation per slip close) | Same RPC |
| 1.3c | Cage-confirmed observation | (Not traced — likely cashier/cage UI) | Cage reconciles actual cash | `amount_kind='cage_confirmed'` | Same RPC |

**RPC:** `rpc_create_pit_cash_observation` in `20260106021105_prd_ops_cash_obs_001_rpc.sql` (gaming_day trigger at lines 92-106). Hardcodes `direction='out'` inside the RPC.

### 1.4 Table Buy-In Telemetry (rated + grind)

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.4a | Rated buy-in (bridged from PFT) | `fn_bridge_finance_to_telemetry()` AFTER INSERT on `player_financial_transaction` (mig `20260115000200`) | Any PFT row with `direction='in' AND rating_slip_id IS NOT NULL` | `telemetry_kind='RATED_BUYIN'`, `source='finance_bridge'`, `tender_type=pft.tender_type`, `amount_cents=pft.amount`, `occurred_at=pft.created_at`, idempotency_key=`pft:{pft.id}` | INSERT `table_buyin_telemetry` |
| 1.4b | Grind buy-in (anonymous at table) | `rpc_log_table_buyin_telemetry` (referenced by RLS comment at mig `20260114003530:114`; direct UI caller not traced) | Pit-floor observation of unrated play | `telemetry_kind='GRIND_BUYIN'`, `visit_id=NULL`, `rating_slip_id=NULL`, `amount_cents`, `actor_id` | INSERT `table_buyin_telemetry` |

**Constraint logic** (`20260114003530:47-57`):
- `RATED_BUYIN` → MUST have both `visit_id` and `rating_slip_id` NOT NULL
- `GRIND_BUYIN` → MUST have both `visit_id` and `rating_slip_id` NULL

**Grind buy-ins have NO PFT, NO MTL, NO player, NO visit.** They exist only here, and they contribute to `estimated_drop_grind_cents` in `rpc_shift_table_metrics`.

### 1.5 Chip Custody (table_fill / table_credit / table_drop_event — PRD-033)

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.5a | Pit requests fill | `app/api/v1/table-context/fills/route.ts:106` → `chip-custody.ts:80-114` | Fill requested | amount_cents, chipset, requested_by, slip_no | `rpc_request_table_fill` → `table_fill` (status='requested') |
| 1.5b | Cashier confirms fill | `app/api/v1/table-context/fills/[id]/confirm/route.ts:55` → `chip-custody.ts:208-223` | Cashier attests | confirmed_amount_cents, discrepancy_note | `rpc_confirm_table_fill` → UPDATE (status='confirmed') |
| 1.5c | Pit requests credit | `app/api/v1/table-context/credits/route.ts:106` | Credit requested | Same shape as fill | `rpc_request_table_credit` → `table_credit` |
| 1.5d | Cashier confirms credit | `app/api/v1/table-context/credits/[id]/confirm/route.ts:55` | Cashier attests | confirmed_amount_cents, discrepancy_note | `rpc_confirm_table_credit` |
| 1.5e | Drop log | `app/api/v1/table-context/drop-events/route.ts:110` | Drop box removed | seal_no, witnessed_by, removed_at | `rpc_log_table_drop` → `table_drop_event` |
| 1.5f | Cage acknowledges drop | `app/api/v1/table-context/drop-events/[id]/acknowledge/route.ts:50` | Cage receipt | cage_received_by | `rpc_acknowledge_drop_received` → UPDATE |

### 1.6 Loyalty Ledger

| # | Surface | Entry Point | Trigger | Data Captured | Write Target |
|---|---|---|---|---|---|
| 1.6a | Rating-slip close → base accrual | `supabase/migrations/20251216073543_adr014_ghost_visit_loyalty_guard.sql:20-214` (RPC `rpc_accrue_on_close`) | RPC (likely triggered by close flow, **exact caller UNKNOWN — REQUIRES VERIFICATION**) | rating_slip.policy_snapshot.loyalty.theo, points_conversion_rate | INSERT `loyalty_ledger` (reason='base_accrual') + UPDATE `player_loyalty.current_balance` |
| 1.6b | Campaign promotion apply | Same file, lines 226-411 (`rpc_apply_promotion`) | Promo UI | rating_slip_id, campaign_id, promo_multiplier | INSERT `loyalty_ledger` (reason='promotion') |
| 1.6c | Promo instruments emit | `supabase/migrations/20260106235611_loyalty_promo_instruments.sql:391,531,705` | 3 promo RPCs | n/a — side-effect emit | INSERT `loyalty_outbox` (producer exists — see §9, GAP-L1 revision) |

### 1.7 Rating-Slip Financial Adjacencies (denormalized / derived)

`rating_slip` itself has **NO `buy_in`, `cash_in`, or `cash_out` columns** (verified against `types/database.types.ts`). Its financial-adjacent columns are:

- `average_bet`, `final_average_bet` (bet magnitude, denormalized)
- `duration_seconds`, `final_duration_seconds`, `accumulated_seconds`
- `computed_theo_cents`, `legacy_theo_cents`
- `game_settings` (jsonb), `policy_snapshot` (jsonb) — frozen at create/move
- `cash_out_observed_cents`, `cash_out_observed_confirmed_total`, `cash_out_observed_estimate_total`, `cash_out_observation_count`, `cash_out_last_observed_at` — **denormalized aggregates of `pit_cash_observation`** (projection)

All monetary amounts live in PFT / pit_cash_observation / loyalty_ledger; the rating slip anchors them by `rating_slip_id` FK.

---

## 2. Write Boundary Classification

| Source | Classification | Authoritative Ledger | Notes |
|---|---|---|---|
| 1.1a–1.1d | **Canonical** | `player_financial_transaction` | Sole production path = `rpc_create_financial_txn` + `rpc_create_financial_adjustment`. RLS blocks UPDATE/DELETE absolutely (append-only). |
| 1.1e | Non-canonical (seed only) | n/a | Direct INSERT bypass — acceptable for test data only. |
| 1.2a | **Canonical** | `mtl_entry` | Direct RLS-gated INSERT (no RPC). Append-only via BEFORE triggers (mig `20260103002836:286-296`). |
| 1.2b | **Canonical** (annotation) | `mtl_audit_note` | Same pattern; no actor binding verification (see §7 P2-4). |
| 1.3a–1.3c | **Derived / operational** | `pit_cash_observation` | Labeled "operational telemetry, not authoritative settlement" per PRD-OPS-CASH-OBS-001. See split-brain P0-1. |
| 1.4a | **Derived** (bridge) | `table_buyin_telemetry` (RATED) | AFTER INSERT trigger on PFT. Idempotent via `pft:{pft.id}` key. Schema comment: "Telemetry-only (not accounting data)." |
| 1.4b | **Canonical** for grind, but **non-authoritative** for finance | `table_buyin_telemetry` (GRIND) | Has NO PFT antecedent; no player/visit/slip. Only appears in Estimated Drop aggregates. See §7 P1-7. |
| 1.5a–1.5f | **Operational attestation** (not financial) | `table_fill`, `table_credit`, `table_drop_event` | Chip custody audit trail; does NOT emit PFT row on confirmation. |
| 1.6a–1.6b | **Canonical** (loyalty) | `loyalty_ledger` + `player_loyalty` | Idempotency via `ux_loyalty_ledger_base_accrual` (one per slip forever). |
| 1.6c | Side-effect-only | `loyalty_outbox` | Async downstream notifications; producer exists but consumer path not traced. |

**Aggregation surfaces (derived projections, NOT sources):**

| View / Derived | Definition | Classification |
|---|---|---|
| `visit_financial_summary` | `20260218203729_add_pit_cash_observation_to_visit_financial_summary.sql` | **LIVE VIEW**, SECURITY INVOKER. UNIONs PFT + pit_cash_observation. See §5 Rule-V1. |
| `mtl_gaming_day_summary` | `20260103002836_prd010_mtl_audit_note_denial.sql:143-165` | LIVE VIEW of `mtl_entry` aggregated by gaming_day + patron. Not materialized. |
| `measurement_audit_event_correlation_v` | `20260307115131_adr039_measurement_views.sql:9-28` | LIVE VIEW joining rating_slip LEFT JOIN PFT LEFT JOIN mtl_entry LEFT JOIN loyalty_ledger. Fanout risk (see §5 Rule-C1). |
| `rpc_shift_table_metrics` → `estimated_drop_*_cents` | `20260114004336:54-56,242-244` | **COMPUTED ON-READ** from `table_buyin_telemetry`. Not stored. |

---

## 3. Fact Assignment

| Fact ID | Authoritative Write | Why it belongs | Status |
|---|---|---|---|
| **FACT-PFT-TXN-IN-PIT-CASH** | `direction='in' ∧ source='pit' ∧ tender='cash'` | Pit buy-in in cash | ✅ Clean |
| **FACT-PFT-TXN-IN-PIT-CHIPS** | `direction='in' ∧ source='pit' ∧ tender='chips'` | Pit buy-in in chips | ✅ Clean |
| **FACT-PFT-TXN-OUT-CAGE** | `direction='out' ∧ source='cage'` | Cashier cash-out | ✅ Clean |
| **FACT-PFT-TXN-IN-CAGE-MARKER** | `direction='in' ∧ source='cage' ∧ tender='marker'` | Marker issuance | ✅ Clean |
| **FACT-PFT-ADJUSTMENT** | `txn_kind='adjustment'` (via `rpc_create_financial_adjustment`) | Correction/void | ⚠️ Semantic ambiguity — a "void" is just an adjustment with negative delta; no distinct `txn_kind='void'` (§7 P2-3). |
| **FACT-PFT-SYSTEM** | `source='system'` | Automated reconciliation (admin only) | ⚠️ No write path observed beyond admin schema; purpose unclear. |
| **FACT-MTL-ENTRY** | `INSERT mtl_entry` | CTR/SAR compliance log | ✅ Clean |
| **FACT-MTL-AUDIT-NOTE** | `INSERT mtl_audit_note` | Operational annotation | ⚠️ Actor attribution not verified (§7 P2-4). |
| **FACT-MTL-PATRON-DAILY-TOTAL** | (derived) `mtl_gaming_day_summary` view | Aggregate | ❌ Not a fact — it's a **projection**. Prompt listed this as a primary fact; schema says it's a LIVE VIEW, not a table. **UNRESOLVED FACT OWNERSHIP**. |
| **FACT-PIT-CASH-OBSERVATION-ESTIMATE** | `pit_cash_observation` with `amount_kind='estimate'` | Pit-floor estimate of chip walk-off | ⚠️ Non-authoritative but fed into canonical visit aggregation (§7 P0-1). |
| **FACT-PIT-CASH-OBSERVATION-CONFIRMED** | `pit_cash_observation` with `amount_kind='cage_confirmed'` | Cage-confirmed cash-out | ⚠️ Same table as estimate; no 1:1 reconciliation constraint (§7 P1-1). |
| **FACT-RATED-BUYIN-TELEMETRY** | `table_buyin_telemetry` with `telemetry_kind='RATED_BUYIN' ∧ source='finance_bridge'` | Per-table projection of rated buy-ins, bridged from PFT | ⚠️ **Duplicate of FACT-PFT-TXN-IN-PIT** but under a different grain (table × time) and with explicit "not accounting" classification. See §7 P1-7. |
| **FACT-GRIND-BUYIN-TELEMETRY** | `table_buyin_telemetry` with `telemetry_kind='GRIND_BUYIN'` | Anonymous/unrated buy-ins observed at table | ⚠️ **Has no player, visit, or slip.** Contributes to Estimated Drop with no provenance back to any patron. See §7 P1-7. |
| **FACT-TABLE-FILL-REQUESTED** | `table_fill` with `status='requested'` | Pit-side chip movement intent | ✅ Clean (operational) |
| **FACT-TABLE-FILL-CONFIRMED** | `table_fill` with `status='confirmed'` (UPDATE via RPC) | Cashier attestation | ✅ Clean |
| **FACT-TABLE-CREDIT-REQUESTED / CONFIRMED** | mirror fill | | ✅ Clean |
| **FACT-TABLE-DROP-EVENT** | `table_drop_event` INSERT | Drop box pulled | ✅ Clean |
| **FACT-TABLE-DROP-CAGE-RECEIVED** | `table_drop_event` UPDATE with cage_received_at | Cage receipt acknowledgment | ⚠️ Implicit state machine (NULL vs NOT NULL) — no status enum. |
| **FACT-LOYALTY-BASE-ACCRUAL** | `loyalty_ledger` with `reason='base_accrual'` | Points earned on slip close | ✅ Clean (idempotent one-per-slip) |
| **FACT-LOYALTY-PROMOTION** | `loyalty_ledger` with `reason='promotion'` | Campaign multiplier | ✅ Clean |
| **FACT-LOYALTY-REDEMPTION** | `loyalty_ledger` with `reason='redeem'` | Points spent | ❌ **UNRESOLVED FACT OWNERSHIP** — enum value exists but `rpc_redeem` (or equivalent) not found. **REQUIRES VERIFICATION**. |
| **FACT-VISIT-FINANCIAL-SUMMARY** | (derived) `visit_financial_summary` view | Per-visit aggregate | ❌ Derived, but consumers (rating slip modal) treat as authoritative. |
| **FACT-ESTIMATED-DROP** | (computed on-read) `rpc_shift_table_metrics` | Shift drop estimate | ❌ Derived; no snapshot; freshness SLA gap per ADR-050. |

---

## 4. Propagation Chains

Full paths: **Source → Service → RPC → DB → Trigger/View → Consumer**.

### 4.1 Buy-In (rated)

```
Pit boss (rating-slip modal form)
  → use-save-with-buyin.ts:122-133 (dollars × 100 = cents)
  → POST /api/v1/financial-transactions
  → app/api/v1/financial-transactions/route.ts:104-174 (role-scoped schema: pit_boss → createFinancialTxnPitBossSchema)
  → services/player-financial/crud.ts:141-191
  → rpc_create_financial_txn (ADR-024 context injection via set_rls_context_from_staff)
  → INSERT player_financial_transaction (direction='in', source='pit')
  → BEFORE INSERT trigger trg_fin_gaming_day (mig 20251022003807:86-88) derives gaming_day
  → AFTER INSERT trigger fn_derive_mtl_from_finance (mig 20260116111329) emits mtl_entry with idempotency_key='fin:'||finance_id
    ⇒ This is a one-way forward bridge from PFT → MTL; MTL never writes back.
  → Returned row → invalidateQueries([
        playerFinancialKeys.visitSummary(visitId),     // GET /api/v1/visits/{id}/financial-summary → visit_financial_summary VIEW
        mtlKeys.entries.scope,                         // refetch MTL
        ratingSlipModalKeys.data(slipId)               // refetch modal BFF
      ])
```

### 4.2 Cash-Out (chips taken during session)

```
Pit boss (rating-slip modal form; chips-taken field)
  → use-save-with-buyin.ts:158-177 or use-close-with-financial.ts:100-121
  → rpc_create_pit_cash_observation (dollars, NOT cents)
  → INSERT pit_cash_observation (direction='out' hardcoded, amount_kind='estimate' default)
  → BEFORE INSERT trigger derives gaming_day (mig 20260106021105:92-106)
  → NO downstream trigger — pit_cash_observation is a sink
  → But: visit_financial_summary VIEW UNIONs pit_cash_observation (rounded × 100) and treats as canonical 'out'
    ⇒ This is the critical split-brain (§7 P0-1)
```

### 4.3 Cash-Out (cashier, canonical)

```
Cashier (patron cash-out form)
  → services/player-financial/http.ts:59-70 → POST /api/v1/financial-transactions
  → role-scoped schema: cashier → createFinancialTxnCashierSchema (enforces source='cage', tender ∈ cash|check|wire|marker)
  → rpc_create_financial_txn → PFT with direction='out', source='cage'
  → same MTL forward bridge → mtl_entry(direction='out')
  → visit_financial_summary sums cash-out from PFT (cents)
```

### 4.4 Chip Custody (fill / credit / drop)

```
Pit (requests) → rpc_request_table_fill → INSERT table_fill (status='requested')
Cashier (confirms) → rpc_confirm_table_fill(confirmed_amount_cents, discrepancy_note) → UPDATE (status='confirmed')
  ⇒ NO PFT write triggered. Chip custody is intentionally separate from financial ledger.

table_drop_event: INSERT → optional UPDATE (cage_received_at) — NO PFT linkage.
```

### 4.5 Loyalty Accrual

```
Slip close (caller UNKNOWN — trigger? explicit RPC in close path?)
  → rpc_accrue_on_close (reads rating_slip.policy_snapshot.loyalty.theo × points_conversion_rate)
  → UPSERT loyalty_ledger (reason='base_accrual', unique on casino_id+rating_slip_id)
  → UPDATE player_loyalty.current_balance
  → ADR-014 ghost visit guard: RAISE if player_id IS NULL

Campaign apply → rpc_apply_promotion → loyalty_ledger(reason='promotion') → loyalty_outbox insert (3 emit points in 20260106235611:391,531,705)
```

### 4.6 Estimated Drop (derived, computed on-read)

```
Rated path:
  rpc_create_financial_txn → INSERT PFT (direction='in', rating_slip_id NOT NULL)
    → AFTER INSERT trigger fn_bridge_finance_to_telemetry (mig 20260115000200)
    → INSERT table_buyin_telemetry (telemetry_kind='RATED_BUYIN', source='finance_bridge',
                                    idempotency_key='pft:'||pft.id)

Grind path:
  Pit-floor UI → rpc_log_table_buyin_telemetry (callers not traced)
    → INSERT table_buyin_telemetry (telemetry_kind='GRIND_BUYIN', visit_id=NULL,
                                    rating_slip_id=NULL)

Aggregation (on read):
  Shift dashboard → rpc_shift_table_metrics(p_window_start, p_window_end)
    → SUM(amount_cents) grouped by telemetry_kind within window
    → returns estimated_drop_rated_cents + estimated_drop_grind_cents = estimated_drop_buyins_cents
    → NOT stored; every read recomputes

⇒ estimated_drop_buyins_cents mixes RATED (bridged from PFT) and GRIND (no PFT).
⇒ visit_financial_summary.total_in sees RATED only.
⇒ A number that claims to be "the drop" is not reproducible from per-visit sums.
```

### 4.7 Financial Adjustment (void/correction)

```
Adjustment UI (scope unclear; no dedicated route traced)
  → services/player-financial/http.ts:178-259 → rpc_create_financial_adjustment
  → INSERT new PFT row (txn_kind='adjustment', related_transaction_id=original, direction derived from delta sign, amount=|delta|)
  → Original row remains immutable (RLS blocks UPDATE)
  → Downstream readers (visit_financial_summary) include adjustment rows — totals reflect net automatically
  → get_visit_cash_in_with_adjustments exists (referenced in Agent 4 trace) — purpose unclear but implies adjustment-aware aggregation path
```

---

## 5. Bridge / Projection Rules (Hidden Contracts)

Filters and gates that silently shape financial numbers.

### Rule **V1** — `visit_financial_summary` UNIONs telemetry into canonical aggregate ⚠️ **CRITICAL**
```
Condition:  Any row inserted into pit_cash_observation (for a visit)
Effect:     View adds (visit_id, casino_id, direction='out', amount=ROUND(pco.amount*100), created_at) to union
Implication: Operational telemetry contributes to "canonical" visit financial totals. A
             pit-floor chip estimate is counted as an actual cash-out. A cage_confirmed
             observation is counted once (correctly) but so is an estimate from the
             same visit (no dedup). See §7 P0-1.
Source:     20260218203729_add_pit_cash_observation_to_visit_financial_summary.sql:17-51
Hidden?     PARTIALLY — view COMMENT discloses the union, but consumer code shows no awareness of the telemetry vs canonical distinction.
```

### Rule **V2** — PFT gaming_day trigger depends on casino_settings.gaming_day_start_time (timezone-blind)
```
Condition:  INSERT into player_financial_transaction
Effect:     trg_fin_gaming_day sets NEW.gaming_day = compute_gaming_day(NEW.created_at, gstart)
            where gstart defaults to '06:00' if casino_settings row missing
Implication: Computation uses TIME offset, NOT timezone. If casino_settings.timezone
             says 'America/Denver' but rows are UTC, gaming_day boundary is wrong at
             DST transitions. 3am local buy-in → previous gaming day.
Source:     20251022003807_fix_gaming_day_time_and_rpc.sql:48-88
Hidden?     YES (timezone-silent behavior).
```

### Rule **V3** — PFT idempotency partial uniqueness
```
Condition:  (casino_id, idempotency_key) where idempotency_key IS NOT NULL
Effect:     NULL keys do NOT conflict. Two NULL-keyed calls create two PFT rows.
Implication: Direct RPC calls (bypassing route-handler key generation) can double-write.
Source:     20251109214028:5-7; API layer key generation at app/api/v1/financial-transactions/route.ts:108
Hidden?     YES — partial-index semantics are non-obvious.
```

### Rule **V4** — PFT append-only enforcement (absolute)
```
Condition:  UPDATE or DELETE on player_financial_transaction
Effect:     RLS USING (auth.uid() IS NOT NULL AND false) — always denies
Implication: No in-place correction possible. Adjustments always = new rows.
Hidden?     NO (documented in ADR-016).
```

### Rule **V5** — PFT → MTL auto-derivation (forward only)
```
Condition:  AFTER INSERT on player_financial_transaction WHERE direction IN ('in','out')
Effect:     fn_derive_mtl_from_finance() INSERTs mtl_entry with idempotency_key='fin:'||id
Implication: MTL always has at least as many rows as PFT direction-bearing rows. If
             someone creates mtl_entry directly (API path 1.2a), that row has no PFT
             antecedent. Reconciling MTL back to PFT will show orphan MTL rows.
Source:     20260116111329 (migration referenced; content not inspected in depth)
Hidden?     PARTIALLY — comment in use-save-with-buyin.ts:254 says "unconditional" but guards G1–G5 exist inside the trigger function.
```

### Rule **V5.5** — Rated buy-in exists in two ledgers with different grains
```
Condition:  INSERT into player_financial_transaction with direction='in' AND
            rating_slip_id IS NOT NULL
Effect:     fn_bridge_finance_to_telemetry fires; INSERTs a matching row in
            table_buyin_telemetry with telemetry_kind='RATED_BUYIN',
            source='finance_bridge', idempotency_key='pft:'||NEW.id
Implication: Every rated buy-in is recorded twice — once per-player (PFT, visit-grain)
            and once per-table (telemetry, table/time-grain). The bridge is one-way;
            deleting/voiding the PFT row does NOT propagate to telemetry. Adjustments
            (txn_kind='adjustment') also trigger the bridge — so an adjustment of a
            rated buy-in creates a second RATED_BUYIN telemetry row, inflating table
            drop estimates unless the consumer nets by idempotency ancestry.
Source:     20260115000200_fn_bridge_finance_to_telemetry.sql:28-155
Hidden?     PARTIALLY — the bridge is documented in comment but consumer impact on
            Estimated Drop is not surfaced anywhere.
```

### Rule **V5.6** — Grind buy-ins have no patron, no visit, no PFT
```
Condition:  telemetry_kind='GRIND_BUYIN' check constraint requires visit_id IS NULL
            AND rating_slip_id IS NULL (mig 20260114003530:55-57)
Effect:     Grind rows exist only in table_buyin_telemetry. They contribute to
            estimated_drop_grind_cents and estimated_drop_buyins_cents.
Implication: Per-player or per-visit views (visit_financial_summary, player timeline,
            MTL) will never surface grind. Per-table shift metrics include grind.
            A casino manager comparing "sum of visit drops" to "shift table drop"
            cannot reconcile without awareness of this split.
Source:     20260114003530_table_buyin_telemetry.sql:55-57; 20260114004336_rpc_shift_table_metrics.sql:201-244
Hidden?     YES — no consumer-side documentation.
```

### Rule **V6** — Pit cash observation unit conversion (silent truncation)
```
Condition:  pit_cash_observation.amount stored as DOLLARS (numeric)
Effect:     visit_financial_summary converts via ROUND(amount * 100). Values like
            $1.995 round to $2.00 (cents=200).
Implication: visit_financial_summary total_out can differ from literal sum of
            pit_cash_observation.amount*100 when fractional dollars occur.
Hidden?     YES — no tolerance documentation.
```

### Rule **V7** — MTL gaming_day aggregation uses casino's gaming_day_start_time
```
Condition:  mtl_gaming_day_summary view (LIVE) groups by (casino_id, patron_uuid, gaming_day)
Effect:     trg_mtl_entry_gaming_day derives gaming_day on INSERT; the view aggregates
            on that column. No re-computation if casino_settings changes historically.
Implication: Editing casino_settings.gaming_day_start_time does NOT retroactively
            re-bucket old MTL entries (their gaming_day is frozen).
Source:     20260103002836:119-165
Hidden?     YES — implicit retroactive immutability.
```

### Rule **V8** — Loyalty base accrual is once-per-slip **forever**
```
Condition:  UNIQUE INDEX (casino_id, rating_slip_id) WHERE reason='base_accrual'
Effect:     If a slip is closed, accrual fires once. If it's reopened and re-closed,
            a second accrual attempt returns is_existing=true (no-op).
Implication: A slip can never be re-accrued, even if its policy_snapshot or theo
            changes via correction. Corrections require a promotion or adjustment.
Source:     20251213003000:117-122; 20251216073543:81-100
Hidden?     PARTIALLY — enforced by unique index; RPC gracefully handles.
```

### Rule **V9** — Loyalty ghost-visit guard (ADR-014)
```
Condition:  rating_slip.player_id IS NULL at time of rpc_accrue_on_close
Effect:     RAISE 'LOYALTY_GHOST_VISIT_EXCLUDED'
Implication: Ghost visits (unidentified patrons) are excluded from loyalty. Their
            rated play still appears in PFT/MTL but earns no points.
Source:     20251216073543:125-127, 321-323
Hidden?     NO (ADR-014 documents).
```

### Rule **V10** — Chip custody immutability after confirmation
```
Condition:  table_fill / table_credit with status='confirmed'
Effect:     RLS UPDATE policy requires status='requested'; once confirmed, row is frozen
            (all columns, not just status)
Implication: No post-hoc correction of confirmed amount. Discrepancies must be handled
            out-of-band (void + new request).
Source:     20260217074828_prd033_immutability_rls_enforcement.sql:26-42, 51-67
Hidden?     NO.
```

### Rule **V11** — Direction='in' filter appears silently in multiple surfaces
```
Condition:  visit_financial_summary.total_in, compliance panel MtlSummary cashIn,
            rpc_get_visit_live_view session_total_buy_in, others
Effect:     Every consumer filters direction='in' as if "buy-in"; no consumer validates
            the semantic (could be a cage deposit, marker issuance, adjustment).
Implication: A marker issuance (direction='in', source='cage', tender='marker') is
            indistinguishable from a cash buy-in in aggregated views.
Hidden?     YES — no centralized "what counts as a buy-in" definition.
```

### Rule **C1** — measurement_audit_event_correlation_v Cartesian fanout
```
Condition:  A rating slip with N PFT rows, M MTL entries, K loyalty ledger rows
Effect:     LEFT JOINs produce N × M × K rows for that slip.
Implication: Consumers must collapse/dedup themselves. No aggregation fence.
Source:     20260307115131_adr039_measurement_views.sql:9-28
Hidden?     YES — consumer guidance absent.
```

### Rule **C2** — Chip custody does NOT emit PFT
```
Condition:  rpc_confirm_table_fill / rpc_confirm_table_credit success
Effect:     UPDATE status='confirmed'; NO PFT INSERT
Implication: Confirmed chip movements are operational only, not financial events.
            They do not appear in visit_financial_summary, PFT, or MTL.
Hidden?     PARTIALLY — implicit from separate RPC surfaces.
```

### Rule **C3** — Cents vs Dollars split across surfaces
```
Condition:  Consumer reads financial number
Effect:     PFT stores cents (amount::bigint after mig 20251211). pit_cash_observation
            stores dollars. Rating slip modal DTO explicitly says cents. Compliance
            panel DTO doesn't label unit.
Implication: A client that passes MtlEntry.amount to formatDollars() may inflate 100×
            if the source was PFT-derived and happened to be cents-tagged.
Hidden?     YES — unit contract is per-surface, not systemic.
```

---

## 6. Downstream Consumers

| Consumer | Route / File | Source Read | Class | Caching / Invalidation |
|---|---|---|---|---|
| **Rating-slip modal — financial section** | `components/modals/rating-slip/rating-slip-modal.tsx:554-564` via `use-rating-slip-modal` | BFF RPC `rpc_get_modal_data` which reads `visit_financial_summary` | **Derived projection** | React Query key `ratingSlipModalKeys.data(slipId)`, stale 10s, gcTime 5m; invalidated on PFT mutation (broad scope). |
| **Rating-slip modal — pending net position** | `rating-slip-modal.tsx:564` | Server `totalChipsOut` + **local form state** `pendingChipsTaken` (Zustand) | **Mixed — server + unsaved client state** | **P0 split-brain (§7 P0-2)**. |
| **Rating-slip modal — cash-in adjustment breakdown** | `form-section-cash-in.tsx:136-159` | `originalTotal`, `adjustmentTotal` passed as props (source not traced) | Derived | Inherits parent invalidation. |
| **Cashier — patron transactions list** | `hooks/cashier/use-patron-transactions.ts:53-77`; `app/(dashboard)/cashier/patron-transactions-view.tsx:36+` | `listFinancialTransactions({source:'cage', direction:'out'})` → PFT directly | **Canonical** | Stale 30s, `refetchOnWindowFocus`. Optimistic append on create, invalidate on settle. |
| **Cashier — operational confirmations** | `app/(dashboard)/cashier/operational-confirmations/operational-confirmations-view.tsx` | `listFills({status:'requested'})`, `listCredits({status:'requested'})` — table_fill, table_credit direct | **Canonical** (operational) | React Query `tableContextKeys.pendingFills/Credits`; invalidated on confirm mutation. |
| **Cashier — recent confirmations** | `components/cashier/recent-confirmations-list.tsx:78` | `confirmed_amount_cents ?? amount_cents` | **Canonical** with fallback | Same invalidation. Displays "(Discrepancy noted)" badge when `discrepancy_note` present. |
| **Cashier — drop acknowledgements** | `app/(dashboard)/cashier/drop-acknowledgements/drop-acknowledgements-view.tsx` | `table_drop_event WHERE cage_received_at IS NULL` | **Canonical** | `tableContextKeys.unacknowledgedDrops(gamingDay)`; invalidated on acknowledge. |
| **Compliance panel (Player360)** | `components/player-360/compliance/panel.tsx:296-330` | Client-side `.filter().reduce()` over `mtlEntries` prop | **Recomputed** | **Upstream source of the prop NOT traced** — see §7 P1-2 and §9 GAP-U1. |
| **MTL gaming-day summary (admin)** | `components/mtl/gaming-day-summary.tsx:272+`; route `/admin/anomaly-detection/reports` | `mtl_gaming_day_summary` view | **Derived projection** (live view) | Hook not traced; likely React Query. |
| **Player Timeline — financial events** | `app/(dashboard)/players/[playerId]/timeline/_components/timeline-panel.tsx:30+`; `hooks/player-timeline/use-player-timeline.ts` | Timeline service `filter: ['cash_in','cash_out','cash_observation','financial_adjustment']` | **Canonical** (reads PFT + pit_cash_observation via timeline service) | No realtime subscription; `refetchOnWindowFocus` only (§7 P2-1). |
| **Shift Intelligence — secondary KPIs** | `components/shift-intelligence/secondary-kpis-row.tsx:25`; `services/shift-intelligence/service.ts:244` | `rpc_shift_table_metrics` → `estimated_drop_buyins_total_cents` | **Computed on-read** | React Query; polling cadence ~30s. ADR-050 targets ≤2s realtime but client bridge incomplete. |
| **Player360 dashboard — loyalty balance** | `services/player360-dashboard/*` | `player_loyalty.current_balance` | **Canonical** (derived from loyalty_ledger) | Hook-level caching. |
| **Measurement audit view (admin compliance)** | `measurement_audit_event_correlation_v` (GRANT SELECT TO authenticated, line 85) | View joins rating_slip + PFT + mtl_entry + loyalty_ledger | **Derived with Cartesian fanout** (§5 Rule-C1) | No caching (DB view). |

---

## 7. Split-Brain Findings

### 7.A Multi-Origin Split

**P0-1 — Pit cash observation elevated to canonical in visit_financial_summary** ⚠️ **HIGHEST RISK**
- **Description:** `visit_financial_summary` UNIONs `player_financial_transaction` (authoritative) with `pit_cash_observation` (explicitly non-authoritative per PRD-OPS-CASH-OBS-001). Both contribute to `total_out`. No distinction in the aggregate.
- **Root cause:** Migration `20260218203729` added the UNION to surface "chips taken" in the modal's cash-out total, but pit_cash_observation includes both `amount_kind='estimate'` and `amount_kind='cage_confirmed'`. No DISTINCT, no dedup, no filter by `amount_kind`.
- **Affected surfaces:** Rating-slip modal (net position), any consumer of `visit_financial_summary.total_out` / `net_amount`. Downstream: anything that reads the modal BFF RPC.
- **Severity:** **P0** — violates "finance is canonical" invariant; operators see a number that mixes telemetry with ledger.

**P1-1 — Pit cash observation estimate + confirmed double-count**
- **Description:** `pit_cash_observation` allows both an `estimate` row (at slip save/close) and a `cage_confirmed` row (from cage) for the same visit/slip. No uniqueness constraint enforces one-of; no reconciliation RPC collapses.
- **Affected surfaces:** visit_financial_summary (both rows counted), any measurement consumer.
- **Severity:** P1.

**P1-2 — PFT vs MTL vs pit_cash_observation triple ledger, no reconciliation contract**
- **Description:** Cash movement can be recorded in PFT (canonical), MTL (compliance, auto-derived from PFT), and pit_cash_observation (telemetry). PFT→MTL forward bridge exists (fn_derive_mtl_from_finance), but pit_cash_observation has no cross-ledger link. If MTL entry is created directly (path 1.2a), no PFT row exists.
- **Affected surfaces:** Reconciliation reports; compliance audits.
- **Severity:** P1.

**P1-7 — Rated-buyin dual-grain + grind no-patron: Estimated Drop is not per-visit reconcilable**
- **Description:** `table_buyin_telemetry` holds RATED_BUYIN (bridged 1:1 from PFT via trigger) and GRIND_BUYIN (direct, no PFT, no patron). `estimated_drop_buyins_cents` sums both. `visit_financial_summary.total_in` sees only rated. A reconciliation question "does the sum of visit buy-ins equal the shift table drop?" is structurally undefined: grind is visible table-level, invisible visit-level. Additionally, adjustments to rated PFT rows fire the bridge and create a second RATED_BUYIN telemetry row with a new idempotency key (`pft:{adjustment_id}`), inflating table drop unless consumers dedup by ancestry.
- **Affected surfaces:** Shift dashboard `estimated_drop_*_cents`, any comparison between per-visit and per-table financial aggregates.
- **Severity:** P1.

**P1-3 — Created_by_staff_id spoofing potential**
- **Description:** RPC validates role for `auth.uid()`, but does NOT assert `p_created_by_staff_id == app.actor_id`. If session-var injection is subverted (ADR-024 guards this, but defense-in-depth missing).
- **Severity:** P1 (mitigated by ADR-024, but not belt-and-suspenders).

### 7.B Partial Propagation

**P1-4 — finance_outbox has no producer**
- **Description:** Table exists since `20251109214028`, has RLS policies, FK indexes. No `INSERT INTO finance_outbox` found in any migration. Async consumers (loyalty side-effects, email, reporting) must poll PFT directly.
- **Affected surfaces:** Any downstream that was designed to consume finance events out-of-band.
- **Severity:** P1.

**P2-1 — Player timeline financial events stale until window focus**
- **Description:** `useInfinitePlayerTimeline` does not subscribe to realtime; relies on `refetchOnWindowFocus`. A concurrent cash-out doesn't appear for 30s+ on an open timeline panel.
- **Severity:** P2.

**P2-2 — Estimated Drop realtime SLA gap (ADR-050)**
- **Description:** Dashboards claim ≤2s freshness for `estimated_drop_buyins_cents`; actual cadence via polling is ~30s. Root cause: unauthenticated socket boundary per ADR-050.
- **Severity:** P2 (documented; remediation planned).

### 7.C Semantic Drift

**P1-5 — "direction='in'" means many things**
- **Description:** `direction='in'` aggregates PFT rows regardless of source/tender. A marker issuance, a cage deposit, and a pit cash buy-in all contribute to `total_in`. UI labels "Total In" as "Buy-in".
- **Affected surfaces:** visit_financial_summary, rating-slip modal, all "buy-in" displays.
- **Severity:** P1.

**P2-3 — "Adjustment" vs "void" conflation**
- **Description:** `txn_kind='adjustment'` with negative delta_amount serves as both correction (typo fix) and reversal (void). `reason_code` enum distinguishes intent, but downstream consumers don't split by reason.
- **Severity:** P2.

**P2-4 — `mtl_audit_note` actor attribution unverified**
- **Description:** `staff_id` is a prop on insert; no RLS check that `auth.uid()` matches staff_id. A pit_boss can insert a note with another staff_id.
- **Severity:** P2.

**P2-5 — Cents vs dollars drift across surfaces**
- **Description:** PFT uses cents, pit_cash_observation uses dollars, `visit_financial_summary` converts pit_cash at ROUND(×100), rating-slip modal DTO explicitly flags cents, compliance panel DTO does not.
- **Severity:** P2.

### 7.D Context Misalignment

**P2-6 — MTL gaming_day frozen; casino_settings editable**
- **Description:** mtl_entry.gaming_day is stamped on insert. Editing `casino_settings.gaming_day_start_time` doesn't retroactively rebucket. Historical MTL aggregates become inconsistent with current settings.
- **Severity:** P2.

**P2-7 — Cashier vs pit_boss MTL read/write asymmetry**
- **Description:** Migration `20260103002836` denies cashier SELECT on mtl_entry but allows cashier INSERT. Cashier cannot see historical entries while filling the form.
- **Severity:** P2 (UX conflict, may be gated at UI layer — REQUIRES VERIFICATION).

**P2-8 — Gaming-day timezone silent fallback**
- **Description:** `compute_gaming_day` takes a TIME, not a timezone. `casino_settings.timezone` exists but is not consulted. Defaults to America/Los_Angeles if null (migration 20260103002836:102-106).
- **Severity:** P2 (affects non-US casinos or DST transitions).

### 7.E UI Illusion

**P0-2 — Rating-slip modal net position displays uncommitted client state** ⚠️
- **Description:** `rating-slip-modal.tsx:564` computes `totalCashIn - (totalChipsOut_api + pendingChipsTaken_form)`. Operator sees a negative net that includes unsaved chips-taken from the form. If they close the modal without saving, form state is lost but the displayed number was based on it.
- **Affected surfaces:** Rating-slip modal.
- **Severity:** **P0** — operator decision (close/pause/move) based on a phantom number.

**P1-6 — "Adjust confirmed amount" is discrepancy, not financial adjustment**
- **Description:** Cashier can enter `confirmed_amount_cents` different from requested `amount_cents` on table_fill/credit confirmation. This records a discrepancy_note but does NOT create a PFT adjustment. If the floor expected a financial reconciliation, none happens.
- **Severity:** P1 (documented intentionally — chip custody ≠ financial — but easy to misread).

---

## 8. Fact Integrity Assessment

| Fact | One authoritative write path? | Deterministic propagation? | Filters explicit? | Auditable lifecycle? | Classification |
|---|---|---|---|---|---|
| FACT-PFT-TXN-IN/OUT (pit, cage) | ✅ Yes (`rpc_create_financial_txn`) | ✅ Forward → MTL | ⚠️ direction='in' filter is implicit downstream | ✅ Append-only | ✅ **Clean** |
| FACT-PFT-ADJUSTMENT | ✅ Yes (`rpc_create_financial_adjustment`) | ✅ | ⚠️ adjustment vs void conflation | ✅ | ⚠️ **Ambiguous** |
| FACT-MTL-ENTRY | ✅ Direct RLS INSERT | ⚠️ Some via PFT trigger, some direct → two provenance paths | ✅ Mostly | ✅ | ⚠️ **Ambiguous** |
| FACT-PIT-CASH-OBSERVATION | ✅ `rpc_create_pit_cash_observation` | ❌ Flows into canonical aggregation despite being non-authoritative | ❌ Hidden UNION in view | ✅ | ❌ **Broken** |
| FACT-TABLE-FILL/CREDIT | ✅ | ✅ No cross-ledger cascade | ✅ | ✅ | ✅ **Clean** |
| FACT-TABLE-DROP-EVENT | ✅ | ⚠️ Implicit state via cage_received_at NULL | ✅ | ✅ | ⚠️ **Ambiguous** |
| FACT-LOYALTY-BASE-ACCRUAL | ✅ `rpc_accrue_on_close` | ⚠️ Caller of RPC not explicitly traced | ✅ (once-per-slip) | ✅ | ⚠️ **Ambiguous** |
| FACT-LOYALTY-PROMOTION | ✅ `rpc_apply_promotion` | ✅ Emits to loyalty_outbox | ✅ | ✅ | ✅ **Clean** |
| FACT-LOYALTY-REDEMPTION | ❌ Write path not found | n/a | n/a | n/a | ❌ **Broken / Missing** |
| FACT-VISIT-FINANCIAL-SUMMARY (derived) | n/a | ❌ Mixes PFT + pit_cash_observation | ❌ Union hidden | n/a | ❌ **Broken** as authoritative |
| FACT-ESTIMATED-DROP (derived) | n/a | ✅ Computed from table_buyin_telemetry | ✅ | ⚠️ No snapshot | ⚠️ **Ambiguous** |
| FACT-MTL-PATRON-DAILY-TOTAL | n/a — no table exists | (view only) | ✅ | ⚠️ No snapshot; live view | ⚠️ **Ambiguous** (treated as fact by consumers but is projection) |

---

## 9. Provenance Gaps

| ID | Gap | Consumer | Severity |
|---|---|---|---|
| **GAP-F1** | `finance_outbox` has no producer — 0 INSERT sites in migrations | Any async consumer designed to listen for finance events | P1 |
| **GAP-L1** | `loyalty_ledger` reason=`'redeem'` has no corresponding RPC (`rpc_redeem` not found) | Loyalty redemption flows | P1 |
| **GAP-L2** | Caller of `rpc_accrue_on_close` not explicitly traced (likely trigger on rating_slip.status='closed' or explicit call in close RPC) | Loyalty accrual | P2 — REQUIRES VERIFICATION |
| **GAP-U1** | `components/player-360/compliance/panel.tsx` receives `mtlEntries` as prop with unknown upstream | Compliance dashboard numbers | P1 |
| **GAP-U2** | `form-section-cash-in.tsx` adjustment breakdown props (`originalTotal`, `adjustmentTotal`) have unknown upstream | Rating-slip modal | P2 |
| **GAP-U3** | Rating-slip `final_average_bet` provenance: UI passes `formState.averageBet` to `rpc_close_rating_slip`; `formState` origin not traced | Loyalty theo, reporting | P2 |
| **GAP-V1** | `measurement_audit_event_correlation_v` has no consumer guidance for Cartesian fanout | Admin audit tooling | P2 |
| **GAP-V2** | `visit_financial_summary.total_out` includes pit_cash_observation estimates AND confirmed; no way to separate without going back to base tables | Rating-slip modal, shift reports | P1 |
| **GAP-O1** | Drop acknowledgement (`cage_received_at`) has no downstream join to shift rundown / shift closure gate | Shift close workflow | P2 |
| **GAP-O2** | `discrepancy_note` on table_fill/credit is not surfaced in any report or compliance query found | Discrepancy investigation | P2 |
| **GAP-R1** | No report or export routes found for financial data (only `/admin/anomaly-detection/reports`) | External / regulatory reporting | P1 — REQUIRES VERIFICATION |
| **GAP-S1** | Direct RPC callers bypass route-handler schema validation (visit_id NOT NULL, amount>0, idempotency key); RPC itself is lenient | Non-production paths, internal tools | P1 |
| **GAP-T1** | `policy_snapshot` / `game_settings` versioning on long-running rating slips: captured at slip create/move; no re-snapshot if policy updates mid-session | Loyalty accrual accuracy | P2 |

---

## 10. System Risk Summary

### Top 5 Architectural Risks

1. **R1 — Telemetry in the canonical aggregate** (P0-1, GAP-V2). `visit_financial_summary` mixes PFT and pit_cash_observation. The primary "how much has this visit spent" number shown to operators is not traceable to a single ledger. **Any Financial Data Distribution Standard must decide: is pit_cash_observation financial or operational?** The answer defines whether this UNION stays, gets filtered (`amount_kind='cage_confirmed'` only), or gets removed entirely.

2. **R2 — Multiple cash-movement surfaces, no reconciliation contract** (P1-2, P1-7). PFT, MTL (auto + direct), pit_cash_observation, and `table_buyin_telemetry` (RATED bridged from PFT, GRIND with no PFT). PFT→MTL and PFT→telemetry are forward bridges; reverse bridges, pit_cash cross-walks, and grind→visit rollups do not exist. Per-visit aggregates and per-table aggregates are structurally non-reconcilable (grind is table-visible, visit-invisible). Compliance audit cannot determinize "same cash event" across surfaces.

3. **R3 — Client-state-leaked financial displays** (P0-2). Rating-slip modal net position includes uncommitted Zustand state. Operators make close/pause/move decisions on numbers that may revert. This is a UI correctness issue with financial consequence.

4. **R4 — Missing finance event stream** (P1, GAP-F1). `finance_outbox` exists but is empty. Async integrations (loyalty side-effects, email, partner webhooks, reporting) either poll PFT directly or don't fire at all. `loyalty_outbox` is a counter-example: it has producers.

5. **R5 — Hidden "direction='in'" semantics** (P1-5). Aggregated "buy-in" totals don't distinguish cash buy-ins from markers, cage deposits, or adjustments. A Financial Data Distribution Standard needs explicit fact IDs that preserve source/tender context through aggregation.

### Highest-Impact Split-Brain Surfaces

1. **Rating-slip modal financial section** — pulls from both `visit_financial_summary` (telemetry-contaminated) AND local Zustand state. Double contamination.
2. **Compliance panel (Player360)** — reads MTL with unknown provenance, recomputes totals client-side, no validation against canonical aggregate.
3. **`measurement_audit_event_correlation_v`** — Cartesian fanout makes it hazardous for naive consumers.

### Surfaces Most Likely to Produce Inconsistencies

1. Any dashboard that displays "cash out" or "chips out" without filtering pit_cash_observation by `amount_kind`.
2. Any timeline / history that polls for refresh instead of subscribing to realtime.
3. Anything that compares MTL to PFT assuming they're 1:1 (direct MTL inserts break this).
4. Any cross-gaming-day aggregation that assumes gaming_day boundaries are stable (casino_settings edits + timezone-blind compute_gaming_day).

### Audit-Grade Accountability Blockers

1. **No event stream.** `finance_outbox` empty → cannot rebuild downstream state from a log.
2. **pit_cash_observation dual-fact (estimate + confirmed) without uniqueness.** Cannot determinize "what actually happened" at the cage.
3. **Loyalty redemption path missing from trace** (GAP-L1). Cannot audit points-to-cash flow.
4. **Discrepancy notes not surfaced** (GAP-O2). Cashier attestation trail exists but is invisible to investigators.
5. **MTL actor attribution on audit notes unverified** (P2-4). "Who said this?" cannot be answered deterministically.

---

## Appendices

### A. Key Migrations Referenced

| Migration | Role |
|---|---|
| `00000000000000_baseline_srm.sql` | Baseline schema |
| `20251022003807_fix_gaming_day_time_and_rpc.sql` | `compute_gaming_day`, PFT `trg_fin_gaming_day` |
| `20251109214028_finance_loyalty_idempotency_outbox.sql` | finance_outbox + loyalty_outbox tables, PFT idempotency index |
| `20251211015115_prd009_player_financial_service.sql` | PlayerFinancialService canonical schema (referenced by SRM) |
| `20251213003000_prd004_loyalty_service_schema.sql` | loyalty_ledger with unique index |
| `20251213180125_add_visit_financial_summary_view.sql` | Original view (PFT-only) |
| `20251216073543_adr014_ghost_visit_loyalty_guard.sql` | `rpc_accrue_on_close`, `rpc_apply_promotion` |
| `20251216160332_fix_visit_financial_summary_security_invoker.sql` | RLS via view security-invoker |
| `20260103002836_prd010_mtl_audit_note_denial.sql` | MTL schema + gaming-day summary view + ADR-025 authz |
| `20260106021105_prd_ops_cash_obs_001_rpc.sql` | pit_cash_observation table + gaming_day trigger |
| `20260106021106_prd_ops_cash_obs_001_rpc.sql` | `rpc_create_pit_cash_observation` |
| `20260106235611_loyalty_promo_instruments.sql` | loyalty_outbox producers (3 emit points) |
| `20260114003530_table_buyin_telemetry.sql` | `table_buyin_telemetry` schema (RATED + GRIND); RPC-only INSERT |
| `20260114004336_rpc_shift_table_metrics.sql` | `rpc_shift_table_metrics` — Estimated Drop aggregation |
| `20260115000200_fn_bridge_finance_to_telemetry.sql` | PFT → telemetry trigger (G1–G5 guardrails) |
| `20260116111329_*` | `fn_derive_mtl_from_finance` (PFT → MTL trigger) |
| `20260116150149_add_financial_adjustment_support.sql` | `rpc_create_financial_adjustment` |
| `20260206005335_prd028_restore_loyalty_outbox.sql` | Restored loyalty_outbox after greenfield drop |
| `20260217074826/27/28_prd033_*` | Cashier confirmation RPCs + immutability RLS |
| `20260218203729_add_pit_cash_observation_to_visit_financial_summary.sql` | **THE UNION** (§5 Rule-V1) |
| `20260306223803_prd044_d3d4_remove_p_casino_id.sql` | Current `rpc_create_financial_txn` signature |
| `20260307115131_adr039_measurement_views.sql` | `measurement_audit_event_correlation_v` |

### B. Verification Checklist (Items Marked UNKNOWN / REQUIRES VERIFICATION)

- [ ] **GAP-L1:** Does a loyalty redemption RPC exist? Grep `rpc_redeem`, `redeem_points`, `reason = 'redeem'` for write paths.
- [ ] **GAP-L2:** Caller of `rpc_accrue_on_close` — trigger? Explicit call in `rpc_close_rating_slip`? Inspect close path end-to-end.
- [ ] **GAP-U1:** Parent component(s) that pass `mtlEntries` to `CompliancePanel` — what service/hook supplies them?
- [ ] **P2-7:** Is the cashier MTL read-deny actually surfaced in UI, or is there a workaround that fetches via a different role?
- [ ] **GAP-R1:** Confirm absence (or presence) of CSV/PDF export endpoints under `app/api/**/export`, `app/admin/**/export`.
- [ ] **GAP-T1:** How does a policy_snapshot update apply to an in-flight rating slip — `rpc_move_player` re-snapshot only, or also on explicit refresh?
- [ ] **FACT-PFT-SYSTEM:** Are there production writers of `source='system'` PFTs?

### C. Methodology

Six parallel Explore agents traced one financial domain each. Findings were reconciled against the live codebase before synthesis:

- **Agent 1** — Rating slip financial fields (verified: no buy_in/cash_in/cash_out columns in `rating_slip`).
- **Agent 2** — PlayerFinancialTransaction (verified: RPC signature, idempotency index; corrected: `measurement_audit_event_correlation_v` DOES exist).
- **Agent 3** — MTL + pit cash observation (verified: direct INSERT path, ADR-025 authz).
- **Agent 4** — Adjustments + cashier confirmations (verified: immutability RLS, discrepancy gate).
- **Agent 5** — Loyalty + derived metrics (corrected: `loyalty_outbox` HAS 3 producers — was classified P0, downgraded to clean).
- **Agent 6** — UI consumers (verified: modal Zustand split, compliance panel prop opacity).

All P0/P1 claims were spot-checked against migrations and `types/database.types.ts`. Claims that did not survive verification (Agent 2's "measurement_audit_event_correlation_v missing", Agent 5's "loyalty_outbox has no producer") were corrected before inclusion.

This document is a **baseline snapshot as of 2026-04-22**. It does not prescribe fixes. The Financial Data Distribution Standard should authoritatively answer the open questions in §10 R1 (pit_cash_observation classification) and §B verification items before remediation begins.
