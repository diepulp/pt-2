/**
 * PostgreSQL Connection Pool
 *
 * Creates a `pg.Pool` configured for the worker's direct-DB access pattern.
 * The worker uses `pg` (node-postgres) directly — NOT the Supabase JS client
 * — because it operates with a service_role connection string and needs
 * advisory locking (`FOR UPDATE SKIP LOCKED`) for the claim CTE.
 *
 * Pool sizing is intentionally conservative (max 5) because the worker is
 * single-threaded and processes one batch at a time.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import pg from 'pg';

import type { Config } from './config.js';

/**
 * Create a configured PostgreSQL connection pool.
 *
 * The pool is not connected until the first query is issued; no explicit
 * `pool.connect()` call is needed. The caller is responsible for calling
 * `pool.end()` during graceful shutdown.
 *
 * @param config - Validated worker configuration.
 * @returns A `pg.Pool` instance ready for use.
 */
export function createPool(config: Config): pg.Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 5,
    statement_timeout: config.STATEMENT_TIMEOUT_MS,
  });
}
