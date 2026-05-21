---
id: EXEC-088
title: Wave 2 Phase 2.4 — Consumer Expansion: Operational Telemetry Projection
prd: PRD-088
prd_path: docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection-v0.md
fib_h: FIB-H-TRANSACTIONAL-OUTBOX
fib_s: null
status: pending
created: 2026-05-21
complexity_prescreen: full
fib_s_loaded: false
write_path_classification: detected
read_boundary_classification: "GET /api/v1/table-context/operational-projection is a read-only projection route exception; http_boundary:false means no new HTTP write boundary, not no new read route"
e2e_mandate_waiver: "relay-cron-internal + grind-panel-write-via-existing-rpc — (1) rpc_claim_operational_outbox_batch and rpc_process_operational_projection are service_role-only SECURITY DEFINER RPCs invoked by Vercel cron; no browser-triggerable operator write surface exists for these paths; (2) GrindBuyinPanel mount exposes the pre-existing useLogGrindBuyin mutation hook (rpc_log_table_buyin_telemetry GRIND_BUYIN path existed since Phase 2.1 — this is surfacing not introducing a write path); write-path coverage via WS5_TESTS I3/I4 integration invariant tests + consumer unit tests + RLS/grant tests; DoD grind-panel verification via /admin/outbox-observability admin surface observation within one relay cycle"
gov010_check: "waived:wave-2-phase-2.4-continuation-governing-adrs-in-affects-field"
workstreams:
  WS1_DB:
    name: "Operational Projection Store & Consumer RPCs"
    executor: backend-service-builder
    executor_type: skill
    type: database
    bounded_context: PlayerFinancialService
    depends_on: []
    estimated_complexity: high
    outputs:
      - supabase/migrations/{ts}_create_shift_operational_projection.sql
      - supabase/migrations/{ts}_create_rpc_claim_operational_outbox_batch.sql
      - supabase/migrations/{ts}_create_rpc_process_operational_projection.sql
      - supabase/migrations/{ts}_create_idx_finance_outbox_operational_backlog.sql
    patterns:
      - "ADR-056: SECURITY DEFINER with SET search_path = '' on both RPCs"
      - "ADR-018: REVOKE from anon/authenticated; GRANT EXECUTE to service_role only"
      - "Phase 2.3 claim CTE pattern (rpc_claim_class_a_outbox_batch): FOR UPDATE SKIP LOCKED + atomic delivery_attempts increment"
      - "Poison-row containment: operational claim excludes rows with delivery_attempts >= 5; relay/observability reports those rows as operationalDeadLetter without adding a new table or claim-lease column"
      - "Phase 2.3 process RPC atomicity pattern adapted for operational payload validation: fetch row → ownership-check → payload validation → idempotency insert → projection-upsert → processed_at, all in one PG transaction"
    acceptance_criteria:
      - "shift_operational_projection exists with PK (casino_id, gaming_day, table_id); all amount columns BIGINT NOT NULL DEFAULT 0; FK to casino(id) and gaming_table(id) ON DELETE CASCADE"
      - "RLS ENABLED on shift_operational_projection; zero authenticated or anon policies; REVOKE ALL FROM anon, authenticated executed"
      - "rpc_claim_operational_outbox_batch: SECURITY DEFINER, SET search_path = '', service_role EXECUTE only; claims only fact_class='operational' AND event_type IN ('grind.observed','fill.recorded','credit.recorded') AND processed_at IS NULL AND delivery_attempts < 5 using FOR UPDATE SKIP LOCKED; updates last_attempted_at and delivery_attempts atomically in same CTE"
      - "rpc_process_operational_projection: SECURITY DEFINER, SET search_path = '', service_role EXECUTE only; return values are exactly 'processed' | 'duplicate' | 'skipped_ledger' | 'skipped_unknown' | 'not_found'"
      - "Ownership verified BEFORE processed_messages insert: ledger rows → 'skipped_ledger' (no processed_at, no insert); unknown operational event_type → 'skipped_unknown' (no processed_at, no insert)"
      - "Operational payload guard: owned operational events require payload.amount_cents to be a non-null integer cents value >= 0 before projection mutation"
      - "Malformed owned operational event payload raises/returns an error with no processed_at stamp, no processed_messages insert, and no shift_operational_projection mutation"
      - "Idempotency: processed_messages INSERT ON CONFLICT DO NOTHING occurs AFTER ownership and payload validation; conflict → 'duplicate' with no projection write"
      - "Projection UPSERT accumulates: grind.observed → grind_volume_cents += payload->>'amount_cents'; fill.recorded → fill_total_cents +=; credit.recorded → credit_total_cents +=; all → event_count += 1, updated_at = now()"
      - "idx_finance_outbox_operational_backlog partial index exists on finance_outbox(casino_id, gaming_day, table_id, event_id) WHERE processed_at IS NULL AND fact_class='operational' AND event_type IN (...)"
      - "npm run db:types-local exits 0; shift_operational_projection, rpc_claim_operational_outbox_batch, rpc_process_operational_projection all appear in generated types"
    implementation_notes:
      - "CRITICAL — payload field is 'amount_cents' (not 'amount'). Confirmed from rpc_record_grind_observation (jsonb_build_object('amount_cents', p_amount_cents)) and fill/credit RPCs in PRD-038 migration. Class A ledger events use 'amount'; operational events use 'amount_cents'. The process RPC must validate v_payload->>'amount_cents' is present, integer cents, and >= 0 before casting/mutating projection state."
      - "SRM registration is a verification gate: confirm shift_operational_projection is registered under PlayerFinancialService; if absent, WS6 must patch SRM before closure"
      - "All four migrations must sort AFTER 20260519184710 — generate timestamps with 'date +%Y%m%d%H%M%S'"
      - "No claimed_until column — claim leases are post-Wave-2; any claimed_until reference is a Phase 2.4 violation (verified by WS5 source/migration test)"
      - "processed_messages remains global by event_id — do not add type or casino_id partitioning"
      - "Migration pre-state assertions required (follow 20260519184708 pattern): assert gaming_day NOT NULL on finance_outbox, assert processed_messages exists, assert gaming_day_lifecycle exists"
      - "UPSERT uses additive accumulation: ON CONFLICT (casino_id, gaming_day, table_id) DO UPDATE SET grind_volume_cents = shift_operational_projection.grind_volume_cents + EXCLUDED.grind_volume_cents (for grind), etc."
    gate: schema-validation

  WS2_CONSUMER:
    name: "Operational Consumer Service & Relay Dispatch"
    executor: backend-service-builder
    executor_type: skill
    type: service-layer
    bounded_context: PlayerFinancialService
    depends_on: [WS1_DB]
    estimated_complexity: medium
    outputs:
      - services/player-financial/outbox-operational-consumer.ts
      - services/player-financial/dtos.ts
      - app/api/internal/outbox-relay/route.ts
    patterns:
      - "Mirror services/player-financial/outbox-consumer.ts (Class A consumer — Phase 2.3)"
      - "ADR-056: createServiceClient() required — both RPCs are SECURITY DEFINER service_role only"
      - "Relay route: CRON_SECRET auth guard, stop-before-deadline window, BATCH_SIZE constant"
    acceptance_criteria:
      - "runOperationalConsumer() exported from outbox-operational-consumer.ts; signature: (supabase: SupabaseClient<Database>) => Promise<{ processed: number; duplicate: number; errors: Error[] }>"
      - "Calls rpc_claim_operational_outbox_batch(p_batch_size), iterates rows, calls rpc_process_operational_projection per row; accumulates processed/duplicate/errors"
      - "'processed' and 'duplicate' both increment their counters (both are non-error outcomes); Error objects pushed to errors[]"
      - "'skipped_ledger', 'skipped_unknown', and 'not_found' process outcomes are treated as errors in the consumer result; no successful relay response may silently drop skipped/not_found outcomes"
      - "Consumer does NOT call rpc_acknowledge_outbox_delivery (operational events use processed_at stamped by the RPC atomically — no separate acknowledgement step)"
      - "OperationalConsumerResultDTO in dtos.ts: standalone type { processed: number; duplicate: number; errors: string[] } (errors serialized for DTO boundary; skipped/not_found outcomes are represented as errors unless explicit skipped/notFound counters are added)"
      - "Relay route second branch runs AFTER Class A branch; if operational branch throws, error is caught, Class A result is preserved in response"
      - "Relay response includes both classA and operational result objects"
      - "Relay or outbox observability response distinguishes ledger backlog, claimable operational backlog (delivery_attempts < 5), and operationalDeadLetter backlog (delivery_attempts >= 5); a single undifferentiated processed_at IS NULL backlog count is insufficient for Phase 2.4 diagnostics"
      - "Operational BATCH_SIZE <= Class A BATCH_SIZE (50) — cap at 25 initially"
      - "npm run type-check exits 0"
    implementation_notes:
      - "Read services/player-financial/outbox-consumer.ts before writing — mirror ConsumerResult type pattern and error handling exactly"
      - "IMPORTANT: relay route currently calls rpc_acknowledge_outbox_delivery after each Class A row. The operational branch does NOT call rpc_acknowledge_outbox_delivery — rpc_process_operational_projection already stamps processed_at atomically. Do not add acknowledge calls to operational branch."
      - "runOperationalConsumer receives supabase SupabaseClient<Database> — same signature as runConsumer — relay route passes same service client to both branches"
      - "Stop-before-deadline check applies to combined loop — if deadline is already breached when operational branch starts, skip it"
      - "OperationalConsumerResult (internal, errors: Error[]) is distinct from OperationalConsumerResultDTO (DTO, errors: string[]) — keep separate"
    gate: type-check

  WS3_COMPLETENESS:
    name: "Completeness Derivation & Surface Authority Updates"
    executor: api-builder
    executor_type: skill
    type: route-handlers
    bounded_context: PlayerFinancialService
    depends_on: [WS1_DB]
    estimated_complexity: medium
    outputs:
      - services/player-financial/crud.ts
      - services/player-financial/dtos.ts
      - hooks/table-context/use-buyin-telemetry.ts
      - components/table/grind-buyin-panel.tsx
      - app/api/v1/table-context/operational-projection/route.ts
      - docs/25-api-data/api-surface.openapi.yaml
    patterns:
      - "Mirror getVisitClassACompleteness() — same three-step pattern (projection row → lifecycle → backlog)"
      - "ADR-054 R4: authority degradation — 'actual' + 'estimated' → 'estimated'; non-negotiable"
      - "ADR-054: origin_label travels unchanged; no layer may upgrade 'estimated'"
      - "Phase 2.3 service-role injection pattern: client passed in from caller, function does not create its own"
      - "api-builder route pattern: ServiceHttpResult<T>, withServerAction, casinoId from rlsContext not query param"
    acceptance_criteria:
      - "getShiftOperationalCompleteness(supabase, casinoId, gamingDay, tableId) exported from crud.ts; does not call createServiceClient() internally"
      - "Step 1: no shift_operational_projection row, no gaming_day_lifecycle row → 'unknown'"
      - "Step 2: no shift_operational_projection row, lifecycle closed, and table-scoped operational backlog = 0 → 'complete' with zero totals (zero-event closed table/day)"
      - "Step 3: projection exists, no gaming_day_lifecycle row → 'partial'"
      - "Step 4: projection exists, lifecycle closed, table-scoped backlog (fact_class='operational', event_type IN (...), processed_at IS NULL, AND casino_id + gaming_day + table_id match) > 0 → 'partial'"
      - "Step 5: all satisfied → 'complete'"
      - "completeness.status values strictly 'complete' | 'partial' | 'unknown' only — no new values"
      - "Mixed-class surfaces (operational + Class A) emit type: 'estimated' for combined values"
      - "useGrindBuyinTotal() updated to accept gamingDay: string instead of shiftWindow; queries operational-projection route instead of table_buyin_telemetry directly"
      - "GrindBuyinPanel prop interface updated from shiftWindow: {startTs, endTs} to gamingDay: string; no shiftWindow prop remains in the panel or useGrindBuyinTotal call path"
      - "Operational projection route response DTO is declared in services/player-financial/dtos.ts as { totalCents: number; count: number; completeness: { status: 'complete' | 'partial' | 'unknown' }; type: 'estimated' }"
      - "GET /api/v1/table-context/operational-projection uses createServiceClient(); casinoId derived from rlsContext (not from query param alone)"
      - "GET /api/v1/table-context/operational-projection is explicitly classified as a read-only projection route exception; http_boundary:false means no new HTTP write boundary"
      - "Route authorization test proves casinoId is derived from authenticated context and any request-supplied casinoId is ignored or rejected"
      - "docs/25-api-data/api-surface.openapi.yaml includes the GET /api/v1/table-context/operational-projection contract; npm run openapi:validate exits 0 if OpenAPI validation is available in the current checkout"
      - "npm run type-check exits 0"
    implementation_notes:
      - "SURFACE DISCOVERY — REQUIRED FIRST STEP: grep for 'table_buyin_telemetry', 'rpc_shift_table_metrics', 'grind_cents', 'fills_total', 'credits_total', 'useGrindBuyinTotal' across services/, hooks/, app/api/, components/. Known confirmed surface: hooks/table-context/use-buyin-telemetry.ts (line 43: .from('table_buyin_telemetry')). Document all discovered surfaces before modifying any."
      - "HOOK INTERFACE CHANGE (WS4 coordination): useGrindBuyinTotal currently accepts shiftWindow: {startTs, endTs}. After update, accept gamingDay: string (DATE string matching shift_operational_projection PK). This change also requires updating GrindBuyinPanel's internal call site — treat as a small coordinated change with WS4."
      - "UNDO DECISION — Phase 2.4 does not model negative grind reversals as valid operational projection inputs. Remove or disable the current useUndoGrindBuyin negative GRIND_BUYIN path for this mounted surface unless a governed reversal event is introduced in a separate spec."
      - "shift_operational_projection is service_role-only. The new GET route must: (1) authenticate via withServerAction, (2) read casinoId from rlsContext, (3) call createServiceClient() for DB read. Request-supplied casinoId alone is not an authorization boundary per PRD §5.1."
      - "Backlog check is TABLE-SCOPED: WHERE casino_id + gaming_day + table_id all match the specific table. A pending row for another table on the same gaming_day does not affect this table's completeness."
      - "Authority degradation: any surface showing grind/fill/credit totals alongside Class A visit totals must display type: 'estimated' for the combined value. Do not show type: 'actual' for any shift_operational_projection-derived value."
    gate: type-check

  WS4_PANEL:
    name: "GrindBuyinPanel Table-Context Mounting"
    executor: frontend-design-pt-2
    executor_type: skill
    type: react-components
    bounded_context: PlayerFinancialService
    depends_on: [WS3_COMPLETENESS]
    estimated_complexity: low
    outputs:
      - components/pit-panels/tables-panel.tsx
    patterns:
      - "Mode A (Extending Existing Surface): read adjacent panels in tables-panel.tsx before mounting"
      - "Conditional mount: render only when selectedTable is non-null (same guard as all other table-context panels)"
      - "No new global/Zustand state; gamingDay comes from existing PanelContainer gamingDay prop and may be threaded as a bounded TablesPanel prop"
    acceptance_criteria:
      - "GrindBuyinPanel imported from '@/components/table/grind-buyin-panel' in tables-panel.tsx"
      - "GrindBuyinPanel rendered only within selectedTable non-null guard block"
      - "tableId={selectedTable.id} and casinoId={casinoId} passed from existing in-scope values"
      - "gamingDay passed from the existing PanelContainer gamingDay prop (gamingDay?.date) into TablesPanel and then GrindBuyinPanel; do not use selectedTable.gaming_day unless DashboardTableDTO is explicitly extended in the same slice"
      - "Panel is reachable via normal navigation: Pit Dashboard → select a table → GrindBuyinPanel is visible"
      - "type-check proves GrindBuyinPanel receives a valid gamingDay string; render is guarded until gamingDay is present; no new Zustand/global state is introduced solely to pass gamingDay"
      - "npm run type-check exits 0"
    implementation_notes:
      - "PRE-EDIT VERIFICATION — inspect components/pit-panels/panel-container.tsx and confirm gamingDay?.date is already available; thread that existing value to TablesPanel rather than deriving from selectedTable."
      - "DEPENDS ON WS3 COMPLETING hook interface change first: GrindBuyinPanel currently requires shiftWindow: {startTs, endTs}. WS3 updates useGrindBuyinTotal to accept gamingDay: string. After WS3, pass PanelContainer's existing gamingDay?.date through TablesPanel to GrindBuyinPanel and guard render if absent. Execute WS4 AFTER WS3 gate passes."
      - "Mount location: inside the selectedTable guard block in tables-panel.tsx (around line 151 onward), alongside existing fill/credit/inventory panels. Confirm exact line by reading current file before editing."
      - "Do not add new Zustand/global state. A bounded TablesPanel gamingDay prop is allowed because PanelContainer already owns gamingDay for sibling panels."
      - "No visual changes to GrindBuyinPanel component itself — Mode A: match existing panel spacing and guard patterns."
    gate: type-check

  WS5_TESTS:
    name: "I3/I4 Re-Verification & Consumer Test Suite"
    executor: qa-specialist
    executor_type: skill
    type: unit-tests
    bounded_context: PlayerFinancialService
    depends_on: [WS2_CONSUMER, WS3_COMPLETENESS, WS4_PANEL]
    estimated_complexity: medium
    outputs:
      - tests/failure/i3-idempotency-operational-projection.test.ts
      - tests/failure/i4-replay-operational-projection.test.ts
      - services/player-financial/__tests__/outbox-operational-consumer.test.ts
      - services/player-financial/__tests__/operational-projection-authority.test.ts
      - services/player-financial/__tests__/operational-completeness.int.test.ts
    patterns:
      - "ADR-044 S4: /** @jest-environment node */ directive on all server-side test files"
      - "ADR-044 S5: integration tests guarded by if (process.env.RUN_INTEGRATION_TESTS !== 'true') test.skip(...)"
      - "I3 pattern (tests/failure/i3-idempotency.test.ts): call consumer twice on same event_id; assert processed → duplicate sequence"
      - "I4 deterministic replay: ORDER BY casino_id, gaming_day, table_id, event_id — NOT created_at"
      - "RLS tests: anon/authenticated client → assert permission denied on table and both RPCs"
    acceptance_criteria:
      - "I3: duplicate event_id delivery → 'processed' first call, 'duplicate' second; shift_operational_projection unchanged after duplicate; exactly one processed_messages row"
      - "I4: process N events, record totals; TRUNCATE shift_operational_projection and delete processed_messages rows for those operational event_id values in the test harness only; reset processed_at for those same rows; replay in (casino_id, gaming_day, table_id, event_id) order; assert identical grind_volume_cents, fill_total_cents, credit_total_cents"
      - "runOperationalConsumer() unit: processed path → counter increments; duplicate path → duplicate counter; Error path → errors[] populated, other rows continue"
      - "Authority degradation: surface aggregating shift_operational_projection + visit_class_a_projection data emits type: 'estimated'"
      - "Contract test: no Phase 2.4 DTO has completeness.status outside 'complete' | 'partial' | 'unknown'"
      - "Route DTO contract test: operational-projection GET returns { totalCents, count, completeness, type: 'estimated' } and never accepts request-supplied casinoId as authorization context"
      - "Source/migration test: no Phase 2.4 migration file references 'claimed_until'"
      - "Completeness isolation: pending operational row for table_B on same gaming_day does NOT affect table_A's getShiftOperationalCompleteness result"
      - "Zero-event completeness: lifecycle closed + no projection row + no table-scoped operational backlog returns 'complete' with zero totals, not 'unknown'"
      - "Poison-row progress: a malformed operational row with delivery_attempts >= 5 is excluded from claimable backlog, counted in operationalDeadLetter diagnostics, and does not prevent later valid operational rows from being claimed"
      - "Skipped-event (ledger): rpc_process_operational_projection returns 'skipped_ledger'; no shift_operational_projection write; no processed_at stamp; no processed_messages row"
      - "Skipped-event (unknown op type): returns 'skipped_unknown'; same no-write guarantees"
      - "Malformed payload: null, missing, non-numeric, or negative amount_cents on an owned operational event fails without processed_at stamp, processed_messages insert, or projection mutation"
      - "Malformed-before-idempotency: malformed owned operational event never inserts processed_messages, proving payload validation precedes idempotency insert"
      - "Undo behavior: mounted GrindBuyinPanel does not submit negative GRIND_BUYIN unless a governed reversal event exists; test asserts no negative operational outbox row is produced by the undo control"
      - "RLS/grant: authenticated client gets permission denied on shift_operational_projection SELECT; gets permission denied EXECUTE on rpc_claim_operational_outbox_batch and rpc_process_operational_projection; anon same"
    implementation_notes:
      - "I3/I4 in tests/failure/ are REAL integration tests (against local Supabase, service_role client), not mocked units. Unlike existing tests/failure/i3-idempotency.test.ts (which mocks supabase). Guard with RUN_INTEGRATION_TESTS=true check; use /** @jest-environment node */."
      - "I4 replay ordering: ORDER BY casino_id, gaming_day, table_id, event_id. Tests must NOT rely on created_at ordering — PRD §5.1 explicit requirement. Because processed_messages is the production idempotency guard, the replay test must clear processed_messages only for the operational event_ids under test before replay; do not add a production replay bypass."
      - "RLS grant tests: use createBrowserComponentClient() as authenticated user; call .from('shift_operational_projection').select() and assert denial semantics; call both RPCs and assert recognized permission/function-not-executable denial. Do not pin to a single brittle PostgREST code; fail any successful table access or RPC execution."
      - "Completeness isolation test seeds two tables (A and B) on same gaming_day; asserts getShiftOperationalCompleteness for A is 'complete' even when table_B has pending operational rows."
      - "Test runner (output-safe per CLAUDE.md): RUN_INTEGRATION_TESTS=true npx jest --testPathPattern='i3-idempotency-operational|i4-replay-operational' --forceExit > /tmp/test-i3i4-op.log 2>&1"
    gate: test-pass

  WS6_GOVERNANCE:
    name: "Wave 2 Tracker & Rollout Map Phase 2.4 Closure"
    executor: lead-architect
    executor_type: skill
    type: governance
    bounded_context: governance
    depends_on: [WS5_TESTS]
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
    patterns:
      - "Wave 2 tracker update protocol: update both WAVE-2-TRACKER.json and WAVE-2-PROGRESS-TRACKER.md together"
    acceptance_criteria:
      - "WAVE-2-TRACKER.json: active_phase → '2.5', phase_status → 'phase_2_4_complete_phase_2_5_not_started', last_closed_phase → '2.4', last_closed_prd → 'PRD-088', last_closed_exec → 'EXEC-088', last_updated updated"
      - "WAVE-2-PROGRESS-TRACKER.md: Phase 2.3 row synced to ✅ COMPLETE (existing markdown staleness fix); Phase 2.4 row → ✅ COMPLETE; Phase 2.5 row → 🔲 NOT STARTED; Immediate Next Actions updated"
      - "WAVE-2-ROLLOUT-MAP.md: Phase 2.4 exit gate section marked ✅ MET; status header updated; known residual gaps (fill/credit workflow absence, PWB-002) named in exit notes"
      - "Exit notes explicitly state: 'canonical complete means projection-complete for consumed operational outbox rows; full workflow-coverage completeness remains blocked until fill/credit operator UI ships (PWB-002)'"
      - "SRM evidence includes either shift_operational_projection already registered under PlayerFinancialService or a governance patch adding that registration before closure"
      - "npm run openapi:validate && npm run type-check && npm run lint && npm run build all exit 0"
    implementation_notes:
      - "Phase 2.3 staleness: WAVE-2-PROGRESS-TRACKER.md Phase 2.3 row is currently stale (not marked COMPLETE even though PRD-087/EXEC-087 delivered 2026-05-19). Fix this in same commit as Phase 2.4 update."
      - "Do not mark Phase 2.5 as 'in progress' — it has no PRD yet. Mark as NOT STARTED with no cursor advancement beyond 2.5."
    gate: build

execution_phases:
  - phase: 1
    parallel: [WS1_DB]
    description: "Projection store + operational claim/process RPCs + backlog index. Blocking gate — all consumer and surface work depends on schema. Gate: db:types-local exits 0; schema-validation proofs pass."
  - phase: 2
    parallel: [WS2_CONSUMER, WS3_COMPLETENESS]
    description: "Consumer service + relay dispatch (WS2) and completeness function + surface updates + hook interface change (WS3) run in parallel. Both depend only on WS1_DB. WS3 must complete before WS4 can mount."
  - phase: 3
    parallel: [WS4_PANEL]
    description: "GrindBuyinPanel mounting in tables-panel.tsx. Runs after WS3 completes the useGrindBuyinTotal hook interface update (shiftWindow → gamingDay). Pre-edit verification must inspect PanelContainer's existing gamingDay prop and thread gamingDay?.date to TablesPanel/GrindBuyinPanel; do not add new global state. Gate: type-check exits 0."
  - phase: 4
    parallel: [WS5_TESTS]
    description: "Full test suite: I3/I4 re-verification (integration), consumer unit tests, authority degradation, contract, skipped-event, completeness isolation, RLS/grant tests. Depends on all implementation workstreams."
  - phase: 5
    parallel: [WS6_GOVERNANCE]
    description: "Wave 2 tracker Phase 2.4 closure. Sync Phase 2.3 staleness, advance cursor to 2.5, name residual gaps. Runs after all implementation gates pass."

gates:
  schema-validation:
    type: migration
    human_gate: true
    commands:
      - "npm run db:types-local"
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: |
      - shift_operational_projection exists in pg_class
      - rpc_claim_operational_outbox_batch exists as SECURITY DEFINER, service_role EXECUTE only
      - rpc_process_operational_projection exists as SECURITY DEFINER, service_role EXECUTE only
      - idx_finance_outbox_operational_backlog exists on finance_outbox
      - REVOKE ALL ON TABLE public.shift_operational_projection FROM anon, authenticated executed
      - No authenticated/anon RLS policies on shift_operational_projection
      - db:types-local exits 0; shift_operational_projection and both RPCs present in generated Database type
      - No migration file references 'claimed_until'
  type-check:
    type: build
    commands:
      - "npm run type-check"
      - "npm run lint"
    passing_criteria: "All exit 0; no as-any casts introduced; no console.* in production code"
  test-pass:
    type: test
    commands:
      - "RUN_INTEGRATION_TESTS=true npx jest --testPathPattern='i3-idempotency-operational|i4-replay-operational' --forceExit > /tmp/test-i3i4-op.log 2>&1"
      - "npx jest --testPathPattern='outbox-operational-consumer|operational-projection' --forceExit > /tmp/test-op.log 2>&1"
    passing_criteria: |
      - I3: duplicate event_id → exactly one processed_messages row; second call returns 'duplicate'; projection unchanged
      - I4: replay in (casino_id, gaming_day, table_id, event_id) order → identical totals
      - Consumer unit tests: processed/duplicate/error paths all pass
      - Authority degradation: mixed-class surface emits type 'estimated'
      - Contract: no completeness.status outside canonical three values
      - Route DTO: operational-projection GET returns totalCents/count/completeness/type estimated and ignores/rejects request-supplied casinoId authorization
      - Completeness isolation: table_B backlog does not affect table_A completeness
      - Zero-event completeness: closed table/day with no projection row and no backlog returns complete with zero totals
      - Poison-row containment: delivery_attempts >= 5 operational rows are reported as operationalDeadLetter and do not starve later valid rows
      - Skipped-event: no writes for ledger or unknown operational event types
      - Malformed payload: null, missing, non-numeric, or negative amount_cents produces no processed_messages insert, processed_at stamp, or projection side effect
      - Undo behavior: mounted GrindBuyinPanel does not produce negative GRIND_BUYIN operational outbox rows in Phase 2.4
      - RLS/grant: authenticated + anon denied on table and both RPCs; assert denial semantics, not a single PostgREST code, and fail any successful unauthorized access/execution
  build:
    type: build
    commands:
      - "npm run openapi:validate"
      - "npm run type-check"
      - "npm run lint"
      - "npm run build"
    passing_criteria: "All exit 0"
---

# EXEC-088 — Wave 2 Phase 2.4: Consumer Expansion: Operational Telemetry Projection

## Overview

This EXEC-SPEC implements PRD-088: build the projection consumer for the operational event stream (`grind.observed`, `fill.recorded`, `credit.recorded`) that has been accumulating in `finance_outbox` with `processed_at IS NULL` since Phases 2.0–2.2.

Phase 2.4 does **not** repeat Phase 2.3's Gate A work. The `gaming_day` column is already NOT NULL on all operational rows (Phase 2.3 Gate A inheritance). The `gaming_day_lifecycle` table and `rpc_close_gaming_day` are already delivered. The `processed_messages` idempotency pattern is established. Phase 2.4 is a clean consumer slice with no envelope compatibility gate required.

**Containment**: This phase does not modify authoring tables, the Class A projection consumer, relay worker backoff architecture, or any existing SECURITY DEFINER function. It adds new infrastructure alongside the Phase 2.3 substrate without disturbing it. Operational poison rows are contained with a claim cap (`delivery_attempts < 5`) and diagnostics only; no claim leases, retry scheduler, or new dead-letter table are introduced.

```
Phase 1: DB Schema  →  Phase 2: Consumer + Completeness (parallel)  →  Phase 3: Panel Mount  →  Phase 4: Tests  →  Phase 5: Governance
```

---

## Architectural Decisions

### DEC-EXEC-1: Payload Field Name for Operational Events

**Decision**: Operational event payloads use `amount_cents` (not `amount` as in Class A ledger events).

**Evidence**: `rpc_record_grind_observation` emits `jsonb_build_object('amount_cents', p_amount_cents)`. PRD-038 fill/credit RPCs emit the same field name. The process RPC must extract `(v_payload->>'amount_cents')::bigint` — not `(v_payload->>'amount')::bigint`.

**Implementation contract**: `rpc_process_operational_projection` validates `amount_cents` from the JSONB payload for all three owned event types before both idempotency insertion and projection mutation. Null, missing, non-numeric, or negative `amount_cents` must fail without stamping `processed_at`, inserting `processed_messages`, or mutating `shift_operational_projection`.

### DEC-EXEC-2: useGrindBuyinTotal Hook Interface

**Decision**: `useGrindBuyinTotal()` accepts `gamingDay: string` (DATE) instead of `shiftWindow: {startTs, endTs}` after WS3. The hook calls `GET /api/v1/table-context/operational-projection?gamingDay=...&tableId=...` which uses `createServiceClient()` to read `shift_operational_projection`.

**Rationale**: `shift_operational_projection` is keyed by `(casino_id, gaming_day, table_id)` — not by time range. Continuing to use a time-range shiftWindow would require querying the authoring table, which is the problem being solved. The new route provides the service-role boundary required by the table's RLS posture.

**WS4 dependency**: WS4 (panel mounting) executes after WS3 completes this interface update. `PanelContainer` already receives `gamingDay?.date` for sibling panels; WS4 threads that existing value into `TablesPanel` and then `GrindBuyinPanel`. Do not assume `DashboardTableDTO` has `gaming_day`, and do not add new global/Zustand state.

**Undo containment**: Phase 2.4 does not model negative grind reversals as valid operational projection inputs. The current `useUndoGrindBuyin` negative `GRIND_BUYIN` path must be removed or disabled for the mounted panel unless a separate governed reversal event is introduced.

### DEC-EXEC-3: No rpc_acknowledge_outbox_delivery for Operational Branch

**Decision**: The operational consumer does NOT call `rpc_acknowledge_outbox_delivery` after processing each row. `rpc_process_operational_projection` stamps `processed_at` atomically within its own transaction — the separate acknowledgement step used by the Class A branch is not needed.

**Rationale**: Phase 2.3's Class A consumer uses `rpc_acknowledge_outbox_delivery` as a separate step because `rpc_process_class_a_projection` does not call it internally. Phase 2.4's `rpc_process_operational_projection` stamps `processed_at` directly — adding a second acknowledgement would be redundant and could create confusing state.

### DEC-EXEC-4: New Operational Projection Route

**Decision**: `GET /api/v1/table-context/operational-projection` is a new read-only projection route exception (not an update to an existing route) required because `shift_operational_projection` has no authenticated RLS policies.

**Rationale**: `useGrindBuyinTotal` runs in the browser with an authenticated client. Since `shift_operational_projection` is service_role-only, a route handler using `createServiceClient()` is the required access pattern. The route derives `casinoId` from `rlsContext` (not from query params alone) per PRD §5.1.

**Boundary classification**: `http_boundary:false` means no new HTTP write boundary for Phase 2.4; it does not prohibit this read-only route. Route authorization tests must prove casino_id comes from authenticated context and any request-supplied `casinoId` is ignored or rejected.

### DEC-EXEC-5: Operational Replay Test Semantics

**Decision**: I4 replay verification clears `processed_messages` only for the operational `event_id` values under test before resetting their `processed_at` values and replaying them. Production code does not get a replay bypass.

**Rationale**: `processed_messages` is the production idempotency guard. If the replay test truncates only `shift_operational_projection`, the second pass returns `duplicate` for every already-processed event and produces no projection state. Clearing scoped test receipts preserves the I4 invariant without weakening production idempotency.

### DEC-EXEC-6: Gaming Day Source for Table Panel Mount

**Decision**: `gamingDay` for `GrindBuyinPanel` comes from the existing `PanelContainer` `gamingDay?.date` value, which is already used by sibling panels. WS4 may thread this as a bounded `TablesPanel` prop. It must not add Zustand/global state and must not assume `DashboardTableDTO` has `gaming_day`.

**Rationale**: Current `DashboardTableDTO` does not include `gaming_day`. Reusing the panel container's existing gaming-day value avoids a schema/DTO expansion solely for this mount.

### DEC-EXEC-7: Zero-Event Completeness

**Decision**: A closed `(casino_id, gaming_day, table_id)` with no `shift_operational_projection` row and no table-scoped operational backlog is `complete` with zero totals.

**Rationale**: Absence of projection state is ambiguous only while the gaming day is open. After lifecycle close and empty backlog, zero emitted operational events is a complete projection outcome, not an unknown state.

---

## ADR-041 Surface Classification

**Surface**: `GrindBuyinPanel` mounted in the table-context workflow, backed by `GET /api/v1/table-context/operational-projection`.

**Rendering Delivery**: Client Shell. The table-context panel is an existing client-side interactive surface; Phase 2.4 extends it without introducing an RSC prefetch boundary.

**Data Aggregation**: BFF Summary Endpoint. The browser must not read `shift_operational_projection` directly because the table is service-role-only; the route returns the small projection summary needed by the panel.

**Rejected Patterns**: Direct Client Fetch is rejected because authenticated RLS has no SELECT policy on `shift_operational_projection`. RSC Prefetch is rejected because this is an existing interactive table-context client panel and the projection total updates after operator actions.

**Metric Provenance**:
- `grind_volume_cents` / rendered `totalCents`: truth class `estimated`, freshness class `near-real-time after relay`, source `shift_operational_projection` derived from `finance_outbox` `grind.observed`.
- `fill_total_cents`: truth class `estimated`, freshness class `near-real-time after relay`, source `shift_operational_projection` derived from `finance_outbox` `fill.recorded`.
- `credit_total_cents`: truth class `estimated`, freshness class `near-real-time after relay`, source `shift_operational_projection` derived from `finance_outbox` `credit.recorded`.
- `completeness.status`: truth class `projection-completeness`, freshness class `route read time`, source `shift_operational_projection` + `gaming_day_lifecycle` + table-scoped operational backlog.

---

## Known Residual Gaps (for Phase 2.5 Sign-Off)

| Gap | Finding | Post-Wave-2 path |
|---|---|---|
| `fill.recorded` workflow | No operator UI; hardware-integration-only API route | PWB-002 |
| `credit.recorded` workflow | No operator UI; hardware-integration-only API route | PWB-002 |
| `adjustment.recorded` anchor | ADR-057 gate silently skips emission | PWB-001 / PROD-ANCHOR-STD-001 |

These gaps are accepted for Phase 2.4. The exit gate explicitly states: **canonical `complete` means projection-complete for consumed operational outbox rows; it does not claim full workflow-coverage completeness. Fill/credit workflow coverage remains blocked until PWB-002 ships.**
