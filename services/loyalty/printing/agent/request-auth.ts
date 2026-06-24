/**
 * Localhost single-use job-token authorizer (PRD-093 WS_W3, DEC-WIN-03)
 *
 * The agent's localhost request authentication, kept deliberately MINIMAL per the
 * approved Gate-0 decision: a short-lived, single-use token bound to a specific
 * `(jobKey, printerTargetId)`, rejected BEFORE any spooler submission. This is the
 * whole mechanism — there is intentionally NO asymmetric/PKI machinery, NO
 * persistent replay ledger, NO timestamp-watermark protocol, and NO custom
 * rotation. Those were considered and dropped as disproportionate for a single
 * local printer on one trusted workstation.
 *
 * Authoritative duplicate barrier: the agent's durable `jobKey` deduplication
 * (ADR-063 D5) remains the authority on "no second physical copy". The token gates
 * AUTHORIZATION of a fresh spool; dedup gates DUPLICATION. A pure idempotent replay
 * (same `jobKey` already submitted) emits nothing and is handled by dedup, so it is
 * not gated on a fresh token.
 *
 * Lifecycle: the server-side controlled path `issue()`s a token when the operator
 * authorizes a print; the agent `verifyAndConsume()`s it on submission. Single-use
 * is enforced in-memory; expiry is lazy (checked on access) plus a memory bound.
 *
 * @see PRD-093 / EXEC-093 WS_W3
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-03)
 */

import { randomBytes } from 'crypto';

import {
  resolveJobTokenAuthConfig,
  type JobTokenAuthConfig,
} from './request-auth-config';

/** A token bound to exactly one job. */
export interface IssuedJobToken {
  token: string;
  /** Absolute expiry (ms epoch). */
  expiresAt: number;
}

/** The job binding a token authorizes — a token is valid ONLY for this pair. */
export interface JobTokenBinding {
  jobKey: string;
  printerTargetId: string;
}

/** A verify request: the presented token plus the job it claims to authorize. */
export interface JobTokenVerifyInput extends JobTokenBinding {
  token: string | undefined;
}

/** Bounded rejection reasons (pre-spool). No free-form leakage. */
export type JobTokenRejectionReason =
  | 'missing_token'
  | 'unknown_token'
  | 'expired_token'
  | 'replayed_token'
  | 'binding_mismatch';

export type JobTokenVerifyResult =
  | { ok: true }
  | { ok: false; reason: JobTokenRejectionReason };

interface StoredToken {
  jobKey: string;
  printerTargetId: string;
  expiresAt: number;
  consumed: boolean;
}

export interface JobTokenAuthorizer {
  /** Server-side: authorize a print, returning a single-use token for the job. */
  issue(binding: JobTokenBinding): IssuedJobToken;
  /** Agent-side: validate + consume the token for the job. Single-use. */
  verifyAndConsume(input: JobTokenVerifyInput): JobTokenVerifyResult;
  /** Outstanding (issued, not yet consumed/expired) token count — for tests/diagnostics. */
  outstanding(): number;
}

/**
 * Create the in-memory single-use job-token authorizer.
 *
 * @param overrides optional TTL / memory-bound overrides (clamped to safe defaults)
 * @param now injectable clock for deterministic tests (defaults to `Date.now`)
 */
export function createJobTokenAuthorizer(
  overrides?: Partial<JobTokenAuthConfig>,
  now: () => number = Date.now,
): JobTokenAuthorizer {
  const config = resolveJobTokenAuthConfig(overrides);
  const store = new Map<string, StoredToken>();

  function pruneExpired(at: number): void {
    for (const [token, entry] of store) {
      if (entry.consumed || entry.expiresAt <= at) {
        store.delete(token);
      }
    }
  }

  return {
    issue(binding: JobTokenBinding): IssuedJobToken {
      const at = now();
      if (store.size >= config.maxOutstanding) {
        // Memory bound: reclaim expired/consumed before growing further.
        pruneExpired(at);
      }
      const token = randomBytes(32).toString('hex');
      const expiresAt = at + config.ttlMs;
      store.set(token, {
        jobKey: binding.jobKey,
        printerTargetId: binding.printerTargetId,
        expiresAt,
        consumed: false,
      });
      return { token, expiresAt };
    },

    verifyAndConsume(input: JobTokenVerifyInput): JobTokenVerifyResult {
      if (!input.token) {
        return { ok: false, reason: 'missing_token' };
      }
      const entry = store.get(input.token);
      if (!entry) {
        return { ok: false, reason: 'unknown_token' };
      }
      const at = now();
      if (entry.expiresAt <= at) {
        store.delete(input.token);
        return { ok: false, reason: 'expired_token' };
      }
      if (entry.consumed) {
        return { ok: false, reason: 'replayed_token' };
      }
      if (
        entry.jobKey !== input.jobKey ||
        entry.printerTargetId !== input.printerTargetId
      ) {
        // Bound to a different job — do NOT consume; the real token may still arrive.
        return { ok: false, reason: 'binding_mismatch' };
      }
      // Single-use: consume. Keep the consumed marker briefly so a replay reads
      // `replayed_token` rather than `unknown_token`; it is reclaimed on prune/expiry.
      entry.consumed = true;
      return { ok: true };
    },

    outstanding(): number {
      const at = now();
      let count = 0;
      for (const entry of store.values()) {
        if (!entry.consumed && entry.expiresAt > at) count += 1;
      }
      return count;
    },
  };
}
