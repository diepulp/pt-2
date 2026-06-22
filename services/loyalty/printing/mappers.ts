/**
 * InstrumentPrinting mappers (PRD-092 WS3)
 *
 * Pure Row → DTO and Input → RPC-args transformations. No I/O, no mutation.
 *
 * @see PRD-092 / EXEC-092 WS3
 */

import type { Database } from '@/types/database.types';

import type { PrintFailureDomain, PrintResultStatus } from './contract';
import type {
  InstrumentKind,
  PrintAttemptDTO,
  RequestPrintAttemptInput,
  TransitionPrintAttemptInput,
} from './dtos';

type PrintAttemptRow = Database['public']['Tables']['print_attempt']['Row'];

type RequestRpcArgs =
  Database['public']['Functions']['rpc_request_print_attempt']['Args'];
type TransitionRpcArgs =
  Database['public']['Functions']['rpc_transition_print_attempt']['Args'];

/**
 * Map a `print_attempt` row to its camelCase read DTO.
 * The DB CHECK constraints guarantee the narrowed unions, so the casts here are
 * the row→DTO narrowing seam (generated row types are `string`).
 */
export function mapRowToPrintAttemptDTO(row: PrintAttemptRow): PrintAttemptDTO {
  return {
    printAttemptId: row.print_attempt_id,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB→DTO boundary: instrument_kind mirrors the DB CHECK constraint
    instrumentKind: row.instrument_kind as InstrumentKind,
    instrumentRef: row.instrument_ref,
    casinoId: row.casino_id,
    operatorId: row.operator_id,
    printerTargetId: row.printer_target_id,
    stationId: row.station_id,
    requestedAt: row.requested_at,
    templateId: row.template_id,
    templateVersion: row.template_version,
    receiptDocumentHash: row.receipt_document_hash,
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- DB→DTO boundary: result_status mirrors the DB CHECK constraint
    resultStatus: row.result_status as PrintResultStatus,
    failureDomain: row.failure_domain as PrintFailureDomain | null,
    failureCode: row.failure_code,
    idempotencyKey: row.idempotency_key,
    reprintOf: row.reprint_of,
  };
}

/**
 * Map a request input DTO to `rpc_request_print_attempt` arguments.
 * casino/operator are intentionally absent — derived server-side (ADR-024).
 */
export function mapRequestInputToRpcArgs(
  input: RequestPrintAttemptInput,
): RequestRpcArgs {
  return {
    p_instrument_kind: input.instrumentKind,
    p_instrument_ref: input.instrumentRef,
    p_printer_target_id: input.printerTargetId,
    p_template_id: input.templateId,
    p_template_version: input.templateVersion,
    p_receipt_document_hash: input.receiptDocumentHash,
    p_idempotency_key: input.idempotencyKey,
    p_station_id: input.stationId ?? undefined,
    p_reprint_of: input.reprintOf ?? undefined,
    p_correlation_id: input.correlationId ?? undefined,
  };
}

/**
 * Map a transition input DTO to `rpc_transition_print_attempt` arguments.
 */
export function mapTransitionInputToRpcArgs(
  input: TransitionPrintAttemptInput,
): TransitionRpcArgs {
  return {
    p_print_attempt_id: input.printAttemptId,
    p_result_status: input.resultStatus,
    p_failure_domain: input.failureDomain ?? undefined,
    p_failure_code: input.failureCode ?? undefined,
    p_correlation_id: input.correlationId ?? undefined,
  };
}
