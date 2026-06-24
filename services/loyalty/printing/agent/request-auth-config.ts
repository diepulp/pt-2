/**
 * Localhost request-auth configuration (PRD-093 WS_W3, DEC-WIN-03)
 *
 * Minimal tunables for the single-use job-token authorizer and the authenticated
 * /diagnostics endpoint. Deliberately small — DEC-WIN-03 is a short-lived
 * single-use token, NOT a PKI/rotation system, so there is nothing here to
 * provision beyond a TTL, a memory bound, and the loopback diagnostics credential.
 *
 * @see PRD-093 / EXEC-093 WS_W3
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-03)
 */

export interface JobTokenAuthConfig {
  /** Token lifetime in ms (short-lived). Default 60s. */
  ttlMs: number;
  /** Hard cap on outstanding (un-consumed, un-expired) tokens — memory bound. */
  maxOutstanding: number;
}

export const DEFAULT_JOB_TOKEN_AUTH_CONFIG: JobTokenAuthConfig = {
  ttlMs: 60_000,
  maxOutstanding: 1_000,
};

/**
 * Resolve the job-token auth config, applying defaults. Overrides are clamped to
 * sane bounds so a misconfiguration cannot disable single-use/short-lived
 * guarantees (e.g. a non-positive TTL falls back to the default).
 */
export function resolveJobTokenAuthConfig(
  overrides?: Partial<JobTokenAuthConfig>,
): JobTokenAuthConfig {
  const ttlMs =
    overrides?.ttlMs && overrides.ttlMs > 0
      ? overrides.ttlMs
      : DEFAULT_JOB_TOKEN_AUTH_CONFIG.ttlMs;
  const maxOutstanding =
    overrides?.maxOutstanding && overrides.maxOutstanding > 0
      ? overrides.maxOutstanding
      : DEFAULT_JOB_TOKEN_AUTH_CONFIG.maxOutstanding;
  return { ttlMs, maxOutstanding };
}
