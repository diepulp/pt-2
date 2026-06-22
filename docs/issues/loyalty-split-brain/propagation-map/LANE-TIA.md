# LANE-TIA — Table Inventory Accounting Canon Propagation

**Lane:** Table Inventory Accounting (TIA)
**Date:** 2026-06-21
**Auditor:** TIA propagation lane (audit against SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md §5/§6)
**Canon authority loaded:** SRL-TIA-001, ADR-059, ADR-060, ADR-061 (via `/tia-canon-authority`)

---

## 0. Headline / Maturity Correction

The canon authority skill's gap registry (last current 2026-05-29) lists TIA as **"Not started — gate OPEN"**. **That is stale.** The exemplar (PRD-090 / EXEC-090) has been **built and is live on the per-session surface**. Evidence:

- Service module exists: `services/table-context/table-inventory-accounting.ts` (full three-state machine).
- BFF route exists: `app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts`.
- Consumer hook + surface exist: `hooks/table-context/use-table-rundown.ts`, `components/table/rundown-summary-panel.tsx`.
- Suppression gates exist and pass: `__tests__/tia-suppression-gate.test.ts`, `__tests__/tia-static-analysis.test.ts`.
- Legacy RPC quarantined: `services/table-context/rundown.ts:55` (`computeTableRundown` marked `QUARANTINED (PRD-090 DEC-2)`).

**Maturity verdict (directive §3):** `standardized_pattern`, `propagation_status: partial` — **CONFIRMED** (the directive's initial recommendation is correct), but the binding reason has changed: it is partial because the **per-session vertical is converged while the aggregate/rollup vertical is explicitly deferred (TODO-WS4)** and one legacy aggregate field (`estimated_drop_buyins_total_cents`) and a dormant legacy field (`table_win_cents`) remain in non-suppressed surfaces.

---

## 6.1 Canonical Authority Inventory

| Attribute | Value | Evidence |
|---|---|---|
| Authored fact | None — TIA authors nothing (read-time derivation) | `table-inventory-accounting.ts:1-19` ("Stateless: no persistence, no outbox, no side effects") |
| Canonical owner | `TableContextService.TableInventoryAccounting` | `table-inventory-accounting.ts:367` `createTableInventoryAccountingService` |
| Write authority | **none** (per SRL-TIA-001) | no INSERT/UPDATE/RPC-write in service; diagnostic is no-op `table-inventory-accounting.ts:48-53` |
| Canonical DTO | `TableInventoryAccountingProjection` | `services/table-context/dtos.ts:704-730` |
| Formula | `drop + closing + credits − opening − fills` (frozen ADR-059 D2) | `table-inventory-accounting.ts:476-481` |
| Correction rule | None — pure read projection; no append/reversal | n/a (no ledger) |
| Temporal posture | Session-scope window `[opened_at, COALESCE(closed_at, NOW()))` | `table-inventory-accounting.ts:443-448` (upperBound = `closed_at ?? upperBoundAt`) |
| Completeness/authority semantics | three-state `calculation_kind`; `custody_status` always `'non_custody_estimate'`; `final_table_win_loss_cents` always `null` | `table-inventory-accounting.ts:493-518` |
| Permitted consumers | `RundownSummaryPanel` only (render-only) | `rundown-summary-panel.tsx:181-208` |
| Forbidden competing owners | `rpc_shift_table_metrics`, `rpc_compute_table_rundown`, any local recompute | enforced `tia-static-analysis.test.ts:42-78` |

### Conformance deviations (DTO drift vs frozen ADR-059 D3)

These are real divergences from the frozen canon DTO. They do not break the three-state machine but are **propagation-debt / drift**, severity S5 (cosmetic-to-semantic):

1. **`DropEstimateState` uses `'present' | 'absent'`** (`dtos.ts:688`, service `:491`) — canon ADR-059/SRL says the absent value MUST be `'none_for_session'`, not `'absent'`. (Surface label text is still correct.)
2. **`completeness` envelope is `{ status: string }`** keyed off `closed_at` (`service:503-505`) — canon ADR-059 D3 requires `included_inputs: ReadonlyArray<...>`, `missing_inputs: ReadonlyArray<'drop_estimate'>`, and `status: 'complete'|'partial'|'integrity_failure'`. The implemented envelope drops `included_inputs`/`missing_inputs` entirely and uses session-closed (not input-presence) to decide `complete`/`partial`. This conflates "session closed" with "inputs complete" — a semantic shortcut the canon explicitly separates.
3. **`source_authority.drop`** is set to the literal table name `'table_buyin_telemetry'` (`service:507`) — canon ADR-060 expects `'telemetry_derived_estimate' | 'none'`. Cosmetic but a vocabulary deviation.
4. **`integrity_failure` does not populate `completeness.status='integrity_failure'`** — it leaves status as `complete`/`partial` from `closed_at`. The `integrity_issues[]` array is the only signal. (L3 is honored at the surface because the panel branches on `calculation_kind`, not `completeness.status`.)

`source_authority.inventory` key correctly **absent** (gate: `tia-suppression-gate.test.ts:143-156`). ✅

---

## 6.2 Producer Inventory (feeders into `table_buyin_telemetry`)

TIA itself produces nothing. Its only authored input is `table_buyin_telemetry` (telemetry SUM). Two producers feed the qualifying kinds:

| Producer | Workflow | Boundary | RPC/path | Kind written | Classification | Evidence |
|---|---|---|---|---|---|---|
| **Grind buy-in (pit-manual)** | `GrindBuyinPanel` quick-tap | browser → RPC | `rpc_log_table_buyin_telemetry` (`p_telemetry_kind='GRIND_BUYIN'`, `p_source='pit_manual'`) | `GRIND_BUYIN` | **canonical** (qualifying kind; idempotency key present) | `hooks/table-context/use-buyin-telemetry.ts:78-112`; `grind-buyin-panel.tsx:44-95`; RPC `20260114004141_rpc_log_table_buyin_telemetry.sql:139-148` |
| **Rated buy-in (finance bridge)** | PFT `direction='in'` insert with `rating_slip_id` | DB trigger | `trg_bridge_finance_to_telemetry` → INSERT `table_buyin_telemetry` | `RATED_BUYIN` | **canonical (dual-write via outbox-adjacent bridge)** — idempotency key `pft:<id>` | `20260116201236_telemetry_bridge_trigger.sql:53-76`; kind `'RATED_BUYIN'` line 68 |
| Adjustment telemetry | PFT adjustments | trigger | writes `RATED_ADJUSTMENT` | **legacy_authoring / out-of-scope** — `RATED_ADJUSTMENT` is explicitly EXCLUDED from the TIA SUM (ADR-060 D2) | `20260219002247_enable_adjustment_telemetry.sql`; TIA filter excludes it `table-inventory-accounting.ts:338` (`.in([...,'RATED_BUYIN','GRIND_BUYIN'])`) |

**Producer-side seam integrity:** TIA's SUM predicate (`service:333-340`) filters `telemetry_kind IN ('RATED_BUYIN','GRIND_BUYIN')` and is session-window scoped — **conformant** to ADR-061 D2. `RATED_ADJUSTMENT` rows present in the table are correctly excluded. No `COALESCE(...,0)` (rows.length===0 → `null`, `service:353-355`). ✅

**Note (not TIA's fault, flagged):** `GrindBuyinPanel` reads its *display* total from a **separate** gaming-day-scoped operational-projection route (`use-buyin-telemetry.ts:31-59` → `/operational-projection`, via `getShiftOperationalCompleteness`), NOT from TIA. So the operator-visible "Shift Total" on the grind panel and the TIA session projection are two different aggregation windows over the same producer. This is a latent surface-divergence at the producer UI (gaming-day total vs session-scope SUM) but is operational telemetry posture, not a win/loss-result surface — severity S5.

---

## 6.3 Consumer Inventory (surfaces rendering a table-result-like value)

| Consumer | Value consumed | Current source | Recompute? | Classification | Evidence |
|---|---|---|---|---|---|
| **RundownSummaryPanel** | `projected_table_win_loss_cents` / `partial_table_result_cents` | TIA projection via hook | No (render-only; bigint string parse) | **canonical_consumer** | `rundown-summary-panel.tsx:181-208`; render-only gate `tia-static-analysis.test.ts:82-147` |
| `shift-metrics/dtos.ts` ShiftTableMetricsDTO | per-table win/loss | **removed** (commented, TODO-WS4) | n/a | **migration_target** (win/loss suppressed; canonical aggregate not yet wired) | `dtos.ts:107-110` |
| `shift-metrics` Pit/Casino DTOs | aggregate win/loss totals | **removed** (commented, TODO-WS4) | n/a | **migration_target** | `dtos.ts:170-172` |
| `shift-report/assembler.ts` FinancialTableRow/Casino | `holdPercent` from win/loss | **suppressed → null** (TODO-WS4) | No | **migration_target** | `assembler.ts:378-379, 404-405` |
| **`secondary-kpi-stack.tsx`** (dashboard V3) | `estimated_drop_buyins_total_cents` | shift-metrics rollup | reads aggregate drop directly | **legacy_projection_consumer** — aggregate drop survives suppression (gate only forbids per-table `estimated_drop_buyins_cents`, not `_total_cents`) | `secondary-kpi-stack.tsx:75`; surviving DTO field `dtos.ts:168` |
| `casino-summary-card.tsx` | `estimated_drop_buyins_total_cents` (+ rated/grind) | shift-metrics rollup | reads aggregate drop | **legacy_projection_consumer** | `casino-summary-card.tsx:260` |
| **`rundown-report-card.tsx`** | Fills / Credits / Drop only | `useRundownReport` (persisted ADR-027 rundown report) | No — **does NOT render `table_win_cents`** | **canonical-adjacent / dormant-legacy-field carrier** (DTO/mapper still carries `table_win_cents` but the card renders only fills/credits/drop) | `rundown-report-card.tsx:80-93`; field carried in `rundown-report/mappers.ts:46,81,116,142` + `dtos.ts:46,70` but unrendered |

**Surface-misrepresentation scan result:** No active operator surface renders a *competing win/loss-like result* alongside TIA. The legacy `table_win_cents` is carried through the persisted-rundown DTO chain but is **not rendered** to operators (verified: `rundown-report-card.tsx` renders Fills/Credits/Drop, no win field). The win/loss aggregate fields in shift-metrics/shift-report are **commented-out** (suppressed at the DTO boundary). So the P0 "competing visible win/loss" violation (R8/GAP-TIA-6) is **closed for win/loss**. **Remaining residue is drop-estimate, not win/loss:** `estimated_drop_buyins_total_cents` aggregate still flows to two dashboard surfaces.

**Possible aggregation bug (flagged, severity S4, drop not win/loss):** `assembler.ts:395-398` computes casino drop as `rated_total + grind_total + buyins_total`, but per `dtos.ts:168` `estimated_drop_buyins_total_cents` already EQUALS `rated + grind`. This double-counts drop at the casino total. Not a TIA-owned value, but it sits on the legacy aggregate path TIA is meant to eventually replace (TODO-WS4).

---

## 6.4 Cross-Domain Seam Inventory

### Seam 1: `table_buyin_telemetry → TIA` (Telemetry → TIA, directive §6.4 / §11.x)

1. **Fact crossing:** session-scoped SUM of `amount_cents` for qualifying buy-in telemetry.
2. **Kind:** projection input (telemetry_fact aggregated read-time). Not a command, not an authored fact at this seam.
3. **Identity anchors:** `casino_id`, `table_id` (= `gaming_table_id`), window `[opened_at, COALESCE(closed_at,NOW()))`. (`service:333-340,443-448`)
4. **Frozen values:** at close, `closed_at` freezes the upper bound. While open, upper bound = request-time `NOW()` (single capture per request, `service:372-373`).
5. **Live values:** for an OPEN session the SUM is live (recomputed each request with moving `NOW()`).
6. **Idempotency:** owned by producers (`rpc_log_table_buyin_telemetry` idempotency key; bridge `pft:<id>`). TIA is read-only — no idempotency concern.
7. **Propagation:** synchronous read at request time (no outbox on the read seam).
8. **Authority labels that must survive:** `custody_status='non_custody_estimate'`, `drop_estimate_state`, `telemetry_derived` qualifier. ✅ preserved `service:500-502, 716`.
9. **Failure behavior:** zero qualifying rows → `null` (NOT 0) → `inventory_only` path. Query error → `DomainError INTERNAL_ERROR` `service:342-350`.
10. **Correcting side:** producer side only (telemetry rows). TIA never corrects.

**Certification:** mechanism PROVEN (int tests exist `services/table-context/__tests__/table-inventory-accounting.int.test.ts`); producer-capability PROVEN; **RATED_ADJUSTMENT exclusion PROVEN** via filter. **CONFORMANT.**

### Seam 2: `table session → TIA session-scope aggregation` (ADR-061 boundary, directive §6.4 last row)

1. **Fact crossing:** session lifecycle facts — `opened_at`, `closed_at`, `gaming_table_id`, opener/closer snapshot FKs.
2. **Kind:** authored facts (session row owned by table session lifecycle) consumed as projection inputs.
3. **Identity anchors:** `id` (session), `casino_id` (from RLS context, NOT row — `service:376-384`), `gaming_table_id`.
4. **Frozen values:** `closed_at` (defines window upper bound), opener/closer snapshot ids.
5. **Live values:** while session OPEN, window upper bound is live (`NOW()`); `completeness.status` flips `partial`→`complete` on close (`service:504`).
6. **Idempotency:** n/a (read).
7. **Propagation:** synchronous read.
8. **Authority labels:** session scope window must NOT be substituted by `gaming_day`. ✅ TIA uses `opened_at`/`closed_at`, never `gaming_day` (`service:443-448`). ADR-061 D4 honored.
9. **Failure behavior:** opener OR closer unresolvable after FK + session-linked fallback (DEC-3) → `integrity_failure`, both result fields null (`service:455-471`). Zero counts are valid (`resolveSnapshotValue` `service:131-144`). Cross-casino session → 404 SESSION_NOT_FOUND (route `:9`).
10. **Correcting side:** table-session lifecycle owns snapshot/lifecycle correction; TIA reflects, never corrects.

**Certification:** CONFORMANT to ADR-061. Identity gate (R-5) enforced on snapshots/fills/credits (`service:166-173, 260-266, 295-301`). **Deviation:** `completeness.status` is derived from `closed_at` rather than input-presence (see §6.1 deviation #2) — this is the one place the session-scope seam leaks lifecycle state into the completeness envelope.

### Seams NOT implicated by TIA (explicit negative findings)

- **Rating Slip → Loyalty accrual / Loyalty ledger / liability:** NOT a TIA seam (loyalty lane owns).
- **PFT → finance outbox:** adjacent (PFT trigger also feeds telemetry) but the outbox path itself is the outbox lane's; TIA only consumes the *telemetry* side-effect of PFT, never the outbox.
- **MTL → linked PFT adjustment:** not TIA.
- **Rating Slip → PFT:** upstream of telemetry bridge; TIA sees only the resulting `RATED_BUYIN` row, not the rating-slip seam.

---

## Proof Obligation Status (directive §14)

| Proof class | Status | Evidence / Gap |
|---|---|---|
| §14.1 Mechanism | **PROVEN** | three-state machine + frozen formula `service:454-488`; unit `__tests__/table-inventory-accounting.test.ts` |
| §14.2 Producer capability | **PROVEN** | grind RPC + finance bridge both write qualifying kinds with idempotency |
| §14.3 Workflow certification | **PARTIAL** | grind workflow live (`GrindBuyinPanel`); rated workflow via PFT trigger live; but **no E2E proving real operator session yields correct projection on the panel** found in TIA scope |
| §14.4 Consumer certification (per-session) | **PROVEN** | render-only gate `tia-static-analysis.test.ts:82-147`; panel reads canonical DTO |
| §14.4 Consumer certification (aggregate) | **UNPROVEN / DEFERRED** | shift-metrics + shift-report win/loss = TODO-WS4; canonical aggregate not wired |
| §14.5 Suppression (win/loss) | **PROVEN** | suppression gate `tia-suppression-gate.test.ts`; `computeTableRundown` quarantined |
| §14.5 Suppression (drop aggregate) | **NOT PROVEN** | `estimated_drop_buyins_total_cents` survives on `secondary-kpi-stack.tsx:75`, `casino-summary-card.tsx:260` — not covered by the suppression gate (gate targets per-table name only) |

---

## Disposition Summary

- **TIA per-session vertical:** `converged` — canonical owner, DTO, BFF, render-only consumer, suppression all in place.
- **TIA aggregate vertical:** `deferred` (TODO-WS4) — win/loss aggregates suppressed but canonical aggregate not yet built; drop aggregate still legacy.
- **Net maturity:** `standardized_pattern` / `partial` (directive recommendation CONFIRMED).
- **Open propagation debt:** (a) 4 DTO-shape drifts from frozen ADR-059 D3 (S5); (b) aggregate `estimated_drop_buyins_total_cents` un-suppressed on 2 dashboards (S4); (c) possible casino drop double-count `assembler.ts:395-398` (S4); (d) grind-panel display total uses gaming-day route not session SUM (S5); (e) dormant `table_win_cents` carried (unrendered) in persisted-rundown DTO chain (S5).
