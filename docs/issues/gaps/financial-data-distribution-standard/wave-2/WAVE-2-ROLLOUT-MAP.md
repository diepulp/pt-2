# WAVE-2 ROLLOUT MAP — Transactional Outbox (PT-2 Pilot)

---

status: Active — Phase 2.4 COMPLETE (PRD-088 / EXEC-088, 2026-05-21). Cursor at Phase 2.5 (Observability + Sign-Off). Post-Wave-2 backlog §10 active; GrindBuyinPanel mounting gap (PWB-003) closed in Phase 2.4. Fill/credit operator UI (PWB-002) and adjustment anchor (PWB-001) remain open.
date: 2026-05-21
phase_model: bounded_operational_rollout (transition from transport_certification_sequencing as of 2026-05-19)
phase_2_0_closed: 2026-05-11
phase_2_0_prd: PRD-081
phase_2_0_exec: EXEC-081
phase_2_0_commit: 8a1b8741
scope: PT-2 pilot — producer expansion (adjustment, fills, credits) through first projection consumer slices.
authority: ADR-052, ADR-053, ADR-054, ADR-055 (frozen 2026-04-23)
derived_from:
  - wave-2/outbox-knowledge-base.md
  - wave-2/PRD-081_VERTICAL_COLLAPSE_EXEMPLAR_DIRECTIVE.md
  - actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
  - actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json
  - actions/ROLLOUT-ROADMAP.md §4
  - .claude/skills/build-pipeline/checkpoints/PRD-081.json

---

## 1. Status Snapshot (as of 2026-05-21 — Phase 2.4 complete; see §4 for per-phase delivery detail)

### Delivered — Phase 2.0 (PRD-081)

| Artifact | Status |
|----------|--------|
| `finance_outbox` Wave 2 DDL + indexes | ✅ |
| `table_buyin_telemetry` schema | ✅ |
| `processed_messages` table | ✅ |
| `generate_uuid_v7()` extension | ✅ |
| `rpc_claim_outbox_batch` | ✅ |
| `rpc_commit_consumer_receipt` | ✅ |
| `rpc_create_financial_txn` outbox extension (Class A exemplar) | ✅ |
| `rpc_record_grind_observation` (Class B exemplar) | ✅ |
| `FinancialOutboxEventDTO` | ✅ |
| Relay worker (`/api/internal/outbox-relay`) + Vercel cron | ✅ |
| Idempotent consumer (`runConsumer`) | ✅ |
| RLS hardening — `finance_outbox` + `processed_messages` | ✅ |
| I1–I4 invariant harness (19 tests PASS) | ✅ |
| Integration + unit tests (98 tests PASS) | ✅ |
| Event catalog (Wave 2 entries for exemplar pair) | ✅ |
| SRM footnote updated (ADR-054 + ADR-056 cited) | ✅ |

### GAP-F1 — Closed

GAP-F1 (`finance_outbox` has zero producers) is fully closed by Phase 2.0. The four transport invariants are proven under real code:

| Invariant | Status | Proof |
|-----------|--------|-------|
| I1 — Atomicity | ✅ Proven — exemplar pair only | tests/failure/i1-atomicity.test.ts; no TS outbox fallback path; **must be re-proven per producer in Phase 2.1 and 2.2** |
| I2 — Durability | ✅ Proven — baseline (inherited) | tests/failure/i2-durability.test.ts; committed row re-delivered on next cycle; inherited by later phases unless relay architecture changes |
| I3 — Idempotency | ✅ Proven — baseline (inherited) | tests/failure/i3-idempotency.test.ts; duplicate → safe prior commit; inherited by later phases unless consumer architecture changes |
| I4 — Replayability | ✅ Proven — baseline (inherited) | tests/failure/i4-replayability.test.ts; ORDER BY (table_id, event_id) deterministic; inherited by later phases unless ordering architecture changes |

### Producer Workstreams — All Wired (Phases 2.1 / 2.2)

| Workstream | Producer | Category | Status |
|------------|----------|----------|--------|
| WS_PRODUCER_ADJUSTMENT | `rpc_create_financial_adjustment` | Class A (Authority Fact) | ✅ Phase 2.1 (PRD-083 / EXEC-083) |
| WS_PRODUCER_FILL | `rpc_request_table_fill` | Dependency Event | ✅ Phase 2.2 (PRD-085 / EXEC-085) |
| WS_PRODUCER_CREDIT | `rpc_request_table_credit` | Dependency Event | ✅ Phase 2.2 (PRD-085 / EXEC-085) |

### Wave 2 Entry Criteria — All Met

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wave 1 complete | ✅ | WAVE-1-PHASE-1.5-SIGNOFF.md, 2026-05-06 |
| Pre-Wave-2 surface debt closed | ✅ | PRD-080 / EXEC-080, commit 20df161b |
| Q1–Q4 resolved | ✅ | All four resolved 2026-05-06 |
| Feature pipeline initiated | ✅ | FIB-H-W2-OUTBOX-001, SCAFFOLD, PRD-081 |
| I1–I4 harness proven against real implementation | ✅ | PRD-081 EXEC-081, test:failure 19/19 PASS |

---

## 2. Rollout Principles

These principles govern every Phase 2.x slice. They are inherited from the frozen ADR set and the Vertical Collapse Directive.

1. **Transport before consumers.** No projection consumer PRD may be initiated until its required producer path exists and I1-I4 are verified. Phase 2.3 does not start before Phase 2.1 gates.

2. **Producers expand one category at a time.** Class A adjustment ships separately from Dependency Events. Within a category, parity rules apply: fills and credits ship as a pair (they are symmetric Dependency Events per RULE-6 / FIB-H §G).

3. **ADR-055 parity is not relaxed.** The exemplar proved Class A and Class B simultaneously. Subsequent expansion slices must still satisfy parity within each slice boundary: no asymmetric rollout where one category of the same semantic class lands far ahead of another.

4. **Consumers are projection-only.** No consumer slice may write to PFT, the grind authoring store, or any other authoring table. Consumers write only to projection stores and `processed_messages`. `origin_label` travels from authoring boundary to consumer unchanged.

5. **Gates are pass/fail.** Each phase has a hard exit condition. No partial advancement. Phase N+1's PRD must land before Phase N+1 code begins.

6. **No scope expansion without FIB amendment.** The FIB-S `downstream_expansion_allowed_without_amendment: false` rule applies to every phase in this map. Any new operator-visible outcome, external consumer contract, or new surface not in the containment loop requires a FIB amendment before it can appear in a PRD.

7. **Freeze discipline holds.** ADR-052–055 are frozen. If a phase surfaces a real conflict, write a superseding ADR. Do not patch frozen docs silently.

8. **Parallelization rule (effective 2026-05-19, post Phase 2.2).** This marks the transition from *transport stabilization* to *bounded operationalization of a stabilized propagation substrate*. Phase 2.3a (Operational Outbox Observability) and Phase 2.3 (Lifecycle-Aware Completeness Projection) may proceed in parallel. They operate on different architectural layers: 2.3a is a read-only runtime verification surface; 2.3 is the first projection consumer. Parallelization is permitted while all four conditions hold: (1) relay topology is frozen; (2) replay ordering semantics are unchanged; (3) no projection logic is introduced into the observability surface; (4) no write/replay/repair actions are added to the admin observability boundary. If any condition breaks, parallelization reverts to sequential. Subsequent phase pairs are sequential unless explicitly permitted by a new rule under this principle.

9. **Producer coverage is workflow-specific.** Transport health does not imply producer coverage. Each event type must be certified through the real workflow surface expected to emit it. Observability evidence must distinguish between: (a) transport functionality — relay picks up and delivers rows; (b) producer RPC capability — the RPC can write to `finance_outbox` when called with a valid anchor; (c) workflow-level anchor resolution — the real operator workflow actually provides the required anchor at the callsite. An event type whose RPC emits conditionally is not certified by relay health or database-level proof alone. Certification requires end-to-end observation through the real workflow surface, from operator action to `finance_outbox` row to `processed_at`. Each PRD for phases that introduce or expand producers must include an anchor resolution table naming the anchor, its source in the workflow context, and the callsite that passes it.

---

## 3. Execution Protocol

> This roadmap is a PLANNING document, not an EXEC-SPEC.

The phase tables below describe *what must be built* and *what the exit gate looks like*. They do not replace PT-2's implementation pipeline.

### Per-phase execution chain (fixed for every Phase ≥ 2.1)

```
┌──────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│ /prd-writer  │ → │  /lead-architect     │ → │  /build PRD-###  │
│ (PRD for     │   │  (EXEC-SPEC scaffold  │   │  (workstream     │
│  the phase)  │   │   + workstream IDs)   │   │   execution)     │
└──────────────┘   └──────────────────────┘   └──────────────────┘
```

Every phase requires:
1. PRD drafted, reviewed, and approved — citing ADR-052–055, this roadmap, and FIB-H-W2-OUTBOX-001 as parent authority
2. EXEC-SPEC scaffolded by `/lead-architect`
3. `/build PRD-###` executed to exit criteria

No code is written for Phase N+1 before its PRD lands. No skill is invoked directly outside the build-pipeline chain.

### Phase transitions

Exiting Phase N → Opening Phase N+1 requires two documents:
1. Phase N exit gate met (this roadmap's §4 criteria)
2. Phase N+1 PRD drafted and approved

---

## 4. Phase Table

---

### Phase 2.0 — Exemplar Proof Slice ✅ COMPLETE 2026-05-11

**PRD:** PRD-081 | **EXEC:** EXEC-081 | **Commit:** 8a1b8741

**Scope:** Prove the full transport chain against the smallest symmetric pair (one Class A, one Class B). Establish finance_outbox, relay, idempotent consumer backbone, and I1–I4 harness. No producer expansion before this gates.

**Exemplar pair:**
- Class A: `rpc_create_financial_txn` → `buyin.recorded`
- Class B: `rpc_record_grind_observation` → `grind.observed`

> **Note (2026-05-21):** `cashout.recorded` was listed here but was never implemented. `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no direction branch. The projection consumer (migration `20260519184708`) explicitly marks it "not yet a distinct outbox producer; future." See **W2-OBS-CASHOUT-PRODUCER-001** for the confirmed gap and remediation path.

**Exit gate (all passed 2026-05-11):**
- [x] `finance_outbox` Wave 2 DDL live
- [x] Both exemplar producers emit atomically (I1 proven)
- [x] Committed row survives relay failure (I2 proven)
- [x] Duplicate delivery produces one consumer side effect (I3 proven)
- [x] Replay from ordered history produces equivalent state (I4 proven)
- [x] test:failure 19/19 PASS; test:slice:player-financial 98/101 PASS (3 integration skipped)
- [x] type-check exit 0; lint exit 0; build exit 0

---

### Phase 2.1 — Producer Expansion A: Financial Adjustment

**Entry gate:** Phase 2.0 exit ✅

**Scope:** Wire `rpc_create_financial_adjustment` to emit a `finance_outbox` row atomically within its existing transaction boundary. This is the only remaining Class A (Authority Fact) producer. No relay, consumer, or DDL schema changes — the transport infrastructure is already in place.

**Semantic contract:**
- `event_type`: `'adjustment.recorded'`
- `fact_class`: `'ledger'`
- `origin_label`: `'actual'`
- `player_id`: mandatory (NOT NULL — full attribution required for Class A)
- `table_id`: mandatory (table-first anchoring)
- `aggregate_id`: the PFT row id for the adjustment

**Skill to invoke:** `backend-service-builder` (RPC extension migration); `qa-specialist` (atomicity proof test for adjustment path)

### Deliverables

- [ ] Migration extending `rpc_create_financial_adjustment` with outbox emission inside same `BEGIN…COMMIT`
- [ ] Event catalog entry for `adjustment.recorded` (registered before producer ships)
- [ ] `FinancialOutboxEventDTO` remains unchanged — no shape changes needed
- [ ] Unit test proving adjustment path calls single RPC (no TS-level outbox fallback)
- [ ] `npm run db:types-local` exits 0 after migration
- [ ] type-check, lint exit 0

### Exit gate

- `rpc_create_financial_adjustment` atomically emits `finance_outbox` row (I1 for adjustment path)
- `adjustment.recorded` registered in Wave 2 event catalog
- No second adjustment-to-outbox path exists in TypeScript
- All gates pass

---

### Phase 2.2 — Producer Expansion B: Dependency Events (Fills + Credits)

**Entry gate:** Phase 2.1 exit

**Scope:** Wire `rpc_request_table_fill` and `rpc_request_table_credit` to emit `finance_outbox` rows atomically. Both must ship simultaneously — they are symmetric Dependency Events and asymmetric rollout is not permitted (ADR-055 parity within the Dependency Event category). No relay, consumer, or DDL schema changes.

**Semantic contract (both producers):**

| Field | Value | Note |
|-------|-------|------|
| `fact_class` | `'operational'` | Dependency Events are not Authority Facts |
| `origin_label` | `'estimated'` | Provenance label per WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md — not an accuracy qualifier |
| `player_id` | `NULL` | Dependency Events have no player attribution |
| `table_id` | mandatory | Table-first anchoring |
| `event_type` (fill) | `'fill.recorded'` | |
| `event_type` (credit) | `'credit.recorded'` | |

**Critical classification note:** Fills and credits carry `'estimated'` as provenance, not because they are uncertain — they are operationally auditable to the cent. The `'estimated'` label means non-ledger operational input under the surface contract (ADR-054 D5). Authority conflation into `'actual'` is a violation.

**Skill to invoke:** `backend-service-builder` (2 RPC extension migrations); `qa-specialist` (atomicity proof + classification guard tests)

### Deliverables

- [ ] Migration extending `rpc_request_table_fill` with outbox emission
- [ ] Migration extending `rpc_request_table_credit` with outbox emission
- [ ] Both migrations in same PR / deployment (ADR-055 simultaneous landing)
- [ ] Event catalog entries for `fill.recorded` and `credit.recorded`
- [ ] `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded in both RPCs (not derived from caller input)
- [ ] `player_id = NULL` enforced unconditionally in both RPCs
- [ ] Tests proving: (a) atomicity for each path, (b) `origin_label` cannot be upgraded by consumer
- [ ] type-check, lint exit 0

### Exit gate

- Both `rpc_request_table_fill` and `rpc_request_table_credit` atomically emit `finance_outbox` rows
- `fill.recorded` and `credit.recorded` registered in Wave 2 event catalog
- `fact_class = 'operational'` and `origin_label = 'estimated'` verified in migration text
- No authority conflation — consumer tests assert `origin_label` stays `'estimated'`
- All gates pass

---

### Phase 2.3a — Operational Outbox Observability *(parallel with Phase 2.3)*

**PRD:** PRD-086 (authored 2026-05-19) | **FIB:** FIB-H-W2-OUTBOX-OBS-001 v0

**Entry gate:** Phase 2.2 exit ✅

**Parallelization:** Authorized to run concurrently with Phase 2.3 while all four parallelization conditions hold (see §2 Principle 8). Phase 2.3a does not mutate producer semantics, relay behavior, replay ordering, `processed_messages`, or projection state.

**Scope:** Read-only internal admin surface at `/admin/outbox-observability` that makes `finance_outbox` state and relay delivery status inspectable without SQL. Enables field validation of Phase 2.2 producer behavior before projection consumers are built. The surface does not create, mutate, replay, repair, or synthesize outbox events.

**Semantic contract preserved:** `origin_label` and `fact_class` are rendered exactly as stored. No upgrade, no inference. A row with `origin_label: 'estimated'` renders as `'estimated'` at every layer of the surface.

**Skill to invoke:** `backend-service-builder` (WS1: RPCs + DTOs); `api-builder` (WS2: `/api/internal/outbox-observability`); `frontend-design-pt-2` (WS3: admin page)

### Deliverables

- [ ] Migration: `rpc_get_outbox_relay_health(p_casino_id UUID)` — SECURITY DEFINER, service_role; returns pending count, oldest pending age, retry row count, poison candidate count (`delivery_attempts >= 3`, heuristic), processed count last 24h
- [ ] Migration: `rpc_get_outbox_event_page(p_casino_id UUID, ...)` — SECURITY DEFINER, service_role; full envelope + relay lifecycle fields; hard-cap 100 rows; status filter and UUID search
- [ ] `OutboxAdminEventDTO` — standalone `Pick<FinancialOutboxRow, ...>` (not extending `FinancialOutboxEventDTO` — independent evolution contract)
- [ ] `OutboxRelayHealthDTO`
- [ ] `GET /api/internal/outbox-observability` — admin session auth, service-role DB client, no writes
- [ ] `app/(dashboard)/admin/outbox-observability/page.tsx` — relay health card + event queue + poison-candidate labeling + search/filter
- [ ] Unit + integration tests: 401 guard, casino-scoped query, poison candidate count
- [ ] type-check, lint, build exit 0

### Exit gate

- Admin surface renders relay health and event queue without a SQL client
- Real workflow action (buy-in, fill, or adjustment) produces visible outbox row with correct `fact_class`, `origin_label`, `table_id`, and `player_id`
- `delivery_attempts >= 3 AND processed_at IS NULL` rows labeled as poison candidates (pilot heuristic, non-authoritative)
- Zero writes to `finance_outbox` or any authoring table — verified by code review and integration test
- `origin_label` rendered as authored — no upgrade visible in any rendered row or API response
- `finance_outbox` reads route through SECURITY DEFINER RPC (ADR-054 R3, ADR-056 compliant)
- All gates pass

**Phase 2.5 boundary:** Phase 2.5 delivers relay log-line metrics (`outbox_backlog_size`, `processing_lag_ms`). This phase delivers the interactive admin surface. No duplication — the Phase 2.5 deliverables remain deferred.

---

### Phase 2.3 — First Consumer Slice: Class A Lifecycle Completeness Proof ✅ COMPLETE (2026-05-19)

**PRD:** PRD-087 v1.1 (2026-05-19 — contained re-draft; v0.x discarded) | **EXEC:** EXEC-087 (2026-05-19) | **FIB:** FIB-H-W2-OUTBOX-001 v0 (no amendment)
**Scope authority:** `phase-2.3/PRD-CONTAINMENT.md` | **Cadence authority:** `phase-2.3/EXEC-087-CADENCE-DIRECTIVE.md`

**Entry gate:** Phase 2.1 exit ✅ — *may begin in parallel with Phase 2.3a; see §2 Principle 8*

**Pre-EXEC gate:** Resolved — `visit_id` is NOT in payload; derived via PFT JOIN on `aggregate_id` inside `rpc_process_class_a_projection`. EXEC-087 scaffolded with this understanding.

**Scope:** Prove that one ledger-authoritative Class A outbox stream can update one visit-level projection and produce a lifecycle-aware completeness signal, without consuming or damaging Phase 2.4 operational inputs. Resolves DEC-1. The original Phase 2.3 description was written before the `gaming_day` envelope gap was discovered; the cadence directive introduced a mandatory Gate A prerequisite that did not appear in the prior plan. No new phase is introduced — Gate A and Gate B are sequential gates within this phase. If Gate A fails closed (no authoritative `gaming_day` derivation for an event type), a remediation migration must be authored and proven before Gate B begins; this is a phase-internal blocker, not a new phase.

**Cadence rule:** Gate B must not activate the consumer before Gate A passes all proofs. The consumer claiming `finance_outbox` rows before the envelope is complete would poison the projection with rows that lack `gaming_day`.

**What DEC-1 means:** `VisitFinancialSummaryDTO`, `FinancialSectionDTO` emit `completeness.status: 'unknown'` always. No lifecycle projection exists, no gaming-day close signal exists. `mtl_gaming_day_summary` and `player_financial_transaction` aggregates have no lifecycle column.

---

#### Gate A — Envelope Compatibility ✅ PASSED (2026-05-19)

`finance_outbox` had no `gaming_day` column. Gate A added the column, amended all five producers, performed authoritative backfill, hardened NOT NULL, and updated the immutability guard.

**Gate A Deliverables:**

- [x] Migration: add `finance_outbox.gaming_day` (nullable) — `20260519183629`
- [x] Migration: amend `fn_finance_outbox_emit` — 9-param signature; old 8-param removed — `20260519183630`
- [x] Migration: amend all five producers — `20260519183631`
- [x] Migration: authoritative backfill (ledger rows from PFT.gaming_day; fill/credit/grind fail-closed — no authoritative derivation; Gate A patch applied) — `20260519183632`
- [x] Migration: harden `gaming_day NOT NULL` — `20260519183633`
- [x] Migration: add `gaming_day` to immutability trigger — `20260519183634`
- [x] `FinancialOutboxEventDTO` Pick updated to include `gaming_day`
- [x] `npm run db:types-local` exits 0

**Gate A Required Proofs:**

- All five producers emit non-null `gaming_day` (unit tests pass after each producer amendment)
- Producer execution posture confirmed: EXEC-087 must inspect `SECURITY DEFINER` / `SECURITY INVOKER` posture of all five RPCs that call `fn_finance_outbox_emit`; helper EXECUTE privileges must match each producer's execution posture; Gate A fails if any authenticated write path breaks after the helper signature or privilege change
- No old `fn_finance_outbox_emit` call site omits `gaming_day`
- `gaming_day` update rejected by immutability trigger (test verifies)
- No authenticated write path broken

---

#### Gate B — Class A Projection Proof ✅ PASSED (2026-05-19)

**Gate B Deliverables:**

- [x] Migration: `visit_class_a_projection` store — `20260519184706`
- [x] Pre-implementation check: `processed_messages` uses `message_id UUID PRIMARY KEY`; `p_message_id` param aligns — verified in `rpc_process_class_a_projection`
- [x] Migration: `rpc_process_class_a_projection(p_message_id)` — ledger-only; non-ledger rows remain `processed_at IS NULL` — `20260519184708`
- [x] `processed_messages` idempotency check within same transaction as projection update
- [x] Gaming-day lifecycle close signal: `gaming_day_lifecycle` table + `rpc_close_gaming_day` — `20260519184707`, `20260519184709`
- [x] `VisitFinancialSummaryDTO` completeness: `'complete'` / `'partial'` / `'unknown'` — propagated via `getVisitClassACompleteness()` + mapper
- [x] `FinancialSectionDTO` completeness: same logic (via mapper chain)
- [x] Mixed-source surfaces remain `'partial'` until Phase 2.4
- [x] `origin_label` travels unchanged
- [ ] type-check, lint, build exit 0 — deferred to DoD gate (branch not yet merged)

**Gate B Required Proofs:**

- No 100× amount corruption: projection amounts in integer cents, matching PFT source
- Duplicate delivery does not double-project (I3 re-verified at consumer layer)
- Replay produces identical completeness state (I4 re-verified at consumer layer)
- Non-ledger rows remain `processed_at IS NULL` after consumer runs
- Closed gaming day + empty Class A backlog = `'complete'` only for Class A-only surfaces

---

**Consumer constraints (non-negotiable — ADR-054):**
- `processed_messages` idempotency check before any projection side effect
- `origin_label` travels unchanged through projection path and rendered surface; no upgrade from `'estimated'` to `'actual'`
- Must not write to `player_financial_transaction` or any authoring store
- Must not perform reconciliation
- Reads `fact_class` and `origin_label` directly from the outbox row — never infers from payload content
- Claims only `fact_class = 'ledger'`; non-ledger rows must remain `processed_at IS NULL`

**Skill to invoke:** `backend-service-builder` (Gate A migrations; Gate B projection store + consumer); `qa-specialist` (Gate A producer proofs; Gate B I3/I4 consumer re-verification; completeness signal tests); `api-builder` (only if existing financial-summary and modal-data routes require wiring changes)

### Exit gate ✅ MET (2026-05-19)

- Gate A ✅: all five producers emit non-null `gaming_day`; NOT NULL constraint hardened; producer execution posture confirmed; no authenticated write path broken
- Gate B ✅: DEC-1 resolved — `VisitFinancialSummaryDTO` and `FinancialSectionDTO` emit `'complete'` / `'partial'` for visits with flowing Class A events
- I3 consumer re-verification ✅: duplicate delivery → one projection update (integration test passes)
- I4 consumer re-verification ✅: replay → identical completeness state (integration test passes)
- Non-ledger rows remain `processed_at IS NULL` ✅ (Phase 2.4 inputs preserved)
- Surface rendering contract (Wave 1) not broken ✅ — labels still visible
- type-check, lint, build: deferred to merge-time DoD gate

**Note on Phase 2.4 inheritance:** Gate A adds `gaming_day` to all operational rows (`fill.recorded`, `credit.recorded`, `grind.observed`). Phase 2.4's operational consumer will find `gaming_day` present in all the rows it needs to process — no separate envelope compatibility gate is required in Phase 2.4.

---

### Phase 2.4 — Consumer Expansion: Operational Telemetry Projection ✅ COMPLETE 2026-05-21

**PRD:** PRD-088 | **EXEC:** EXEC-088 | **Branch:** feat/transactional-outbox

**Entry gate:** Phase 2.2 exit (all producers wired) + Phase 2.3 exit (consumer infrastructure established, Gate A complete)

**Envelope inheritance:** Phase 2.3 Gate A adds `gaming_day` to all operational rows (`fill.recorded`, `credit.recorded`, `grind.observed`). Phase 2.4's operational consumer will find `gaming_day` present in all rows it processes — no separate envelope compatibility gate is required here. The EXEC-SPEC for Phase 2.4 must use `gaming_day` for shift-level projection window scoping.

**Scope:** Projection consumer for Class B (grind) and Dependency Event (fills, credits) streams. Produces shift-level operational telemetry with correct authority labels. This is the consumer that makes shift dashboard financial data event-driven rather than direct-polling from authoring stores.

**Events consumed:**
- `grind.observed` (Class B — `fact_class: 'operational'`, `origin_label: 'estimated'`)
- `fill.recorded` (Dependency Event — same labels)
- `credit.recorded` (Dependency Event — same labels)

**Authority rule:** All three event types carry `origin_label: 'estimated'`. Any mixed-class surface that aggregates these alongside Class A events must degrade to `'estimated'` authority per the hierarchy (Actual > Observed > Estimated). No surface may show a combined operational + ledger total without degradation labeling.

**Surface impact:** Shift telemetry operational estimates (Estimated Drop, Grind Buyin volume) become event-driven. Surfaces gain meaningful `'partial'` completeness during a shift and `'complete'` upon gaming-day close.

**Producer trigger posture — known gaps entering Phase 2.4:**

Per Principle 9, RPC-level wiring (Phase 2.2 exit) is not equivalent to workflow-level certification. The three producers consumed here have the following real-workflow trigger status:

| Producer | RPC wired | UI trigger | Status entering 2.4 |
|---|---|---|---|
| `grind.observed` | ✅ Phase 2.0 | `GrindBuyinPanel` + `useLogGrindBuyin` exist but component **not mounted** in any page | Orphaned — rows cannot be produced by real operator workflows until mounted |
| `fill.recorded` | ✅ Phase 2.2 | No UI — `POST /api/v1/table-context/fills` is hardware-integration-only | Greenfield — rows require direct API call; operator UI is future scope |
| `credit.recorded` | ✅ Phase 2.2 | No UI — `POST /api/v1/table-context/credits` is hardware-integration-only | Greenfield — rows require direct API call; operator UI is future scope |

Consequence: the consumer can be built and proven via direct API/RPC calls. However, real operator workflows will not produce `grind.observed`, `fill.recorded`, or `credit.recorded` rows in production until the UI gaps are addressed. The shift dashboard projection will show `'partial'` completeness permanently in real workflows unless at minimum `GrindBuyinPanel` is mounted.

Mounting `GrindBuyinPanel` is achievable within Phase 2.4 (the component and hook are built). The fill/credit operator UI is explicitly out of scope for Phase 2.4 and must be tracked as a known residual gap for Phase 2.5 sign-off. The Phase 2.4 EXEC-SPEC must name these gaps explicitly rather than treating Phase 2.2 RPC wiring as equivalent to workflow coverage.

**Skill to invoke:** `backend-service-builder` (operational projection store + consumer); `qa-specialist` (authority degradation tests; mixed-class aggregate tests); `frontend-design-pt-2` (shift dashboard surface changes + `GrindBuyinPanel` mounting)

### Deliverables

- [x] `shift_operational_projection` table migration: PK `(casino_id, gaming_day, table_id)`, `grind_volume_cents`, `fill_total_cents`, `credit_total_cents`, `event_count`, `updated_at` — `20260521015409`
- [x] `rpc_claim_operational_outbox_batch` — SECURITY DEFINER, service_role only; claims `fact_class='operational'` rows with `delivery_attempts < 5` — `20260521022656`
- [x] `rpc_process_operational_projection(p_message_id)` — SECURITY DEFINER, service_role only; returns `'processed' | 'duplicate' | 'skipped_ledger' | 'skipped_unknown' | 'not_found'`; stamps `processed_at` atomically (DEC-EXEC-3: no separate ack step) — `20260521022703`
- [x] Backlog index on `finance_outbox(casino_id, fact_class, delivery_attempts, processed_at)` — `20260521022708`
- [x] `services/player-financial/outbox-operational-consumer.ts` — `runOperationalConsumer`, batch_size=25, stop-before-deadline
- [x] `app/api/internal/outbox-relay/route.ts` — operational branch added; response `{classA: {processed, failed}, operational: {processed, duplicate, errors}}`
- [x] `app/api/internal/outbox-observability/route.ts` — 3-way backlog breakdown: `operationalBacklog: {claimable, deadLetter}`
- [x] `getShiftOperationalCompleteness` in `services/player-financial/crud.ts` — 5-step logic; always `type: 'estimated'` (ADR-054 R4)
- [x] `GET /api/v1/table-context/operational-projection` — `casinoId` from `rlsContext` only (DEC-EXEC-4); 400 on invalid params
- [x] `OperationalProjectionResponseDTO`, `OperationalConsumerResultDTO` in `services/player-financial/dtos.ts`
- [x] `hooks/table-context/use-buyin-telemetry.ts` — interface changed from `shiftWindow` to `gamingDay: string` (DEC-EXEC-2)
- [x] `GrindBuyinPanel` mounted in `components/pit-panels/tables-panel.tsx` via `panel-container.tsx` (PWB-003 closed)
- [x] 58 tests across 6 suites — 100% pass; ADR-054 R4 authority degradation invariant test suite
- [x] type-check, lint exit 0

### Exit gate ✅ MET (2026-05-21)

- Consumer certified: `rpc_claim_operational_outbox_batch` + `rpc_process_operational_projection` wired and tested ✅
- `GrindBuyinPanel` mounted in `TablesPanel` — `grind.observed` rows producible via real operator workflow ✅ (PWB-003 closed)
- Fill/credit operator UI gap acknowledged in exit notes — `fill.recorded` / `credit.recorded` require direct API call; operator UI deferred to PWB-002 ✅
- Authority labels correct: `type: 'estimated'` on all `OperationalProjectionResponseDTO` values; ADR-054 R4 invariant test suite passes ✅
- Completeness signals: 5-step logic (`unknown` / `complete-zero` / `partial` / `partial-with-backlog` / `complete`) ✅
- `GrindBuyinPanel` completeness remains partial for fill/credit until operator UI ships (known gap) ✅ (acknowledged)
- All gates pass (type-check exit 0, 58/58 tests) ✅

---

### Phase 2.5 — Observability + Sign-Off

**Entry gate:** Phase 2.4 exit

**Scope:** Minimal relay health observability, outbox retention policy, producer coverage matrix, and Wave 2 sign-off artifact. This is not a full observability dashboard — that is deferred per FIB-H §G.

### Deliverables

- [ ] `outbox_backlog_size` log line added to relay worker (count of `processed_at IS NULL` rows logged per cycle)
- [ ] `processing_lag_ms` log line: elapsed time from `finance_outbox.created_at` to `processed_at`
- [ ] Finance outbox retention: cleanup policy for processed rows older than 7 days (separate job or migration)
- [ ] Wave 2 sign-off artifact: `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md`
  - Summary of all phases completed
  - I1–I4 proof record
  - DEC-1 resolution record
  - Known residual gaps (see below — must be named explicitly, not elided)

### Known residual gaps (required in sign-off artifact)

These gaps are confirmed findings from Phase 2.3a observability investigation and must be named in the sign-off document. They do not block Wave 2 transport/projection infrastructure sign-off, but they block any claim of full workflow-level producer coverage.

| Gap | Finding | Reference | Post-Wave-2 path |
|---|---|---|---|
| `cashout.recorded` — no active producer | `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no direction branch. The session-close path writes to `pit_cash_observation` only. The projection consumer has a reserved slot but no events arrive. Rollout map line 144 ("buyin.recorded / cashout.recorded") was incorrect — cashout was cataloged but never implemented. | W2-OBS-CASHOUT-PRODUCER-001 | Add `CASE WHEN v_row.direction = 'out' THEN 'cashout.recorded'` branch in `rpc_create_financial_txn`; confirm rating-slip cashout path passes `rating_slip_id` |
| `adjustment.recorded` workflow anchor | `original_txn_id` is never passed by the rating-slip modal or MTL compliance dashboard. ADR-057 gate silently skips emission. The RPC is correct; the callers are not. | W2-OBS-ANCHOR-COVERAGE-001; PROD-ANCHOR-STD-001 | Enforce anchor resolution standard at service boundary per PROD-ANCHOR-STD-001 |
| Fill/credit operator UI | `rpc_request_table_fill` and `rpc_request_table_credit` are wired correctly. No operator-facing UI exists; routes are hardware-integration-only. Real workflows produce no outbox rows. | CORE-OPERATIONAL-LOOP.md Category A | Build operator UI surface (separate PRD; hardware integration scope) |
| `GrindBuyinPanel` mounting | Component and hook exist; panel is not mounted in any page. Grind observations cannot be produced by real operator workflows. Should be closed in Phase 2.4. | CORE-OPERATIONAL-LOOP.md Category B | Mount `GrindBuyinPanel` in Phase 2.4 (component ready, no new build needed) |
| Multi-consumer fan-out | Single internal consumer path assumed throughout Wave 2. Fan-out requires schema evolution and FIB amendment. | FIB-H-W2-OUTBOX-001 §G | Requires separate ADR + FIB amendment |
| CDC / WAL relay | Not in scope for Wave 2. Post-pilot scale upgrade. | §6 Non-Goals | Requires separate ADR |
| External consumer contract | No public event bus, no reconciliation interface. Q3 deferred. | §6 Non-Goals | Requires separate ADR + stakeholder discovery |

### Exit gate

- Backlog and lag metrics appear in relay logs
- Retention policy active (no indefinite accumulation)
- Sign-off document authored and approved with all known residual gaps named
- Sign-off explicitly distinguishes: transport complete, RPC producer coverage, workflow-level producer coverage, and known unresolved workflow gaps
- All gates pass

---

## 5. Failure-Simulation Alignment

| Invariant | Scope | Wave 2 Status | Proof Artifact |
|-----------|-------|--------------|----------------|
| I1 — Atomicity | **Producer-specific — must re-prove per producer** | ✅ Proven in 2.0 (exemplar pair); re-proven in 2.1 (adjustment) and 2.2 (fill, credit) | tests/failure/i1-atomicity.test.ts + per-producer atomicity tests in 2.1 and 2.2 |
| I2 — Durability | Transport substrate — baseline inherited | ✅ Proven in 2.0; inherited by 2.1–2.5 unless relay architecture changes | tests/failure/i2-durability.test.ts |
| I3 — Idempotency | Transport substrate — baseline inherited; consumer-level re-verified | ✅ Proven in 2.0; consumer idempotency re-verified in 2.3 and 2.4 | tests/failure/i3-idempotency.test.ts + consumer idempotency tests |
| I4 — Replayability | Transport substrate — baseline inherited; projection-level re-verified | ✅ Proven in 2.0; replay test for each consumer projection in 2.3 and 2.4 | tests/failure/i4-replayability.test.ts + consumer replay tests |
| I5 — Truthfulness | Surface enforcement — Wave 1 baseline | ✅ Proven in Wave 1 Phase 1.4 | e2e/financial-enforcement.spec.ts (Wave 1) |

**I1 is producer-scoped.** Each newly wired producer path (`rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit`) must ship with an explicit atomicity proof test demonstrating that the authoring row and `finance_outbox` row commit inside the same real transaction boundary. The exemplar proof does not certify future producers.

**I2–I4 are transport-substrate invariants.** They are proven once at the relay/consumer architecture level and inherited by later producer phases. Re-verification is required only if the relay worker, ordering guarantee, or idempotent-consumer implementation changes materially. Consumer projection tests in Phase 2.3 and 2.4 extend I3 and I4 at the consumer layer without replacing the baseline harness.

---

## 6. Non-Goals (explicit)

These are excluded from all Wave 2 phases and require a new FIB or superseding ADR before they can enter scope.

- **No CDC / WAL relay** — Debezium, `pg_logical`, WAL streaming. Post-pilot scale upgrade.
- **No external consumer contract** — No public event bus, no third-party event semantics, no reconciliation interface. Q3 deferred outside pilot scope; requires separate ADR + stakeholder discovery.
- **No event sourcing** — The outbox does not reconstruct authoritative state. Not a general ledger.
- **No authoritative totals** — No `Total Drop`, shift-end settlement, or final money position.
- **No multi-consumer fan-out registry** — Wave 2 assumes a single internal consumer path. Fan-out requires schema evolution and a new FIB.
- **No UI-driven reconciliation** — Render completeness labels; never recompute financial state against authoring stores.
- **No compliance domain scope** — `mtl_entry` / MTLService remains parallel and isolated. `finance_outbox` does not propagate compliance events.
- **No new PFT columns** — `player_financial_transaction` is append-only; no schema changes.

---

## 7. Skill Routing (invoked through `/build-pipeline`)

Do not invoke these skills directly for any Phase ≥ 2.1. Each phase runs `/prd-writer` → `/lead-architect` (EXEC-SPEC scaffold) → `/build PRD-###`. `/build-pipeline` dispatches domain-expert skills per workstream.

| Phase | Primary skill(s) | Supporting |
|-------|-----------------|-----------|
| 2.0 Exemplar | ✅ Complete (PRD-081) | — |
| 2.1 Class A Adjustment | `backend-service-builder` (RPC migration) | `qa-specialist` (atomicity test) |
| 2.2 Dependency Events | `backend-service-builder` (2 RPC migrations, simultaneous) | `qa-specialist` (atomicity + classification tests) |
| 2.3 First Consumer (Gate A + Gate B) | `backend-service-builder` (Gate A: gaming_day migrations + producer amendments; Gate B: projection store + consumer) | `qa-specialist` (Gate A producer proofs; Gate B I3/I4 consumer re-verification; completeness signal tests); `api-builder` (if financial-summary / modal-data routes need wiring) |
| 2.4 Op. Telemetry | `backend-service-builder` (operational projection) | `qa-specialist`; `frontend-design-pt-2` (shift dashboard if surface changes) |
| 2.5 Sign-off | `/lead-architect` (sign-off artifact) | `qa-specialist` (final gate) |

---

## 8. Exit Criteria

### Wave 2 complete when

1. All five producer RPCs emit to `finance_outbox` atomically (RPC-level certification):
   - `rpc_create_financial_txn` ✅ (`buyin.recorded` only — `cashout.recorded` branch absent; gap: W2-OBS-CASHOUT-PRODUCER-001)
   - `rpc_record_grind_observation` ✅
   - `rpc_create_financial_adjustment` ✅ (RPC correct; workflow anchor gap documented — PROD-ANCHOR-STD-001)
   - `rpc_request_table_fill` ✅
   - `rpc_request_table_credit` ✅
2. I1–I4 invariants proven for all producer paths (I1 re-verified per new producer; I2–I4 baseline established in Phase 2.0)
3. DEC-1 resolved — visit-level financial aggregates emit `'complete'` / `'partial'` when events are flowing ✅ (Phase 2.3)
4. Shift telemetry surfaces event-driven (not polling authoring stores); `GrindBuyinPanel` mounted (Phase 2.4) ✅ — `GET /api/v1/table-context/operational-projection` route live; `GrindBuyinPanel` mounted; `shift_operational_projection` consumer active
5. Authority labels correct on all new projection surfaces
6. Relay health observable (backlog size + processing lag logged)
7. Sign-off artifact authored and approved with known residual gaps named

**Note on workflow-level coverage (Principle 9):** Wave 2 transport completion is defined at RPC-level certification plus consumer/projection proof. Workflow-level producer coverage is tracked separately under Principle 9. Confirmed workflow gaps (`adjustment.recorded` anchor, fill/credit operator UI) do not block transport completion, but they do block any claim of full operational producer coverage. The Wave 2 sign-off must label the final state as "transport complete with known workflow coverage gaps" unless those gaps are closed before sign-off. Closing them requires post-Wave-2 work governed by PROD-ANCHOR-STD-001 and future UI PRDs.

### Ready to start post-Wave-2 work when

| Criterion | Notes |
|-----------|-------|
| Wave 2 sign-off complete | WAVE-2-SIGN-OFF.md authored |
| All five producers wired and gated | Phase 2.2 exit passed |
| First consumer slice live | Phase 2.3 exit passed |
| External consumer contract if needed | Requires separate ADR + stakeholder discovery (Q3) |
| Multi-consumer fan-out if needed | Requires FIB amendment + schema evolution |

---

## 10. Post-Wave-2 Backlog

Items confirmed during Phase 2.3a observability investigation that are out of scope for Wave 2 but must be tracked for post-Wave-2 scheduling. Each item requires its own PRD before code. None block Wave 2 exit (see §8 note on Principle 9).

| ID | Item | Source | Governing artifact | PRD status |
|---|---|---|---|---|
| PWB-001 | `adjustment.recorded` anchor resolution — refactor rating-slip modal and MTL compliance dashboard to resolve `original_txn_id` at service boundary; move `createFinancialAdjustment` behind API route | W2-OBS-ANCHOR-COVERAGE-001 / LAYER-1-FAILURE.md | PROD-ANCHOR-STD-001 (`proposed_for_wave_2_5_signoff`) | Not started |
| PWB-002 | Fill/credit operator UI — no operator-facing surface exists for `rpc_request_table_fill` / `rpc_request_table_credit`; current API routes are hardware-integration-only; outbox rows cannot be produced by real operator workflows | CORE-OPERATIONAL-LOOP.md Category A | Phase 2.5 sign-off gap table | Not started — hardware integration scope; separate PRD required |
| PWB-003 | `GrindBuyinPanel` mounting — ✅ CLOSED in Phase 2.4 (PRD-088, 2026-05-21). `GrindBuyinPanel` mounted in `TablesPanel` via `panel-container.tsx`; `gamingDay` threaded from `PanelContainer` → `TablesPanel` → `GrindBuyinPanel` (DEC-EXEC-2) | CORE-OPERATIONAL-LOOP.md Category B | Phase 2.4 deliverables (CLOSED) | Delivered in Phase 2.4 |
| PWB-004 | `GrindBuyinPanel` operator surface completion — panel was mounted in Phase 2.4 as a producer proof-of-concept (PWB-003 closed), then **removed from `TablesPanel` on 2026-05-24** pending proper operator surface design. Three gaps blocked continued exposure: (1) no reversal/correction event — EXEC-088 §3.2 explicitly deferred the governed reversal RPC and any undo UI; (2) write path bypasses the service layer — `useLogGrindBuyin` calls `rpc_log_table_buyin_telemetry` directly from `createBrowserComponentClient` rather than through an API route + service; (3) GAP-TABLE-ROLLOVER-UI WS5 stub unresolved. Component (`components/table/grind-buyin-panel.tsx`) and hook (`hooks/table-context/use-buyin-telemetry.ts`) are **preserved** and not deleted — they are the starting point for this PRD. | `components/table/grind-buyin-panel.tsx`; `hooks/table-context/use-buyin-telemetry.ts`; GAP-TABLE-ROLLOVER-UI WS5; EXEC-088 §3.2 | Requires dedicated PRD | Panel removed 2026-05-24; component + hook preserved |

**Promotion rule:** PWB-003 was delivered in Phase 2.4 (2026-05-21). Does not graduate to post-Wave-2 backlog. Phase 2.5 sign-off must record its closure. PWB-004 is the post-Wave-2 continuation item — surface completion, not mounting.

**Sign-off language for known workflow coverage gaps:**

- `adjustment.recorded` — RPC-capable but not workflow-certified until rating-slip and rated MTL adjustment surfaces resolve `original_txn_id` per PROD-ANCHOR-STD-001.
- `fill.recorded` / `credit.recorded` — RPC/API-certified but not operator-workflow-certified until an operator-facing trigger surface exists.
- `grind.observed` — workflow-certified at mount level (PWB-003 closed); operator surface incomplete — no correction/reversal path, write bypasses service layer, rollover UI gap (WS5) unresolved. Full operator UX deferred to PWB-004.

Canonical sign-off phrase: **"Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued."** The sign-off must not use "Wave 2 complete" without this qualifier.

**PROD-ANCHOR-STD-001 lifecycle:**
- Phase 2.5: ratified as accepted governance standard in WAVE-2-SIGN-OFF.md
- Post-Wave-2 (PWB-001 PRD): standard enforced against both affected surfaces
- Until PWB-001 ships: `adjustment.recorded` remains a confirmed workflow-level gap; the outbox observability surface will show no rows for this event type from real operator workflows

---

## 11. Relationship to ROLLOUT-ROADMAP.md

This document is the detailed execution plan for Wave 2 described in outline at `ROLLOUT-ROADMAP.md §4`. The parent roadmap's §4 note ("Wave 2 will need its own roadmap") is fulfilled by this document.

ROLLOUT-ROADMAP.md remains the authoritative record for:
- Wave 1 phases (1.0–1.5) — all complete
- Pre-Wave-2 surface debt closure (PRD-080) — complete
- Cross-wave principles (§2) and rollout governance (§2.5)
- Q1–Q4 open question resolutions (§6)

This document supersedes any standalone `WAVE-2-ROADMAP.md` draft. The build-pipeline checkpoint at `.claude/skills/build-pipeline/checkpoints/PRD-081.json` is the machine-readable state for Phase 2.0.

---

```
Wave 2 changes what the system is.

The transport is proven.
The producers expand next.
The consumers follow the producers.
```
