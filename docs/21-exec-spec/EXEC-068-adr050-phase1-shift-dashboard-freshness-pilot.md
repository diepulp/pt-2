---
prd: PRD-068
prd_title: "ADR-050 Phase 1 Exemplar — Shift-Dashboard Financial Freshness Pilot"
service: ShiftIntelligence
mvp_phase: 2

# Driving Authority (no FIB chain — legacy PRD, GOV-010 waived)
driving_authority: ADR-050
scaffold_surrogate: docs/20-architecture/FINANCIAL-FRESHNESS-ROLLOUT.md
adr_refs: [ADR-050, ADR-004, ADR-015, ADR-031, ADR-041, ADR-049]
gov010_check: waived

# Write-path Classification
write_path_classification: detected
write_path_signals:
  - "W3 E2E exercises rated-buyin adjustment mutation path via rpc_create_financial_adjustment"
  - "Cross-tab realtime probe requires real operator commit flow"

workstreams:
  W0:
    name: Publication-membership migration (TBT)
    description: "ALTER PUBLICATION supabase_realtime ADD TABLE public.table_buyin_telemetry with idempotent guard; satisfies ADR-050 §4 E3 for FACT-RATED-BUYIN / shift-dashboard"
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_add_tbt_to_supabase_realtime.sql
    gate: schema-validation
    estimated_complexity: low

  W1:
    name: Rolling-window refactor (shift-dashboard-v3.tsx)
    description: "Replace frozen useState window at shift-dashboard-v3.tsx:87 with Date.now()-based recompute at query-function time; satisfies ADR-050 §4 E2"
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/shift-dashboard-v3/shift-dashboard-v3.tsx
      - components/shift-dashboard-v3/__tests__/shift-dashboard-v3.window-advance.test.tsx
    gate: test-pass
    estimated_complexity: low

  W2:
    name: Canonical LIVE realtime hook (use-shift-dashboard-realtime)
    description: "New hook subscribing postgres_changes on table_buyin_telemetry; invalidates shiftDashboardKeys.summary.* and .tableMetrics.* via registered factory (§4 E1); includes DD-1(c) centralized debounce for mutation/WAL coordination; bundles hook-mount edit into shift-dashboard-v3.tsx per DD-2"
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [W1]
    outputs:
      - hooks/shift-dashboard/use-shift-dashboard-realtime.ts
      - hooks/shift-dashboard/__tests__/use-shift-dashboard-realtime.test.tsx
      - hooks/shift-dashboard/__tests__/use-shift-dashboard-realtime.int.test.tsx
      - components/shift-dashboard-v3/shift-dashboard-v3.tsx
    gate: test-pass
    estimated_complexity: medium

  W3:
    name: Contract-property tests (E2E + E1 integration + E2 unit)
    description: "Playwright E2E (Mode B) at e2e/adr-050/ covering cross-tab 2s SLA, 30s polling fallback via NEXT_PUBLIC_E2E_DISABLE_REALTIME env flag, rolling-window correctness; integration test iterating fact×surface-scoped mutation-hook inventory for §4 E1 factory compliance"
    executor: e2e-testing
    executor_type: skill
    depends_on: [W0, W1, W2]
    outputs:
      - e2e/adr-050/exemplar-rated-buyin.spec.ts
      - e2e/adr-050/fixtures/shift-dashboard-fixture.ts
      - hooks/shift-dashboard/__tests__/e1-factory-compliance.int.test.ts
      - hooks/shift-dashboard/__tests__/__fixtures__/d1-mutation-hooks.ts
    gate: test-pass
    estimated_complexity: medium

  W4:
    name: Registry promotion + PRD-066 re-status
    description: "Amend REGISTRY_FINANCIAL_SURFACES.md row for FACT-RATED-BUYIN / shift-dashboard from PROPOSED → ACTIVE with concrete realtime_hook + window_correctness values; changelog entry; re-status PRD-066 frontmatter to Superseded with pointer to PRD-068"
    executor: lead-architect
    executor_type: skill
    depends_on: [W0, W1, W2, W3]
    outputs:
      - docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md
      - docs/10-prd/PRD-066-shift-dashboard-downstream-reconciliation-v0.md
    gate: type-check
    estimated_complexity: low

  W5:
    name: Replication Checklist authoring
    description: "Create docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md with four canonical sections per rollout §Phase 1; MUST capture DD-1(c) invalidation-coordination pattern with code example and edge cases; gates Phase 2 fan-out (exit criterion #3)"
    executor: lead-architect
    executor_type: skill
    depends_on: [W0, W1, W2, W3]
    outputs:
      - docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md
    gate: type-check
    estimated_complexity: medium

execution_phases:
  - name: Phase 1 - Foundation (publication + rolling window)
    parallel: [W0, W1]
    gates: [schema-validation, test-pass]

  - name: Phase 2 - Realtime hook + mount
    parallel: [W2]
    gates: [test-pass]

  - name: Phase 3 - Contract-property tests
    parallel: [W3]
    gates: [test-pass]

  - name: Phase 4 - Promotion + Replication Checklist
    parallel: [W4, W5]
    gates: [type-check]

gates:
  schema-validation:
    command: "supabase migration up && npm run db:types-local"
    success_criteria: "Migration applies cleanly (re-run idempotent); types unchanged; pg_publication_tables row present"

  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0"

  lint:
    command: "npm run lint"
    success_criteria: "Exit code 0 with max-warnings=0"

  test-pass:
    command: "npm test"
    success_criteria: "All unit + integration tests pass including window-advance, E1 factory compliance, and realtime hook invalidation paths"

  build:
    command: "npm run build"
    success_criteria: "Exit code 0"

external_dependencies:
  - component: "Supabase realtime"
    required_for: "W0 — publication membership activation; W2/W3 — WAL subscription delivery"
  - hook: "useRealtimeChannel (existing project pattern)"
    required_for: "W2 — subscription lifecycle, reconnect handling"
  - factory: "shiftDashboardKeys (existing key factory)"
    required_for: "W2, W3 — §4 E1 compliance"
  - rpc: "rpc_create_financial_adjustment, rpc_create_financial_txn"
    required_for: "W3 — operator mutation flow under test; unchanged by this PRD (out of scope)"

# Design Decisions (resolved during Stage 2 expert consultation)
decisions:
  - decision_id: DEC-W1-MECHANISM
    subject: "Rolling-window mechanism (W1)"
    resolved: "(a) recompute window_end at query-function time using Date.now() + configured span"
    rationale: "Panels are rolling clock windows, not gaming-day-bound. Simplest, stateless, advances with React Query refetch cadence. (b) tick-counter adds state; (c) gaming-day would misuse temporal authority for non-gaming-day window."
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-DD1-COORDINATION
    subject: "F5 invalidation-coordination pattern (§5.3 of PRD)"
    resolved: "(c) documented hybrid — keep mutation-side invalidation; add centralized debounce in W2 WAL hook so WAL-side invalidation suppressed within ~500ms of any preceding shiftDashboardKeys invalidation"
    rationale: "Only option that scales to N in-scope mutation hooks without per-hook edits. Centralized debounce in the WAL hook — new mutation hooks just call the factory; coordination is transparent. (a) requires editing every mutation hook to delete invalidation. (b) requires mutation↔WAL sequence correlation that mutations don't carry."
    scales_to_n_mutation_hooks: true
    verification: assumption
    assumption_flag: "Assumes queryClient exposes an invalidation observer API or can be wrapped. Fallback: mutation-side helper markRecentShiftDashboardInvalidation(casinoId) invoked alongside factory invalidation — still scales to N with one-line per-hook change. Verify at W2 implementation."
    impact_on_scope: none
    capture_in: "W5 Replication Checklist — Invalidation-Coordination Pattern section"

  - decision_id: DEC-DD2-COEDIT
    subject: "W1 + W2 co-editing shift-dashboard-v3.tsx"
    resolved: "Bundle W1 and W2 into single PR (same executor, same file); workstream graph expresses W2 depends_on W1 to enforce ordering inside the bundle"
    rationale: "Eliminates rebase risk; reviewers see window refactor + hook mount together as one conceptual slice ('make this surface LIVE'); halves review cost."
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-W3-MODE
    subject: "Playwright E2E auth mode"
    resolved: "Mode B (browser login)"
    rationale: "Cross-tab realtime probe requires real browser context. Mode A (dev bypass) fails SECURITY DEFINER RPC (auth.uid() NULL per ADR-024). Mode C (Bearer-token client, no browser) cannot exercise cross-tab or UI rolling-window interaction."
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-W3-DISCONNECT
    subject: "Degraded-realtime simulation (Probe 2)"
    resolved: "Test-only env flag NEXT_PUBLIC_E2E_DISABLE_REALTIME — deterministic skip of subscription mount, polling fallback (30s) handles update delivery"
    rationale: "page.routeWebSocket flaky across Playwright/Supabase SDK versions. Env flag is deterministic and easy to maintain for Phase 1 pilot."
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-ARCHIVAL
    subject: "Archival of legacy EXEC-066/066a/066b + 3 investigation memos"
    resolved: "LEAVE OFF this EXEC-SPEC; reference from W5 Replication Checklist's historical-context section"
    rationale: "PRD §8 explicitly demotes archival from DoD to documentation note. Keeping it off this exec-spec preserves the pilot's 'one fact × one surface' scope; referencing from W5 ensures it is not forgotten."
    verification: cited
    impact_on_scope: none

risks:
  - risk: "Double-refetch per mutation if DEC-DD1 debounce mechanism cannot be implemented as designed (no queryClient observer API)"
    mitigation: "Documented fallback: per-hook markRecentShiftDashboardInvalidation(casinoId) helper. Verified at W2 implementation. Not a correctness risk (data is consistent either way), only a performance risk (wasted round-trip)."
  - risk: "2s cross-tab LIVE SLA probe is CI-timing-sensitive; p95 may drift above 2500ms under loaded runners"
    mitigation: "Outer timeout 5s with semantic assertion at 2000ms intent; Playwright retries=2 in CI config; flag regression if sustained drift observed"
  - risk: "Fact×surface mutation-hook discovery (W3 Layer 2) may miss hooks added between PRD ship and Phase 2"
    mitigation: "Fixture at hooks/shift-dashboard/__tests__/__fixtures__/d1-mutation-hooks.ts directs Phase 2 authors to re-run discovery; optional Phase 5.x CI check to flag new PFT-writing hooks"
  - risk: "WAL event volume from TBT publication may surprise given no prior baseline (first user-table in supabase_realtime)"
    mitigation: "Rate is operator-driven (not background). Post-deploy 24h check of pg_stat_replication.replay_lag. Rollout Phase 5.4 (CI pub-membership check) handles systemic coverage."
  - risk: "Slice-specific ADR-050 exception discovered during implementation invalidates exit criterion #4"
    mitigation: "If structural, this PRD's exit is partial; Phase 2 does not begin. Replication Checklist (W5) captures any exception with explicit rationale."

---

# EXECUTION-SPEC: PRD-068 — ADR-050 Phase 1 Exemplar

## Overview

This EXEC-SPEC delivers the **first worked application** of ADR-050's Financial Surface Freshness Contract: making the shift-dashboard surface observe `FACT-RATED-BUYIN` via the contract's four declarations (D1–D4) and three enforcement rules (E1/E2/E3).

The deliverable is **pilot-scoped** (one fact × one surface) and **pattern-codifying** (W5 Replication Checklist is the exit-criterion #3 artifact gating Phase 2 fan-out). Of the six workstreams, W0–W3 ship compliance; W4–W5 convert the result into a mechanically replicable pattern.

This is a **consumer-led observability slice**: Shift Intelligence observes `table_buyin_telemetry` (owned by Financial Telemetry) via a new canonical realtime hook. No writes, no RLS delta, no SECURITY DEFINER, no new API surfaces. Complexity sits in *coordination* (DEC-DD1) not *construction*.

## Scope

### In Scope (strictly)

- Publication membership activation for `table_buyin_telemetry`
- Rolling-window refactor at `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` (inline only; no `useRollingWindow` extraction per PRD §7.5)
- New canonical realtime hook `hooks/shift-dashboard/use-shift-dashboard-realtime.ts`
- Invalidation coordination pattern (DEC-DD1 resolution — hybrid with centralized debounce)
- Contract-property test suite (E2E + integration + unit) covering §4 E1/E2/E3 for this fact × surface pair
- Registry row promotion (`FACT-RATED-BUYIN` / shift-dashboard: PROPOSED → ACTIVE)
- Replication Checklist authoring
- PRD-066 frontmatter re-status to Superseded

### Out of Scope (explicit, per PRD §2.3)

- Phase 2 fan-out (2.A cash-obs, 2.B pit-approvals, 2.C session-custody)
- Phase 3 MTL slice (blocked on P0.3)
- PFT RLS re-audit (P0.4 / Registry OVI #1)
- Rating-slip ↔ MTL reverse bridge (deferred under PRD-065)
- Changes to `trg_bridge_finance_to_telemetry` or PFT write paths
- Deprecation or replacement of `useDashboardRealtime` (Registry OVI #5 — separate track)
- Dead-invalidation cleanup at `hooks/mtl/use-mtl-mutations.ts` (Registry OVI #4)
- §4 E1 ESLint rule implementation (rollout Phase 5.1)
- Shared UI components (`<AsOfBadge />` — rollout Phase 5.2 if needed)
- Archival of legacy EXEC-066/066a/066b (documentation note, not DoD)

## Architecture Context

### Driving authority

- **ADR-050** (ACCEPTED 2026-04-19): Financial Surface Freshness Contract — D1/D2/D3/D4 declarations and E1/E2/E3 enforcement
- **FINANCIAL-FRESHNESS-ROLLOUT.md** §Phase 1 — workstream shape, exit criteria
- **REGISTRY_FINANCIAL_SURFACES.md** — `FACT-RATED-BUYIN` registered row (currently PROPOSED)

### Cross-context posture

- **Consumer**: Shift Intelligence (shift-dashboard surface)
- **D2 table owner**: Financial Telemetry (`table_buyin_telemetry`)
- **D1 table owner**: Financial Services (`player_financial_transaction`)
- **Derivation edge**: `trg_bridge_finance_to_telemetry` — unchanged by this PRD

The realtime hook subscribes cross-context (Shift Intelligence consumes a Financial Telemetry WAL stream). ADR-050 explicitly charters this pattern; it is not a bypass of service boundaries.

### Related ADRs (cited, not superseded)

- **ADR-004** — Real-time strategy (extended by ADR-050 in the financial domain)
- **ADR-015** — RLS hybrid Pattern C (used by TBT for casino-scope isolation)
- **ADR-031** — Financial amount convention
- **ADR-041** — Surface governance standard (REGISTRY_FINANCIAL_SURFACES is ADR-050's domain-specific registry)
- **ADR-049** — Operator action atomicity

## Workstream Details

### W0: Publication-membership migration (TBT)

**Purpose**: Activate WAL publication for `table_buyin_telemetry` so the shift-dashboard realtime hook can receive `postgres_changes` events. Satisfies §4 E3.

**Deliverables**:
1. One migration under `supabase/migrations/` with timestamp generated at implementation time (`date +%Y%m%d%H%M%S`)
2. Content: idempotent `DO`-block guard wrapping `ALTER PUBLICATION supabase_realtime ADD TABLE public.table_buyin_telemetry`
3. Header comment block: ADR-050 reference, P0.2 audit commit (`f52d34ca`), affected tables, reversibility recipe

**Acceptance Criteria**:
- [ ] `supabase migration up` applies cleanly (and is safe to re-run — idempotent guard verified)
- [ ] `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='table_buyin_telemetry'` returns 1 row post-apply
- [ ] `npm run db:types-local` exits 0 with no diff (publication membership not part of generated types)
- [ ] Rollback recipe documented in header comment: `ALTER PUBLICATION supabase_realtime DROP TABLE public.table_buyin_telemetry;` — with NFR3 note that rollback demotes the registry row

**Observability (non-blocking)**: 24h post-deploy check of `pg_stat_replication.replay_lag`; flagged as anchor entry for rollout Phase 5.4 CI pub-membership check.

### W1: Rolling-window refactor

**Purpose**: Replace the frozen-window `useState(() => window)` at `shift-dashboard-v3.tsx:87` with a Date.now()-based recompute at query-function time. Satisfies §4 E2.

**Mechanism (per DEC-W1-MECHANISM)**: recompute `window_end` inside the queryFn (or refetch-scoped selector) from `Date.now()` + configured span. Operator picker override preserved conditionally — if a ref/state holds an explicit operator-selected window, rolling recompute is bypassed.

**Deliverables**:
1. Edit `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` area (replace `useState` pattern)
2. Unit test at `components/shift-dashboard-v3/__tests__/shift-dashboard-v3.window-advance.test.tsx` — fake-timer assertion that `window_end(T+refetch) > window_end(T+0)`

**Acceptance Criteria**:
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0 (max-warnings=0)
- [ ] Window-advance unit test passes
- [ ] `rpc_shift_table_metrics` call signature unchanged

### W2: Canonical LIVE realtime hook

**Purpose**: Ship the first canonical financial-domain realtime hook. Subscribe `postgres_changes` on `table_buyin_telemetry` and invalidate shift-dashboard keys via the registered factory (§4 E1 compliance).

**Deliverables**:
1. Hook: `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` — casino-scoped channel name, `casino_id=eq.${casinoId}` filter, reuses existing `useRealtimeChannel` for subscription lifecycle
2. DEC-DD1 debounce implementation — centralized in the WAL hook; suppresses WAL-side invalidation within ~500ms of any preceding `shiftDashboardKeys` invalidation
3. Unit test `.test.tsx` — mock `useRealtimeChannel`, fire onEvent, assert invalidation via factory (NOT inline array); assert debounce swallows redundant event
4. Integration test `.int.test.tsx` — real React Query client + mock subscription emitter; assert §4 E1 compliance on observed invalidation path
5. Mount-site edit: one-line addition to `components/shift-dashboard-v3/shift-dashboard-v3.tsx` (bundled with W1's PR per DEC-DD2)

**Acceptance Criteria**:
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0 (max-warnings=0, no `as any`, no inline `queryKey: [...]` literals)
- [ ] Unit + integration tests pass
- [ ] Channel name pattern: `shift-dashboard-rated-buyin-${casinoId}`
- [ ] All invalidations use `shiftDashboardKeys.*` factory (§4 E1)
- [ ] DEC-DD1 assumption verified during implementation (queryClient observer API available OR fallback helper adopted)

### W3: Contract-property tests

**Purpose**: Prove the contract holds at runtime. Three test layers per F6/F7/FR7 of PRD; fact×surface scope for Layer 2 per FR7.

**Deliverables**:

**Layer 1 — Playwright E2E (Mode B, browser login)** at `e2e/adr-050/exemplar-rated-buyin.spec.ts`:
- Probe 1: cross-tab 2s LIVE SLA (Tab A commits adjustment via `rpc_create_financial_adjustment`; Tab B panels update within 2s via WAL propagation; `context.newPage()` shares auth)
- Probe 2: polling fallback 30s — `NEXT_PUBLIC_E2E_DISABLE_REALTIME=true` env flag disables subscription; rolling-window fix allows polling to deliver fresh aggregate
- Probe 3: rolling-window correctness — mount dashboard; commit adjustment without reload; assert aggregate reflects post-mount mutation without user interaction

**Layer 2 — Integration test (§4 E1 fact×surface compliance)** at `hooks/shift-dashboard/__tests__/e1-factory-compliance.int.test.ts`:
- Fixture `__fixtures__/d1-mutation-hooks.ts` enumerates the in-scope mutation-hook inventory (hooks writing to `player_financial_transaction` D1 that affect shift-dashboard keys)
- Test iterates fixture; asserts every shift-dashboard-key invalidation uses `shiftDashboardKeys.*` factory

**Layer 3 — Unit test (§4 E2 window-advance)** — owned by W1 (listed here so W3 gate covers it)

**Acceptance Criteria**:
- [ ] `npx playwright test e2e/adr-050/exemplar-rated-buyin.spec.ts --reporter=list` — all probes pass
- [ ] `npm test hooks/shift-dashboard/__tests__/e1-factory-compliance.int.test.ts` — fact×surface compliance passes
- [ ] Fixture enumerates and rationalizes each hook in the in-scope set
- [ ] Flake mitigation: outer 5s timeout with semantic 2000ms intent; Playwright `retries=2` in CI config
- [ ] Test describe blocks labeled per QA-006: `'E2E — Mode B (browser login)'`

### W4: Registry promotion + PRD-066 re-status

**Purpose**: Convert compliance into a durable ledger entry. Promote registry row; re-status superseded PRD.

**Deliverables**:
1. Amend `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md`:
   - `FACT-RATED-BUYIN` / shift-dashboard row: `PROPOSED` → `ACTIVE`
   - `realtime_hook`: `hooks/shift-dashboard/use-shift-dashboard-realtime.ts`
   - `window_correctness`: concrete reference to `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` with rolling-window mechanism summary (Date.now()-based)
   - Changelog entry with PR reference and DEC-DD1 one-liner
2. Amend `docs/10-prd/PRD-066-shift-dashboard-downstream-reconciliation-v0.md` frontmatter:
   - `status: Draft` → `status: Superseded`
   - Add `superseded_by: PRD-068` pointer

**Acceptance Criteria**:
- [ ] Registry row shows `ACTIVE` with concrete file refs
- [ ] Changelog entry present
- [ ] PRD-066 frontmatter re-statused with pointer
- [ ] `npm run type-check` exits 0 (no code change; gate trivially passes)

### W5: Replication Checklist authoring

**Purpose**: Codify the pattern so Phase 2 slices are mechanical, not re-derived. Exit criterion #3 of rollout §Phase 1.

**Deliverables**:
Create `docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md` with four canonical sections:

1. **What changed, where, in what order** — file-level delta ordered by dependency (W0 → W1 → W2 → W3 → W4). One entry per file with a sentence on what each change accomplishes in contract terms.
2. **Invalidation-coordination pattern** — DEC-DD1(c) hybrid with centralized debounce. Full code example of the debounce mechanism, the assumption flag (queryClient observer API) and the documented fallback helper pattern. Edge cases: WAL reconnect after debounce window; multi-casino multi-tab concurrent writes; same-tab rapid sequential mutations.
3. **Pitfalls encountered** — anything that surfaced during implementation worth Phase 2 knowing. (Populated at implementation; common candidates: type-regeneration expectations after publication-only migration; `useRealtimeChannel` edge cases; casino_id filter syntax for RLS-scoped subscriptions.)
4. **Slice-specific ADR exceptions** — any ADR-050 clause this slice had to work around or extend. If NONE, state so explicitly — it satisfies exit criterion #4. If present, describe precisely and classify: **structural** (invalidates replication viability) vs **cosmetic** (inherited by Phase 2 but doesn't block).

Also includes a **Historical-context footer** referencing the legacy EXEC-066/066a/066b + 3 investigation memos (DEC-ARCHIVAL).

**Acceptance Criteria**:
- [ ] Document exists at `docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md`
- [ ] All four sections present and substantive
- [ ] DEC-DD1 pattern described with code example + edge cases
- [ ] Exit criterion #4 statement explicit (exceptions: none / structural / cosmetic)
- [ ] Linked from the registry row's `replication_checklist` column (or equivalent)

## Definition of Done

**Functionality**
- [ ] W0–W5 all complete
- [ ] Win/Loss and Est. Drop panels reflect committed rated buy-in / adjustment within 2s nominal / 30s degraded (cross-tab and same-tab)
- [ ] Rolling-window refactor satisfies §4 E2

**Data & Integrity**
- [ ] `table_buyin_telemetry` is a declared member of `supabase_realtime` publication
- [ ] `trg_bridge_finance_to_telemetry` unchanged
- [ ] No change to `player_financial_transaction` write path or RLS

**Security & Access**
- [ ] Realtime channel scoped by `casino_id` (Pattern C direct casino-scope RLS on TBT already verified by P0.1b sweep)
- [ ] No new RLS policies authored; no SECURITY DEFINER changes

**Testing**
- [ ] E2E probe covers LIVE SLA (2s realtime / 30s fallback) and rolling-window correctness
- [ ] Integration test covers §4 E1 factory compliance on fact×surface-scoped mutation-hook inventory
- [ ] Unit test covers rolling-window advance mechanism
- [ ] All tests pass locally; E2E promoted to CI-Advisory if feasible (Required-tier promotion is out of scope)

**Operational Readiness**
- [ ] Publication migration reversible (`DROP TABLE` rollback recipe in header)
- [ ] Realtime hook includes graceful disconnect / reconnect via existing `useRealtimeChannel` pattern
- [ ] Basic logging on WAL event arrival + invalidation fire (existing pattern only)

**Documentation**
- [ ] `REGISTRY_FINANCIAL_SURFACES.md` row updated with concrete `realtime_hook` and `window_correctness` values; changelog entry added
- [ ] PRD-066 re-statused `Superseded` with pointer to PRD-068
- [ ] Replication Checklist authored and linked from registry row

**Phase 1 Exit Criteria (per FINANCIAL-FRESHNESS-ROLLOUT.md §Phase 1)**
- [ ] **#1** — W0–W4 all merged (this EXEC adds W5 as the checklist workstream explicitly)
- [ ] **#2** — Registry row `ACTIVE`
- [ ] **#3** — Replication Checklist written, including the invalidation-coordination pattern per DEC-DD1
- [ ] **#4** — Replication viability confirmed (no undocumented slice-specific ADR exceptions)

**Phase 2 Gate (downstream posture)**
- Phase 2 fan-out (2.A / 2.B / 2.C) does not begin until all four exit criteria above are satisfied. Pilot-containment guarantee.

---
