# Wave 2 Integration Proof — Signoff

prd: PRD-082
exec_spec: docs/21-exec-spec/EXEC-082-wave2-integration-proof.md
run_date: 2026-05-12
run_by: Vladimir Ivanov
environment_tested: local Supabase (http://127.0.0.1:54321) — disposable, not shared preview/staging/production

commands_or_scripts_run: |
  docker exec -i supabase_db_pt-2 psql -U postgres < supabase/migrations/20260512021632_fix_wave2_transport_path_bugs.sql
  docker exec -i supabase_db_pt-2 psql -U postgres (player_casino insert + finance_outbox policy patch applied directly)
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 ... npx tsx scripts/outbox-proof/run-all.ts

transport_path_patches_applied: |
  Migration 20260512021632_fix_wave2_transport_path_bugs.sql applied before suite run.
  Three bugs fixed:
  1. rpc_create_financial_txn: ON CONFLICT DO UPDATE → DO NOTHING + SELECT fallback.
     Root cause: player_financial_transaction_no_updates (USING=false) causes RLS failure
     even without a real conflict when ON CONFLICT specifies a partial index target.
  2. bridge_rated_buyin_to_telemetry() trigger: added event_type column (NOT NULL since Wave 2).
     Root cause: migration 20260511134257 added event_type NOT NULL but did not update trigger.
  3. finance_outbox INSERT policy: added finance_outbox_insert_staff policy for authenticated role.
     Root cause: migration 20260511134129 assumed SECURITY DEFINER RPCs for all outbox writes,
     but rpc_create_financial_txn is SECURITY INVOKER (per ADR-040); no INSERT policy = default deny.
  Seed bug fixed: player_casino record for proof player was missing; SELECT RLS policy on
  player_financial_transaction requires player_casino for visibility.

I1_result: PASS
I1_detail: |
  Part A (Class A success): rpc_create_financial_txn(direction=in, slip_id=PROOF.SLIP_ID) →
    PFT row returned, 1 finance_outbox row with event_type=buyin.recorded, fact_class=ledger,
    origin_label=actual, casino_id=CASINO_1_ID, table_id=TABLE_1_ID, player_id=PLAYER_ID.
  Part B (Class A F14 rollback): rpc_create_financial_txn with nonexistent slip UUID →
    exception raised, 0 finance_outbox rows, 0 PFT rows (atomic rollback).
  Part C (Class B success): rpc_record_grind_observation(TABLE_1_ID, 5000) →
    grind_id returned, 1 finance_outbox row with event_type=grind.observed, fact_class=operational,
    origin_label=estimated, casino_id=CASINO_1_ID, table_id=TABLE_1_ID, player_id=NULL.
  Part D (Class B cross-casino rejection): rpc_record_grind_observation(TABLE_2_ID, ...) →
    exception raised, 0 finance_outbox rows (atomic rollback).

I2_result: PASS
I2_detail: |
  Claimed 1 row via rpc_claim_outbox_batch(1), did NOT commit (crash simulation).
  Post-crash: processed_at=NULL, delivery_attempts=1.
  Re-claimed same event_id: delivery_attempts=2 (reclaimability inherent via processed_at IS NULL).
  Committed via rpc_commit_consumer_receipt: processed_at set, result='processed'.

I3_result: PASS
I3_detail: |
  Created Class A outbox row. First relay: rpc_commit_consumer_receipt returned 'processed',
  exactly 1 outbox_integration_proof_state row written by receipt SQL transaction (DEC-003).
  Reset state (truncate proof-state + processed_messages, reset processed_at).
  Second relay: rpc_commit_consumer_receipt returned 'duplicate', proof-state still exactly 1 row
  (ON CONFLICT DO NOTHING — harness SQL boundary enforced).

I4_result: PASS
I4_detail: |
  Generated 15 outbox rows (Class A + Class B). Relay complete: all 15 processed.
  Live fingerprint: eaae205b1e02b9d8067c29766f34abde (15 proof-state rows, consumed_at excluded).
  Reset state. Replay complete: replay fingerprint eaae205b1e02b9d8067c29766f34abde.
  live === replay (deterministic event ordering via UUIDv7 event_id).

I5_result: PASS
I5_detail: |
  cashier role: rpc_create_financial_txn(direction=out, source=cage, no slip) → PFT row created,
  0 finance_outbox rows emitted. Cashout non-emission holds for Wave 2 cage path.

runtime_drift_findings: |
  All 8 drift checks: PASS.
  BLOCKING_DRIFT_CLASSES: none
  NON_BLOCKING_FINDINGS: none
  DRIFT_CLASSIFICATION: ALL_NON_BLOCKING
  Checks: ENV_VARS, CRON_SECRET_VALIDATION, SERVICE_ROLE_RPC_ACCESS, RPC_CREATE_FINANCIAL_TXN,
  RPC_RECORD_GRIND_OBSERVATION, RPC_COMMIT_CONSUMER_RECEIPT, RLS_BOUNDARY, PROOF_STATE_TABLE_ACCESSIBLE.

decision: Phase 2.1 authorized

decision_rationale: |
  All five invariants proven (I1 Atomicity, I2 Durability, I3 Idempotency, I4 Replayability,
  I5 Cashout Non-Emission = PASS). Runtime drift classification = ALL_NON_BLOCKING.
  No blocking drift classes (RELAY_AUTH_BROKEN, SERVICE_ROLE_RPC_ACCESS_BROKEN,
  RLS_BOUNDARY_BROKEN) detected. Decision rule from EXEC-082 §runtime_authorization_rule: satisfied.

teardown_status: |
  TEARDOWN-ARTIFACT-PRD-082.md exists at:
  docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md
  Teardown must be executed before any Phase 2.1 producer-expansion artifact is merged.
  Harness infrastructure (outbox_integration_proof_state table + rpc_commit_consumer_receipt
  harness amendment) remains local-only; not present in remote or shared environments.
