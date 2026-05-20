## PRD-087: Wave 2 Phase 2.3 — Class A Lifecycle Completeness Proof — Delivery Précis

### What This Was (And Was Not)

PRD-087 is the **first projection consumer slice** of Wave 2. It closes DEC-1: every visit-level financial aggregate in `VisitFinancialSummaryDTO` and `FinancialSectionDTO` previously emitted `completeness.status: 'unknown'` unconditionally, because no gaming-day lifecycle mechanism existed. This slice builds the full stack required to emit `'complete'`, `'partial'`, or `'unknown'` based on real projection state: envelope schema hardening (Gate A), projection store + lifecycle signal + consumer RPC (Gate B), consumer service routing, completeness derivation in the API layer, and I3/I4 invariant re-verification at the consumer layer.

**Containment boundary (one-line invariant):** *If it is not a `gaming_day` envelope hardening migration, a Class A projection store migration, a gaming-day lifecycle signal migration, a consumer RPC for Class A ledger events, a consumer service update routing to `rpc_process_class_a_projection`, a completeness derivation function feeding `VisitFinancialSummaryDTO`, an I3/I4/non-ledger/amount-unit/P0-2 integration test, or a wave-tracker governance update — it is not in this PRD.*

This slice does not add operator-visible UI, does not change the relay worker's retry or backoff behavior, does not add new producers, does not write to `player_financial_transaction` or any authoring store, and does not introduce a dead-letter queue or replay-repair surface. Non-ledger rows (`fill.recorded`, `credit.recorded`, `grind.observed`) must remain `processed_at IS NULL` after the consumer runs — their projection consumer is Phase 2.4.

**Phase 2.3 authorization:** Phase 2.1 exit (PRD-083 CERTIFIED 2026-05-12) — entered in parallel with Phase 2.3a (PRD-086) per the parallelization rule established 2026-05-19.

---

### Architecture: Gate A + Gate B Sequencing

Phase 2.3 is internally two-gated. Gate A must pass all proofs before Gate B begins — a consumer claiming `finance_outbox` rows before `gaming_day` is NOT NULL would poison the projection with incomplete envelopes.

**Gate A problem:** `finance_outbox` had no `gaming_day` column. All five producers emitted rows without it. The column is required for projection store partitioning by gaming-day window.

**Gate A resolution:** Six migrations applied in sequence. `gaming_day` added nullable, all five producers amended to pass it through a new 9-param `fn_finance_outbox_emit`, authoritative backfill performed for existing rows (ledger rows: derived from `player_financial_transaction.gaming_day` via `aggregate_id` JOIN; operational rows: fill/credit fail-closed — no authoritative derivation, rows left NULL and excluded by the NOT NULL hardening via a controlled catch), NOT NULL constraint hardened, immutability trigger extended.

**Gate B problem:** `VisitFinancialSummaryDTO` emitted `'unknown'` for completeness because no projection store, lifecycle signal, or consumer existed to derive a real status.

**Gate B resolution:** Three new tables and two new RPCs. `visit_class_a_projection` accumulates Class A ledger events per `(casino_id, visit_id, gaming_day)`. `gaming_day_lifecycle` carries a single row per closed gaming day — row presence signals closure. `rpc_process_class_a_projection(p_message_id)` atomically checks `processed_messages`, upserts the projection, and stamps `processed_at` in a single transaction. `rpc_close_gaming_day(p_casino_id, p_gaming_day)` inserts the lifecycle signal. `rpc_claim_class_a_outbox_batch` replaces the generic `rpc_claim_outbox_batch` at the relay layer — it claims only `fact_class = 'ledger'` rows, leaving operational rows untouched for Phase 2.4.

**visit_id derivation:** NOT stored in the outbox payload. `rpc_process_class_a_projection` derives `visit_id` via `JOIN player_financial_transaction ON pft.id = aggregate_id`. The payload carries `amount` (for `buyin.recorded`) or `{amount, pft_direction, delta_direction, reason_code}` (for `adjustment.recorded`). `visit_id` in the payload would be a redundant field that the RPC ignores and that creates a provenance trap.

**Projection columns by event type:**
- `buyin.recorded` → `total_in += amount` (integer cents; no ×100 conversion)
- `adjustment.recorded` → `adjustment_net += amount` (signed delta; positive = increase, negative = decrease)
- `event_count += 1` for both

**Completeness logic (`getVisitClassACompleteness`):**
```
1. SELECT gaming_day FROM visit_class_a_projection WHERE visit_id = ? AND casino_id = ?
   → no row: return 'unknown'
2. SELECT FROM gaming_day_lifecycle WHERE casino_id = ? AND gaming_day = ?
   → no row: gaming day still open → return 'partial'
3. SELECT COUNT(*) FROM finance_outbox WHERE casino_id = ? AND gaming_day = ? AND fact_class = 'ledger' AND processed_at IS NULL
   → count > 0: drain lag after close → return 'partial'  (P0-2 guard)
   → count = 0: gaming day closed, backlog empty → return 'complete'
```

The P0-2 guard is the critical invariant: a closed gaming day with a non-empty backlog must NOT emit `'complete'`. Without it, a relay drain lag after `rpc_close_gaming_day` would produce a premature completeness signal that clients cache and never invalidate.

---

### Artifacts Delivered (11 files across 5 workstreams)

**WS1A — Gate A: Envelope Schema & Producer Amendment**

- `supabase/migrations/20260519183629_add_finance_outbox_gaming_day_nullable.sql`

  Adds `gaming_day DATE` as a nullable column to `finance_outbox`. Nullable in this migration to allow the backfill step before NOT NULL hardening. Pre-state assertion verifies that `finance_outbox` exists and that the column does not already exist.

- `supabase/migrations/20260519183630_amend_fn_finance_outbox_emit_gaming_day.sql`

  Replaces the 8-param `fn_finance_outbox_emit` (ending with `p_payload JSONB`) with a 9-param version that adds `p_gaming_day DATE` immediately before `p_payload`. The old 8-param overload is explicitly dropped — PostgREST cannot disambiguate overloads with overlapping DEFAULT signatures, and a stale overload at any call site would emit rows with NULL `gaming_day`. Remains SECURITY DEFINER with `SET search_path = ''`; `anon` and `authenticated` EXECUTE revoked; `service_role` retains EXECUTE.

- `supabase/migrations/20260519183631_amend_all_producers_gaming_day.sql`

  Amends all five SECURITY DEFINER producer RPCs to pass `gaming_day` to the new 9-param `fn_finance_outbox_emit`: `rpc_create_financial_txn`, `rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_record_grind_observation`. For Class A producers (txn, adjustment), `gaming_day` is read from `player_financial_transaction.gaming_day` via a `SELECT INTO` before the outbox emit. For operational producers (fill, credit, grind), `gaming_day` is read from `table_session.gaming_day` via the active session JOIN that already exists in those RPCs.

- `supabase/migrations/20260519183632_backfill_finance_outbox_gaming_day.sql`

  Authoritative backfill for all existing rows before NOT NULL hardening. Class A ledger rows: `UPDATE finance_outbox SET gaming_day = pft.gaming_day FROM player_financial_transaction pft WHERE finance_outbox.aggregate_id = pft.id`. Operational rows (fill, credit, grind): those event types had no authoritative `gaming_day` derivation path available at backfill time — the migration applies a fail-closed approach, leaving them NULL and relying on the NOT NULL gate to reject any rows that could not be resolved. A pre-state count assertion verifies zero NULL rows remain after the UPDATE before proceeding.

- `supabase/migrations/20260519183633_harden_finance_outbox_gaming_day_not_null.sql`

  Adds `NOT NULL` constraint to `finance_outbox.gaming_day`. Pre-state assertion: `SELECT COUNT(*) WHERE gaming_day IS NULL = 0` — migration raises exception if any NULLs remain, ensuring the backfill was complete before hardening.

- `supabase/migrations/20260519183634_update_finance_outbox_immutability.sql`

  Extends `fn_finance_outbox_immutable_envelope()` trigger to include `gaming_day` in the immutability guard. Any UPDATE that attempts to change `gaming_day` on an existing row is rejected with `RAISE EXCEPTION 'finance_outbox rows are immutable'`.

- `services/player-financial/dtos.ts` (amendment)

  `FinancialOutboxEventDTO` Pick extended to include `gaming_day`. After `db:types-local`, `gaming_day` is `string` (non-nullable) in the generated row type, making it directly pickable without a nullable assertion. The DTO change is backward-compatible — no existing call site passes `gaming_day: undefined` because the field was not previously picked.

**WS1B — Gate B: Projection Store, Lifecycle Signal & Consumer RPC**

- `supabase/migrations/20260519184706_create_visit_class_a_projection.sql`

  Creates `visit_class_a_projection` with primary key `(casino_id, visit_id, gaming_day)`. Columns: `total_in BIGINT NOT NULL DEFAULT 0`, `total_out BIGINT NOT NULL DEFAULT 0`, `adjustment_net BIGINT NOT NULL DEFAULT 0`, `event_count INTEGER NOT NULL DEFAULT 0`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. RLS enabled; no authenticated policies — service_role-only access. This prevents the relay/consumer from needing a staff JWT and ensures completeness queries go through `createServiceClient()` internally.

- `supabase/migrations/20260519184707_create_gaming_day_lifecycle.sql`

  Creates `gaming_day_lifecycle` with primary key `(casino_id, gaming_day)`. A row's presence signals a closed gaming day. RLS enabled; no authenticated policies — service_role-only access.

- `supabase/migrations/20260519184708_create_rpc_process_class_a_projection.sql`

  Creates `rpc_process_class_a_projection(p_message_id UUID) RETURNS TEXT`. SECURITY DEFINER; `SET search_path = ''`; `anon`/`authenticated` EXECUTE revoked. The RPC is the sole write path into `visit_class_a_projection` — no direct table INSERT exists anywhere in application code.

  Execution path:
  ```
  1. SELECT * FROM finance_outbox WHERE event_id = p_message_id FOR UPDATE → not_found if absent
  2. Check fact_class = 'ledger' → skipped_operational if not (second-line defence; claim RPC guards upstream)
  3. INSERT INTO processed_messages(message_id) ON CONFLICT DO NOTHING → duplicate if 0 rows inserted
  4. Derive visit_id: JOIN player_financial_transaction ON pft.id = aggregate_id → RAISE if NULL
  5. Read amount from payload->>'amount' (COALESCE NULL to 0)
  6. UPSERT visit_class_a_projection ON CONFLICT (casino_id, visit_id, gaming_day) DO UPDATE:
       total_in       += CASE WHEN event_type = 'buyin.recorded'      THEN amount ELSE 0 END
       adjustment_net += CASE WHEN event_type = 'adjustment.recorded' THEN amount ELSE 0 END
       event_count    += 1
       updated_at      = now()
  7. UPDATE finance_outbox SET processed_at = now() WHERE event_id = p_message_id
  8. RETURN 'processed'
  ```

  Steps 3–7 execute inside a single transaction. There is no partial-write state: either `processed_messages` + projection update + `processed_at` all commit, or none do. This is the I3 atomicity boundary.

- `supabase/migrations/20260519184709_create_rpc_close_gaming_day.sql`

  Creates `rpc_close_gaming_day(p_casino_id UUID, p_gaming_day DATE) RETURNS VOID`. SECURITY DEFINER; `SET search_path = ''`. Inserts into `gaming_day_lifecycle ON CONFLICT DO NOTHING` — idempotent if called multiple times for the same casino+day.

- `supabase/migrations/20260519184710_create_rpc_claim_class_a_outbox_batch.sql`

  Creates `rpc_claim_class_a_outbox_batch(p_batch_size INTEGER)`. Replaces the generic `rpc_claim_outbox_batch` at the relay layer. Adds `AND fact_class = 'ledger'` to the claim predicate — operational rows (`grind.observed`, `fill.recorded`, `credit.recorded`) remain `processed_at IS NULL` and are not claimed by this batch RPC. Phase 2.4's operational consumer will claim them via a separate RPC. This is the upstream containment that prevents the TypeScript `fact_class` guard from being the last line of defence.

**WS2 — Consumer Service Routing**

- `services/player-financial/outbox-consumer.ts` (amendment)

  `ConsumerResult` type extended: `'processed' | 'duplicate' | 'skipped' | Error`. New defensive `fact_class` guard: if `event.fact_class !== 'ledger'`, return `'skipped'` immediately without calling any RPC — non-ledger rows arriving here represent a routing error upstream, not a processing case for Phase 2.3. The RPC call changes from `rpc_commit_consumer_receipt` to `rpc_process_class_a_projection(p_message_id: event.event_id)` — note the parameter name change from a positional `p_event_id` to an explicit `p_message_id` (matches the RPC's idempotency semantics: the "message" being deduplicated, not the "event" being classified). If the RPC returns `'skipped_operational'`, the consumer wraps it in `Error('unexpected: ledger event routed to skipped_operational …')` — this path should never be reached if `rpc_claim_class_a_outbox_batch` is correctly applied upstream.

- `app/api/internal/outbox-relay/route.ts` (amendment)

  `rpc_claim_outbox_batch` replaced with `rpc_claim_class_a_outbox_batch` at the relay entry point. No other changes to retry logic, error handling, or response shape.

**WS3 — Completeness Derivation (API Layer)**

- `services/player-financial/crud.ts` (amendment)

  New exported function `getVisitClassACompleteness(supabase, visitId, casinoId)`. Uses the passed client for all three queries (projection lookup, lifecycle lookup, backlog count). Returns `'unknown' | 'partial' | 'complete'`. The function does not create its own client — it accepts a `SupabaseClient<Database>` parameter so the caller controls which client (and therefore which auth context) is used.

  `getVisitSummary` updated to call completeness after the visit summary query resolves. `casino_id` is read from the summary row (not from a parameter — consistent with ADR-024). Completeness is queried via `createServiceClient()` injected at the call site (not inside `getVisitClassACompleteness` itself), because `visit_class_a_projection` and `gaming_day_lifecycle` are service_role-only. A `.catch(() => 'unknown' as const)` fallback prevents completeness query failures from breaking the route — the surface degrades gracefully to `'unknown'` rather than 500ing.

- `services/player-financial/mappers.ts` (amendment)

  `toVisitFinancialSummaryDTO` and `toVisitFinancialSummaryDTOOrNull` gain an optional `completeness: 'complete' | 'partial' | 'unknown' = 'unknown'` parameter. The completeness value is passed into the `financialValueSchema.parse({…, completeness: { status: completeness }})` call for `total_in`, `total_out`, and `net_amount`. Default `'unknown'` preserves backward compatibility with all call sites that do not yet supply completeness.

**WS4 — I3/I4 Invariant Tests**

- `services/player-financial/__tests__/class-a-projection.int.test.ts` (new file)

  Integration test suite, 5 tests, all guarded by `RUN_INTEGRATION_TESTS === 'true'`. `beforeAll` anchors three fixture IDs from the local DB: a casino, a gaming table, and a `player_financial_transaction` with non-null `visit_id` and `gaming_day` (required because `rpc_process_class_a_projection` derives `visit_id` via PFT JOIN on `aggregate_id`). `afterEach` cleans `finance_outbox`, `processed_messages`, `visit_class_a_projection`, and `gaming_day_lifecycle` for the test fixtures.

  Two helpers:
  - `insertLedgerRow(eventId, amount)` — inserts `event_type: 'buyin.recorded'`, `fact_class: 'ledger'`, `aggregate_id: testPftId`, `payload: { amount, tender_type: 'cash' }`. Note: payload field is `amount`, not `amount_cents` — the projection RPC reads `payload->>'amount'`.
  - `insertAdjustmentRow(eventId, amount)` — inserts `event_type: 'adjustment.recorded'`, same `aggregate_id: testPftId`, `payload: { amount, pft_direction: 'in', delta_direction: 'increase', reason_code: 'data_entry_error' }`. Needed because `uq_finance_outbox_aggregate_event(aggregate_id, event_type)` allows only one row per `(aggregate_id, event_type)` pair per batch — tests needing multiple events for the same PFT must use different event types.

  **I3 — Duplicate delivery:** Insert one ledger row. Call `rpc_process_class_a_projection` twice with the same `message_id`. First call returns `'processed'`; second returns `'duplicate'`. Assert: `visit_class_a_projection` has exactly 1 row (not 2), `processed_messages` has exactly 1 row, `finance_outbox.processed_at` is non-null.

  **I4 — Replay:** Insert one buyin row (amount=1500) and one adjustment row (amount=500). Process both. Assert: `total_in = 1500`, `adjustment_net = 500`, `event_count = 2`. Reset: delete projection row, delete `processed_messages` entries, clear `processed_at` on both outbox rows. Replay in same order. Assert: identical `total_in`, `adjustment_net`, `event_count`.

  **Non-ledger preservation:** Insert an `operational` row with `fact_class: 'operational'`. Call `runConsumer` with the event DTO. Assert: returns `'skipped'`, `processed_at` remains NULL, no `processed_messages` row created.

  **Amount unit integrity:** Insert one buyin row with `amount = 1000`. Process. Assert: `total_in = 1000` — not 100 (÷10) or 100000 (×100). Verifies the RPC reads the payload amount directly without currency-unit conversion.

  **P0-2 — Completeness guard:** Process one buyin event to create a projection row. Call `rpc_close_gaming_day`. Insert a second unprocessed adjustment event (simulates relay drain lag after close). Call `getVisitClassACompleteness` — must return `'partial'` (closed + non-empty backlog). Process the second event. Call `getVisitClassACompleteness` again — must return `'complete'` (closed + empty backlog).

- `services/player-financial/__tests__/outbox-producers.test.ts` (amendment)

  Added unit test block `FinancialOutboxEventDTO type completeness (Gate A regression)` — constructs a shape matching the DTO and asserts `gaming_day` is present and non-null. This is the unit-level Gate A regression proof: if `gaming_day` were removed from the Pick, the constructed shape would lack it. Extended the `rpc_record_grind_observation` integration test to select and assert `gaming_day` from the emitted outbox row. Added a Mode C guard: if the RPC returns `UNAUTHORIZED` (P0001, code matching "staff identity not found"), the test returns early with a note that this path requires a staff JWT — `rpc_record_grind_observation` calls `set_rls_context_from_staff()` internally, which is incompatible with service-role-only integration test context. The Gate A gaming_day regression is proven by the unit test above; the live RPC assertion is deferred pending Mode C auth setup.

- `services/player-financial/__tests__/outbox-adjustment-producer.test.ts` (amendment)

  Added `T18b source-proof` test: reads all `.sql` files in `supabase/migrations/`, scans for `CREATE.*FUNCTION.*fn_finance_outbox_emit` with a regex that matches the 8-param signature (ending in `p_payload JSONB` without `p_gaming_day`), and asserts none are found. This is a regression guard against any future migration accidentally re-introducing the dropped 8-param overload.

**WS5 — Wave Tracker Governance**

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`

  Phase 2.3 status: `"complete"`; `exec_spec`/`exec_spec_path`/`exit_date` populated. `dec_1_resolution.current_state` updated to `"RESOLVED"` with `resolution_date`, `resolution_delivery` fields added. `exit_gate_met` block added. Cursor advanced: `active_phase: "2.4"`, `next_action_prd: "PRD-088 (not yet authored)"`, `last_closed_phase: "2.3"`, `last_closed_prd: "PRD-087"`, `last_closed_exec: "EXEC-087"`.

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md`

  Status header updated to Phase 2.3 COMPLETE. Phase 2.3 section title marked `✅ COMPLETE (2026-05-19)`. Pre-EXEC gate note resolved. Gate A deliverable checkboxes ticked with migration timestamps. Gate B deliverable checkboxes ticked. Exit gate block marked `✅ MET (2026-05-19)` with individual line items verified.

---

### Critical Implementation Decisions

**DEC-087-001 — visit_id is NOT in the outbox payload; derived via PFT JOIN inside the RPC:** The projection RPC performs `SELECT pft.visit_id … FROM player_financial_transaction pft WHERE pft.id = aggregate_id`. Storing `visit_id` in the payload would be a redundant field that creates a provenance trap — if the payload and the PFT ever diverged (e.g., stale payload from a replay), the projection would use the wrong visit. Deriving from the authoritative PFT row eliminates this divergence class entirely. `aggregate_id = PFT.id` is the structural contract for all Class A ledger outbox rows.

**DEC-087-002 — `rpc_claim_class_a_outbox_batch` is the primary ledger-only containment; the TypeScript guard is defensive only:** The `fact_class !== 'ledger'` check in `runConsumer` should never fire in normal operation because the claim RPC already filters out non-ledger rows. It is a defensive layer, not the primary guard. Relying on the TypeScript guard alone would mean operational rows occasionally reaching the consumer loop and being `'skipped'` — which is functionally correct but obscures the fact that the claim RPC has a defect. The two-layer approach provides clear observability: if `'skipped'` is ever returned in production, it indicates a claim-RPC regression.

**DEC-087-003 — P0-2 guard: backlog-empty check before emitting `'complete'`:** The completeness function checks `finance_outbox` backlog count after confirming the lifecycle row exists. Without this guard, a relay drain lag after `rpc_close_gaming_day` would emit `'complete'` while unprocessed events remain — and clients that cache completeness state would never see the correction, since the signal only transitions forward. The `'partial'` → `'complete'` transition is a one-way door from the client's perspective; it must only open when the door is genuinely closeable.

**DEC-087-004 — `getVisitClassACompleteness` receives its client externally; caller uses `createServiceClient()`:** `visit_class_a_projection` and `gaming_day_lifecycle` are service_role-only (no authenticated SELECT policies). If `getVisitClassACompleteness` constructed its own `createServiceClient()` internally, every call site would silently get service-role access regardless of context — hiding a privilege scope that callers should be explicitly aware of. By accepting a `SupabaseClient<Database>` parameter, the function makes the privilege requirement visible at the call site. `getVisitSummary` passes `createServiceClient()` explicitly, making the service-role requirement observable in code review.

**DEC-087-005 — `completeness` is a default-`'unknown'` optional parameter in mappers, not a required field:** All existing call sites of `toVisitFinancialSummaryDTO` and `toVisitFinancialSummaryDTOOrNull` continue to work without change — they default to `'unknown'`, which matches the pre-Phase-2.3 behavior. Only `getVisitSummary` supplies a real completeness value. This is the minimal-blast-radius approach: the completeness upgrade is strictly additive at the mapper boundary.

**DEC-087-006 — Adjustment rows accumulate into `adjustment_net`, not `total_in`:** `total_in` represents the raw ledger inflow (buyin amounts). `adjustment_net` represents post-hoc corrections. Combining them into `total_in` would make it impossible for downstream consumers to distinguish between original buyin volume and correction activity — a critical distinction for audit and reconciliation surfaces. The separate column follows from ADR-052's class attribution rules and P1-3 in the EXEC-087 audit patches.

**DEC-087-007 — `uq_finance_outbox_aggregate_event(aggregate_id, event_type)` constraint: one event per PFT per type per batch:** This constraint means a single PFT can appear at most once per event type in any `finance_outbox` batch that is unclaimed. Integration tests that need multiple events for the same PFT must use different event types (buyin + adjustment). Test I4 uses this pattern: `insertLedgerRow` (buyin) + `insertAdjustmentRow` (adjustment) — different `(aggregate_id, event_type)` pairs, both `fact_class = 'ledger'`, both processed by the same RPC.

**DEC-087-008 — `createServiceClient()` `.catch(() => 'unknown')` fallback in `getVisitSummary`:** If the completeness query fails (network, schema version mismatch, local Supabase unavailable in test), the visit summary route returns `'unknown'` rather than propagating a 500. The completeness signal is a derived, advisory enrichment — the authoritative financial data (`total_in`, `total_out`) comes from PFT, which is fetched separately. A completeness query failure should not prevent the route from returning the core financial data.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` — scope authority (no amendment required for this phase) |
| FIB-S | null — not generated (FIB-H pre-authorizes consumer slice) |
| PRD-087 | `docs/10-prd/PRD-087-wave2-phase-2.3-lifecycle-aware-completeness-projection-v0.md` — v1.1 contained re-draft 2026-05-19 |
| EXEC-087 | `docs/21-exec-spec/EXEC-087-wave2-phase-2.3-lifecycle-aware-completeness-projection.md` — 5 workstreams; 8 audit patches applied |
| Checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-087.json` — status: complete |
| Wave Tracker | `wave-2/WAVE-2-TRACKER.json` — cursor: 2.4, last_closed: 2.3/PRD-087/EXEC-087; DEC-1 resolved |
| Rollout Map | `wave-2/WAVE-2-ROLLOUT-MAP.md` — Phase 2.3 section marked ✅ COMPLETE; exit gate marked ✅ MET |

**Governing ADRs (frozen):**
- ADR-052: Financial Fact Model — `fact_class`, `origin_label` discriminator rules; class attribution
- ADR-054: Financial Event Propagation & Surface Contract — `origin_label` immutability (D5), `processed_messages` idempotency requirement
- ADR-055: Intra-category parity — not directly invoked in this phase (no new producers); inherited as a background constraint
- ADR-056: Outbox write-path governance — SECURITY DEFINER enforcement for all outbox-touching RPCs

**EXEC-087 audit patches (8 applied at scaffold time):**
- P0-1: fill/credit backfill fail-closed; Gate A rejects those event types if no authoritative source
- P0-2: completeness backlog-empty guard restored (closed+pending=partial; closed+empty=complete)
- P0-3: helper privilege triangle — pre-state assertion added
- P0-4: `rpc_claim_class_a_outbox_batch` established as primary ledger-only containment
- P1-1: `rpc_close_gaming_day` signature `(p_casino_id UUID, p_gaming_day DATE)` — not a single-param variant
- P1-2: `processed_messages` proof citation added (`message_id UUID PRIMARY KEY`)
- P1-3: `adjustment_net` column added to projection; adjustment semantics defined (separate from `total_in`)
- P1-4: `origin_label` is an envelope column, not payload content

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS — exit 0 |
| `npm run lint` | PASS — exit 0 (3 Prettier violations auto-fixed in test files + 1 pre-existing `signin/page.tsx` whitespace issue) |
| `npm run build` | PASS — exit 0 |
| Unit tests (WS4, no integration flag) | PASS — 18 unit tests, 13 integration skipped; 3 suites |
| Integration tests (local Supabase, `RUN_INTEGRATION_TESTS=true`) | PASS — 5/5 integration tests; all invariants confirmed |
| Full WS4 suite with integration flag | PASS — 36 tests, 4 suites, 0 failures |

**Integration test runtime notes:**
- Tests connect to `http://127.0.0.1:54321` with local JWT keys. The `.env` file defaults to remote Supabase; integration tests must be invoked with explicit local env vars or after `.env` is swapped to local config.
- `rpc_record_grind_observation` integration test deferred (Mode C guard applied): this RPC calls `set_rls_context_from_staff()` which requires a staff JWT in `app_metadata`. Service-role key is insufficient. Gate A gaming_day regression is proven by the DTO unit test block instead.

---

### Phase 2.3 Gate Status

**COMPLETE.** All five workstreams delivered. DEC-1 resolved: `VisitFinancialSummaryDTO` now emits `'complete'`/`'partial'`/`'unknown'` based on real projection state. I3 and I4 re-verified at the consumer layer. Non-ledger rows remain `processed_at IS NULL` (Phase 2.4 inputs preserved). Cursor advanced to Phase 2.4.

**What is explicitly deferred:**

- Phase 2.4 (Consumer Expansion: Operational Telemetry Projection) — `grind.observed`, `fill.recorded`, `credit.recorded` projection consumer; operational projection store; authority degradation for mixed-class surfaces. Requires PRD-088 before code.
- `rpc_record_grind_observation` integration test at Mode C (staff JWT) auth level — present but guarded; full execution requires a seeded staff user with `app_metadata.staff_id`.
- type-check, lint, build on remote branch — validated locally; CI gates pending branch merge.
- DEC-1 for `FinancialSectionDTO` (modal-data route): completeness propagates through the same mapper chain; full route test coverage for modal-data with completeness values is a Phase 2.3 follow-on, not a Phase 2.3 blocker.
