---
id: PRD-088
title: Wave 2 Phase 2.4 — Consumer Expansion: Operational Telemetry Projection
owner: Lead Architect
status: Draft
affects: [ADR-052, ADR-053, ADR-054, ADR-055, PRD-081, PRD-083, PRD-085, PRD-087]
created: 2026-05-21
last_review: 2026-05-21
phase: Wave 2 Phase 2.4
pattern: B
http_boundary: false
scope_authority: docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
parent_fib: docs/issues/gaps/financial-data-distribution-standard/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
---

# PRD-088 — Wave 2 Phase 2.4: Consumer Expansion: Operational Telemetry Projection

**Containment boundary (one-line invariant):** *This PRD changes how operational outbox events (`grind.observed`, `fill.recorded`, `credit.recorded`) are consumed into a shift-level projection; it does not change authoring tables, the relay worker retry architecture, the Class A projection consumer, or the gaming-day lifecycle signal mechanism.*

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Phase 2.4 builds the projection consumer for the operational stream — the Class B and Dependency Event rows that have been accumulating in `finance_outbox` with `processed_at IS NULL` since Phases 2.0–2.2. It creates a shift-level `shift_operational_projection` table, a SECURITY DEFINER RPC to process operational events idempotently, a parallel batch-claim RPC for owned operational rows, and a TypeScript consumer service dispatched alongside the existing Class A branch in the relay route. Shift telemetry surfaces gain meaningful authority labels (`type: 'estimated'`) and lifecycle-aware completeness signals (`'partial'` during open shift, canonical `'complete'` after gaming-day close and empty operational backlog for emitted operational inputs; rendered copy may say projection-complete, but the DTO status remains `complete`). The `GrindBuyinPanel` component — already built and wired through the `rpc_log_table_buyin_telemetry` compatibility wrapper that routes `GRIND_BUYIN` to `rpc_record_grind_observation`, but not mounted anywhere — is mounted in the table-context page so that `grind.observed` rows flow from real operator workflows. Fill and credit workflow gaps are formally documented as post-Wave-2 backlog; they are certifiable through direct API calls for this phase, but their missing operator workflows prevent any claim of full workflow-coverage completeness until PWB-002 ships. Phase 2.4 is the last consumer slice before the Phase 2.5 sign-off.

---

## 2. Problem & Goals

### 2.1 Problem

Since Phase 2.0, three event types (`grind.observed`, `fill.recorded`, `credit.recorded`) have been emitting `finance_outbox` rows with `processed_at IS NULL`. No consumer reads them. The relay worker currently claims only `fact_class = 'ledger'` rows via `rpc_claim_class_a_outbox_batch` — the operational rows are untouched, accumulating indefinitely.

The operational stream carries the financial data that feeds shift telemetry: grind buy-in volume, table fill amounts, and table credit amounts. As long as these events go unconsumed, shift-level financial surfaces must poll the authoring tables directly (`table_buyin_telemetry`, `table_fills`, `table_credits`). That polling path bypasses the outbox contract: no authority labels, no completeness signals, no event-driven lifecycle awareness.

Additionally, `GrindBuyinPanel` exists as a functional component with a wired `useLogGrindBuyin` hook, but it is not mounted in any page. Real operator workflows therefore cannot produce `grind.observed` rows — the event type has been RPC-certifiable since Phase 2.0 but has zero workflow-level producer coverage.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1** — Operational events consumed | `grind.observed`, `fill.recorded`, `credit.recorded` rows in `finance_outbox` have `processed_at` set after relay cycles; no perpetual `processed_at IS NULL` backlog for these event types |
| **G2** — Shift projection live | `shift_operational_projection` has rows keyed by `(casino_id, gaming_day, table_id)` containing accurate grind volume, fill total, and credit total after events are processed |
| **G3** — Authority labels correct | All shift telemetry surfaces carrying grind/fill/credit data emit `type: 'estimated'`; no surface shows `type: 'actual'` for operationally-derived values |
| **G4** — Mixed-class surfaces degrade correctly | Any surface aggregating Class A `'actual'` values alongside operational `'estimated'` values emits the combined total as `type: 'estimated'`; authority degradation follows Actual > Observed > Estimated |
| **G5** — Lifecycle-aware completeness for shift surfaces | Shift-level surfaces emit `completeness.status: 'partial'` during an open gaming day and canonical `completeness.status: 'complete'` after `rpc_close_gaming_day` + empty table-scoped operational backlog for emitted operational inputs that day; UI copy may label this as projection-complete, but DTOs must not introduce a new `CompletenessStatus` value. This is not full workflow-coverage completeness while fill/credit operator workflows remain absent |
| **G6** — Consumer is idempotent | Duplicate delivery of the same `event_id` produces exactly one projection update (I3 re-verified at operational consumer layer) |
| **G7** — Projection is replayable | Truncating `shift_operational_projection`, clearing scoped `processed_messages` receipts for the replayed operational event IDs, resetting their `processed_at`, and replaying operational events from `finance_outbox` in deterministic order `(casino_id, gaming_day, table_id, event_id)` produces the same totals as live processing (I4 re-verified at operational projection layer; no production replay bypass) |
| **G8** — `GrindBuyinPanel` mounted | A live operator workflow (pit boss logs grind at a table) produces a `grind.observed` row in `finance_outbox`; the row reaches `processed_at` within one relay cycle |

### 2.3 Non-Goals

The following are **explicitly out of scope** for this PRD. They require a separate PRD or a new FIB amendment.

- Operator UI for fill or credit triggers — `rpc_request_table_fill` and `rpc_request_table_credit` are hardware-integration-only API routes; building an operator-facing surface is post-Wave-2 (PWB-002)
- Anchor resolution for `adjustment.recorded` — post-Wave-2 backlog (PWB-001 / PROD-ANCHOR-STD-001)
- Changes to `player_financial_transaction`, `table_buyin_telemetry`, `table_fills`, `table_credits`, or any other authoring table
- Relay worker retry-backoff architecture changes; Phase 2.4 may add operational claim-cap diagnostics (`delivery_attempts >= 5`) but must not add claim leases, a retry scheduler, or a new dead-letter table
- Class A projection consumer changes (Phase 2.3 delivered `rpc_process_class_a_projection` and `visit_class_a_projection` — no modifications to those in this phase)
- Multi-consumer fan-out — single internal consumer path is the Wave 2 assumption
- Total Drop, shift-end settlement, or any authoritative financial total (ADR-053 scope boundary)
- CDC / WAL relay, external consumer contracts, or event sourcing
- Compliance domain scope (`mtl_entry` / MTLService remains parallel and isolated)

---

## 3. Users & Use Cases

- **Primary user:** Internal system — the relay worker, the new operational consumer service, and the projection store. No new top-level operator surface is introduced; this phase mounts an existing component into an existing table-context workflow.
- **Secondary beneficiaries:** Pit bosses and floor supervisors who see shift financial telemetry — they gain meaningful authority labels and completeness signals instead of unlabeled polling results.

**Top Jobs:**

- As the **relay consumer**, I need to claim `fact_class = 'operational'` rows from `finance_outbox` and process them into a shift-level projection atomically with idempotency, so that shift telemetry surfaces reflect event-driven state rather than direct authoring-store queries.
- As the **relay consumer**, I need duplicate delivery of an operational event to produce exactly one projection update, so that relay retries never corrupt shift totals.
- As a **pit boss**, I need shift telemetry surfaces to display authority labels (`type: 'estimated'`) on grind/fill/credit-derived values, so that I understand these are operational estimates rather than ledger-authoritative figures.
- As a **pit boss**, I need to log a grind observation at a table using the existing Grind Buyin panel, so that `grind.observed` events flow through the outbox chain and appear in shift telemetry.
- As a **pit boss**, I need the shift financial surface to show `'partial'` completeness during an open gaming day and canonical `'complete'` after it closes and the emitted table-scoped operational backlog drains, so that end-of-shift review is clearly distinguishable from mid-shift estimates without overstating fill/credit workflow coverage.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Operational batch claim RPC:**
- New `rpc_claim_operational_outbox_batch(p_batch_size INT)` SECURITY DEFINER RPC that claims only rows where `fact_class = 'operational'`, `event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded')`, `processed_at IS NULL`, and `delivery_attempts < 5` using `FOR UPDATE SKIP LOCKED`; marks `last_attempted_at` and increments `delivery_attempts` in the same CTE, matching the current `rpc_claim_class_a_outbox_batch` contract. Rows with `delivery_attempts >= 5` are no longer claimable and must be counted in relay/observability diagnostics as `operationalDeadLetter`. This phase does **not** add or depend on `claimed_until`; any claim-lease redesign requires a separate schema decision. The RPC leaves `fact_class = 'ledger'` rows and future unknown operational event types untouched.

**Operational projection store:**
- New `shift_operational_projection` table keyed by `(casino_id, gaming_day, table_id)` with columns for `grind_volume_cents`, `fill_total_cents`, `credit_total_cents`, `event_count`, `updated_at`; `casino_id` and `table_id` have FKs to their owner tables; service_role-only access (no authenticated SELECT policies)

**Operational consumer RPC:**
- New `rpc_process_operational_projection(p_message_id UUID) RETURNS TEXT` SECURITY DEFINER RPC; atomically: fetches the outbox row, verifies ownership (`fact_class = 'operational'` and owned `event_type`) before inserting into `processed_messages`, checks `processed_messages` idempotency, routes by `event_type` to the correct projection column UPSERT, stamps `processed_at`; returns `'processed'` / `'duplicate'` / `'skipped_ledger'` / `'skipped_unknown'` / `'not_found'` (second-line defence for routing errors). Skipped ledger or unknown operational event types must not write projection state, must not stamp `processed_at`, and must not insert into `processed_messages`.
- `processed_messages` remains global by `event_id`; this is valid because each outbox event is consumed by exactly one internal projection branch in Wave 2. Multi-consumer fan-out remains out of scope.

**Consumer service:**
- New `services/player-financial/outbox-operational-consumer.ts` exporting `runOperationalConsumer()` that calls `rpc_claim_operational_outbox_batch`, iterates, calls `rpc_process_operational_projection` per row, accumulates `'processed'` / `'duplicate'` / `Error` results

**Relay route dispatch:**
- `app/api/internal/outbox-relay/route.ts` updated with a second dispatch branch: after Class A processing, claim and process operational batch; both branches run within the same deadline window

**Completeness derivation for shift surfaces:**
- New `getShiftOperationalCompleteness(supabase, casinoId, gamingDay, tableId)` function in `services/player-financial/crud.ts`; same three-step logic as `getVisitClassACompleteness`: projection row present? → lifecycle signal present? → owned operational backlog empty for that `(casino_id, gaming_day, table_id)`?
- Shift telemetry surfaces that currently read grind/fill/credit from authoring stores updated to read from `shift_operational_projection` and carry the derived completeness signal

**Authority degradation:**
- Any surface that aggregates `shift_operational_projection` data alongside Class A data must emit the combined total as `type: 'estimated'`; the surface must not present a unified authority value of `'actual'`

**`GrindBuyinPanel` mounting:**
- `GrindBuyinPanel` component (component and `useLogGrindBuyin` hook already built; the hook calls `rpc_log_table_buyin_telemetry`, whose `GRIND_BUYIN` path is the governed compatibility wrapper for `rpc_record_grind_observation`) mounted in the appropriate table-context page so pit bosses can log grind observations through the standard operator workflow

**I3/I4 re-verification:**
- `tests/failure/i3-idempotency-operational-projection.test.ts` — duplicate delivery of the same `event_id` produces exactly one operational projection row
- `tests/failure/i4-replay-operational-projection.test.ts` — process operational events, record totals, truncate `shift_operational_projection`, delete `processed_messages` rows only for the operational `event_id` values under test, reset `processed_at` for those same rows, replay ordered by `(casino_id, gaming_day, table_id, event_id)` or the existing canonical relay ordering if already established → identical totals; tests must not rely only on `created_at` ordering and must not introduce a production replay bypass

**Release governance:**
- `WAVE-2-TRACKER.json` and `WAVE-2-PROGRESS-TRACKER.md` updated after implementation gates pass: Phase 2.3 synced to ✅ COMPLETE (fixing existing markdown staleness), Phase 2.4 status updated to complete, cursor advanced to Phase 2.5

### 4.2 Out of Scope

- Operator UI for fill or credit workflows
- `adjustment.recorded` anchor resolution (PROD-ANCHOR-STD-001)
- `rpc_close_gaming_day` or `gaming_day_lifecycle` changes — already delivered in Phase 2.3, reused here
- Class A projection consumer or `visit_class_a_projection` changes
- Any changes to the relay worker retry-backoff architecture beyond the operational claim-cap diagnostic required by this PRD
- End-to-end certification of fill/credit through operator UI (direct API call is the certifiable trigger for this phase)

---

## 5. Requirements

### 5.1 Functional Requirements

- `rpc_claim_operational_outbox_batch` must filter on `fact_class = 'operational'`, `event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded')`, `processed_at IS NULL`, and `delivery_attempts < 5` using `FOR UPDATE SKIP LOCKED`, returning at most `p_batch_size` rows; claimed rows have `last_attempted_at` set and `delivery_attempts` incremented in the same claim CTE, matching current Class A claim semantics
- `rpc_process_operational_projection` must verify the row is an owned operational event before touching `processed_messages`; it then checks `processed_messages` idempotency (`INSERT ON CONFLICT DO NOTHING`) before any projection write. If a conflict is detected, it returns `'duplicate'` without modifying `shift_operational_projection`
- `rpc_process_operational_projection` must route by `event_type`: `grind.observed` increments `grind_volume_cents`; `fill.recorded` increments `fill_total_cents`; `credit.recorded` increments `credit_total_cents`; all three increment `event_count`; unknown operational event types return `'skipped_unknown'` without writing projection state, stamping `processed_at`, or inserting `processed_messages`
- `origin_label` must travel from the `finance_outbox` row to the rendered surface value unchanged; no consumer layer may upgrade `'estimated'` to `'actual'`
- `shift_operational_projection` must have no authenticated RLS policies (service_role-only); completeness queries must use `createServiceClient()` at the call site, not inside the completeness function
- Mixed-class aggregations must apply authority degradation: `'actual'` combined with `'estimated'` renders as `'estimated'`; the hierarchy (Actual > Observed > Estimated) is non-negotiable per ADR-054 R4
- The relay route must not increase its total deadline budget; both Class A and operational branches must complete within the existing stop-before-deadline window
- `GrindBuyinPanel` must be mounted in a page where it is reachable by a logged-in pit boss through normal navigation; bounded component/hook interface changes are allowed to replace `shiftWindow` with `gamingDay`, but no visual redesign or new business workflow is in scope

### 5.2 Non-Functional Requirements

- Both Class A and operational consumer branches must run within the existing Vercel cron cycle (`* * * * *`); the operational batch size must be bounded to prevent deadline overrun
- `rpc_process_operational_projection` and `rpc_claim_operational_outbox_batch` must be SECURITY DEFINER with `SET search_path = ''`; `anon` and `authenticated` EXECUTE revoked per ADR-056
- `shift_operational_projection` amounts are stored as integer cents (`BIGINT NOT NULL DEFAULT 0`); no floating-point accumulation
- No new PFT columns or authoring-table schema changes

> Architecture details: WAVE-2-ROLLOUT-MAP.md §4 (Phase 2.4), outbox-knowledge-base.md, SRM v4.11.0.
> Schema: `types/database.types.ts` (regenerate after migrations with `npm run db:types-local`).

---

## 6. UX / Flow Overview

This phase has no new top-level operator-facing screens. The observable changes are:

**Flow 1: Grind Observation (via mounted `GrindBuyinPanel`)**
1. Pit boss opens a table-context page where `GrindBuyinPanel` is now mounted
2. Pit boss enters a grind buy-in amount and submits
3. `useLogGrindBuyin` calls `rpc_log_table_buyin_telemetry` with `p_telemetry_kind = 'GRIND_BUYIN'`; the compatibility wrapper delegates to `rpc_record_grind_observation` → `grind.observed` row emitted to `finance_outbox`
4. Relay cron fires → `rpc_claim_operational_outbox_batch` claims the row
5. `runOperationalConsumer` calls `rpc_process_operational_projection` → `shift_operational_projection` upserted, `processed_at` set
6. Shift telemetry surface reflects updated grind volume with `type: 'estimated'` and `completeness: { status: 'partial' }`

**Flow 2: Fill or Credit Trigger (via direct API — operator UI is future scope)**
1. Authenticated caller `POST /api/v1/table-context/fills` or `/credits`
2. `rpc_request_table_fill` / `rpc_request_table_credit` → `fill.recorded` / `credit.recorded` emitted
3. Relay cycle claims and processes via `rpc_process_operational_projection`
4. `shift_operational_projection.fill_total_cents` / `credit_total_cents` updated

**Flow 3: Gaming-Day Close + Complete Signal**
1. Operator (or system) calls `rpc_close_gaming_day(p_casino_id, p_gaming_day)`
2. Row inserted into `gaming_day_lifecycle`
3. Relay processes any remaining operational backlog
4. Next call to `getShiftOperationalCompleteness` for that table/day: table-scoped owned operational backlog empty + lifecycle row present → returns canonical `'complete'` for consumed operational outbox rows
5. Shift telemetry surface shows `completeness: { status: 'complete' }` with source/copy indicating projection-complete semantics where needed; fill/credit workflow absence remains a named coverage gap and prevents full workflow-completeness claims until PWB-002

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 2.2 exit** (PRD-085) — `rpc_request_table_fill` and `rpc_request_table_credit` emit to `finance_outbox` atomically ✅ (complete 2026-05-19)
- **Phase 2.3 Gate A** (PRD-087) — `finance_outbox.gaming_day` NOT NULL on all operational rows; `rpc_claim_class_a_outbox_batch` leaves operational rows untouched ✅ (complete 2026-05-19)
- **Phase 2.3 Gate B** (PRD-087) — `gaming_day_lifecycle` table and `rpc_close_gaming_day` delivered; `processed_messages` idempotency pattern established ✅ (complete 2026-05-19)
- **`GrindBuyinPanel` component** — component and `useLogGrindBuyin` hook exist; only bounded interface work is required to replace `shiftWindow` totals with `gamingDay` projection totals before mounting ✅

### 7.2 Risks & Open Questions

- **Relay deadline budget** — Two consumer branches (Class A + operational) must both complete within the existing stop-before-deadline window. The EXEC-SPEC must set operational batch size so the combined cycle stays under the 30s − 5s deadline. Mitigation: cap `p_batch_size` conservatively; Phase 2.5 adds backlog metrics to tune it.
- **Poison operational rows** — Malformed owned operational payloads must not mutate projection state or stamp `processed_at`, but infinite retry can starve useful work and obscure the real backlog. Mitigation: the operational claim RPC excludes rows with `delivery_attempts >= 5`; relay/observability output counts those rows separately as `operationalDeadLetter`; valid later rows must still be claimable.
- **`GrindBuyinPanel` mount location** — The appropriate page for `GrindBuyinPanel` must be confirmed during EXEC-SPEC scaffolding. The component exists; the EXEC-SPEC author must verify which table-context or floor-view page a pit boss would naturally use to log a grind observation.
- **Fill/credit workflow-level certification** — No operator UI exists for fills or credits; certification for G1 uses direct API calls. This gap is expected per CORE-OPERATIONAL-LOOP.md Category A and is formally acknowledged in the exit gate. It does not block Phase 2.4 projection-completeness for emitted operational inputs, but it prevents full workflow-coverage completeness and must be named in the Phase 2.5 sign-off.
- **Shift telemetry surface discovery** — The EXEC-SPEC must identify all TypeScript surfaces (routes, hooks, components) that currently read `grind_volume`, fill amounts, or credit amounts directly from authoring tables. These must be updated to read from `shift_operational_projection`. The PRD-087-precis precedent (discovering `VisitFinancialSummaryDTO` routes during EXEC scaffolding) applies here.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `grind.observed`, `fill.recorded`, and `credit.recorded` rows in `finance_outbox` reach `processed_at` within one relay cycle after being emitted
- [ ] `shift_operational_projection` accumulates correct integer-cent totals per `(casino_id, gaming_day, table_id)` after relay processes operational events
- [ ] `GrindBuyinPanel` is mounted in a table-context page; a pit boss can log a grind observation and observe a `grind.observed` row in `/admin/outbox-observability` within one relay cycle

**Data & Integrity**
- [ ] Duplicate delivery of any operational `event_id` produces exactly one projection update — verified by I3 re-verify test
- [ ] Truncating `shift_operational_projection`, clearing scoped `processed_messages` receipts for the operational `event_id` values under test, resetting those rows' `processed_at`, and replaying from `finance_outbox` in deterministic order `(casino_id, gaming_day, table_id, event_id)` produces identical totals — verified by I4 re-verify test
- [ ] Integer-cent amounts: `grind_volume_cents`, `fill_total_cents`, `credit_total_cents` contain no ×100 conversions or floating-point accumulation
- [ ] No `fact_class = 'ledger'` rows are claimed or processed by the operational consumer; Class A projection state is unchanged after Phase 2.4 deployment

**Security & Access**
- [ ] `rpc_claim_operational_outbox_batch` and `rpc_process_operational_projection` are SECURITY DEFINER with `SET search_path = ''`; `anon` and `authenticated` EXECUTE revoked; `service_role` only
- [ ] `shift_operational_projection` has no authenticated SELECT/INSERT/UPDATE policies; access is service_role-only
- [ ] No authenticated role can write directly to `shift_operational_projection` outside the consumer RPC
- [ ] Any service-role read of `shift_operational_projection` occurs only after the route/service caller has authenticated and derived casino context; request-supplied `casinoId` alone is not an authorization boundary

**Testing**
- [ ] `tests/failure/i3-idempotency-operational-projection.test.ts` passes — duplicate event_id → one projection row, one `processed_messages` row
- [ ] `tests/failure/i4-replay-operational-projection.test.ts` passes — replay produces identical `grind_volume_cents`, `fill_total_cents`, `credit_total_cents` as live run
- [ ] Unit tests for `runOperationalConsumer()` covering `'processed'` / `'duplicate'` / `Error` paths
- [ ] Authority degradation test: a surface aggregating operational + Class A values emits `type: 'estimated'`
- [ ] Contract test: no Phase 2.4 DTO emits a `completeness.status` outside canonical `complete | partial | unknown`
- [ ] Source/migration test: Phase 2.4 SQL does not reference `claimed_until` unless a same-slice migration adds that column
- [ ] Completeness isolation test: a pending operational row for another table on the same gaming day does not keep this table's projection `partial`
- [ ] Zero-event completeness test: lifecycle closed + no projection row + no table-scoped operational backlog returns `complete` with zero totals
- [ ] Poison-row progress test: an operational row with `delivery_attempts >= 5` is excluded from claimable backlog, counted as `operationalDeadLetter`, and does not prevent later valid operational rows from being claimed
- [ ] Skipped-event test: ledger rows and unknown operational event types do not write `shift_operational_projection`, do not stamp `processed_at`, and do not insert `processed_messages`
- [ ] RLS/grant test: authenticated and anon roles cannot SELECT/INSERT/UPDATE `shift_operational_projection` and cannot EXECUTE the operational claim/process RPCs

**Operational Readiness**
- [ ] Fill/credit workflow-level gap formally documented in exit notes and flagged for Phase 2.5 sign-off
- [ ] All three operational event types certifiable via direct API/RPC trigger (minimum bar per Principle 9, WAVE-2-ROLLOUT-MAP.md)
- [ ] Completeness exit wording explicitly says canonical `complete` means projection-complete for consumed operational outbox rows and does not claim full workflow-coverage completeness until PWB-002 ships
- [ ] Relay route handles operational consumer errors without crashing the Class A branch
- [ ] Relay/observability output distinguishes ledger backlog, claimable operational backlog, and `operationalDeadLetter`; a single undifferentiated `processed_at IS NULL` backlog count is insufficient for Phase 2.4 diagnostics

**Documentation**
- [ ] `WAVE-2-TRACKER.json` and `WAVE-2-PROGRESS-TRACKER.md` updated: Phase 2.3 markdown synced to ✅ COMPLETE, Phase 2.4 status updated to `complete`, cursor advanced to Phase 2.5
- [ ] `WAVE-2-ROLLOUT-MAP.md` Phase 2.4 exit gate marked ✅ MET
- [ ] Known workflow coverage gaps for `fill.recorded` and `credit.recorded` named in exit notes, consistent with CORE-OPERATIONAL-LOOP.md Category A documentation

**Quality Gates**
- [ ] `npm run type-check` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm run build` exit 0

---

## 9. Related Documents

- **Wave 2 Rollout Map (phase plan + exit gates):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md` §4 Phase 2.4
- **Wave 2 Tracker (machine-readable state):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`
- **Wave 2 Progress Tracker (human-readable state):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md`
- **Outbox Knowledge Base (DDL, relay worker contract, I1–I4 invariants):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`
- **Phase 2.3 Précis (consumer infrastructure reference):** `docs/issues/gaps/financial-data-distribution-standard/implementation-precis/PRD-087-precis.md`
- **Core Operational Loop (producer trigger posture):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md`
- **Layer 1 Failure Investigation:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-observability/issues/LAYER-1-FAILURE.md`
- **PROD-ANCHOR-STD-001 (post-Wave-2 backlog):** `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-observability/issues/` (proposed standard)
- **Frozen ADR set:**
  - ADR-052: Financial Fact Model (dual-layer, discriminators, table-first anchoring)
  - ADR-053: Financial System Scope Boundary (no authoritative totals)
  - ADR-054: Financial Event Propagation & Surface Contract (`origin_label` immutability, R4 authority degradation)
  - ADR-055: Cross-Class Authoring Parity
  - ADR-056: Outbox write-path governance (SECURITY DEFINER enforcement)
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.11.0
- **Schema:** `types/database.types.ts` (regenerate with `npm run db:types-local` after migrations)
- **Prerequisite PRDs:** PRD-081 (exemplar), PRD-083 (Phase 2.1), PRD-085 (Phase 2.2), PRD-087 (Phase 2.3)

---

## Appendix A: Projection Store Schema Reference

```sql
-- Operational shift projection (Phase 2.4)
CREATE TABLE public.shift_operational_projection (
  casino_id          UUID        NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  gaming_day         DATE        NOT NULL,
  table_id           UUID        NOT NULL REFERENCES public.gaming_table(id) ON DELETE CASCADE,
  grind_volume_cents BIGINT      NOT NULL DEFAULT 0,
  fill_total_cents   BIGINT      NOT NULL DEFAULT 0,
  credit_total_cents BIGINT      NOT NULL DEFAULT 0,
  event_count        INTEGER     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (casino_id, gaming_day, table_id)
);

ALTER TABLE public.shift_operational_projection ENABLE ROW LEVEL SECURITY;
-- No authenticated policies — service_role-only access

-- Claim RPC (service_role only, mirrors rpc_claim_class_a_outbox_batch)
-- rpc_claim_operational_outbox_batch(p_batch_size INTEGER)
-- WHERE fact_class = 'operational'
--   AND event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded')
--   AND processed_at IS NULL
--   AND delivery_attempts < 5
-- FOR UPDATE SKIP LOCKED
-- UPDATE last_attempted_at = now(), delivery_attempts = delivery_attempts + 1

-- Primary key supports projection lookup by (casino_id, gaming_day, table_id).

CREATE INDEX idx_finance_outbox_operational_backlog
  ON public.finance_outbox (casino_id, gaming_day, table_id, event_id)
  WHERE processed_at IS NULL
    AND fact_class = 'operational'
    AND event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded');

-- Consumer RPC (atomic: processed_messages + projection upsert + processed_at)
-- rpc_process_operational_projection(p_message_id UUID) RETURNS TEXT
-- Routes: grind.observed → grind_volume_cents +=, fill.recorded → fill_total_cents +=,
--         credit.recorded → credit_total_cents +=, all → event_count += 1
-- Unknown operational event types return 'skipped_unknown' without processed_at stamping.
```

---

## Appendix B: Implementation Plan

### WS1: Database Layer — Projection Store + RPCs (P0)

- [ ] Migration: `shift_operational_projection` table (BIGINT cents columns, FK-backed `casino_id`/`table_id`, service_role RLS deny-by-default)
- [ ] Migration: `rpc_claim_operational_outbox_batch(p_batch_size INT)` — SECURITY DEFINER, `SET search_path = ''`, `anon`/`authenticated` EXECUTE revoked, claims only owned operational event types with `processed_at IS NULL AND delivery_attempts < 5` via `FOR UPDATE SKIP LOCKED`; no `claimed_until` dependency unless a same-slice schema migration adds it
- [ ] Migration: `rpc_process_operational_projection(p_message_id UUID)` — SECURITY DEFINER, `SET search_path = ''`, verifies ownership before `processed_messages`, then atomically writes global `processed_messages` + projection UPSERT + `processed_at`; route by owned `event_type`; return `'skipped_unknown'` without stamping unknown operational rows or poisoning `processed_messages`
- [ ] SRM update: register `shift_operational_projection` under PlayerFinancialService as a Wave 2 projection store owned with `finance_outbox` transport infrastructure
- [ ] `npm run db:types-local` exit 0

### WS2: Consumer Service + Relay Dispatch (P0)

- [ ] `services/player-financial/outbox-operational-consumer.ts` — `runOperationalConsumer()` calling `rpc_claim_operational_outbox_batch` + `rpc_process_operational_projection`; returns `{ processed: number, duplicate: number, errors: Error[] }`
- [ ] `app/api/internal/outbox-relay/route.ts` — second dispatch branch for operational batch; both branches run within stop-before-deadline window; batch sizes tuned so combined cycle fits the deadline
- [ ] `OperationalConsumerResultDTO` type in `services/player-financial/dtos.ts` (standalone, not extending `ConsumerResult`)

### WS3: Completeness Derivation + Surface Updates (P0)

- [ ] `getShiftOperationalCompleteness(supabase, casinoId, gamingDay, tableId)` in `services/player-financial/crud.ts` — same three-step logic (projection row present? → lifecycle signal present? → table-scoped owned operational backlog empty?); returns canonical `complete | partial | unknown`; uses passed client; caller injects `createServiceClient()`
- [ ] Identify all TypeScript surfaces reading grind/fill/credit from authoring tables directly; update each to read from `shift_operational_projection`
- [ ] Authority degradation: any mixed-class surface (Class A + operational) emits the combined value as `type: 'estimated'`

### WS4: `GrindBuyinPanel` Mounting (P1)

- [ ] Mount `GrindBuyinPanel` in the appropriate table-context page (EXEC-SPEC to confirm page); bounded hook/prop changes are allowed only to replace `shiftWindow` totals with `gamingDay` projection totals
- [ ] Verify `useLogGrindBuyin` hook wiring is intact and produces a `grind.observed` row visible in `/admin/outbox-observability` after submission

### WS5: I3/I4 Re-Verification Tests (P0)

- [ ] `tests/failure/i3-idempotency-operational-projection.test.ts` — duplicate `event_id` → one `processed_messages` row, one `shift_operational_projection` row; second call returns `'duplicate'`
- [ ] `tests/failure/i4-replay-operational-projection.test.ts` — process operational events, record totals, truncate projection, delete scoped `processed_messages` receipts for those operational event_ids, reset `processed_at`, replay in deterministic order `(casino_id, gaming_day, table_id, event_id)`, assert identical totals
- [ ] Unit tests for `runOperationalConsumer()` — `'processed'` path, `'duplicate'` path, `Error` propagation
- [ ] Authority degradation test — mixed-class aggregate emits `type: 'estimated'`
- [ ] Contract test — no Phase 2.4 DTO emits a `completeness.status` outside canonical `complete | partial | unknown`
- [ ] Source/migration test — Phase 2.4 SQL does not reference `claimed_until` unless a same-slice migration adds that column
- [ ] Completeness isolation test — a pending operational row for another table on the same gaming day does not keep this table's projection `partial`
- [ ] Zero-event completeness test — lifecycle closed + no projection row + no table-scoped operational backlog returns `complete` with zero totals
- [ ] Poison-row progress test — `delivery_attempts >= 5` operational rows are excluded from claimable backlog, counted as `operationalDeadLetter`, and do not block later valid rows
- [ ] Skipped-event test — ledger rows and unknown operational event types do not write `shift_operational_projection`, do not stamp `processed_at`, and do not insert `processed_messages`

### WS6: Release Governance (P1)

Runs after implementation gates pass.

- [ ] `WAVE-2-TRACKER.json` — Phase 2.4 status → `complete`; cursor `active_phase → "2.5"`; `last_closed_phase → "2.4"`, `last_closed_prd → "PRD-088"`, `last_closed_exec → "EXEC-088"`
- [ ] `WAVE-2-PROGRESS-TRACKER.md` — sync Phase 2.3 row to ✅ COMPLETE (existing markdown staleness fix); Phase 2.4 row → ✅ COMPLETE; Phase 2.5 row → 🔲 NOT STARTED; Immediate Next Actions updated
- [ ] `WAVE-2-ROLLOUT-MAP.md` — Phase 2.4 exit gate section marked ✅ MET; status header updated

---

## Appendix C: Exit Gate (verbatim from WAVE-2-ROLLOUT-MAP.md §4)

- Consumer certified via direct API/RPC trigger for all three event types (minimum bar per Principle 9)
- `GrindBuyinPanel` mounted and producing live `grind.observed` rows through real operator workflow
- Fill/credit producer trigger gap formally acknowledged in exit notes — operator UI deferred; direct API call is the certifiable trigger for this phase
- Authority labels correct: `origin_label: 'estimated'` on all operationally-derived values
- Mixed-class surface shows degraded authority, not spurious `'actual'`
- Completeness signals use canonical `complete` for projection-complete consumed operational outbox rows during shift lifecycle; full workflow-coverage completeness remains blocked until fill/credit operator UI ships
- All gates pass

---

## Appendix D: Known Residual Gaps (for Phase 2.5 Sign-Off)

These gaps are accepted for this phase. They must be named in the Phase 2.5 sign-off artifact.

| Gap | Finding | Post-Wave-2 path |
|---|---|---|
| `fill.recorded` workflow | No operator UI; `POST /api/v1/table-context/fills` is hardware-integration-only | PWB-002: separate PRD; hardware integration scope |
| `credit.recorded` workflow | No operator UI; `POST /api/v1/table-context/credits` is hardware-integration-only | PWB-002: separate PRD; hardware integration scope |
| `adjustment.recorded` anchor | `original_txn_id` never passed by rating-slip modal or MTL dashboard; ADR-057 gate silently skips emission | PWB-001: PROD-ANCHOR-STD-001 remediation |

---

## Appendix E: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-21 | Lead Architect | Initial draft |
| v0.1 | 2026-05-21 | Devil's Advocate remediation | Applied patch delta: removed unsupported `claimed_until` dependency, mapped projection-complete semantics to canonical `complete`, added FK/index requirements, required ownership-before-idempotency, and expanded contract tests |
| v0.2 | 2026-05-21 | Devil's Advocate remediation | Applied second audit delta: fixed hook-flow wording, added service-role caller boundary, mirrored WS5 tests into DoD, required RLS/grant tests, required backlog split diagnostics, and added SRM ownership registration gate |
