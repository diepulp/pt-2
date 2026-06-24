/**
 * CUPS transport adapter (PRD-092 WS5)
 *
 * The production realization of `LoyaltyInstrumentPrinter<ReceiptDocument>`. It
 * runs SERVER-SIDE: it renders the canonical document to a transport payload
 * (WS4 cups renderer) and POSTs the job to the loopback agent (DEC-002), which
 * fronts CUPS and returns the spooler outcome. The adapter then maps that
 * outcome to the OS-neutral `PrintOutcome` vocabulary.
 *
 * Outcome mapping (AC1 + DEC-006):
 *   - spooler `accepted` / `completed` → `submitted` (NEVER stronger; submitted
 *     ≠ printed). The "`completed` → `submitted`" collapse lives HERE, in the
 *     adapter, exactly as the contract requires.
 *   - spooler `rejected` → `failed` / `transport_submission` `spooler_rejected`
 *     (the job did not print).
 *   - `agent_unreachable` (pre-submission) → `failed` / `transport_submission`
 *     `agent_unreachable` (the job never reached the spooler).
 *   - `malformed_agent_response` (post-submission) → `unknown` /
 *     `transport_submission` `malformed_agent_response` — the job MAY have
 *     printed, so it is NOT reported as `failed` (a duplicate-safe truth).
 *
 * `failure_domain=device` is NEVER populated (one-way path; §7a hard deferral).
 *
 * GATE-PLATFORM-1: the adapter is AT the boundary — it may know transport
 * specifics, but it exports only the OS-neutral port. Nothing CUPS-specific
 * leaks above it.
 *
 * @see PRD-092 / EXEC-092 WS5
 * @see ADR-062 D3 (OS-neutral port) / ADR-063 D5, D6 / DEC-002 / DEC-006
 */

import { createHash } from 'crypto';

import {
  AgentTransportError,
  type AgentPrintJobResponse,
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
  RenderedReceipt,
} from '../templates/receipt-document';

/**
 * Derive the D5 idempotency `jobKey` for the agent from the rendered payload +
 * target. Identical jobs (same target + same bytes) share a key, so the agent
 * will not re-spool a duplicate (no second physical copy).
 */
export function deriveJobKey(
  printerTargetId: string,
  rendered: RenderedReceipt,
): string {
  return createHash('sha256')
    .update(`${printerTargetId}\n${rendered.contentType}\n${rendered.body}`)
    .digest('hex');
}

/**
 * Map a well-formed agent response to the OS-neutral terminal outcome. Shared by
 * the cups and fake adapters so both return identical canonical vocabulary
 * (GATE-PLATFORM-2).
 */
export function mapAgentResponseToOutcome(
  response: AgentPrintJobResponse,
): PrintOutcome {
  switch (response.spoolerOutcome) {
    case 'accepted':
    case 'completed':
      // AC1: `completed` maps to `submitted`, never a stronger state.
      return { status: 'submitted' };
    case 'rejected':
      return {
        status: 'failed',
        failure: {
          domain: 'transport_submission',
          code: 'spooler_rejected',
          message: response.rejectionReason,
        },
      };
    default: {
      const _exhaustive: never = response.spoolerOutcome;
      throw new Error(
        `Unhandled spooler outcome: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

/**
 * Map a transport-layer error to a terminal outcome (DEC-006). Pre-submission
 * faults are `failed` (definitely did not print); a post-submission malformed
 * reply is `unknown` (it MAY have printed). The `transport_submission` code is
 * attached so WS6 can persist the failure domain even on `unknown`.
 */
export function mapTransportErrorToOutcome(
  error: AgentTransportError,
): PrintOutcome {
  if (error.code === 'agent_unreachable') {
    return {
      status: 'failed',
      failure: {
        domain: 'transport_submission',
        code: 'agent_unreachable',
        message: error.message,
      },
    };
  }
  // malformed_agent_response — post-submission ambiguity (DEC-006).
  return {
    status: 'unknown',
    failure: {
      domain: 'transport_submission',
      code: 'malformed_agent_response',
      message: error.message,
    },
  };
}

/**
 * A minimal, NON-redeemable canonical document for the admin test-print path.
 * It carries no instrument barcode/token — exercising the adapter without
 * issuing anything (WS6 admin test-print: no instrument, no audit row).
 */
export function buildTestPrintDocument(): ReceiptDocument {
  return {
    templateId: 'admin-test-print',
    templateVersion: 1,
    blocks: [
      {
        type: 'text',
        text: 'ADMIN TEST PRINT',
        align: 'center',
        bold: true,
        size: 'large',
      },
      { type: 'divider' },
      { type: 'text', text: 'Non-redeemable transport check', align: 'center' },
      { type: 'feed', lines: 1 },
      { type: 'cut', mode: 'full' },
    ],
  };
}

/** Configuration for the cups adapter. */
export interface CupsAdapterConfig {
  /** Transport to the loopback agent (in-process or HTTP). */
  client: LoopbackAgentClient;
  /** Canonical renderer; defaults to the production cups renderer (WS4). */
  renderer?: ReceiptRenderer;
}

/**
 * Factory for the production CUPS adapter. Functional factory, not a class.
 */
export function createCupsAdapter(
  config: CupsAdapterConfig,
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
        // An unreachable agent is "not available" — WS6 maps this to a
        // pre-submission `failed` rather than attempting a print.
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
