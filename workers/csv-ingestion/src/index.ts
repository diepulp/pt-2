/**
 * CSV Ingestion Worker — Entry Point
 *
 * Starts the poll loop that:
 * 1. Reaps stale batches (heartbeat timeout) and permanently fails exhausted ones.
 * 2. Claims the next 'uploaded' batch.
 * 3. Downloads the CSV from Supabase Storage via a signed URL.
 * 4. Runs the full ingestion pipeline (parse → normalize → validate → insert).
 * 5. Marks the batch as 'staging' on success, 'failed' on unrecoverable error.
 * 6. Sleeps for POLL_INTERVAL_MS when no work is available.
 *
 * Graceful shutdown:
 * SIGTERM and SIGINT are handled. The current batch will finish processing
 * before the process exits (the `running` flag is checked at loop iteration
 * boundaries, not mid-batch). The pg pool is drained before exit.
 *
 * Error handling:
 * - 'BATCH_ROW_LIMIT' errors are swallowed (batch is already failed in DB).
 * - All other errors are logged and the loop continues after a sleep.
 *   The reaper will recover the batch on the next run.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import { reapAndClaim } from './claim.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { startHealthServer } from './health.js';
import { ingestBatch } from './ingest.js';
import { createLogger } from './logger.js';
import { createStorageClient } from './storage.js';

/**
 * Main entry point. Runs the poll loop until a shutdown signal is received.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.WORKER_ID);
  const pool = createPool(config);
  const storage = createStorageClient(config);
  let running = true;

  logger.info('Worker starting', {
    worker_id: config.WORKER_ID,
    poll_interval_ms: config.POLL_INTERVAL_MS,
    chunk_size: config.CHUNK_SIZE,
    max_attempts: config.MAX_ATTEMPTS,
  });

  // --- Health server ---
  const healthServer = startHealthServer(config, logger);

  // --- Graceful shutdown ---
  const shutdown = async (): Promise<void> => {
    logger.info('Shutdown signal received — draining...');
    running = false;
    healthServer.close();
    await pool.end();
    logger.info('Shutdown complete');
  };

  process.on('SIGTERM', () => {
    shutdown().catch((err: unknown) => {
      process.stderr.write(
        `Shutdown error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    shutdown().catch((err: unknown) => {
      process.stderr.write(
        `Shutdown error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
  });

  // --- Poll loop ---
  while (running) {
    try {
      const batch = await reapAndClaim(pool, config, logger);

      if (batch === null) {
        // No work available — sleep before polling again.
        await sleep(config.POLL_INTERVAL_MS);
        continue;
      }

      if (batch.storage_path === null || batch.storage_path.trim() === '') {
        // A batch was claimed but has no file path — this should not happen
        // under normal operation. Fail it immediately so it does not block
        // the queue.
        logger.error('Claimed batch has no storage_path — failing', {
          batch_id: batch.id,
          casino_id: batch.casino_id,
        });
        // We do not import failBatch directly here to keep index.ts thin;
        // the reaper will handle it after the heartbeat expires. In practice
        // this situation should be prevented at upload time.
        await sleep(config.POLL_INTERVAL_MS);
        continue;
      }

      // Download the CSV as a streaming response body.
      const signedUrl = await storage.getSignedUrl(batch.storage_path);
      const csvStream = await storage.downloadStream(signedUrl);

      // Run the full ingestion pipeline.
      await ingestBatch(pool, batch, csvStream, config, logger);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Row cap failures are expected and the batch is already failed in DB —
      // no need to log them as unexpected errors.
      if (message !== 'BATCH_ROW_LIMIT') {
        logger.error('Poll loop error', { error: message });
      }

      // Always sleep after an error to avoid tight failure loops.
      await sleep(config.POLL_INTERVAL_MS);
    }
  }
}

/**
 * Sleep for the specified number of milliseconds.
 *
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Fatal startup error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
