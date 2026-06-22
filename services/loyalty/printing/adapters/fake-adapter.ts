/**
 * Fake transport adapter (PRD-092 WS5)
 *
 * A deterministic `LoyaltyInstrumentPrinter<ReceiptDocument>` for the
 * contract-parity suite (GATE-PLATFORM-2) and WS8 tests — it talks to NO real
 * agent or spooler and needs NO physical printer. It runs the same shared
 * outcome mapping as the cups adapter, so both return identical canonical
 * vocabulary; only the source of the spooler outcome differs (programmed here,
 * real there).
 *
 * Default behaviour exercises the `completed` → `submitted` collapse (AC1).
 * Programmed `spoolerOutcome` / `transportError` let WS8 drive the rejection and
 * transport-fault paths deterministically.
 *
 * @see PRD-092 / EXEC-092 WS5 / GATE-PLATFORM-2
 */

import {
  AgentTransportError,
  type AgentPrintJobResponse,
  type AgentTransportErrorCode,
  type SpoolerOutcome,
} from '../agent/loopback-agent';
import type {
  LoyaltyInstrumentPrinter,
  PrintOutcome,
  PrintRequest,
  PrinterStatus,
} from '../contract';
import { createFakeRenderer } from '../renderers/fake-renderer';
import type {
  ReceiptDocument,
  ReceiptRenderer,
} from '../templates/receipt-document';

import {
  mapAgentResponseToOutcome,
  mapTransportErrorToOutcome,
} from './cups-adapter';

/** Deterministic, programmable behaviour for the fake adapter. */
export interface FakeAdapterConfig {
  /** Canonical renderer; defaults to the deterministic fake renderer (WS4). */
  renderer?: ReceiptRenderer;
  /** Health probe result (default `true`). */
  available?: boolean;
  /**
   * Simulated spooler outcome (default `completed` — exercises the collapse to
   * `submitted`). Ignored when `transportError` is set.
   */
  spoolerOutcome?: SpoolerOutcome;
  /** Reason attached to a simulated `rejected` outcome. */
  rejectionReason?: string;
  /**
   * When set, every `print` simulates this transport fault instead of a spooler
   * outcome (drives the `agent_unreachable` / `malformed_agent_response` paths).
   */
  transportError?: AgentTransportErrorCode | null;
}

/**
 * Factory for the deterministic fake adapter. Functional factory, not a class.
 */
export function createFakeAdapter(
  config?: FakeAdapterConfig,
): LoyaltyInstrumentPrinter<ReceiptDocument> {
  const renderer = config?.renderer ?? createFakeRenderer();
  const available = config?.available ?? true;
  const spoolerOutcome: SpoolerOutcome = config?.spoolerOutcome ?? 'completed';
  const transportError = config?.transportError ?? null;

  function simulate(request: PrintRequest<ReceiptDocument>): PrintOutcome {
    // Render to assert the canonical-payload invariant on this path too.
    const rendered = renderer.render(request.document);
    if (!rendered.canonical) {
      return {
        status: 'failed',
        failure: {
          domain: 'render_validation',
          code: 'non_canonical_renderer',
          message: `renderer "${rendered.rendererKind}" is not canonical`,
        },
      };
    }

    if (transportError) {
      return mapTransportErrorToOutcome(
        new AgentTransportError(transportError, `simulated ${transportError}`),
      );
    }

    const response: AgentPrintJobResponse =
      spoolerOutcome === 'rejected'
        ? {
            spoolerOutcome: 'rejected',
            rejectionReason:
              config?.rejectionReason ?? 'simulated spooler rejection',
          }
        : { spoolerOutcome, spoolerJobId: `fake-${request.printerTargetId}` };

    return mapAgentResponseToOutcome(response);
  }

  return {
    async getStatus(_printerTargetId: string): Promise<PrinterStatus> {
      return {
        available,
        detail: available ? undefined : 'fake adapter configured unavailable',
      };
    },

    async print(request: PrintRequest<ReceiptDocument>): Promise<PrintOutcome> {
      return simulate(request);
    },

    async testPrint(printerTargetId: string): Promise<PrintOutcome> {
      return simulate({
        printerTargetId,
        document: {
          templateId: 'admin-test-print',
          templateVersion: 1,
          blocks: [],
        },
      });
    },
  };
}
