/**
 * Structured JSON Logger
 *
 * Writes newline-delimited JSON to stdout. Every line is a self-contained log
 * entry that can be consumed by any structured log aggregator (Datadog,
 * CloudWatch Logs Insights, Loki, etc.).
 *
 * Rules:
 * - No `console.*` — all output goes through `process.stdout.write` to avoid
 *   the V8 inspector overhead and to guarantee newline-delimited format.
 * - The `worker_id` is injected automatically from the factory argument so
 *   call sites never need to pass it.
 * - Extra metadata is spread into the log entry so callers can attach any
 *   domain-specific fields (batch_id, casino_id, row counts, etc.).
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

/** Shape of every log entry written to stdout. */
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  worker_id: string;
  batch_id?: string;
  casino_id?: string;
  rows_processed?: number;
  duration_ms?: number;
  error?: string;
  [key: string]: unknown;
}

/**
 * Create a structured logger bound to a specific worker ID.
 *
 * @param workerId - Stable identifier for this worker instance.
 * @returns Logger with `info`, `warn`, and `error` methods.
 */
export function createLogger(workerId: string) {
  function log(
    level: LogEntry['level'],
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      worker_id: workerId,
      ...meta,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    /**
     * Log an informational message.
     *
     * @param message - Human-readable description of the event.
     * @param meta - Optional key-value pairs appended to the log entry.
     */
    info(message: string, meta?: Record<string, unknown>): void {
      log('info', message, meta);
    },

    /**
     * Log a warning for recoverable conditions that may require attention.
     *
     * @param message - Human-readable description of the condition.
     * @param meta - Optional key-value pairs appended to the log entry.
     */
    warn(message: string, meta?: Record<string, unknown>): void {
      log('warn', message, meta);
    },

    /**
     * Log an error for failures that affect batch processing.
     *
     * @param message - Human-readable description of the failure.
     * @param meta - Optional key-value pairs appended to the log entry.
     */
    error(message: string, meta?: Record<string, unknown>): void {
      log('error', message, meta);
    },
  };
}

/** Inferred type of the logger returned by {@link createLogger}. */
export type Logger = ReturnType<typeof createLogger>;
