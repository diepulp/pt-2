# LANE-FINANCIAL — System Canon Propagation Map

**Lane:** Financial Model — transactional outbox, financial value surface, producer anchor resolution, PFT / finance.
**Directive:** `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md`
**Authority:** `/financial-model-authority` (ADR-052..056, Wave 2 UL). Wave 2 CLOSED 2026-05-21 (PRD-089).
**Date:** 2026-06-21
**Scope note:** Loyalty and TIA lanes are owned by other agents. This lane maps the **finance side** of any seam that touches loyalty/TIA/MTL.

---

## Headline findings

1. **Transport substrate is `standardized_pattern`, propagation `partial`** — confirmed, not corrected. All 5 financial producers emit to `finance_outbox` in-transaction via the governed helper `fn_finance_outbox_emit`. Two consumer projections exist (Class A visit, Class B operational). I1–I5 proven.
2. **The fracture is at the RENDER layer, not transport.** The `FinancialValue` envelope (`value/type/source/completeness`) is authored correctly at service/DTO boundaries but **stripped before JSX** at almost every money surface. Only 2 surfaces in the whole app render the labels to a human: loyalty `entitlement-confirm-panel` and the outbox observability `origin_label` badge. This is anti-pattern **AP-7 (consumer self-healing)** in waiting plus widespread `surface_misrepresentation`.
3. **The relay is operationally deviated.** ADR-056 mandates a Vercel cron in `vercel.json`. The every-minute relay cron was **removed** (commit `607fdcb1`, Vercel Hobby rejects sub-daily crons) and replaced by a GitHub Actions `*/5` trigger (`.github/workflows/outbox-relay-trigger.yml`). The deviation is undocumented in ADR-056 or any Wave 2 sign-off — a governance gap. Workflow-certification proof for production is therefore NOT clean.
4. **MTL↔PFT seam is clean and one-directional** (PFT→MTL, trigger-derived). MTL never authors a competing financial fact, never emits to the outbox. `origin_label='compliance'` is dead/over-permissive CHECK surface, unreachable through the governed helper.

---

## 6.1 Canonical Authority Inventory

| Concept | Canonical owner | DTO / envelope | Correction rule | Temporal posture | Permitted consumers | Forbidden competing owners |
|---|---|---|---|---|---|---|
| **Financial authority fact (Class A / PFT)** | `player_financial_transaction` (append-only) via `rpc_create_financial_txn` / `rpc_create_financial_adjustment` | `FinancialOutboxEventDTO` envelope (`event_type` `buyin.recorded`/`adjustment.recorded`, `fact_class='ledger'`, `origin_label='actual'`); read DTO `FinancialTransactionDTO` (`services/player-financial/dtos.ts`) | New PFT row (`txn_kind='adjustment'/'reversal'`, may be negative) — never UPDATE/DELETE (`player_financial_transaction_no_updates`) | `gaming_day` trigger-stamped on PFT; outbox `event_id` UUIDv7 is the ordering authority | Outbox relay consumer → `visit_class_a_projection`; visit financial summary | grind store; MTL; TBT rated partition writing PFT |
| **Operational telemetry fact (Class B / grind)** | `table_buyin_telemetry` (grind partition) via `rpc_record_grind_observation` | envelope `grind.observed`, `fact_class='operational'`, `origin_label='estimated'`, `player_id=NULL` | new observation row; no correction of prior | `gaming_day = compute_gaming_day(casino, NOW())` at emit | operational consumer → `shift_operational_projection` | PFT (no cross-class derivation, ADR-052 R3) |
| **Dependency Event (fills, credits)** | `table_fill` / `table_credit` via `rpc_request_table_fill` / `rpc_request_table_credit` | `fill.recorded` / `credit.recorded`, `fact_class='operational'`, `origin_label='estimated'`, `player_id=NULL` | new row; `IDEMPOTENCY_CONFLICT` on divergent payload for same `request_id` | `gaming_day` computed at emit | operational consumer → `shift_operational_projection` | must not be flattened into grind telemetry (DEC-UL-2); must not be upgraded to `actual` |
| **Financial surface value** | `FinancialValue` envelope — `types/financial.ts:9-17`; validator `lib/financial/schema.ts:41-49` | `{ value:int cents, type, source, completeness:{status,coverage?} }`, `.strict().readonly()` | n/a (derived) | n/a | every API/UI/export boundary | any surface rendering bare dollars without the envelope (see 6.3 violations) |
| **Producer anchor resolution** | `fn_finance_outbox_emit` (SD helper) — `casino_id` from `app.casino_id` GUC (never caller-supplied), `table_id` mandatory, `gaming_day` mandatory param | helper signature `(event_id, event_type, fact_class, origin_label, table_id, player_id, aggregate_id, payload, gaming_day)` | n/a | `gaming_day` resolved at authoring boundary | all 5 producer RPCs | caller-supplied `casino_id` (forbidden); TypeScript-level outbox INSERT (none exists) |
| **Correction / reversal** | `rpc_create_financial_adjustment` → `adjustment.recorded` (ledger/actual), conditional emit (ADR-057 eligibility) | same envelope as Class A | append-only adjustment PFT row | `gaming_day` from PFT trigger | Class A consumer; MTL re-derivation | MTL (immutable, cannot correct finance) |

**Outbox table contract:** `finance_outbox` — `event_id UUIDv7 PK`, `event_type`, `fact_class CHECK IN ('ledger','operational')`, `origin_label CHECK IN ('actual','estimated','observed','compliance')`, `casino_id`, `table_id NOT NULL`, `player_id NULL`, `aggregate_id`, `payload`, `gaming_day NOT NULL`, `processed_at`, `delivery_attempts`, `last_error`. Envelope immutability enforced by `trg_finance_outbox_immutable_envelope` (`20260511134129:104-131`). No authenticated RLS policies; service_role only; INSERT only through SD producer RPCs (`20260523034116_sec011_revoke_authenticated_outbox_table_access.sql`). **Note:** `'observed'`/`'compliance'` CHECK values are dead surface — `fn_finance_outbox_emit` rejects all but `('actual','estimated')` and `('ledger','operational')`.

---

## 6.2 Producer Inventory

All 5 producers are **SECURITY DEFINER** with same-transaction emission via `fn_finance_outbox_emit` (latest body: `20260519183631_amend_all_producers_gaming_day.sql`). No TypeScript-level outbox fallback exists (all `from('finance_outbox')` in production code is read-only).

| Producer | Domain | Operator workflow | Service boundary | RPC | Authoritative table | Emit | event_type | fact_class/origin_label | player_id | Idempotency key | Real-workflow cert | Classification | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `rpc_create_financial_txn` (buyin) | player_financial | Pit buy-in entry | `createTransaction` `services/player-financial/crud.ts:159` | SD | PFT | yes `…183631:166-176` | `buyin.recorded` | ledger/actual | required | PFT `ON CONFLICT (casino_id, idempotency_key) DO NOTHING`; outbox `(aggregate_id,event_type) DO NOTHING` | I1 5/5 + PRD-082 live | **canonical** | keep |
| `rpc_create_financial_txn` (cashout) | player_financial | Pit cash-out | same | SD | PFT | **NO** (structural — no cashout branch, I5) | — | — | — | PFT key | I5 PASS (0 outbox rows) | **ledger_only** | keep (cashout non-emission is correct) |
| `rpc_create_financial_adjustment` | player_financial | Adjustment / reversal | `createFinancialAdjustment` `services/player-financial/http.ts:183` | SD | PFT | conditional (ADR-057 eligibility) `…183631:430-445` | `adjustment.recorded` | ledger/actual | required (ASSERT NOT NULL) | PFT key; helper DO NOTHING | PRD-084 20/20 PASS (live cert 2026-05-18) | **canonical** | keep |
| `rpc_record_grind_observation` | table-context (grind) | GrindBuyinPanel | **no production TS caller** | SD | `table_buyin_telemetry` | yes `…183631:281-291` | `grind.observed` | operational/estimated | NULL | helper DO NOTHING | I1 exemplar; GrindBuyinPanel mounted (PWB-003) | **canonical_but_uncertified_workflow** (panel mounted but no service-layer caller; produced via UI hook path) | certify workflow |
| `rpc_request_table_fill` | table-context | Table fill request | `requestTableFill` `services/table-context/chip-custody.ts:84` | SD | `table_fill` | yes `…183631:626-636` | `fill.recorded` | operational/estimated | NULL | `(casino_id,request_id) DO NOTHING` + divergent→`IDEMPOTENCY_CONFLICT` | I1 T1-T12 unit; **integration pending** (RUN_INTEGRATION_TESTS) | **canonical_but_uncertified_workflow** | certify (operator UI deferred → PWB-002) |
| `rpc_request_table_credit` | table-context | Table credit request | `requestTableCredit` `services/table-context/chip-custody.ts:127` | SD | `table_credit` | yes `…183631:806-816` | `credit.recorded` | operational/estimated | NULL | `(casino_id,request_id) DO NOTHING` + divergent→`IDEMPOTENCY_CONFLICT` | I1 T1-T12 unit; **integration pending** | **canonical_but_uncertified_workflow** | certify (operator UI deferred → PWB-002) |
| `rpc_create_pit_cash_observation` | player_financial (Observed taxonomy) | — | — | — | `pit_cash_observation` | NO | — | observed (taxonomy only) | — | — | **not authored in pilot** | **dead_candidate** (taxonomy only) | defer |
| `mtl_entry` INSERT | mtl (Compliance) | CTR logging | `services/mtl/crud.ts:192` | — | `mtl_entry` | NO (parallel) | — | compliance (never emitted) | — | `fin:%` for derived | n/a | **outbox-excluded by design** | keep parallel |

**Anchor requirement (all emitters):** `casino_id` derived from `app.casino_id` GUC inside `fn_finance_outbox_emit` (`20260519183630:63`) — never caller-supplied. `table_id` and `gaming_day` mandatory. This is the **producer_anchor_resolution** canonical pattern, satisfied at the SD-helper boundary.

---

## 6.3 Consumer Inventory

`FinancialValue` envelope: `types/financial.ts:9-17`, validator `lib/financial/schema.ts:41-49`. Canonical renderer (only correct UI): `components/financial/FinancialValue.tsx` (visible authority badge + source + completeness; refuses `$0` on unknown).

| Consumer | Value | Current source | Recompute? | Cache/projection? | Provenance? | Authority preserved? | Completeness? | Visible labels? | Classification | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|
| Visit financial summary route `app/api/v1/visits/[visitId]/financial-summary/route.ts:59` | total_in/out/net | `visit_financial_summary` view + `visit_class_a_projection` completeness (`crud.ts:542-604`) | no | yes (projection for completeness) | yes (DTO) | yes (`actual`/`PFT`) | yes (complete/partial/unknown via lifecycle+backlog, `crud.ts:212-248`) | n/a (transport) | **canonical_consumer** (transport) | keep |
| Rating-slip modal financial section `app/api/v1/rating-slips/[id]/modal-data/route.ts:301`; UI `components/modals/rating-slip/rating-slip-modal.tsx:579-586` | cash in/out, net | visit summary DTO (envelope present) | **YES** (`computedChipsOut`, net recompute `:586,778`) | no | DTO yes, UI drops | **dropped at render** | dropped | **NO** | **surface_misrepresentation** | migrate to `<FinancialValue>` |
| Operational projection route `app/api/v1/table-context/operational-projection/route.ts:62`; UI `components/table/grind-buyin-panel.tsx:117` | grind+fill+credit total | `shift_operational_projection` (`crud.ts:274-287`) | no | yes (projection) | partial (flattened: `totalCents`, no `source`) | `estimated` pinned (correct, never upgraded) | yes in DTO | **NO** (`estimated`/partial hidden; `$0` on missing) | **surface_misrepresentation** / DTO is **migration_target** (flattened envelope) | full envelope + visible badge |
| Outbox observability admin `app/(dashboard)/admin/outbox-observability/OutboxObservabilityClient.tsx:547,189` | origin_label/fact_class | `OutboxAdminEventDTO` (`dtos.ts:369`) | no | reads outbox | yes | **yes — faithful pass-through, NOT upgraded** | n/a | yes | **canonical_consumer** | keep |
| Player-360 snapshot/summary `components/player-360/snapshot/card.tsx:211…`, `summary-band.tsx:137-185` | cashIn/out/theo/velocity | unwrapped to `.value` in mappers | **YES** (`cashVelocity` recompute `summary-band.tsx:152`) | no | **no** (envelope unwrapped) | no | no | **NO** | **surface_misrepresentation** / `direct_authoring_store_reader` | migrate |
| Loyalty entitlement panel `components/loyalty/entitlement-confirm-panel.tsx:106-115` | reward value | reward_catalog | no | no | yes (`<FinancialValue>`) | yes (`compliance` badge visible) | yes | **YES** | **canonical_consumer** (reference good) | keep |
| Loyalty comp/reward/issuance `components/loyalty/comp-confirm-panel.tsx:88,178`, `reward-selector.tsx:166` | points/reward face | catalog | **YES** (`pointsCost = ceil(...)`) | no | no | n/a (points ≠ money) | no | no | **client_recompute** / `legacy_projection_consumer` | n/a points; reward face → migrate |
| Buy-in threshold indicator `components/rating-slip/buy-in-threshold-indicator.tsx:171` | threshold $ | direct | no | no | no | no | no | no | **direct_authoring_store_reader** | low priority |

**DEC-1 resolved** (Phase 2.3): visit-level aggregates now emit `complete`/`partial`/`unknown` based on gaming-day lifecycle + outbox backlog (`getVisitClassACompleteness` `crud.ts:212-248`; `getShiftOperationalCompleteness` `crud.ts:274-353`). **But** the resolved completeness signal dies at the render layer for every surface except the two canonical consumers above.

---

## 6.4 Cross-Domain Seam Inventory (finance side)

### Seam A — `PFT authoring → finance outbox` (same-transaction emission)
1. **Fact:** authored Class A financial fact (PFT row).
2. **Type:** authored fact → projection input on emit.
3. **Anchors:** `casino_id` (GUC-derived), `table_id`, `player_id` (Class A required), `aggregate_id` (PFT id), `gaming_day`.
4. **Frozen:** all envelope columns at insert (`origin_label`, `fact_class`, amounts in payload).
5. **Live:** none (PFT append-only).
6. **Idempotency:** producer-owned — PFT `(casino_id, idempotency_key)` + helper `(aggregate_id, event_type) DO NOTHING`.
7. **Propagation:** **transactional** (same `BEGIN…COMMIT`, ADR-054 R3) for emit; relay delivery async/outbox-driven.
8. **Authority labels surviving:** `fact_class`, `origin_label` immutable in transit (R4); envelope-immutability trigger enforces.
9. **Failure:** emit failure rolls back PFT (same txn). Relay failure → `delivery_attempts++`, reclaimable (I2).
10. **Correction:** Finance only, via new adjustment PFT row.

### Seam B — `MTL → linked PFT adjustment` (mapped from finance side)
1. **Fact:** authored Finance fact (PFT adjustment row). **Direction is PFT→MTL only** — there is no MTL→PFT write.
2. **Type:** authored fact (Finance) → projection input (`mtl_entry`, derived-only).
3. **Anchors:** trigger `fn_derive_mtl_from_finance` keys `mtl_entry.idempotency_key = 'fin:'||pft.id`.
4. **Frozen:** MTL entry immutable (no UPDATE/DELETE, `services/mtl/crud.ts:9-17`).
5. **Live:** none.
6. **Idempotency:** Finance-keyed — `fin:` prefix + `ux_mtl_entry_casino_idem` `ON CONFLICT DO NOTHING` (`20260217215827:135,172`).
7. **Propagation:** PFT→MTL **synchronous + transactional** (AFTER INSERT trigger); PFT→outbox independent async fan-out off the same insert.
8. **Authority labels:** adjustment emits `adjustment.recorded`/`ledger`/`actual` to outbox; MTL emits **nothing** to outbox. `compliance` never reaches outbox.
9. **Failure:** bridge is FAIL-CLOSED — missing RLS context / tenant mismatch / actor mismatch RAISE and roll back the whole txn (PFT included).
10. **Correction:** **Finance only.** MTL is append-only and only reflects Finance corrections (new adjustment → new derived `mtl_entry`). Load-bearing guard: CHECK `mtl_financial_types_must_be_derived` prevents MTL authoring a competing financial fact.

### Seam C — `visit → financial summaries`
1. **Fact:** derived projection of Class A facts (visit-level totals).
2. **Type:** projection artifact (`visit_financial_summary` view + `visit_class_a_projection` completeness store).
3. **Anchors:** `visit_id`, `casino_id`, `gaming_day`.
4. **Frozen:** historical PFT rows.
5. **Live:** completeness flips when gaming day closes / backlog drains.
6. **Idempotency:** consumer-owned (`processed_messages` + `rpc_process_class_a_projection` atomic upsert).
7. **Propagation:** outbox-driven (relay → projection); summary read is synchronous query.
8. **Authority labels:** `type='actual'`, `source='PFT'`, completeness `complete`/`partial`/`unknown`.
9. **Failure:** relay backlog → completeness stays `partial`; never silently `complete` (R6 honored at service).
10. **Correction:** projection rebuilt by replay (I4); never hand-patched.

**Seam C render caveat:** the envelope is correctly authored but the rating-slip modal and player-360 consumers strip it (see 6.3). The seam is certified at transport, **not** at consumer render.

---

## 3 / propagation_status — Transactional Outbox maturity

**Confirmed: `standardized_pattern` / `partial`.**
- **proven_exemplar:** PRD-081 exemplar pair (Class A txn + Class B grind), GAP-F1 CLOSED, commit `8a1b8741`.
- **standardized_pattern:** rules/contracts/gates frozen — ADR-052..056; I1–I5 harness; `fn_finance_outbox_emit` governs every producer; Wave 2 sign-off PROD-ANCHOR-STD-001 ratified.
- **NOT yet propagated_standard:** consumers strip the envelope at render (surface_misrepresentation across player-360, rating-slip modal, GrindBuyinPanel); operator UI for fill/credit deferred (PWB-002); cashout producer for outbox deferred (W2-OBS-CASHOUT-PRODUCER-001); fill/credit integration certification pending.

---

## §14 Proof Obligations (five classes — do NOT collapse)

| Class | Status | Evidence |
|---|---|---|
| **14.1 Mechanism** (same-txn outbox insert) | **PROVEN** | I1 5/5, PRD-082 live; `fn_finance_outbox_emit` + immutability trigger |
| **14.2 Producer capability** (RPC produces correct row) | **PROVEN per producer** | txn/grind I1 exemplar; adjustment PRD-084 20/20; fill/credit I1 T1-T12 unit |
| **14.3 Workflow certification** (real operator supplies anchors) | **PARTIAL / DEVIATED** | Class A buyin + adjustment certified live. Grind workflow via GrindBuyinPanel (mounted, no integration cert). **Fill/credit operator UI deferred (PWB-002); integration tests pending.** **Relay production trigger DEVIATED** — GHA `*/5` not Vercel cron (ADR-056), undocumented. AP-3 risk. |
| **14.4 Consumer certification** (surface consumes canonical DTO without recompute) | **FAILING at render** | Transport DTOs carry envelope; **render layer strips it** — rating-slip modal recomputes net (`rating-slip-modal.tsx:586`), player-360 recomputes cashVelocity, GrindBuyinPanel hides `estimated`/`partial` and shows `$0` on unknown. AP-7 territory. Only `entitlement-confirm-panel` + outbox observability certified. |
| **14.5 Suppression** (competing visible paths removed) | **NOT DONE** | No removal gate on bare-dollar surfaces beside the canonical `<FinancialValue>` renderer (AP-4). `pit_cash_observation` (Observed) is dead taxonomy but not removed. `origin_label` CHECK still permits dead `observed`/`compliance` values. |

**Relay deviation (flagged):** `.github/workflows/outbox-relay-trigger.yml` (`*/5 * * * *`) replaced the Vercel `* * * * *` cron (removed in commit `607fdcb1` because Vercel Hobby rejects sub-daily crons). `vercel.json` now schedules only `/api/internal/outbox-cleanup` at `0 7 * * *`. ADR-056 D2 mandates Vercel cron in `vercel.json`. Deviation lives only in the workflow header comment + git message — **not** in ADR-056, WAVE-2-SIGN-OFF.md, or any GAP log. Several post-deviation docs still assert "Vercel cron every minute" (PRD-086/088/089, sign-off). This is a **governance gap**, not just infra: production workflow-certification (14.3) cannot be declared clean until ADR-056 is amended or the deviation reverted.

---

## Domain status (finance lane)

| Domain | Status | Reason |
|---|---|---|
| `player_financial` | `partial_propagation` | producers canonical; consumers strip envelope at render; relay trigger deviated |
| `mtl` | `mapped_dependency` | parallel compliance; PFT→MTL derived-only; never emits to outbox; clean seam |

---

## Anti-pattern exposure (directive §15)

- **AP-3 (RPC-only certification):** fill/credit integration pending; relay prod trigger deviated → workflow not fully certified.
- **AP-4 (surface compatibility preservation):** bare-dollar surfaces persist beside canonical `<FinancialValue>` with no removal gate.
- **AP-7 (consumer self-healing):** rating-slip modal + player-360 recompute financial state client-side instead of consuming the canonical envelope.
