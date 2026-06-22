/**
 * InstrumentPrinting DTOs (PRD-092 WS3)
 *
 * Pattern A (Contract-First): manual camelCase DTOs derived from the
 * `print_attempt` Database row. The submodule writes ONLY `print_attempt`;
 * `promo_coupon` / `loyalty_ledger` are READ-ONLY sources, correlated through a
 * polymorphic `instrumentKind` + `instrumentRef` (DEC-003 — no hard FK).
 *
 * Vocabulary types (`PrintResultStatus`, `PrintFailureDomain`) are imported from
 * the OS-neutral contract so there is a single source of truth. Device /
 * PrinterFault vocabulary is a §7a hard deferral and stays absent.
 *
 * @see PRD-092 / EXEC-092 WS3
 * @see ADR-062 D2 (single audit-controlled lifecycle row)
 */

import type { Database } from '@/types/database.types';

import type {
  PrintFailureDomain,
  PrintResultStatus,
  TerminalPrintStatus,
} from './contract';

type PrintAttemptRow = Database['public']['Tables']['print_attempt']['Row'];

/**
 * Polymorphic instrument discriminator (DEC-003).
 * `promo_coupon` = entitlement coupon; `ledger_entry` = points_comp slip.
 */
export type InstrumentKind = 'promo_coupon' | 'ledger_entry';

/**
 * Read DTO for a print attempt — camelCase mirror of the audit row.
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: Contract-First manual DTO per EXEC-092 WS3
export interface PrintAttemptDTO {
  /** Attempt PK. */
  printAttemptId: string;
  /** Polymorphic discriminator (DEC-003). */
  instrumentKind: InstrumentKind;
  /** Polymorphic uuid reference (no hard FK). */
  instrumentRef: string;
  /** Casino scope. */
  casinoId: string;
  /** Context-derived operator (ADR-024). */
  operatorId: string;
  /** Opaque deployment-configured target id. */
  printerTargetId: string;
  /** Optional originating station. */
  stationId: string | null;
  /** Request timestamp (ISO 8601). */
  requestedAt: string;
  /** Versioned template identity. */
  templateId: string;
  templateVersion: number;
  /** Digest of the canonical rendered ReceiptDocument. */
  receiptDocumentHash: string;
  /** Four-state lifecycle outcome. */
  resultStatus: PrintResultStatus;
  /** Failure domain — `render_validation` | `transport_submission` (DEC-006); `device` deferred (§7a). */
  failureDomain: PrintFailureDomain | null;
  failureCode: string | null;
  /** Server-derived idempotency key (DEC-005). */
  idempotencyKey: string;
  /** Reprint lineage — null for first_print. */
  reprintOf: string | null;
}

/**
 * Input to request a print attempt (consumed by WS6 → `rpc_request_print_attempt`).
 * `casinoId` / `operatorId` are NEVER part of the input — they are context-derived
 * server-side (ADR-024 INV-8). The `idempotencyKey` is SERVER-derived by the WS6
 * action (DEC-005) before this input is built; the client never mints it.
 */

export interface RequestPrintAttemptInput {
  instrumentKind: InstrumentKind;
  instrumentRef: string;
  printerTargetId: string;
  templateId: string;
  templateVersion: number;
  receiptDocumentHash: string;
  /** Server-derived (DEC-005); supplied by the WS6 action, not the browser. */
  idempotencyKey: string;
  stationId?: string | null;
  /** Set only for an explicit reprint instance. */
  reprintOf?: string | null;
  correlationId?: string | null;
}

/**
 * Input to transition a `requested` attempt to a terminal outcome
 * (consumed by WS6 → `rpc_transition_print_attempt`). Mutates status + failure only.
 */

export interface TransitionPrintAttemptInput {
  printAttemptId: string;
  resultStatus: TerminalPrintStatus;
  /** `render_validation` or null — `device` is rejected (§7a). */
  failureDomain?: PrintFailureDomain | null;
  failureCode?: string | null;
  correlationId?: string | null;
}

/** Raw row alias for mappers (internal use). */
export type PrintAttemptRowType = PrintAttemptRow;
