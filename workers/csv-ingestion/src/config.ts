/**
 * Worker Configuration
 *
 * Loads and validates all environment variables required by the CSV ingestion
 * worker. Uses Zod for parse-time validation so the process fails fast with a
 * clear error message when a required variable is missing or malformed.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import { z } from 'zod';

const configSchema = z.object({
  /** Full PostgreSQL connection string used by the pg Pool (service_role). */
  DATABASE_URL: z.string().url(),

  /** Supabase project URL for Storage signed URL generation. */
  SUPABASE_URL: z.string().url(),

  /** Supabase service_role key — bypasses RLS. Never expose to clients. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /** Milliseconds to sleep between poll iterations when no batch is found. */
  POLL_INTERVAL_MS: z.coerce.number().default(5_000),

  /**
   * Milliseconds of heartbeat silence before the reaper considers a claim stale.
   * Default: 5 minutes.
   */
  REAPER_HEARTBEAT_THRESHOLD_MS: z.coerce.number().default(300_000),

  /** Expiry (seconds) for signed Storage URLs generated for CSV downloads. */
  STORAGE_SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(600),

  /** Maximum number of claim attempts before a batch is permanently failed. */
  MAX_ATTEMPTS: z.coerce.number().default(3),

  /** Number of rows to accumulate before flushing to the database. */
  CHUNK_SIZE: z.coerce.number().default(500),

  /** Per-statement timeout applied to every pg query (milliseconds). */
  STATEMENT_TIMEOUT_MS: z.coerce.number().default(60_000),

  /** Port for the HTTP health/readiness endpoint. */
  HEALTH_PORT: z.coerce.number().default(8080),

  /**
   * Stable identifier for this worker instance.
   * Defaults to a random 8-character suffix so multiple workers can be
   * distinguished in logs without manual configuration.
   */
  WORKER_ID: z
    .string()
    .default(() => `worker-${crypto.randomUUID().slice(0, 8)}`),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse and validate all required environment variables.
 *
 * Throws a `ZodError` with descriptive field-level messages if any variable
 * is missing or fails validation. Call once at process startup.
 *
 * @returns Validated and coerced configuration object.
 */
export function loadConfig(): Config {
  return configSchema.parse(process.env);
}
