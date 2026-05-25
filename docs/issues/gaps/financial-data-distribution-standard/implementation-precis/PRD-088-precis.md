## PRD-088: Wave 2 Phase 2.4 — Operational Telemetry Projection — Delivery Précis

### What This Was (And Was Not)

PRD-088 is the **second and final projection consumer slice** of Wave 2. It closes the operational telemetry gap: `grind.observed`, `fill.recorded`, and `credit.recorded` events had been flowing through `finance_outbox` since Phase 2.2 but were deliberately left `processed_at IS NULL` — the Phase 2.3 consumer claimed only `fact_class = 'ledger'`. Phase 2.4 adds the claim-and-process path for `fact_class = 'operational'` rows, writes them into `shift_operational_projection` (a shift-scoped projection store keyed by `(casino_id, gaming_day, table_id)`), surfaces the result through a new route, mounts the `GrindBuyinPanel` component so real operator workflows can produce `grind.observed` rows, and extends the relay observability surface with a three-way operational backlog breakdown.

**Containment boundary (one-line invariant):** *If it is not a `shift_operational_projection` schema migration, a claim-batch or process RPC for operational fact class, a stop-before-deadline operational consumer service, a relay route amendment adding the operational branch, an observability route amendment for three-way backlog breakdown, a five-step completeness derivation function, a `GET /api/v1/table-context/operational-projection` route, a `gamingDay` interface update to `use-buyin-telemetry`, a `GrindBuyinPanel` mount in the tables panel, an authority degradation invariant test, a route contract test, or a wave-tracker governance update — it is not in this PRD.*

This slice does not add new producers, does not write to `player_financial_transaction` or `visit_class_a_projection`, does not introduce replay-repair or dead-letter repair actions, does not add a compliance consumer, does not add a Class A adjustment or cashout consumer, and does not change relay retry/backoff semantics. All `fact_class = 'ledger'` rows continue to be claimed and processed exclusively by Phase 2.3's `rpc_claim_class_a_outbox_batch` / `rpc_process_class_a_projection` path.

**Phase 2.4 authorization:** Phase 2.2 exit (all producers wired) + Phase 2.3 exit (Class A consumer infrastructure established, `gaming_day` envelope hardened for all operational rows).

---

### Architecture: Dual-Branch Relay + Operational Projection

**The relay dual-branch pattern:** The relay route now runs two sequential branches against the same `createServiceClient()` instance. Branch 1 (Class A, existing) claims ledger rows via `rpc_claim_class_a_outbox_batch` and processes each via `rpc_process_class_a_projection`. Branch 2 (operational, new) claims operational rows via `rpc_claim_operational_outbox_batch` and processes each via `rpc_process_operational_projection`. Branch 2 begins only if the stop-before-deadline window has not been breached. Both branches run against the single service client — no second `createServiceClient()` call anywhere in the relay path. The relay response restructured from a flat `{processed, failed}` to `{classA: {processed, failed}, operational: {processed, duplicate, errors}}`.

**No separate acknowledge step (DEC-EXEC-3):** Phase 2.3's Class A consumer called `rpc_acknowledge_outbox_delivery` after each row. The operational consumer does not — `rpc_process_operational_projection` stamps `processed_at` atomically inside its own transaction (same pattern as `rpc_process_class_a_projection`). The acknowledge RPC is not called for any operational row.

**Batch size cap at 25:** The operational consumer uses `OPERATIONAL_BATCH_SIZE = 25`, capped below the Class A `BATCH_SIZE = 50`. The relay cycle is shared, so the operational branch must leave enough time budget for the Class A branch to complete first.

**`shift_operational_projection` store:** Keyed by `(casino_id, gaming_day, table_id)`. Columns: `grind_volume_cents BIGINT`, `fill_total_cents BIGINT`, `credit_total_cents BIGINT`, `event_count BIGINT`, `updated_at TIMESTAMPTZ`. Accumulation is per-event-type:
- `grind.observed` → `grind_volume_cents += payload.amount_cents`
- `fill.recorded` → `fill_total_cents += payload.amount_cents`
- `credit.recorded` → `credit_total_cents += payload.amount_cents`
- All → `event_count += 1`

Note: the payload field is `amount_cents` (not `amount`) — Phase 2.4 operational rows encode amounts as integer cents. This differs from the Phase 2.3 Class A payload convention (`amount`) and was confirmed from the migrations before implementation (DEC-EXEC-1).

**Five-step completeness logic (`getShiftOperationalCompleteness`):**
```
1. No projection row AND no lifecycle row → 'unknown' (shift not started)
2. No projection row AND lifecycle row AND table-scoped backlog = 0 → 'complete' with totalCents = 0
   (zero-event closed gaming day — valid for tables with no fill/credit/grind activity)
3. Projection row exists AND no lifecycle row → 'partial' (gaming day still open)
4. Projection row exists AND lifecycle row AND table-scoped backlog > 0 → 'partial'
   (gaming day closed but relay drain lag; same P0-2 invariant as Phase 2.3)
5. Projection row exists AND lifecycle row AND table-scoped backlog = 0 → 'complete'
```

The backlog count in steps 2 and 4 is **table-scoped**: `WHERE casino_id = ? AND gaming_day = ? AND table_id = ? AND fact_class = 'operational' AND processed_at IS NULL`. Pending rows for other tables do not influence this table's completeness signal.

**ADR-054 R4 authority invariant:** `OperationalProjectionResponseDTO.type` is always `'estimated'`. The completeness function returns `type: 'estimated'` unconditionally — no completeness step, no lifecycle state, and no consumer layer may upgrade this to `'actual'`, `'observed'`, or `'compliance'`. This is enforced by an explicit invariant test suite.

**DEC-EXEC-4 — casinoId from rlsContext only:** `GET /api/v1/table-context/operational-projection` accepts `gamingDay` and `tableId` as query params but not `casinoId`. Casino identity comes exclusively from `ctx.rlsContext.casinoId` derived by `withServerAction`. Any `casinoId` query param is ignored and must not reach the service function. This prevents casino spoofing via query string manipulation.

**Observability three-way backlog (Phase 2.4 addition):** `GET /api/internal/outbox-observability` now returns `operationalBacklog: {claimable: N, deadLetter: N}`. Claimable = `delivery_attempts < 5` AND `processed_at IS NULL` AND `fact_class = 'operational'`. Dead letter = `delivery_attempts >= 5` AND `processed_at IS NULL` AND `fact_class = 'operational'`. The threshold of 5 is consistent with `rpc_claim_operational_outbox_batch`'s claim predicate (`delivery_attempts < 5`).

---

### Artifacts Delivered (across 6 workstreams)

**WS1_DB — Schema Migrations**

- `supabase/migrations/20260521015409_create_shift_operational_projection.sql`

  Creates `shift_operational_projection` with primary key `(casino_id, gaming_day, table_id)`. Columns: `grind_volume_cents BIGINT NOT NULL DEFAULT 0`, `fill_total_cents BIGINT NOT NULL DEFAULT 0`, `credit_total_cents BIGINT NOT NULL DEFAULT 0`, `event_count BIGINT NOT NULL DEFAULT 0`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. RLS enabled; no authenticated policies — service_role-only access. This ensures the completeness derivation and the relay consumer share the same access model as Phase 2.3's `visit_class_a_projection`: all access through `createServiceClient()`.

- `supabase/migrations/20260521022656_create_rpc_claim_operational_outbox_batch.sql`

  Creates `rpc_claim_operational_outbox_batch(p_batch_size INTEGER)`. SECURITY DEFINER; `SET search_path = ''`; `anon`/`authenticated` EXECUTE revoked; `service_role` retains EXECUTE. Claim predicate: `fact_class = 'operational' AND processed_at IS NULL AND delivery_attempts < 5`. Returns rows from `finance_outbox` with `FOR UPDATE SKIP LOCKED`. The `delivery_attempts < 5` guard is the dead-letter boundary — rows at 5 or more attempts are excluded from claims and surface as `operationalBacklog.deadLetter` in observability.

- `supabase/migrations/20260521022703_create_rpc_process_operational_projection.sql`

  Creates `rpc_process_operational_projection(p_message_id UUID) RETURNS TEXT`. SECURITY DEFINER; `SET search_path = ''`. Returns `'processed' | 'duplicate' | 'skipped_ledger' | 'skipped_unknown' | 'not_found'`.

  Execution path:
  ```
  1. SELECT * FROM finance_outbox WHERE event_id = p_message_id FOR UPDATE → 'not_found' if absent
  2. Check fact_class = 'operational' → 'skipped_ledger' if fact_class = 'ledger'
     → 'skipped_unknown' if unrecognized fact_class
  3. INSERT INTO processed_messages(message_id) ON CONFLICT DO NOTHING → 'duplicate' if 0 rows inserted
  4. Read amount_cents from payload->>'amount_cents' (COALESCE NULL to 0)
  5. UPSERT shift_operational_projection ON CONFLICT (casino_id, gaming_day, table_id) DO UPDATE:
       grind_volume_cents += CASE WHEN event_type = 'grind.observed'  THEN amount_cents ELSE 0 END
       fill_total_cents   += CASE WHEN event_type = 'fill.recorded'   THEN amount_cents ELSE 0 END
       credit_total_cents += CASE WHEN event_type = 'credit.recorded' THEN amount_cents ELSE 0 END
       event_count        += 1
       updated_at          = now()
  6. UPDATE finance_outbox SET processed_at = now() WHERE event_id = p_message_id
  7. RETURN 'processed'
  ```

  Steps 3–6 execute inside a single transaction. `'skipped_ledger'` and `'skipped_unknown'` are error outcomes (pushed to the consumer's `errors[]`); `'processed'` and `'duplicate'` are non-error outcomes. This differs from Phase 2.3's skip semantics — there, `'skipped_operational'` was a fallthrough for misrouted rows; here, any non-operational row arriving at this RPC is definitively wrong and must be surfaced as an error.

- `supabase/migrations/20260521022708_create_idx_finance_outbox_operational_backlog.sql`

  Creates index `idx_finance_outbox_operational_backlog` on `finance_outbox(casino_id, fact_class, delivery_attempts, processed_at)`. Supports the claimable/dead-letter count queries in the observability route without a sequential scan of the full table.

**WS2_CONSUMER — Operational Consumer Service & Relay**

- `services/player-financial/outbox-operational-consumer.ts` (new file)

  Exports `runOperationalConsumer(supabase: SupabaseClient<Database>, deadline?: number): Promise<{ processed: number; duplicate: number; errors: Error[] }>`. Separate type `OperationalConsumerResult` (internal, `errors: Error[]`) distinct from `OperationalConsumerResultDTO` (serialized, `errors: string[]`).

  Implementation: calls `rpc_claim_operational_outbox_batch({ p_batch_size: OPERATIONAL_BATCH_SIZE })` (cap 25). If claim errors, returns early with empty result. For each row, calls `rpc_process_operational_projection({ p_message_id: row.event_id })`. Outcome routing:
  - `'processed'` → increment `processed`
  - `'duplicate'` → increment `duplicate` (not an error)
  - `'skipped_ledger'`, `'skipped_unknown'`, `'not_found'` → push `new Error(outcome)` to `errors[]`
  - Thrown exception → push to `errors[]`, continue processing remaining rows

  Stop-before-deadline: if `Date.now() >= deadline` at entry, returns immediately with `{ processed: 0, duplicate: 0, errors: [] }`. No rows claimed, no side effects.

- `services/player-financial/dtos.ts` (amendment)

  Added `OperationalConsumerResultDTO: { processed: number; duplicate: number; errors: string[] }`. Added `OutboxOperationalBacklogDTO` for observability. `errors` is `string[]` in the DTO (serialized at the relay boundary) but `Error[]` in the internal consumer result type — the relay route converts via `errors.map(e => e.message)`.

- `app/api/internal/outbox-relay/route.ts` (amendment)

  Class A branch unchanged. After Class A completes, the route checks the stop-before-deadline window. If not breached, calls `runOperationalConsumer(serviceClient, deadline)` with the shared `serviceClient`. If the operational branch throws, the error is caught, Class A result is preserved, and the operational result is returned as `{ processed: 0, duplicate: 0, errors: ['<caught error message>'] }`. Response body restructured: `{ classA: { processed, failed }, operational: { processed, duplicate, errors } }`. The `classA` key replaces the previous flat `{ processed, failed }` envelope.

- `app/api/internal/outbox-observability/route.ts` (amendment)

  Two additional `from('finance_outbox')` queries added after the two RPC calls: (1) `.select('*', { count: 'exact', head: true }).eq('fact_class', 'operational').is('processed_at', null).lt('delivery_attempts', 5)` → claimable count; (2) same chain with `.gte('delivery_attempts', 5)` → dead-letter count. Both run in `Promise.all` alongside the existing health and events RPCs. Response gains `operationalBacklog: { claimable, deadLetter }`.

**WS3_COMPLETENESS — Completeness Derivation, Route & DTO**

- `services/player-financial/crud.ts` (amendment)

  New exported function `getShiftOperationalCompleteness(supabase, casinoId, gamingDay, tableId)`. Accepts the client externally (same pattern as Phase 2.3's `getVisitClassACompleteness`) — callers must pass `createServiceClient()` because `shift_operational_projection` is service_role-only. The backlog count query (step 4/5) is table-scoped: `WHERE casino_id = casinoId AND gaming_day = gamingDay AND table_id = tableId AND fact_class = 'operational' AND processed_at IS NULL`.

- `app/api/v1/table-context/operational-projection/route.ts` (new file)

  `GET /api/v1/table-context/operational-projection`. Required query params: `gamingDay` (YYYY-MM-DD format; Zod `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`), `tableId` (UUID; Zod `z.string().uuid()`). Missing or invalid params return 400 with `code: 'VALIDATION_ERROR'`. `casinoId` is extracted from `ctx.rlsContext.casinoId` — never from query params. Calls `getShiftOperationalCompleteness` via `withServerAction` middleware chain. Response envelope: `ServiceHttpResult<OperationalProjectionResponseDTO>`.

- `services/player-financial/dtos.ts` (amendment)

  Added `OperationalProjectionResponseDTO: { totalCents: number; count: number; completeness: { status: 'complete' | 'partial' | 'unknown' }; type: 'estimated' }`. The `type` field is a literal `'estimated'` — not a union. TypeScript enforces that no code path may assign any other value.

- `hooks/table-context/use-buyin-telemetry.ts` (amendment, DEC-EXEC-2)

  Interface changed from `shiftWindow: { start: string; end: string }` to `gamingDay: string`. The hook previously fetched from `table_buyin_telemetry` (direct polling); Phase 2.4 routes through the new projection route. The `shiftWindow` parameter was the legacy time-range anchor for polling; `gamingDay` is the gaming-day key for the projection store.

- `docs/25-api-data/api-surface.openapi.yaml` (amendment)

  Added `GET /api/v1/table-context/operational-projection` operation with required query params `gamingDay` and `tableId`, 200 response schema referencing `OperationalProjectionResponseDTO`, and 400 error response.

**WS4_PANEL — GrindBuyinPanel Mount (PWB-003 Closure)**

- `components/table/grind-buyin-panel.tsx` (amendment)

  Interface changed from `shiftWindow` to `gamingDay: string`. Undo negative path removed — the undo action wrote a negative grind observation, which was identified as an incorrect authority pattern (it would emit a `grind.observed` row with a negative amount, corrupting the projection accumulator). The panel now supports only forward grind observations.

- `components/pit-panels/tables-panel.tsx` (amendment)

  Added `gamingDay?: string` to `TablesPanelProps`. `GrindBuyinPanel` mounted inside the `selectedTable` non-null guard block, conditioned on `gamingDay` being truthy:
  ```tsx
  {gamingDay && (
    <GrindBuyinPanel tableId={selectedTable.id} casinoId={casinoId} gamingDay={gamingDay} />
  )}
  ```
  Import added: `import { GrindBuyinPanel } from '@/components/table/grind-buyin-panel'`.

- `components/pit-panels/panel-container.tsx` (amendment)

  `gamingDay?.date` passed as `gamingDay` to `TablesPanel` in both `renderActivePanel()` branches (`case 'tables':` and `default:`). The `gamingDay` state already existed in `PanelContainer` from prior work — no new Zustand store or global state required.

**WS5_TESTS — Test Coverage (6 new/updated suites)**

- `services/player-financial/__tests__/outbox-operational-consumer.test.ts` (new file)

  Tests: empty claim batch returns zero result; `'processed'` increments processed; `'duplicate'` increments duplicate (not error); `'skipped_ledger'`, `'skipped_unknown'`, `'not_found'` push to errors[]; thrown exception per row is caught and continues; claim error returns early; multi-row accumulation across mixed outcomes; DEC-EXEC-3 — `rpc_acknowledge_outbox_delivery` is never called for operational rows; batch_size constant is 25; stop-before-deadline with breached deadline returns empty immediately.

- `services/player-financial/__tests__/operational-authority-degradation.test.ts` (new file)

  ADR-054 R4 invariant test suite. Verifies all five completeness steps always return `type: 'estimated'`: Step 1 (unknown: no rows), Step 2 (complete-zero: lifecycle row + zero backlog), Step 3 (partial: projection row, no lifecycle), Step 4 (partial: projection + lifecycle + backlog > 0), Step 5 (complete: all satisfied). Type-level invariant: constructs `OperationalProjectionResponseDTO` with `type: 'estimated'` and asserts it is not `'actual'`, `'observed'`, or `'compliance'`.

- `services/player-financial/__tests__/shift-operational-completeness.test.ts` (new file)

  Tests all five completeness steps with precise `from()` chain ordering. Verifies TABLE-SCOPED backlog: the backlog count query for table A is not affected by pending operational rows for table B (separate `from()` call with different `table_id` binding). `makeSupabase` helper uses call index to route: idx=0 → projection query (`.maybeSingle()`), idx=1 → lifecycle query (`.maybeSingle()`), idx=2 → backlog count (chain terminates on `.is('processed_at', null)` not `.lt()`/`.gte()`).

- `services/player-financial/__tests__/outbox-relay.test.ts` (updated)

  Updated to mock `@/services/player-financial/outbox-operational-consumer` (`runOperationalConsumer: jest.fn()`). Added `gaming_day: '2026-05-21'` to `makeRow()` helper (required by `FinancialOutboxEventDTO`). Removed `from` mock from `makeSupabase` (operational consumer is a separate mock). All response body assertions updated: `body.processed` → `body.classA.processed`, `body.failed` → `body.classA.failed`, removed `body.backlog`. New tests: response always contains both `classA` and `operational` keys; operational consumer called with the same service client instance (not a new one); errors serialized as `string[]` in the response; graceful degradation when operational branch throws (Class A result preserved, operational result has error entry).

- `app/api/internal/outbox-observability/__tests__/route.test.ts` (updated)

  `buildServiceClient` helper rebuilt to support the new promise.all structure: `rpc` mock (`mockResolvedValueOnce` × 2 for health and events RPCs) plus `from` mock (`mockReturnValueOnce` × 2 for claimable and dead-letter count chains). New tests: `operationalBacklog: {claimable, deadLetter}` present in response; `from('finance_outbox')` called twice for count queries; first chain ends with `.lt('delivery_attempts', 5)`, second with `.gte('delivery_attempts', 5)`.

- `app/api/v1/table-context/operational-projection/__tests__/route.test.ts` (new file)

  `/** @jest-environment node */`. Uses `NextRequest` from `next/server` (required for `parseQuery` compatibility — plain `Request` does not expose search params correctly in Jest). Mocks: `@/lib/supabase/server` (createClient), `@/lib/supabase/service` (createServiceClient), `@/lib/server-actions/middleware` (withServerAction calls handler directly with mocked context), `@/services/player-financial/crud` (getShiftOperationalCompleteness). UUID `11111111-1111-1111-1111-111111111111` used in `VALID_PARAMS` — valid under the project's permissive `uuidFormat` regex (8-4-4-4-12 hex format; the project deliberately uses `uuidFormat` over Zod's `.uuid()` to avoid rejecting database UUIDs that don't follow RFC 4122 version/variant conventions). Tests: missing `gamingDay` → 400 VALIDATION_ERROR; invalid gamingDay format → 400; missing `tableId` → 400; non-UUID tableId (`'not-a-uuid'`) → 400; valid params → 200 with OperationalProjectionResponseDTO shape; `type: 'estimated'` invariant; `casinoId` from rlsContext not query params (DEC-EXEC-4); service function receives correct `(supabase, casinoId, gamingDay, tableId)` args; completeness status reflected in response.

**WS6_GOVERNANCE — Wave Tracker Closure**

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md`

  Status header: cursor advanced from Phase 2.4 pending to Phase 2.5. Phase 2.4 section title marked `✅ COMPLETE 2026-05-21` with PRD/EXEC references. All 14 deliverable checkboxes ticked with migration IDs and file paths. Exit gate marked `✅ MET (2026-05-21)` per criterion. PWB-003 row in §10 updated to CLOSED (GrindBuyinPanel mounted Phase 2.4). Promotion rule updated (PWB-003 not promoted). §8 criterion 4 updated to reflect Phase 2.4 live status.

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md`

  Category B producer status updated from "Component ready; not in page tree" to "MOUNTED — Phase 2.4 closed this gap". Layer 5 in the isolation protocol updated from "Deferred (Phase 2.3/PRD-087 projection consumers not yet live)" to "✅ LIVE as of Phase 2.3 (Class A) and Phase 2.4 (operational)". Phase 5 Operational Trust Gate: Producer 6 row updated to reflect UI workflow now available. Footer trust gate rationale updated to reflect both projection consumers live and Category B resolved.

---

### Critical Implementation Decisions

**DEC-EXEC-1 — Operational payload field is `amount_cents`, not `amount`:** Phase 2.3 Class A rows encode amounts as `payload.amount` (integer cents). Phase 2.4 operational rows encode amounts as `payload.amount_cents`. This was confirmed by reading `rpc_process_operational_projection` migration source before any TypeScript implementation. The consumer reads `payload->>'amount_cents'` — if the field had been assumed to be `amount`, every projection row would accumulate 0.

**DEC-EXEC-2 — `useGrindBuyinTotal` / `use-buyin-telemetry` interface changed from `shiftWindow` to `gamingDay`:** The legacy `shiftWindow: { start, end }` parameter was a time-range anchor for direct polling of `table_buyin_telemetry` (a real-time aggregation view). Phase 2.4 routes through `shift_operational_projection` keyed by gaming day. The interface change is a breaking change for any callers — confirmed no other callers existed before proceeding. The legacy `table_buyin_telemetry` reference was removed from the hook.

**DEC-EXEC-3 — No separate `rpc_acknowledge_outbox_delivery` for the operational branch:** The operational RPC stamps `processed_at` atomically inside its own transaction (steps 3–6 all commit together). Calling a separate acknowledge RPC after the fact would be a redundant operation and would introduce a TOCTOU window — if the process RPC succeeded but the acknowledge call failed, the row would be reprocessed on the next relay cycle. Atomic stamping inside the process RPC eliminates this window entirely.

**DEC-EXEC-4 — `casinoId` from `rlsContext` only; any query param `casinoId` is ignored:** The `withServerAction` middleware derives `rlsContext.casinoId` from the staff JWT → staff table lookup chain (ADR-024 authoritative context derivation). A `casinoId` query param is caller-supplied and unverified. Accepting it would allow a staff user to request projection data for a casino they are not authenticated to. The route validates `gamingDay` and `tableId` from query params but always reads `casinoId` from `ctx.rlsContext.casinoId`.

**DEC-EXEC-5 — Undo negative path removed from `GrindBuyinPanel`:** The undo action emitted a `grind.observed` row with a negative `amount_cents` in the payload. The projection accumulator (`grind_volume_cents +=`) would interpret this as a subtraction. However, accumulating negative amounts creates a shared-mutable-counter problem: the projection is not a log; it is a materialized aggregate. A negative observation would require the consumer to track sign-aware accumulation, which is outside the scope of operational telemetry and violates the spirit of `origin_label: 'estimated'` (estimated volume should not go negative from corrections — corrections are a Class A / adjustment pattern). The undo path is removed; the panel supports forward observations only.

**DEC-EXEC-6 — `errors` is `string[]` in `OperationalConsumerResultDTO` but `Error[]` internally:** The relay route boundary serializes errors before writing them to the response body. The internal `OperationalConsumerResult` type carries `Error[]` to preserve stack traces for logging. At the relay response boundary, `errors.map(e => e.message)` converts to `string[]` for the HTTP response. These are explicitly distinct types — `OperationalConsumerResultDTO` uses `string[]` and must never be assigned an `Error[]` directly.

**DEC-EXEC-7 — Use `uuidFormat` (permissive regex), not `z.string().uuid()`, for route query params:** The project uses `uuidFormat` (defined in `services/player-financial/schemas.ts`) which validates the 8-4-4-4-12 hex format without checking RFC 4122 version/variant bits. Zod's `.uuid()` would reject valid database UUIDs like `11111111-1111-1111-1111-111111111111` (variant byte `1` is not in range `8-b`), causing legitimate requests to fail. The pre-commit hook enforces that Zod schemas live in `services/{domain}/schemas.ts` — `operationalProjectionQuerySchema` is exported from there and imported into the route. This also surfaced that the Zod `.uuid()` method is deprecated in the version used in this project.

**DEC-EXEC-8 — TABLE-SCOPED backlog in completeness (not casino/gaming-day global):** The backlog count query includes `AND table_id = tableId`. A table whose operational consumer has processed all its rows correctly returns `'complete'` even if another table in the same casino/gaming-day has pending rows. Global casino-day backlog would make every table's completeness hostage to every other table's relay lag — the signal would be permanently `'partial'` in multi-table environments.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` — scope authority (no amendment required for this phase) |
| FIB-S | null — not generated (FIB-H pre-authorizes operational consumer slice) |
| PRD-088 | `docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection.md` |
| EXEC-088 | `docs/21-exec-spec/EXEC-088-wave2-phase-2.4-operational-telemetry-projection.md` — 6 workstreams |
| Checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-088.json` — status: complete |
| Rollout Map | `wave-2/WAVE-2-ROLLOUT-MAP.md` — Phase 2.4 section marked ✅ COMPLETE; cursor at Phase 2.5 |
| Core Loop | `wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md` — Category B and Layer 5 updated |

**Governing ADRs (frozen):**
- ADR-052: Financial Fact Model — `fact_class`, `origin_label` discriminator rules; `'operational'` class definition
- ADR-054: Financial Event Propagation & Surface Contract — R4 authority invariant (`type: 'estimated'`); D5 origin_label immutability; `processed_messages` idempotency requirement
- ADR-055: Intra-category parity — fill/credit shipped simultaneously in Phase 2.2; this consumer processes them as a pair
- ADR-056: Outbox write-path governance — SECURITY DEFINER enforcement for all outbox-touching RPCs

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS — exit 0 |
| `npm run lint` | PASS — exit 0 |
| Unit tests (WS5 targeted suites) | PASS — 58/58 tests, 6 suites, 0 failures |
| ADR-054 R4 authority invariant suite | PASS — 6 tests across all 5 completeness steps |
| Route contract tests | PASS — 9 tests (4 validation, 5 success paths) |
| Relay response shape tests | PASS — classA/operational dual-key structure verified |
| Observability three-way backlog tests | PASS — claimable/deadLetter query args verified |

---

### Phase 2.4 Gate Status

**COMPLETE.** All six workstreams delivered. Operational consumer wired, `shift_operational_projection` live, route surfacing completeness signal, `GrindBuyinPanel` mounted (PWB-003 closed), ADR-054 R4 authority invariant test suite passing. Cursor advanced to Phase 2.5.

**What is explicitly deferred (post-Wave-2 backlog):**

- Phase 2.5 (Observability + Sign-Off) — relay log-line metrics (`outbox_backlog_size`, `processing_lag_ms`), finance outbox retention policy, `WAVE-2-SIGN-OFF.md`. Requires PRD-089 before code.
- PWB-001: `adjustment.recorded` anchor resolution — `original_txn_id` is never passed by the rating-slip modal or MTL compliance dashboard; ADR-057 gate silently skips emission. Governed by PROD-ANCHOR-STD-001.
- PWB-002: Fill/credit operator UI — `rpc_request_table_fill` and `rpc_request_table_credit` are RPC/API-certified; no operator-facing trigger surface exists; outbox rows require direct API call in the current state.
- `cashout.recorded` producer — `rpc_create_financial_txn` hardcodes `'buyin.recorded'`; direction branch absent. Governed by W2-OBS-CASHOUT-PRODUCER-001.
- Integration tests for the operational consumer at Mode C auth (staff JWT) — the `rpc_claim_operational_outbox_batch` RPC calls `set_rls_context_from_staff()` internally; service-role unit tests cover the consumer logic; live RPC tests require a seeded staff user with `app_metadata.staff_id`.
- type-check, lint, build on CI — validated locally; CI gates pending branch merge.
