/**
 * LoyaltyService.InstrumentPrinting submodule (PRD-092 WS3)
 *
 * Pattern A (Contract-First) functional factory for the controlled
 * loyalty-instrument print path. This module is the typed surface + seam:
 *   - the OS-neutral `LoyaltyInstrumentPrinter` contract (adapter port),
 *   - camelCase DTOs derived from `print_attempt`,
 *   - Zod validation + pure mappers (input → RPC args, row → DTO),
 *   - a deployment-time adapter registry seam.
 *
 * Orchestration (calling the WS2 RPCs + a resolved adapter, fail-closed) is the
 * WS6 controlled action's job — it composes the pieces exported here.
 *
 * Scope (Linux/CUPS exemplar): writes ONLY `print_attempt`; `promo_coupon` /
 * `loyalty_ledger` are READ-ONLY correlation sources (DEC-003). No SRM row, no
 * bounded-context admission. NO keys.ts (DA §8 — see README).
 *
 * @see PRD-092 / EXEC-092 WS3
 * @see services/loyalty/index.ts (Pattern A factory exemplar)
 */

import type {
  LoyaltyInstrumentPrinter,
  PrinterAdapterKey,
  PrinterAdapterRegistry,
} from './contract';
import {
  mapRequestInputToRpcArgs,
  mapRowToPrintAttemptDTO,
  mapTransitionInputToRpcArgs,
} from './mappers';
import {
  requestPrintAttemptInputSchema,
  transitionPrintAttemptInputSchema,
} from './schemas';

// Re-export the contract, DTOs, and schemas for consumers (WS4/WS5/WS6).
export * from './contract';
export * from './dtos';
export * from './schemas';
export {
  mapRowToPrintAttemptDTO,
  mapRequestInputToRpcArgs,
  mapTransitionInputToRpcArgs,
} from './mappers';

// Re-export the WS4 templating layer + renderers for consumers (WS5/WS6).
export * from './templates/receipt-document';
export {
  buildReceiptDocument,
  COMP_TEMPLATE_ID,
  ENTITLEMENT_TEMPLATE_ID,
  TEMPLATE_VERSION,
} from './templates/build-receipt';
export {
  hashReceiptDocument,
  serializeReceiptDocumentCanonical,
} from './templates/hash';
export { createCupsRenderer } from './renderers/cups-renderer';
export { createFakeRenderer } from './renderers/fake-renderer';
export { createHtmlPreviewRenderer } from './renderers/html-preview-renderer';

// Re-export the WS5 transport adapters + loopback agent for consumers (WS6).
export * from './adapters';

/**
 * In-memory deployment-time adapter registry (the seam mechanism only — WS5
 * registers the concrete `cups` / `fake` adapters). Selection is config-driven
 * at deployment, NOT a runtime per-request hot-swap. Resolving an unregistered
 * key throws (fail closed — never a silent no-op).
 */
export function createPrinterAdapterRegistry<
  TDocument = unknown,
>(): PrinterAdapterRegistry<TDocument> {
  const adapters = new Map<
    PrinterAdapterKey,
    LoyaltyInstrumentPrinter<TDocument>
  >();
  return {
    register(key, adapter) {
      adapters.set(key, adapter);
    },
    resolve(key) {
      const adapter = adapters.get(key);
      if (!adapter) {
        throw new Error(`No printer adapter registered for key "${key}"`);
      }
      return adapter;
    },
  };
}

/**
 * InstrumentPrinting service surface — explicit interface, no `ReturnType<>`.
 * Validation + mapping helpers WS6 composes with the WS2 RPCs and a resolved
 * adapter. Kept free of I/O: this submodule provides the typed contract, the
 * controlled action (WS6) owns the orchestration.
 */
export interface InstrumentPrintingService<TDocument = unknown> {
  /** Deployment-time adapter registry seam. */
  readonly registry: PrinterAdapterRegistry<TDocument>;
  /** Validate + normalise a request input (throws on invalid). */
  validateRequest: typeof requestPrintAttemptInputSchema.parse;
  /** Validate + normalise a transition input (throws on invalid). */
  validateTransition: typeof transitionPrintAttemptInputSchema.parse;
  /** Map a validated request input to `rpc_request_print_attempt` args. */
  toRequestArgs: typeof mapRequestInputToRpcArgs;
  /** Map a validated transition input to `rpc_transition_print_attempt` args. */
  toTransitionArgs: typeof mapTransitionInputToRpcArgs;
  /** Map a `print_attempt` row to its read DTO. */
  toAttemptDTO: typeof mapRowToPrintAttemptDTO;
}

/**
 * Functional factory (Pattern A) composing the InstrumentPrinting surface.
 * Accepts an optional pre-populated registry (WS5/WS6 wire the adapters at
 * deployment); defaults to a fresh empty registry.
 */
export function createInstrumentPrintingService<TDocument = unknown>(
  registry: PrinterAdapterRegistry<TDocument> = createPrinterAdapterRegistry<TDocument>(),
): InstrumentPrintingService<TDocument> {
  return {
    registry,
    validateRequest: (input) => requestPrintAttemptInputSchema.parse(input),
    validateTransition: (input) =>
      transitionPrintAttemptInputSchema.parse(input),
    toRequestArgs: mapRequestInputToRpcArgs,
    toTransitionArgs: mapTransitionInputToRpcArgs,
    toAttemptDTO: mapRowToPrintAttemptDTO,
  };
}
