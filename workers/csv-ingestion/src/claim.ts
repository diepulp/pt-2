/**
 * Claim Orchestrator
 *
 * Combines the reaper pass (recover stale batches) with the claim attempt
 * (acquire ownership of the next 'uploaded' batch) into a single operation
 * called at the top of each poll loop iteration.
 *
 * Separation of concerns:
 * - `repo.reapStaleBatches` and `repo.claimBatch` contain all SQL.
 * - This module contains only the orchestration and logging logic.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import pg from 'pg';

import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { ClaimedBatch } from './repo.js';
import * as repo from './repo.js';

/**
 * Run the reaper and attempt to claim one 'uploaded' batch.
 *
 * Order of operations:
 * 1. Reap stale 'parsing' batches (reset retryable, fail exhausted).
 * 2. Claim the oldest 'uploaded' batch with `FOR UPDATE SKIP LOCKED`.
 *
 * @param pool - Active pg.Pool.
 * @param config - Validated worker configuration (thresholds, worker ID).
 * @param logger - Structured logger bound to this worker instance.
 * @returns The claimed batch, or null if no 'uploaded' batch is available.
 */
export async function reapAndClaim(
  pool: pg.Pool,
  config: Config,
  logger: Logger,
): Promise<ClaimedBatch | null> {
  // Step 1: reap stale batches before attempting a new claim so that any
  // recovered batches are immediately eligible for the claim below.
  const { reset, failed } = await repo.reapStaleBatches(
    pool,
    config.REAPER_HEARTBEAT_THRESHOLD_MS,
    config.MAX_ATTEMPTS,
  );

  if (reset > 0) {
    logger.info(`Reaped stale batches — reset to uploaded`, { count: reset });
  }
  if (failed > 0) {
    logger.warn(`Reaped exhausted batches — permanently failed`, {
      count: failed,
    });
  }

  // Step 2: claim the next available batch.
  const batch = await repo.claimBatch(pool, config.WORKER_ID);

  if (batch !== null) {
    logger.info('Claimed batch', {
      batch_id: batch.id,
      casino_id: batch.casino_id,
      attempt: batch.attempt_count,
      storage_path: batch.storage_path ?? '(none)',
    });
  }

  return batch;
}
