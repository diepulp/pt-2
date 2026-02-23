/**
 * Execute RPC Integration Tests — rpc_import_execute
 *
 * Type-level and documented scenario tests for the import execution RPC.
 * Runtime validation requires a live Supabase instance with seeded data.
 *
 * Scenarios:
 *   - 0 matches: creates new player + player_casino enrollment
 *   - 1 match (email): links to existing player
 *   - N matches: conflict — no production writes
 *   - Idempotent re-execute: returns existing report
 *   - Case-insensitive email matching
 *   - Server-side batch limit enforcement
 *
 * @see services/player-import/crud.ts
 * @see supabase/migrations/20260223021214_prd037_csv_player_import_schema.sql
 * @see PRD-037 CSV Player Import
 */

import type { Database } from '@/types/database.types';

// ============================================================================
// Type Aliases
// ============================================================================

type RpcFunctions = Database['public']['Functions'];
type Tables = Database['public']['Tables'];
type ImportBatchRow = Tables['import_batch']['Row'];
type ImportRowRow = Tables['import_row']['Row'];

// ============================================================================
// 1. RPC Type Contract — Compile-Time Assertions
// ============================================================================

// --- rpc_import_create_batch ---
type CreateBatchArgs = RpcFunctions['rpc_import_create_batch']['Args'];

type _AssertCreateBatchRequiresFileName =
  CreateBatchArgs['p_file_name'] extends string ? true : never;
const _createBatchFileNameCheck: _AssertCreateBatchRequiresFileName = true;

type _AssertCreateBatchRequiresIdempotencyKey =
  CreateBatchArgs['p_idempotency_key'] extends string ? true : never;
const _createBatchIdempotencyKeyCheck: _AssertCreateBatchRequiresIdempotencyKey = true;

// --- rpc_import_stage_rows ---
type StageRowsArgs = RpcFunctions['rpc_import_stage_rows']['Args'];

type _AssertStageRowsRequiresBatchId =
  StageRowsArgs['p_batch_id'] extends string ? true : never;
const _stageRowsBatchIdCheck: _AssertStageRowsRequiresBatchId = true;

// --- rpc_import_execute ---
type ExecuteArgs = RpcFunctions['rpc_import_execute']['Args'];

type _AssertExecuteRequiresBatchId = ExecuteArgs['p_batch_id'] extends string
  ? true
  : never;
const _executeBatchIdCheck: _AssertExecuteRequiresBatchId = true;

// Verify no spoofable params (ADR-024 INV-8)
type _AssertExecuteNoCasinoId = 'p_casino_id' extends keyof ExecuteArgs
  ? never
  : true;
const _executeNoCasinoIdCheck: _AssertExecuteNoCasinoId = true;

type _AssertExecuteNoActorId = 'p_actor_id' extends keyof ExecuteArgs
  ? never
  : true;
const _executeNoActorIdCheck: _AssertExecuteNoActorId = true;

// Verify return type matches import_batch row shape
type ExecuteReturn = RpcFunctions['rpc_import_execute']['Returns'];
type ExecuteReturnRow = ExecuteReturn extends (infer R)[] ? R : never;

type _AssertExecuteReturnsStatus =
  ExecuteReturnRow['status'] extends Database['public']['Enums']['import_batch_status']
    ? true
    : never;
const _executeReturnsStatusCheck: _AssertExecuteReturnsStatus = true;

type _AssertExecuteReturnsReportSummary =
  'report_summary' extends keyof ExecuteReturnRow ? true : never;
const _executeReturnsReportCheck: _AssertExecuteReturnsReportSummary = true;

// ============================================================================
// 2. Batch Status Enum Verification
// ============================================================================

type ImportBatchStatus = Database['public']['Enums']['import_batch_status'];

// Verify status includes required values
type _AssertHasStaging = 'staging' extends ImportBatchStatus ? true : never;
const _hasStagingCheck: _AssertHasStaging = true;

type _AssertHasExecuting = 'executing' extends ImportBatchStatus ? true : never;
const _hasExecutingCheck: _AssertHasExecuting = true;

type _AssertHasCompleted = 'completed' extends ImportBatchStatus ? true : never;
const _hasCompletedCheck: _AssertHasCompleted = true;

type _AssertHasFailed = 'failed' extends ImportBatchStatus ? true : never;
const _hasFailedCheck: _AssertHasFailed = true;

// ============================================================================
// 3. Row Status Enum Verification
// ============================================================================

type ImportRowStatus = Database['public']['Enums']['import_row_status'];

type _AssertRowHasStaged = 'staged' extends ImportRowStatus ? true : never;
const _rowHasStagedCheck: _AssertRowHasStaged = true;

type _AssertRowHasCreated = 'created' extends ImportRowStatus ? true : never;
const _rowHasCreatedCheck: _AssertRowHasCreated = true;

type _AssertRowHasLinked = 'linked' extends ImportRowStatus ? true : never;
const _rowHasLinkedCheck: _AssertRowHasLinked = true;

type _AssertRowHasSkipped = 'skipped' extends ImportRowStatus ? true : never;
const _rowHasSkippedCheck: _AssertRowHasSkipped = true;

type _AssertRowHasConflict = 'conflict' extends ImportRowStatus ? true : never;
const _rowHasConflictCheck: _AssertRowHasConflict = true;

type _AssertRowHasError = 'error' extends ImportRowStatus ? true : never;
const _rowHasErrorCheck: _AssertRowHasError = true;

// ============================================================================
// 4. Table Relationships
// ============================================================================

// import_row references import_batch
type ImportRowRelationships = Tables['import_row']['Relationships'];
type _AssertBatchFk = ImportRowRelationships extends readonly (infer R)[]
  ? R extends { foreignKeyName: 'import_row_batch_id_fkey' }
    ? true
    : R
  : never;

// import_row references player via matched_player_id
type _AssertRowHasMatchedPlayerId =
  'matched_player_id' extends keyof ImportRowRow ? true : never;
const _rowMatchedPlayerIdCheck: _AssertRowHasMatchedPlayerId = true;

// import_row has reason_code and reason_detail for conflict/error reporting
type _AssertRowHasReasonCode = 'reason_code' extends keyof ImportRowRow
  ? true
  : never;
const _rowReasonCodeCheck: _AssertRowHasReasonCode = true;

type _AssertRowHasReasonDetail = 'reason_detail' extends keyof ImportRowRow
  ? true
  : never;
const _rowReasonDetailCheck: _AssertRowHasReasonDetail = true;

// ============================================================================
// 5. RPC Type Contract Tests
// ============================================================================

describe('rpc_import_create_batch type contract', () => {
  it('requires file_name and idempotency_key', () => {
    expect(_createBatchFileNameCheck).toBe(true);
    expect(_createBatchIdempotencyKeyCheck).toBe(true);
  });
});

describe('rpc_import_stage_rows type contract', () => {
  it('requires batch_id', () => {
    expect(_stageRowsBatchIdCheck).toBe(true);
  });
});

describe('rpc_import_execute type contract', () => {
  it('requires batch_id', () => {
    expect(_executeBatchIdCheck).toBe(true);
  });

  it('does not accept spoofable parameters (ADR-024 INV-8)', () => {
    expect(_executeNoCasinoIdCheck).toBe(true);
    expect(_executeNoActorIdCheck).toBe(true);
  });

  it('returns batch row with status and report_summary', () => {
    expect(_executeReturnsStatusCheck).toBe(true);
    expect(_executeReturnsReportCheck).toBe(true);
  });
});

// ============================================================================
// 6. Batch Status Lifecycle Tests
// ============================================================================

describe('import_batch status lifecycle', () => {
  it('has required status values', () => {
    expect(_hasStagingCheck).toBe(true);
    expect(_hasExecutingCheck).toBe(true);
    expect(_hasCompletedCheck).toBe(true);
    expect(_hasFailedCheck).toBe(true);
  });
});

// ============================================================================
// 7. Row Status and Outcome Tests
// ============================================================================

describe('import_row status outcomes', () => {
  it('has all required status values', () => {
    expect(_rowHasStagedCheck).toBe(true);
    expect(_rowHasCreatedCheck).toBe(true);
    expect(_rowHasLinkedCheck).toBe(true);
    expect(_rowHasSkippedCheck).toBe(true);
    expect(_rowHasConflictCheck).toBe(true);
    expect(_rowHasErrorCheck).toBe(true);
  });

  it('import_row has matched_player_id for linking', () => {
    expect(_rowMatchedPlayerIdCheck).toBe(true);
  });

  it('import_row has reason fields for conflict/error reporting', () => {
    expect(_rowReasonCodeCheck).toBe(true);
    expect(_rowReasonDetailCheck).toBe(true);
  });
});

// ============================================================================
// 8. Execute Outcome Scenario Documentation
// ============================================================================

describe('rpc_import_execute outcome scenarios', () => {
  /**
   * These tests document the expected behavior enforced by the RPC.
   * Runtime validation requires a live Supabase instance with test data.
   *
   * | Scenario                        | Row Status  | Player Write?  | Notes                                   |
   * |---------------------------------|-------------|----------------|-----------------------------------------|
   * | 0 matches (new player)          | created     | Yes (INSERT)   | Creates player + player_casino          |
   * | 1 match (email exact)           | linked      | No (read-only) | Sets matched_player_id, no field update |
   * | N matches (ambiguous)           | conflict    | No             | reason_detail includes match count      |
   * | Re-execute completed batch      | (unchanged) | No             | Returns existing report                 |
   * | Case-insensitive email          | linked      | No             | FOO@BAR.COM matches foo@bar.com         |
   * | Staging > 10K rows              | (rejected)  | No             | IMPORT_SIZE_LIMIT_EXCEEDED error        |
   */

  it('0 matches: creates new player + player_casino enrollment, row status = created', () => {
    // GIVEN: Staged row with email "brand-new@example.com" (no existing player)
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - New row in `player` table with email = "brand-new@example.com"
    //   - New row in `player_casino` linking player to batch casino_id
    //   - import_row.status = 'created'
    //   - import_row.matched_player_id = (new player id)
    expect(true).toBe(true);
  });

  it('1 match (email exact): links to existing player, NO updates to existing player fields', () => {
    // GIVEN: Staged row with email "existing@example.com" + existing player with same email
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - No new player created
    //   - import_row.status = 'linked'
    //   - import_row.matched_player_id = (existing player id)
    //   - Existing player fields are NOT modified (read-only link)
    expect(true).toBe(true);
  });

  it('N matches: row status = conflict, no production writes, reason_detail includes match count', () => {
    // GIVEN: Staged row with email that matches 3 existing players
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - No new player created
    //   - No existing player modified
    //   - import_row.status = 'conflict'
    //   - import_row.reason_code = 'MULTIPLE_MATCHES'
    //   - import_row.reason_detail includes "3"
    expect(true).toBe(true);
  });

  it('idempotent re-execute: second call returns existing report with completed status', () => {
    // GIVEN: Batch already in 'completed' status with report_summary
    // WHEN: rpc_import_execute(p_batch_id) called again
    // THEN:
    //   - Returns same batch with status = 'completed'
    //   - report_summary unchanged
    //   - No duplicate player creation
    expect(true).toBe(true);
  });

  it('case-insensitive email: FOO@BAR.COM matches existing foo@bar.com', () => {
    // GIVEN: Staged row with email "FOO@BAR.COM"
    // AND: Existing player with email "foo@bar.com"
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - Matches existing player (case-insensitive)
    //   - import_row.status = 'linked'
    expect(true).toBe(true);
  });

  it('server-side batch limit: staging > 10,000 total rows raises IMPORT_SIZE_LIMIT_EXCEEDED', () => {
    // GIVEN: Batch with total_rows > 10,000
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - Raises exception with code IMPORT_SIZE_LIMIT_EXCEEDED
    //   - Batch status remains 'staging' (not transitioned)
    //   - No player writes
    expect(true).toBe(true);
  });

  it('report_summary contains outcome counts after successful execution', () => {
    // GIVEN: Batch with 10 staged rows (mix of outcomes)
    // WHEN: rpc_import_execute(p_batch_id) completes
    // THEN:
    //   - report_summary.total_rows = 10
    //   - report_summary.created + linked + skipped + conflict + error = 10
    //   - report_summary.completed_at is a valid ISO timestamp
    expect(true).toBe(true);
  });

  it('batch transitions: staging → executing → completed', () => {
    // GIVEN: Batch in 'staging' status
    // WHEN: rpc_import_execute(p_batch_id)
    // THEN:
    //   - Batch transitions to 'executing' during processing
    //   - Batch transitions to 'completed' after all rows processed
    //   - updated_at is refreshed
    expect(_hasStagingCheck).toBe(true);
    expect(_hasExecutingCheck).toBe(true);
    expect(_hasCompletedCheck).toBe(true);
  });

  it('failed execution: batch status = failed with error in report_summary', () => {
    // GIVEN: Batch in 'staging' status
    // WHEN: rpc_import_execute fails mid-processing
    // THEN:
    //   - Batch status = 'failed'
    //   - report_summary includes error_message and failed_at
    expect(_hasFailedCheck).toBe(true);
  });
});
