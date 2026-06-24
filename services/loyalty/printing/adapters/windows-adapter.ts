/**
 * windows_spooler transport adapter (PRD-093 WS_W1)
 *
 * The Windows production realization of `LoyaltyInstrumentPrinter<ReceiptDocument>`.
 * It is a PLATFORM PORT BELOW the adapter boundary, not a redesign (INV-1): at the
 * adapter layer Windows and CUPS are identical — both render the canonical document
 * to an OS-neutral transport payload and POST the job to the loopback agent
 * (DEC-002), which fronts the OS spooler and returns the spooler outcome. The
 * platform difference (RAW winspool vs `lp`) lives entirely in the agent's spooler
 * seam (WS_W2 `WindowsSpooler` / `winspool-print-helper.exe`), NOT here.
 *
 * ANTI-FORK (GATE-PLATFORM-2): the canonical result/failure vocabulary is produced
 * by the SHARED mappers imported from `cups-adapter.ts` — `mapAgentResponseToOutcome`,
 * `mapTransportErrorToOutcome`, `deriveJobKey`. There is NO forked mapper, so the
 * `windows_spooler` adapter returns byte-identical canonical vocabulary to `cups`.
 * The parity suite (WS_W8) proves this.
 *
 * GATE-PLATFORM-1: this file exports only the OS-neutral port and contains ZERO
 * Windows / winspool / ESC-POS implementation types or strings. The canonical
 * renderer (reused unchanged, INV-1) emits the OS-neutral payload the Windows agent
 * RAW-passes downstream.
 *
 * @see PRD-093 / EXEC-093 WS_W1
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-01)
 * @see ADR-062 D3 (OS-neutral port) / ADR-063 D5, D6 / DEC-006
 */

import {
  AgentTransportError,
  type LoopbackAgentClient,
} from '../agent/loopback-agent';
import type {
  LoyaltyInstrumentPrinter,
  PrintOutcome,
  PrintRequest,
  PrinterStatus,
} from '../contract';
import { createCupsRenderer } from '../renderers/cups-renderer';
import type {
  ReceiptDocument,
  ReceiptRenderer,
} from '../templates/receipt-document';

import {
  buildTestPrintDocument,
  deriveJobKey,
  mapAgentResponseToOutcome,
  mapTransportErrorToOutcome,
} from './cups-adapter';

/** Configuration for the windows_spooler adapter. */
export interface WindowsAdapterConfig {
  /** Transport to the loopback agent (in-process or HTTP) — identical seam to cups. */
  client: LoopbackAgentClient;
  /** Canonical renderer; defaults to the production canonical renderer (reused, INV-1). */
  renderer?: ReceiptRenderer;
}

/**
 * Factory for the production Windows adapter. Functional factory, not a class.
 * Structurally mirrors `createCupsAdapter`; the only realization difference is the
 * downstream spooler the agent fronts, which is configured at the agent (WS_W3),
 * not here.
 */
export function createWindowsAdapter(
  config: WindowsAdapterConfig,
): LoyaltyInstrumentPrinter<ReceiptDocument> {
  const { client } = config;
  const renderer = config.renderer ?? createCupsRenderer();

  async function submit(
    request: PrintRequest<ReceiptDocument>,
  ): Promise<PrintOutcome> {
    const rendered = renderer.render(request.document);
    // Defense in depth (FR-7 is enforced at the WS6 action): a non-canonical
    // payload must never reach the spooler.
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

    const jobKey = deriveJobKey(request.printerTargetId, rendered);
    try {
      const response = await client.submitJob({
        jobKey,
        printerTargetId: request.printerTargetId,
        contentType: rendered.contentType,
        body: rendered.body,
      });
      return mapAgentResponseToOutcome(response);
    } catch (error) {
      if (error instanceof AgentTransportError) {
        return mapTransportErrorToOutcome(error);
      }
      // Unexpected, post-submission ambiguity — be truthful, not optimistic.
      // (A WS_W2 native-helper timeout surfaces here as `unknown`, never `failed`.)
      return {
        status: 'unknown',
        failure: {
          domain: 'transport_submission',
          code: 'malformed_agent_response',
          message:
            error instanceof Error ? error.message : 'unknown transport fault',
        },
      };
    }
  }

  return {
    // `_printerTargetId` is accepted for contract symmetry; this exemplar fronts
    // a single agent, so health is agent-level.
    async getStatus(_printerTargetId: string): Promise<PrinterStatus> {
      try {
        const health = await client.health();
        return {
          available: health.ok,
          detail: health.ok ? undefined : `agent at ${health.host} not ready`,
        };
      } catch (error) {
        return {
          available: false,
          detail:
            error instanceof AgentTransportError
              ? error.code
              : 'loopback agent unreachable',
        };
      }
    },

    print(request: PrintRequest<ReceiptDocument>): Promise<PrintOutcome> {
      return submit(request);
    },

    testPrint(printerTargetId: string): Promise<PrintOutcome> {
      return submit({ printerTargetId, document: buildTestPrintDocument() });
    },
  };
}
