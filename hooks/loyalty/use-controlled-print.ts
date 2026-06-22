/**
 * Controlled Loyalty-Instrument Print Hook (PRD-092 WS7)
 *
 * The ONLY client entry point that drives a loyalty instrument to a physical
 * printer. Replaces the legacy `window.print()` / usePrintReward path on the
 * named redemption surface (GATE-UX-1). Both families (entitlement coupon +
 * points_comp slip — DEC-003) route through `POST /api/v1/loyalty/printing`.
 *
 * Semantics (frozen DECs):
 *   - MANUAL-FIRST (DEC-004): nothing prints without an explicit operator call
 *     to `print` / `reprint`. There is no auto-fire path here.
 *   - TERMINAL outcomes (DEC-008): `failed` and `unknown` are terminal+immutable
 *     server-side. There is NO retry that re-drives the same key — replaying the
 *     first_print key only returns the prior terminal row. A second physical
 *     submission is ONLY an explicit, nonce-bearing `reprint` (DEC-005).
 *   - The server derives its own DB idempotency key (DEC-005). The HTTP
 *     `Idempotency-Key` header here only guards a single click's double-fire.
 *
 * @see PRD-092 / EXEC-092 WS7
 * @see services/loyalty/printing/http.ts — ControlledPrintRequest/Result
 */

'use client';

import { useCallback, useRef, useState, useTransition } from 'react';

import { FetchError, mutateJSON } from '@/lib/http/fetch-json';
import type { FulfillmentPayload } from '@/services/loyalty/dtos';
import type {
  PrintFailure,
  PrintResultStatus,
} from '@/services/loyalty/printing/contract';
import type { PrintAttemptDTO } from '@/services/loyalty/printing/dtos';
import type {
  ControlledPrintRequest,
  ControlledPrintResult,
} from '@/services/loyalty/printing/http';

// === Types ===

/** Lifecycle of a controlled-print gesture. */
export type ControlledPrintState = 'idle' | 'submitting' | 'done' | 'error';

/** Options for the first-print gesture. */
export interface ControlledPrintOptions {
  /** Optional operator station identifier (audit only). */
  stationId?: string | null;
}

/** Options for an explicit reprint gesture. */
export interface ControlledReprintOptions {
  /** Prior attempt id this reprint descends from (FR-5 lineage). */
  reprintOf: string;
  stationId?: string | null;
}

/** Return value of {@link useControlledPrint}. */
export interface UseControlledPrintReturn {
  /** First-print gesture (no nonce). Collapses retries server-side (DEC-005). */
  print: (
    payload: FulfillmentPayload,
    options?: ControlledPrintOptions,
  ) => void;
  /** Explicit reprint gesture — forks a NEW attempt instance (DEC-005). */
  reprint: (
    payload: FulfillmentPayload,
    options: ControlledReprintOptions,
  ) => void;
  /** Lifecycle state of the latest gesture. */
  state: ControlledPrintState;
  /** True while a request is in flight (mirrors `state === 'submitting'`). */
  isPending: boolean;
  /** Terminal-or-current outcome from the latest completed gesture. */
  outcome: PrintResultStatus | null;
  /** Failure descriptor when the outcome carries one. */
  failure: PrintFailure | null;
  /** The audit DTO from the latest completed gesture (carries lineage id). */
  attempt: PrintAttemptDTO | null;
  /** Error surfaced when the request itself failed (not a `failed` outcome). */
  error: FetchError | Error | null;
  /** Reset to the idle state. */
  reset: () => void;
}

const PRINT_ENDPOINT = '/api/v1/loyalty/printing';

// === Hook ===

/**
 * Mutation-style hook for the controlled loyalty-instrument print action.
 *
 * - `print` issues a first-print (no nonce); the server collapses retries of the
 *   same instrument+intent to one physical copy (DEC-005).
 * - `reprint` mints a fresh `reprintNonce` and forks a distinct attempt lineage
 *   from `reprintOf`. Callers gate `reprint` on an `unknown` outcome behind a
 *   duplicate-risk acknowledgement (DEC-008) — this hook does not auto-reprint.
 * - A non-`submitted` outcome is still an HTTP 200; it lands in `outcome` /
 *   `failure`, NOT in `error`. `error` is reserved for transport/HTTP failures
 *   (e.g. the 503 LOYALTY_PRINT_AGENT_UNCONFIGURED).
 *
 * @example
 * ```tsx
 * const { print, reprint, state, outcome, attempt } = useControlledPrint();
 * <Button onClick={() => print(payload)} disabled={state === 'submitting'}>Print</Button>
 * ```
 */
export function useControlledPrint(): UseControlledPrintReturn {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ControlledPrintState>('idle');
  const [outcome, setOutcome] = useState<PrintResultStatus | null>(null);
  const [failure, setFailure] = useState<PrintFailure | null>(null);
  const [attempt, setAttempt] = useState<PrintAttemptDTO | null>(null);
  const [error, setError] = useState<FetchError | Error | null>(null);

  // Guard against stale callbacks resolving out of order.
  const callIdRef = useRef(0);

  const submit = useCallback((body: ControlledPrintRequest) => {
    const callId = ++callIdRef.current;
    const idempotencyKey = crypto.randomUUID();

    setState('submitting');
    setError(null);

    startTransition(async () => {
      try {
        const result = await mutateJSON<
          ControlledPrintResult,
          ControlledPrintRequest
        >(PRINT_ENDPOINT, body, idempotencyKey);

        if (callId !== callIdRef.current) return;

        setAttempt(result.attempt);
        setOutcome(result.outcome.status);
        setFailure(result.outcome.failure);
        setError(null);
        setState('done');
      } catch (err) {
        if (callId !== callIdRef.current) return;

        setError(err instanceof Error ? err : new Error(String(err)));
        setOutcome(null);
        setFailure(null);
        setState('error');
      }
    });
  }, []);

  const print = useCallback(
    (payload: FulfillmentPayload, options?: ControlledPrintOptions) => {
      submit({ payload, stationId: options?.stationId ?? null });
    },
    [submit],
  );

  const reprint = useCallback(
    (payload: FulfillmentPayload, options: ControlledReprintOptions) => {
      submit({
        payload,
        stationId: options.stationId ?? null,
        reprintNonce: crypto.randomUUID(),
        reprintOf: options.reprintOf,
      });
    },
    [submit],
  );

  const reset = useCallback(() => {
    callIdRef.current++;
    setState('idle');
    setOutcome(null);
    setFailure(null);
    setAttempt(null);
    setError(null);
  }, []);

  return {
    print,
    reprint,
    state,
    isPending,
    outcome,
    failure,
    attempt,
    error,
    reset,
  };
}
