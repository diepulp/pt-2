/**
 * InstrumentPrinting controlled-action orchestration (PRD-092 WS6)
 *
 * The server-authoritative print flow (DEC-002): build the canonical document →
 * request the `requested` audit row (server-derived idempotency key, DEC-005) →
 * submit via the server-side cups adapter (which POSTs to the loopback agent) →
 * transition the row to its terminal outcome. FAILS CLOSED before any success
 * claim (FIB feature-loop step 3).
 *
 * This module owns orchestration only; the route handlers (route.ts,
 * test-print/route.ts) stay thin and map the result to `ServiceHttpResult`.
 *
 * Invariants enforced here:
 *   - FR-7 runtime guard: a NON-canonical renderer (html-preview) is rejected
 *     BEFORE any adapter/device call — a runtime check, not just lint.
 *   - GATE-DOM-1: writes ONLY `print_attempt` (via the WS2 RPCs); never touches
 *     `promo_coupon` / `promo_program` / loyalty ledger.
 *   - Exactly-once physical print: the WS5 loopback agent dedupes by `jobKey`
 *     (same instrument → same document → one spool); the `requested → terminal`
 *     transition is single-flight (the loser of a race hits the WS1 terminal-
 *     immutability trigger, P0100, and returns the prior row — no second write).
 *   - §7a: `failure_domain=device` is never written; only `render_validation`
 *     (pre/at-adapter) or `transport_submission` (DEC-006) reach the audit row,
 *     and `transport_submission` only on a `failed` outcome (WS3 schema refine).
 *
 * @see PRD-092 / EXEC-092 WS6
 * @see ADR-024 (context) / ADR-063 D5 / DEC-002 / DEC-005 / DEC-006 / DEC-007
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import { hashIdempotencyKey } from '@/lib/idempotency';
import type { FulfillmentPayload } from '@/services/loyalty/dtos';
import type { Database } from '@/types/database.types';

import { createCupsAdapter } from './adapters/cups-adapter';
import {
  createHttpLoopbackAgentClient,
  type LoopbackAgentClient,
} from './agent/loopback-agent';
import type {
  LoyaltyInstrumentPrinter,
  PrintFailure,
  PrintOutcome,
  PrintResultStatus,
} from './contract';
import type {
  InstrumentKind,
  PrintAttemptDTO,
  RequestPrintAttemptInput,
} from './dtos';
import {
  mapRequestInputToRpcArgs,
  mapRowToPrintAttemptDTO,
  mapTransitionInputToRpcArgs,
} from './mappers';
import { createCupsRenderer } from './renderers/cups-renderer';
import {
  requestPrintAttemptInputSchema,
  transitionPrintAttemptInputSchema,
} from './schemas';
import { buildReceiptDocument } from './templates/build-receipt';
import { hashReceiptDocument } from './templates/hash';
import type {
  ReceiptDocument,
  ReceiptRenderer,
} from './templates/receipt-document';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation (route boundary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod mirror of the FROZEN `FulfillmentPayload` discriminated union
 * (services/loyalty/dtos.ts). Validated at the route boundary so a malformed
 * payload is a clean 400 BEFORE any write. NOT a fork of the contract — it
 * mirrors it field-for-field so `z.infer` is assignable to `FulfillmentPayload`.
 */
const compFulfillmentSchema = z.object({
  family: z.literal('points_comp'),
  ledger_id: z.string().uuid(),
  reward_id: z.string(),
  reward_code: z.string(),
  reward_name: z.string(),
  face_value_cents: z.number().int(),
  points_redeemed: z.number(),
  balance_after: z.number(),
  player_name: z.string(),
  player_id: z.string(),
  casino_name: z.string(),
  staff_name: z.string(),
  issued_at: z.string(),
});

const entitlementFulfillmentSchema = z.object({
  family: z.literal('entitlement'),
  coupon_id: z.string().uuid(),
  validation_number: z.string(),
  reward_id: z.string(),
  reward_code: z.string(),
  reward_name: z.string(),
  face_value_cents: z.number().int(),
  required_match_wager_cents: z.number().int().nullable(),
  expires_at: z.string().nullable(),
  player_name: z.string(),
  player_id: z.string(),
  player_tier: z.string(),
  casino_name: z.string(),
  staff_name: z.string(),
  issued_at: z.string(),
});

/** The validated fulfillment payload (mirrors `FulfillmentPayload`). */
export const fulfillmentPayloadSchema = z.discriminatedUnion('family', [
  compFulfillmentSchema,
  entitlementFulfillmentSchema,
]);

/**
 * Controlled-print request body. `printerTargetId` is intentionally ABSENT —
 * the device target is server-configured (DA §2), never client-supplied.
 */
export const controlledPrintRequestSchema = z.object({
  payload: fulfillmentPayloadSchema,
  stationId: z.string().min(1).nullish(),
  /** Present ⇒ an explicit reprint (DEC-005 nonce forks a new attempt instance). */
  reprintNonce: z.string().min(1).nullish(),
  /** Prior attempt id this reprint descends from (FR-5 lineage). */
  reprintOf: z.string().uuid().nullish(),
});

export type ControlledPrintRequest = z.infer<
  typeof controlledPrintRequestSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration surface
// ─────────────────────────────────────────────────────────────────────────────

/** Terminal-or-current outcome of a controlled print. */
export interface ControlledPrintOutcome {
  status: PrintResultStatus;
  failure: PrintFailure | null;
}

/** Result of a controlled print action. */
export interface ControlledPrintResult {
  attempt: PrintAttemptDTO;
  outcome: ControlledPrintOutcome;
  /** True ⇒ a prior terminal row was returned and the adapter was NOT fired. */
  replayed: boolean;
}

/** Dependencies for the controlled-action orchestrator. */
export interface InstrumentPrintingHttpDeps {
  supabase: SupabaseClient<Database>;
  /** Transport to the loopback agent (server-configured, loopback-only). */
  client: LoopbackAgentClient;
  /** Opaque, server-configured target id (never a raw device address). */
  printerTargetId: string;
  /** Canonical production renderer; defaults to the cups renderer (FR-7 subject). */
  renderer?: ReceiptRenderer;
  correlationId?: string | null;
}

/** The controlled-action surface the route handlers compose. */
export interface InstrumentPrintingHttp {
  print(input: ControlledPrintRequest): Promise<ControlledPrintResult>;
  /** Non-redeemable admin test-print: adapter only, NO audit row, NO instrument. */
  testPrint(): Promise<{ outcome: PrintOutcome }>;
}

/** Postgres error shape surfaced by `supabase.rpc` (PostgrestError subset). */
interface RpcError {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
  details?: string | null;
}

/** Map a polymorphic instrument from the fulfillment family (DEC-003/DEC-007). */
function resolveInstrument(payload: FulfillmentPayload): {
  kind: InstrumentKind;
  ref: string;
} {
  switch (payload.family) {
    case 'entitlement':
      return { kind: 'promo_coupon', ref: payload.coupon_id };
    case 'points_comp':
      return { kind: 'ledger_entry', ref: payload.ledger_id };
    default: {
      const _exhaustive: never = payload;
      throw new DomainError(
        'VALIDATION_ERROR',
        `Unsupported fulfillment family: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

/**
 * Server-derived idempotency key (DEC-005). first_print collapses retries of the
 * same instrument+intent; an explicit reprint nonce forks a distinct instance.
 * The client NEVER mints this key.
 */
function deriveIdempotencyKey(
  kind: InstrumentKind,
  ref: string,
  reprintNonce: string | null | undefined,
): string {
  return reprintNonce
    ? hashIdempotencyKey({ kind, ref, intent: 'reprint', nonce: reprintNonce })
    : hashIdempotencyKey({ kind, ref, intent: 'first_print' });
}

/** Map a WS2 RPC P-code to a user-facing DomainError. */
function mapRpcError(error: RpcError): DomainError {
  const message = error.message ?? 'print RPC failed';
  switch (error.code) {
    case 'P0001':
      return new DomainError('FORBIDDEN', 'Not authorized to print', {
        httpStatus: 403,
        details: { responseCode: 'LOYALTY_PRINT_FORBIDDEN' },
      });
    case 'P0002':
      return new DomainError('NOT_FOUND', 'Print attempt not found', {
        httpStatus: 404,
        details: { responseCode: 'LOYALTY_PRINT_ATTEMPT_NOT_FOUND' },
      });
    case 'P0003':
      return new DomainError(
        'VALIDATION_ERROR',
        'Instrument reference did not resolve to a same-casino instrument',
        {
          httpStatus: 422,
          details: { responseCode: 'LOYALTY_PRINT_INSTRUMENT_UNRESOLVED' },
        },
      );
    case 'P0101':
    case 'P0102':
      return new DomainError('INTERNAL_ERROR', message, {
        httpStatus: 500,
        details: { responseCode: 'LOYALTY_PRINT_INVALID_TRANSITION' },
      });
    default:
      return new DomainError('INTERNAL_ERROR', message, {
        httpStatus: 500,
        details: safeErrorDetails(error),
      });
  }
}

/** Build the terminal-or-current outcome view from an audit DTO. */
function outcomeFromAttempt(attempt: PrintAttemptDTO): ControlledPrintOutcome {
  const failure: PrintFailure | null =
    attempt.failureDomain !== null
      ? {
          domain: attempt.failureDomain,
          code: attempt.failureCode ?? 'unknown',
        }
      : null;
  return { status: attempt.resultStatus, failure };
}

/**
 * Resolve the server-side print transport config (DA §2). The opaque
 * `printer_target_id` and the loopback agent URL come from environment config
 * ONLY — never the client, never a DB table this pilot. Fails closed when the
 * agent URL is unset (a print cannot silently succeed against no transport).
 */
export function resolveServerPrintConfig(): {
  client: LoopbackAgentClient;
  printerTargetId: string;
} {
  const agentUrl = process.env.LOYALTY_PRINT_AGENT_URL;
  if (!agentUrl) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Loyalty print agent is not configured (LOYALTY_PRINT_AGENT_URL unset)',
      {
        httpStatus: 503,
        details: { responseCode: 'LOYALTY_PRINT_AGENT_UNCONFIGURED' },
      },
    );
  }
  const printerTargetId =
    process.env.LOYALTY_PRINT_TARGET_ID ?? 'loopback-cups';
  return {
    client: createHttpLoopbackAgentClient({ baseUrl: agentUrl }),
    printerTargetId,
  };
}

/**
 * Compose the controlled-action orchestrator from environment config + a
 * request-scoped supabase client. Used by both route handlers.
 */
export function createInstrumentPrintingHttpFromEnv(
  supabase: SupabaseClient<Database>,
  correlationId?: string | null,
): InstrumentPrintingHttp {
  const { client, printerTargetId } = resolveServerPrintConfig();
  // Deployment-tunable printable column count (default 42) so a narrower head
  // can be corrected without a code change — an over-wide line is clipped.
  const parsedWidth = Number(process.env.LOYALTY_PRINT_COLUMN_WIDTH);
  const columnWidth =
    Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : undefined;
  return createInstrumentPrintingHttp({
    supabase,
    client,
    printerTargetId,
    renderer: createCupsRenderer(columnWidth ? { columnWidth } : undefined),
    correlationId,
  });
}

/**
 * Functional factory (Pattern A) for the controlled-action orchestrator.
 */
export function createInstrumentPrintingHttp(
  deps: InstrumentPrintingHttpDeps,
): InstrumentPrintingHttp {
  const renderer = deps.renderer ?? createCupsRenderer();
  const correlationId = deps.correlationId ?? null;

  /** FR-7 runtime guard — a non-canonical renderer never reaches a device. */
  function assertCanonicalRenderer(): void {
    if (!renderer.canonical) {
      throw new DomainError(
        'FORBIDDEN',
        `Non-canonical renderer "${renderer.kind}" rejected before device submission (FR-7)`,
        {
          httpStatus: 403,
          details: { responseCode: 'LOYALTY_PRINT_NON_CANONICAL_RENDERER' },
        },
      );
    }
  }

  function adapter(): LoyaltyInstrumentPrinter<ReceiptDocument> {
    return createCupsAdapter({ client: deps.client, renderer });
  }

  async function fetchAttempt(
    printAttemptId: string,
  ): Promise<PrintAttemptDTO> {
    const { data, error } = await deps.supabase
      .from('print_attempt')
      .select('*')
      .eq('print_attempt_id', printAttemptId)
      .maybeSingle();
    if (error || !data) {
      throw new DomainError('INTERNAL_ERROR', 'Failed to read print attempt', {
        httpStatus: 500,
        details: safeErrorDetails(error),
      });
    }
    return mapRowToPrintAttemptDTO(data);
  }

  return {
    async print(input: ControlledPrintRequest): Promise<ControlledPrintResult> {
      // FR-7: reject a misconfigured non-canonical renderer before any write.
      assertCanonicalRenderer();

      const payload: FulfillmentPayload = input.payload;
      const { kind, ref } = resolveInstrument(payload);

      // Build the canonical document + provenance hash (value authority = WS4).
      const document = buildReceiptDocument(payload);
      const receiptDocumentHash = hashReceiptDocument(document);

      const idempotencyKey = deriveIdempotencyKey(
        kind,
        ref,
        input.reprintNonce,
      );

      // 1. Request the `requested` audit row (insert-or-return-prior, DEC-005).
      const requestInput: RequestPrintAttemptInput =
        requestPrintAttemptInputSchema.parse({
          instrumentKind: kind,
          instrumentRef: ref,
          printerTargetId: deps.printerTargetId,
          templateId: document.templateId,
          templateVersion: document.templateVersion,
          receiptDocumentHash,
          idempotencyKey,
          stationId: input.stationId ?? null,
          reprintOf: input.reprintOf ?? null,
          correlationId,
        });

      const requested = await deps.supabase.rpc(
        'rpc_request_print_attempt',
        mapRequestInputToRpcArgs(requestInput),
      );
      if (requested.error) {
        throw mapRpcError(requested.error);
      }
      if (!requested.data) {
        throw new DomainError(
          'INTERNAL_ERROR',
          'rpc_request_print_attempt returned no row',
          {
            httpStatus: 500,
          },
        );
      }
      const attempt = mapRowToPrintAttemptDTO(requested.data);

      // 2. Collision semantics (DEC-005): a TERMINAL prior row is an idempotent
      //    replay (or a concurrent loser returning the winner's row) — return it
      //    WITHOUT firing the adapter (no second physical copy).
      if (attempt.resultStatus !== 'requested') {
        return {
          attempt,
          outcome: outcomeFromAttempt(attempt),
          replayed: true,
        };
      }

      // 3. INSERT-winner path: submit exactly once. The WS5 agent dedupes the
      //    physical print by jobKey, so even a concurrent peer cannot double-spool.
      const printOutcome = await adapter().print({
        printerTargetId: deps.printerTargetId,
        document,
      });

      // 4. Transition the row to its terminal outcome. failure_domain/code are
      //    only persisted on `failed` (WS3 schema refine); `unknown`/`submitted`
      //    carry none — §7a keeps `device` absent on every path.
      const isFailed = printOutcome.status === 'failed';
      const transitionInput = transitionPrintAttemptInputSchema.parse({
        printAttemptId: attempt.printAttemptId,
        resultStatus: printOutcome.status,
        failureDomain: isFailed ? (printOutcome.failure?.domain ?? null) : null,
        failureCode: isFailed ? (printOutcome.failure?.code ?? null) : null,
        correlationId,
      });

      const transitioned = await deps.supabase.rpc(
        'rpc_transition_print_attempt',
        mapTransitionInputToRpcArgs(transitionInput),
      );

      if (transitioned.error) {
        // Lost the single-flight race: a peer already drove this row terminal
        // (WS1 trigger → P0100). The physical print was deduped by the agent;
        // return the now-current prior row rather than overwriting it.
        if (transitioned.error.code === 'P0100') {
          const prior = await fetchAttempt(attempt.printAttemptId);
          return {
            attempt: prior,
            outcome: outcomeFromAttempt(prior),
            replayed: true,
          };
        }
        throw mapRpcError(transitioned.error);
      }
      if (!transitioned.data) {
        throw new DomainError(
          'INTERNAL_ERROR',
          'rpc_transition_print_attempt returned no row',
          {
            httpStatus: 500,
          },
        );
      }

      const finalAttempt = mapRowToPrintAttemptDTO(transitioned.data);
      return {
        attempt: finalAttempt,
        outcome: {
          status: printOutcome.status,
          failure: printOutcome.failure ?? null,
        },
        replayed: false,
      };
    },

    async testPrint(): Promise<{ outcome: PrintOutcome }> {
      // FR-7 guard applies here too; no audit row, no instrument (feature-loop step 8).
      assertCanonicalRenderer();
      const outcome = await adapter().testPrint(deps.printerTargetId);
      return { outcome };
    },
  };
}
