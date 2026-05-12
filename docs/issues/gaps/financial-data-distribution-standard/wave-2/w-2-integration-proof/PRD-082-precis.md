## PRD-082: Wave 2 Integration Proof — Exemplar Runtime Validation Gate — Delivery Précis

### What This Was (And Was Not)

PRD-082 is the **runtime validation gate** for the Wave 2 transactional outbox exemplar delivered by PRD-081. It does not change business behavior, expand producers, implement projection consumers, or introduce any operator-visible surface. Its sole function is to prove that the PRD-081 transport chain satisfies five invariants against a real running database before any Phase 2.1 producer-expansion work is authorized. All artifacts produced by this slice are either validation-harness infrastructure (migration, seed, proof scripts) or the signed evidence artifact whose `decision` field is the Phase 2.1 gate.

**Containment boundary (one-line invariant):** *If it is not a harness DDL migration, an integration seed, a proof script, or a transport-path bug fix required to make a proof pass, it is not in this PRD.*

The gate required proving five invariants:

| Invariant | Description |
|-----------|-------------|
| I1 Atomicity | finance_outbox INSERT and the authoring-table INSERT either both commit or both roll back |
| I2 Durability | a claimed-but-uncommitted row is reclaimable on the next relay cycle; delivery_attempts increments on retry |
| I3 Idempotency | a duplicate event_id delivery returns `'duplicate'`; exactly one proof-state row exists after two deliveries |
| I4 Replayability | live fingerprint (md5 over ordered event_ids) equals replay fingerprint after state reset |
| I5 Cashout Non-Emission | a cage cashout (direction='out') creates a PFT row but emits zero finance_outbox rows |

The architecture review accepted **Option A**: harness proof-state writes must live inside `rpc_commit_consumer_receipt` in the same PostgreSQL transaction as `processed_messages`. TypeScript-side proof-state writes are inadmissible evidence. Execution is restricted to disposable local environments only.

---

### Transport-Path Bugs Fixed During Execution

Four transport-path defects were uncovered and fixed during WS4 proof execution. They are recorded in `supabase/migrations/20260512021632_fix_wave2_transport_path_bugs.sql`. None were known at spec time; all are genuine PRD-081 transport bugs that would have manifested in production relay runs.

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Bug 1: `rpc_create_financial_txn` RLS failure | `ON CONFLICT DO UPDATE` — `player_financial_transaction_no_updates` denial policy (USING=`false`) causes PostgreSQL to reject any `DO UPDATE` statement even when no conflict occurs, because PostgreSQL checks the SELECT policy for the conflict-resolution path regardless of whether a real conflict is encountered | Changed to `DO NOTHING` + SELECT fallback for idempotency replay |
| Bug 2: `bridge_rated_buyin_to_telemetry()` trigger | Wave 2 migration 20260511134200 added `event_type NOT NULL` to `table_buyin_telemetry` but did not update this AFTER INSERT trigger. Rated buy-ins failed with a NOT NULL constraint violation | Added `v_event_type` variable set to `'buyin.observed'` for both RATED_BUYIN and RATED_ADJUSTMENT kinds |
| Bug 3: `rpc_create_financial_adjustment` RLS failure | Same `DO UPDATE` denial-policy issue as Bug 1 | Same `DO NOTHING` fix |
| Bug 4: `finance_outbox` INSERT default-deny | Migration 20260511134100 comment stated "SECURITY DEFINER RPCs insert directly," but `rpc_create_financial_txn` is SECURITY INVOKER (per ADR-040). RLS enabled with zero INSERT policies = default deny for the `authenticated` role | Added `finance_outbox_insert_staff` INSERT policy + `GRANT INSERT ON finance_outbox TO authenticated` |

**Seed defect:** The proof player had no `player_casino` enrollment record. The `player_financial_transaction` SELECT policy requires `EXISTS(SELECT 1 FROM player_casino WHERE player_id = ... AND casino_id = ...)`. Without this, targeted `ON CONFLICT` with a partial index predicate fails RLS during conflict resolution even when no conflict occurs. Fixed by adding `player_casino` INSERT (Step 5.5) and `app_metadata` setup (Step 9.5) to `scripts/outbox-proof/seed.ts`, and applying the record directly to the local DB.

**Key PostgreSQL 17 behavior documented:** When `ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL` targets a partial index, PostgreSQL checks the SELECT policy on the conflict-resolution scan path even when no actual conflict exists. The SELECT policy for `player_financial_transaction` requires `player_casino` visibility. This is a targeted-ON CONFLICT-specific behavior; plain-column `ON CONFLICT DO NOTHING` (no partial index predicate) does not trigger this check.

---

### Artifacts Delivered (12 files across 4 workstreams)

**WS1 — Harness DDL**
- `supabase/migrations/20260512000744_add_outbox_integration_proof_state.sql` — Creates `outbox_integration_proof_state` table (harness-only, not a projection store) with columns mirroring `finance_outbox` plus `seq BIGSERIAL PK` and `consumed_at TIMESTAMPTZ`. RLS enabled, no policies; `GRANT SELECT, INSERT, TRUNCATE TO service_role`. Amends `rpc_commit_consumer_receipt` to write a proof-state row in the same SQL transaction as `processed_messages` INSERT, ON CONFLICT (event_id) DO NOTHING. `consumed_at` excluded from I4 fingerprint (wall-clock time diverges across live and replay runs)
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md` — Explicit teardown artifact defining the required follow-up migration path before any Phase 2.1 producer-expansion artifact merges. Enumerates accepted and rejected teardown mechanisms. Phase 2.1 merge is blocked until the teardown migration exists

**WS2 — Integration Data Seed**
- `scripts/outbox-proof/seed.ts` — Idempotent TypeScript seed script (via `tsx`) creating FK-valid data anchors with fixed literal UUIDs for all proof fixtures. Creates Supabase auth user `proof-staff@outbox-proof.local` via `auth.admin.createUser()`, plus company, two casinos, two gaming tables, player, player_casino enrollment, visit, rating_slip, and staff record. Step 9.5 sets `app_metadata` (staff_id, casino_id, staff_role=pit_boss) required for `set_rls_context_from_staff()` JWT extraction. Exits after validating sign-in produces a live access token

**WS3 — Invariant Proof Scripts**
- `scripts/outbox-proof/helpers.ts` — Shared utilities: `createAuthenticatedClient()` (signs in as proof-staff; returns live session), `createServiceClient()` (service_role; no auth), `runRelayBatch()` (claim → commit receipt loop; returns processed/duplicate/failed counts), `assert()`, `printResult()`
- `scripts/outbox-proof/run-all.ts` — Orchestrator: imports and runs I1–I5 + drift check in sequence; prints final results table; exits 1 on any FAIL
- `scripts/outbox-proof/i1-atomicity.ts` — Four-part proof: Part A (Class A success — `rpc_create_financial_txn` with valid slip; row content inspection on event_type, fact_class, origin_label, casino_id, table_id, player_id, payload.amount); Part B (Class A F14 failure injection — nonexistent rating_slip_id; proves PFT + outbox roll back atomically); Part C (Class B success — `rpc_record_grind_observation`; row content inspection on event_type='grind.observed', player_id=NULL, payload.amount_cents); Part D (Class B cross-casino failure injection — TABLE_2 belongs to CASINO_2; proves atomic rollback)
- `scripts/outbox-proof/i2-durability.ts` — Claim-without-commit crash simulation: claims one row, does not commit, re-claims same row; asserts `delivery_attempts=2` and `processed_at IS NULL` on retry; commits and asserts `processed_at` set
- `scripts/outbox-proof/i3-idempotency.ts` — First delivery returns `'processed'`; query of `outbox_integration_proof_state` finds exactly 1 row; state reset; second delivery returns `'duplicate'`; proof-state still exactly 1 row (ON CONFLICT DO NOTHING at SQL boundary)
- `scripts/outbox-proof/i4-replayability.ts` — Generates 15 outbox rows; runs live relay; captures `md5(string_agg(event_id||event_type||aggregate_id ORDER BY event_id))` fingerprint; resets state (TRUNCATE proof_state + processed_messages, clear processed_at); replays same rows; asserts live fingerprint === replay fingerprint (`eaae205b1e02b9d8067c29766f34abde`)
- `scripts/outbox-proof/i5-cashout-non-emission.ts` — Calls `rpc_create_financial_txn(direction='out', source='cage', no slip)` as cashier role; asserts PFT row created, zero `finance_outbox` rows emitted
- `scripts/outbox-proof/drift-check.ts` — Eight runtime environment checks: ENV_VARS, CRON_SECRET_VALIDATION, SERVICE_ROLE_RPC_ACCESS, RPC_CREATE_FINANCIAL_TXN, RPC_RECORD_GRIND_OBSERVATION, RPC_COMMIT_CONSUMER_RECEIPT, RLS_BOUNDARY, PROOF_STATE_TABLE_ACCESSIBLE. Classifies findings as blocking or non-blocking per DEC-004

**WS4 — Proof Execution + Transport Patches**
- `supabase/migrations/20260512021632_fix_wave2_transport_path_bugs.sql` — Transport-path patch migration fixing all four bugs described above. Replaces `rpc_create_financial_txn` and `rpc_create_financial_adjustment` ON CONFLICT clause, restores `bridge_rated_buyin_to_telemetry()` trigger with Wave 2 `event_type` column, adds `finance_outbox_insert_staff` RLS policy
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` — Signed evidence artifact. All 8 FR-7 fields present. `decision: Phase 2.1 authorized`

---

### Proof Execution Results

| Invariant | Result | Key Evidence |
|-----------|--------|-------------|
| I1 Atomicity | PASS | Class A success: PFT + 1 outbox row (buyin.recorded / ledger / actual); Class A F14: exception + 0 rows both tables; Class B success: grind_id + 1 outbox row (grind.observed / operational / estimated / player_id=NULL); Class B cross-casino: exception + 0 rows |
| I2 Durability | PASS | delivery_attempts=1 post-crash; reclaimability confirmed; delivery_attempts=2 on retry; processed_at set after commit |
| I3 Idempotency | PASS | First delivery: `'processed'`, 1 proof-state row; duplicate delivery: `'duplicate'`, still 1 proof-state row (SQL ON CONFLICT DO NOTHING boundary) |
| I4 Replayability | PASS | 15 rows; live fingerprint = replay fingerprint = `eaae205b1e02b9d8067c29766f34abde`; deterministic ordering via UUIDv7 event_id |
| I5 Cashout Non-Emission | PASS | Cashout PFT created; 0 finance_outbox rows |
| Drift | ALL_NON_BLOCKING | 8 checks PASS; no RELAY_AUTH_BROKEN, SERVICE_ROLE_RPC_ACCESS_BROKEN, or RLS_BOUNDARY_BROKEN |

---

### Critical Implementation Decisions

**DEC-001 — reclaimability inherent:** `rpc_claim_outbox_batch` uses `WHERE processed_at IS NULL FOR UPDATE SKIP LOCKED`. No persistent claim-lock state. The lock releases when the transaction commits; `processed_at IS NULL` persists. Row re-enters batch on next relay cycle naturally. No unclaim helper required.

**DEC-002 — outbox_integration_proof_state is not a projection store:** The table is harness-only, introduced for PRD-082 validation. No DTO, no service layer, no React Query key, no gaming_day column. Must not be consumed by application code outside PRD-082 validation scope.

**DEC-003 — proof-state atomicity boundary:** Proof-state rows are valid evidence only when written inside `rpc_commit_consumer_receipt` in the same PostgreSQL transaction as `processed_messages`. TypeScript-side proof-state writes are inadmissible. The current Wave 2 consumer side effect is intentionally a no-op; the SQL receipt boundary is the only truthful proof of duplicate-suppression atomicity.

**DEC-004 — blocking drift classes:** RELAY_AUTH_BROKEN, SERVICE_ROLE_RPC_ACCESS_BROKEN, and RLS_BOUNDARY_BROKEN are blocking. Phase 2.1 authorization is forbidden while any blocking drift class is present. Non-blocking findings are advisory and do not gate signoff.

**DEC-005 — architecture acceptance of Option A:** Architecture accepts the harness-only SQL amendment approach conditional on proof-state remaining inside the real receipt transaction, execution being local-disposable only, preview drift remaining advisory, `outbox_integration_proof_state` being forbidden from reuse outside PRD-082, and an explicit teardown artifact existing before Phase 2.1 authorization.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/FIB-W2-INTEGRATION-PROOF.md` — scope authority |
| FIB-S | `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/fib-s-integration-proof.json` — machine traceability authority |
| PRD-082 | `docs/10-prd/PRD-082-wave2-integration-proof-v0.md` |
| EXEC-082 | `docs/21-exec-spec/EXEC-082-wave2-integration-proof.md` — scope: validation-gate, no business behavior change |
| Architecture Note | `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/ARCHITECTURE-REVIEW-NOTE-HARNESS-SQL.md` — Option A acceptance conditions |
| Teardown Artifact | `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md` — pre-Phase 2.1 merge gate |
| Signoff | `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/WAVE-2-INTEGRATION-PROOF-SIGNOFF.md` — `decision: Phase 2.1 authorized` |
| Checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-082.json` — status: complete |

---

### Validation Results

| Gate | Result |
|------|--------|
| schema-validation (`npm run db:types-local`) | PASS — outbox_integration_proof_state at types/database.types.ts:1569 |
| seed-execute (`npx tsx scripts/outbox-proof/seed.ts`) | PASS — auth sign-in as proof-staff@outbox-proof.local succeeds |
| test-pass (`npx tsc --noEmit`) | PASS — 0 type errors across all proof scripts |
| signoff-validation (all 8 FR-7 fields + decision field) | PASS |
| Proof suite OVERALL | PASS — I1/I2/I3/I4/I5 all PASS; Drift ALL_NON_BLOCKING |

---

### Phase 2.1 Gate Status

**AUTHORIZED.** All five invariants proven. Runtime drift ALL_NON_BLOCKING. Signoff decision: Phase 2.1 authorized.

**Pre-merge teardown requirement:** `TEARDOWN-ARTIFACT-PRD-082.md` exists. Before any Phase 2.1 producer-expansion migration merges, a follow-up migration must:
1. Restore `rpc_commit_consumer_receipt` to its non-harness body
2. Drop or disable `outbox_integration_proof_state`
3. Remove any harness-only grants

The harness infrastructure is currently local-only and is not present in any shared preview, staging, or production environment.

---

### What Is Explicitly Deferred

- Teardown migration execution (blocked on Phase 2.1 work starting; TEARDOWN-ARTIFACT-PRD-082.md defines the path)
- Producer expansion: `rpc_create_financial_adjustment`, `rpc_request_table_fill`, `rpc_request_table_credit` outbox wiring
- Projection consumer implementation (downstream of transport)
- `completeness.status: 'complete'/'partial'` on session aggregates (requires projection consumers)
- Replay UI, DLQ alerting, observability dashboard (active Wave 2 guardrail prohibits)
- `supabase/tests/` pgTAP runner integration in CI
- Preview environment drift comparison (advisory only per DEC-005 / EXEC-082)
