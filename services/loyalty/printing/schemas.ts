/**
 * InstrumentPrinting Zod schemas (PRD-092 WS3)
 *
 * Validation for the controlled-write inputs (ADR-013). The terminal vocabulary
 * and the §7a failure-domain deferral are enforced here: `failureDomain` accepts
 * only `render_validation` or null — `device` is rejected at the boundary.
 *
 * @see PRD-092 / EXEC-092 WS3
 * @see ADR-013 (Zod validation standard)
 */

import { z } from 'zod';

/** Polymorphic instrument discriminator (DEC-003). */
export const instrumentKindSchema = z.enum(['promo_coupon', 'ledger_entry']);

/** Full four-state vocabulary. */
export const printResultStatusSchema = z.enum([
  'requested',
  'submitted',
  'failed',
  'unknown',
]);

/** Terminal-only statuses an attempt may transition to. */
export const terminalPrintStatusSchema = z.enum([
  'submitted',
  'failed',
  'unknown',
]);

/**
 * Failure domain — `render_validation` (pre-adapter) or `transport_submission`
 * (DEC-006: agent-unreachable / spooler-reject). `device` is a §7a hard deferral
 * and is rejected (the enum admits nothing else).
 */
export const printFailureDomainSchema = z.enum([
  'render_validation',
  'transport_submission',
]);

/** Input for `rpc_request_print_attempt` (WS6). No casino/operator — context-derived. */
export const requestPrintAttemptInputSchema = z.object({
  instrumentKind: instrumentKindSchema,
  instrumentRef: z.string().uuid(),
  printerTargetId: z.string().min(1),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  receiptDocumentHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  stationId: z.string().min(1).nullish(),
  reprintOf: z.string().uuid().nullish(),
  correlationId: z.string().nullish(),
});

/** Input for `rpc_transition_print_attempt` (WS6). Status + failure only. */
export const transitionPrintAttemptInputSchema = z
  .object({
    printAttemptId: z.string().uuid(),
    resultStatus: terminalPrintStatusSchema,
    failureDomain: printFailureDomainSchema.nullish(),
    failureCode: z.string().min(1).nullish(),
    correlationId: z.string().nullish(),
  })
  .refine(
    (v) =>
      v.resultStatus === 'failed' ||
      (v.failureDomain == null && v.failureCode == null),
    {
      message:
        'failureDomain/failureCode are only valid when resultStatus is "failed"',
      path: ['failureDomain'],
    },
  );

export type RequestPrintAttemptInputParsed = z.infer<
  typeof requestPrintAttemptInputSchema
>;
export type TransitionPrintAttemptInputParsed = z.infer<
  typeof transitionPrintAttemptInputSchema
>;
