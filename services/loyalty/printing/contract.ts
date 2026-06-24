/**
 * LoyaltyInstrumentPrinter — OS-neutral printing port (ADR-062 D3)
 *
 * This is the adapter-facing seam. WS5's `cups` (production) and `fake`
 * (deterministic) adapters implement this interface; WS6's controlled action
 * orchestrates against it. The contract is intentionally abstract:
 *
 *   - ZERO CUPS / Epson / ESC-POS / spooler types or strings (GATE-PLATFORM-1).
 *   - The four-state result vocabulary ONLY — no `acknowledged` / `printed` /
 *     `completed` (submitted ≠ printed).
 *   - `failure_domain` is limited to `render_validation` this phase. Device /
 *     PrinterFault vocabulary is a §7a hard deferral and MUST stay absent.
 *
 * The rendered document type is a parameter (`TDocument`) so this port stays
 * free of any dependency on the WS4 templating layer (which depends on WS3).
 * WS5 adapters specialise `TDocument` to the canonical `ReceiptDocument`.
 *
 * @see PRD-092 / EXEC-092 WS3
 * @see ADR-062 D3 (OS-neutral printer contract)
 */

/**
 * Four-state print lifecycle vocabulary (PRD §7a local terminology).
 * `submitted` means the job reached the spooler — NOT that paper was produced.
 */
export type PrintResultStatus =
  | 'requested'
  | 'submitted'
  | 'failed'
  | 'unknown';

/**
 * Terminal outcomes an adapter may return. `requested` is the pre-adapter state
 * and is therefore intentionally excluded.
 */
export type TerminalPrintStatus = Exclude<PrintResultStatus, 'requested'>;

/**
 * Failure domains populated this phase.
 *   - `render_validation` — invalid `ReceiptDocument` caught BEFORE the adapter.
 *   - `transport_submission` (DEC-006) — a non-device transport fault: the
 *     loopback agent is unreachable, the spooler rejected the job, or the agent
 *     returned a malformed response. This is NOT a device fault.
 * §7a hard deferral: `'device'` is deliberately NOT part of this union (one-way
 * CUPS cannot observe device faults; reserved for the bidirectional phase).
 */
export type PrintFailureDomain = 'render_validation' | 'transport_submission';

/**
 * Bounded `transport_submission` failure codes (DEC-006). Pre-submission faults
 * are terminal `failed`; an ambiguous post-submission loss is modelled as
 * `unknown` (the job MAY have printed), not `failed`.
 */
export type TransportFailureCode =
  | 'agent_unreachable'
  | 'spooler_rejected'
  | 'malformed_agent_response';

/**
 * Canonical failure descriptor. `domain` is constrained to the in-scope set.
 */
export interface PrintFailure {
  domain: PrintFailureDomain;
  code: string;
  message?: string;
}

/**
 * Printer availability snapshot. `available` is the deployment-time health
 * signal (WS5/WS6 define how it is probed); this port stays transport-neutral.
 */
export interface PrinterStatus {
  available: boolean;
  detail?: string;
}

/**
 * Transport-neutral print request handed to an adapter.
 * `document` is the rendered, canonical artifact (WS4 `ReceiptDocument` at the
 * adapter boundary); kept generic here to avoid a layering cycle.
 */
export interface PrintRequest<TDocument = unknown> {
  /** Opaque deployment-configured target id (never a raw device address). */
  printerTargetId: string;
  /** The canonical rendered document to submit. */
  document: TDocument;
}

/**
 * Terminal result of a single adapter submission.
 */
export interface PrintOutcome {
  status: TerminalPrintStatus;
  /** Present iff `status === 'failed'`. */
  failure?: PrintFailure;
}

/**
 * The OS-neutral printer port (ADR-062 D3). Exactly three methods.
 */
export interface LoyaltyInstrumentPrinter<TDocument = unknown> {
  /** Deployment-time availability probe for a configured target. */
  getStatus(printerTargetId: string): Promise<PrinterStatus>;
  /** Submit a rendered document; returns a terminal outcome. */
  print(request: PrintRequest<TDocument>): Promise<PrintOutcome>;
  /** Non-redeemable admin test-print; exercises the adapter, issues no instrument. */
  testPrint(printerTargetId: string): Promise<PrintOutcome>;
}

/**
 * Adapter keys recognised at deployment time. Selection is config-driven, NOT a
 * runtime per-request hot-swap (ADR-062 D3 — one realization per deployment).
 */
export type PrinterAdapterKey = 'cups' | 'fake' | 'windows_spooler';

/**
 * Deployment-time adapter registry seam. WS5 registers concrete adapters; WS6
 * resolves the one selected by deployment configuration. Resolving an
 * unregistered key is an error (fail closed — never a silent no-op).
 */
export interface PrinterAdapterRegistry<TDocument = unknown> {
  register(
    key: PrinterAdapterKey,
    adapter: LoyaltyInstrumentPrinter<TDocument>,
  ): void;
  resolve(key: PrinterAdapterKey): LoyaltyInstrumentPrinter<TDocument>;
}
