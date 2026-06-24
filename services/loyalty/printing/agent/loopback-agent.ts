/**
 * Loopback exemplar print agent (PRD-092 WS5)
 *
 * The managed-local-agent transport realization (DEC-002). On the co-located
 * Linux host the cups adapter (server-side) POSTs a rendered job to THIS agent
 * over loopback; the agent fronts the CUPS spooler and returns the spooler
 * outcome. The server (WS6) — never this agent — owns the `print_attempt` audit
 * write and the terminal transition; the agent performs NO database writes.
 *
 * Scope (the ONLY two ADR-063 decisions in scope this phase):
 *   - D5 idempotency — a repeat submission of the same `jobKey` returns the
 *     prior submitted outcome WITHOUT re-spooling (no second physical copy).
 *   - D6 truthful failure — the agent NEVER fabricates a `submitted` outcome;
 *     a spooler rejection is reported as `rejected` with its reason.
 * ADR-063 D1–D4/D7 (install/update/hardening) are deferred to PRD #2 (Windows).
 *
 * Security (NFR-4 / GATE-SEC-1 minimal): the agent binds the loopback host
 * ONLY. The opaque `printerTargetId` is resolved to a real CUPS queue HERE — the
 * only layer permitted to know a device address; it never reaches the browser.
 *
 * Boundary note (GATE-PLATFORM-1): this file is AT/BELOW the adapter boundary,
 * so CUPS-specific vocabulary (`CupsSpooler`, `lp`, queue, spooler outcomes) is
 * permitted here. None of it is exported through the OS-neutral printer port.
 *
 * @see PRD-092 / EXEC-092 WS5
 * @see ADR-062 D8 (Linux/CUPS exemplar) / ADR-063 D5, D6
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';

import { isCompatibleProtocolVersion } from './protocol-version';
import type { JobTokenAuthorizer } from './request-auth';
import type { WindowsSpooler } from './windows-spooler';

/** The agent binds the loopback host ONLY (NFR-4). */
export const LOOPBACK_HOST = '127.0.0.1';

// ─────────────────────────────────────────────────────────────────────────────
// Adapter ↔ agent wire protocol (transport-neutral above CUPS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A print job handed from the cups adapter to the agent. `jobKey` is the
 * adapter-derived D5 idempotency key (a digest of the rendered payload); the
 * agent dedupes submitted jobs on it.
 */
export interface AgentPrintJobRequest {
  /** D5 idempotency key — repeat submissions of the same key are not re-spooled. */
  jobKey: string;
  /** Opaque deployment-configured target id (the agent resolves it to a queue). */
  printerTargetId: string;
  /** MIME-ish content type of `body` (e.g. `text/plain`). */
  contentType: string;
  /** Serialized transport payload to spool. */
  body: string;
  /**
   * DEC-WIN-03 (PRD-093): single-use authorization token bound to this
   * `(jobKey, printerTargetId)`. REQUIRED when the agent is configured with an
   * authorizer (Windows production); ignored by the Linux exemplar (no authorizer).
   */
  authToken?: string;
  /**
   * ADR-063 D4 caller<->agent protocol version. Checked fail-closed when the agent
   * enforces auth; absent/incompatible is rejected pre-spool.
   */
  protocolVersion?: number;
}

/**
 * Spooler-level outcome the agent reports for a one-way submission.
 *   - `accepted`  — the spooler queued the job.
 *   - `completed` — the spooler reports the job left the queue. This is a
 *     SPOOLER-transport concept; the adapter collapses it to `submitted`
 *     (submitted ≠ printed). It is NEVER promoted to a stronger lifecycle state.
 *   - `rejected`  — the spooler refused the job (D6 truthful; no fabrication).
 */
export type SpoolerOutcome = 'accepted' | 'completed' | 'rejected';

/**
 * The agent's truthful response for a submission. `spoolerJobId` is present iff
 * the job reached the spooler (`accepted`/`completed`); `rejectionReason` is
 * present iff `rejected`.
 */
export interface AgentPrintJobResponse {
  spoolerOutcome: SpoolerOutcome;
  spoolerJobId?: string;
  rejectionReason?: string;
}

/** Agent health snapshot. `host` echoes the loopback bind for observability. */
export interface AgentHealth {
  ok: boolean;
  host: string;
}

/**
 * The transport-error codes a loopback client raises (DEC-006). These are the
 * non-spooler transport faults: the agent could not be reached pre-submission,
 * or it returned an unparseable response post-submission. `spooler_rejected` is
 * NOT here — that is a well-formed `rejected` response, not a transport error.
 */
export type AgentTransportErrorCode =
  | 'agent_unreachable'
  | 'malformed_agent_response';

/**
 * Raised by a `LoopbackAgentClient` when the agent cannot be reached or replies
 * with an unparseable body. The cups adapter maps this to a `transport_submission`
 * `PrintOutcome` (DEC-006). Never thrown for a legitimate spooler rejection.
 */
export class AgentTransportError extends Error {
  readonly code: AgentTransportErrorCode;

  constructor(code: AgentTransportErrorCode, message: string) {
    super(message);
    this.name = 'AgentTransportError';
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUPS spooler port (the agent's downstream seam; CUPS-specific by design)
// ─────────────────────────────────────────────────────────────────────────────

/** A successful spool: the job reached the queue. */
export interface CupsSubmitAccepted {
  outcome: 'accepted' | 'completed';
  jobId: string;
}

/** A spooler refusal (D6 truthful — surfaced, never hidden). */
export interface CupsSubmitRejected {
  outcome: 'rejected';
  reason: string;
}

export type CupsSubmitResult = CupsSubmitAccepted | CupsSubmitRejected;

/** Arguments for a single spooler submission. */
export interface CupsSubmitInput {
  /** Resolved CUPS queue name (the agent maps `printerTargetId` → queue). */
  queue: string;
  contentType: string;
  body: string;
}

/**
 * The downstream CUPS seam. The exemplar ships a deterministic simulated
 * implementation (default) and a real `lp`-command implementation; production
 * deployment injects the command spooler so the agent genuinely fronts CUPS
 * (DEC-002 — load-bearing, not vestigial).
 */
export interface CupsSpooler {
  submit(input: CupsSubmitInput): Promise<CupsSubmitResult>;
}

/**
 * Deterministic in-memory spooler for the exemplar + tests. Produces a stable
 * `jobId` from the queue + body so snapshots are reproducible; honors a
 * configured rejection so the truthful-failure path (D6) is exercisable.
 */
export function createSimulatedCupsSpooler(config?: {
  /** Outcome for accepted jobs (default `accepted`). */
  outcome?: 'accepted' | 'completed';
  /** When true, every submission is rejected (D6 path). */
  rejectAll?: boolean;
  /** Reason attached to a simulated rejection. */
  rejectReason?: string;
}): CupsSpooler {
  const acceptedOutcome = config?.outcome ?? 'accepted';
  return {
    async submit(input: CupsSubmitInput): Promise<CupsSubmitResult> {
      if (config?.rejectAll) {
        return {
          outcome: 'rejected',
          reason: config.rejectReason ?? 'simulated spooler rejection',
        };
      }
      const digest = createHash('sha256')
        .update(`${input.queue}\n${input.body}`)
        .digest('hex')
        .slice(0, 12);
      return {
        outcome: acceptedOutcome,
        jobId: `sim-${input.queue}-${digest}`,
      };
    },
  };
}

/**
 * Production CUPS spooler: pipes the payload to `lp -d <queue>` on the local
 * host. A non-zero exit (or spawn error) is reported as a truthful `rejected`
 * result (D6) — never silently swallowed and never reported as accepted. This
 * is the realization exercised by the manual GATE-HW-2 rig.
 */
export function createCupsCommandSpooler(options?: {
  /** Override the `lp` binary path (default `lp`). */
  lpBinary?: string;
}): CupsSpooler {
  const lpBinary = options?.lpBinary ?? 'lp';
  return {
    submit(input: CupsSubmitInput): Promise<CupsSubmitResult> {
      return new Promise<CupsSubmitResult>((resolve) => {
        const child = spawn(lpBinary, ['-d', input.queue], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        child.on('error', (err: Error) => {
          resolve({
            outcome: 'rejected',
            reason: `lp spawn failed: ${err.message}`,
          });
        });
        child.on('close', (code: number | null) => {
          if (code === 0) {
            // `lp` prints e.g. "request id is queue-42 (1 file(s))" — opaque id.
            const match = stdout.match(/request id is (\S+)/);
            resolve({
              outcome: 'accepted',
              jobId: match ? match[1] : input.queue,
            });
            return;
          }
          const reason =
            stderr.trim() || `lp exited with code ${code ?? 'null'}`;
          resolve({ outcome: 'rejected', reason });
        });

        child.stdin.end(input.body, 'utf8');
      });
    },
  };
}

/**
 * Production ESC/POS spooler: wraps the OS-neutral text payload with the minimal
 * ESC/POS control sequence a TM-T88V needs to actually mark paper, and submits
 * it as a RAW job (`lp -d <queue> -o raw`) so CUPS skips the rasterization
 * filters that render plain text blank on the thermal head (the observed
 * blank-paper symptom). This is the deliberate, FLAGGED home for device
 * encoding (GATE-PLATFORM-1): the renderer stays plain text; the byte-level
 * ESC/POS lives HERE, at/below the adapter boundary, and is never exported
 * upward.
 *
 * Sequence: `ESC @` (initialize) → the rendered text → 3 line feeds → `GS V`
 * partial cut. The renderer's textual `-- cut (...) --` marker (a no-op hint for
 * a pure-text spooler) is stripped here, since this spooler issues a REAL cut.
 *
 * A non-zero `lp` exit (or spawn error) is a truthful `rejected` (D6).
 */
export function createEscPosCommandSpooler(options?: {
  /** Override the `lp` binary path (default `lp`). */
  lpBinary?: string;
  /** Extra `lp` options appended after `-o raw` (e.g. `['-o', 'media=...']`). */
  extraArgs?: string[];
  /** Cut style for the trailing `GS V` (default `partial`). */
  cut?: 'partial' | 'full';
}): CupsSpooler {
  const lpBinary = options?.lpBinary ?? 'lp';
  const extraArgs = options?.extraArgs ?? [];
  // ESC @ = initialize; GS V m = cut (1 = partial, 0 = full).
  const ESC_INIT = Buffer.from([0x1b, 0x40]);
  const FEED = Buffer.from('\n\n\n', 'utf8');
  const CUT = Buffer.from([0x1d, 0x56, options?.cut === 'full' ? 0x00 : 0x01]);

  function toEscPos(body: string): Buffer {
    // Drop the renderer's pure-text cut hint — we emit a real GS V cut below.
    const text = body
      .split('\n')
      .filter((line) => !/^-- cut \(.*\) --$/.test(line.trim()))
      .join('\n');
    return Buffer.concat([ESC_INIT, Buffer.from(text, 'utf8'), FEED, CUT]);
  }

  return {
    submit(input: CupsSubmitInput): Promise<CupsSubmitResult> {
      return new Promise<CupsSubmitResult>((resolve) => {
        const child = spawn(
          lpBinary,
          ['-d', input.queue, '-o', 'raw', ...extraArgs],
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        child.on('error', (err: Error) => {
          resolve({
            outcome: 'rejected',
            reason: `lp spawn failed: ${err.message}`,
          });
        });
        child.on('close', (code: number | null) => {
          if (code === 0) {
            const match = stdout.match(/request id is (\S+)/);
            resolve({
              outcome: 'accepted',
              jobId: match ? match[1] : input.queue,
            });
            return;
          }
          const reason =
            stderr.trim() || `lp exited with code ${code ?? 'null'}`;
          resolve({ outcome: 'rejected', reason });
        });

        child.stdin.end(toEscPos(input.body));
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The loopback agent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exemplar loopback print agent. Fronts a `CupsSpooler`, enforces D5
 * idempotency, and reports outcomes truthfully (D6). Performs NO database
 * writes — the audit row + terminal transition are the server's (WS6) job.
 */
export interface LoopbackPrintAgent {
  /** Always the loopback host (NFR-4). */
  readonly host: string;
  health(): Promise<AgentHealth>;
  submitJob(request: AgentPrintJobRequest): Promise<AgentPrintJobResponse>;
}

/**
 * Resolve an opaque `printerTargetId` to a CUPS queue name. The exemplar maps
 * identity (the deployment configures `printerTargetId` to BE the queue name)
 * with an optional explicit override map. This is the only layer permitted to
 * know the device/queue address.
 */
function resolveQueue(
  printerTargetId: string,
  queueMap?: Record<string, string>,
): string {
  return queueMap?.[printerTargetId] ?? printerTargetId;
}

/**
 * Factory for the loopback agent. Defaults to the simulated spooler so the
 * agent is usable in tests and at type-check time; production wires
 * `createCupsCommandSpooler()`.
 */
export function createLoopbackAgent(deps?: {
  spooler?: CupsSpooler | WindowsSpooler;
  /** Optional `printerTargetId` → CUPS queue mapping (default identity). */
  queueMap?: Record<string, string>;
  /**
   * DEC-WIN-03 (PRD-093): when provided, the agent ENFORCES localhost request
   * auth — every fresh job must carry a compatible `protocolVersion` and a valid,
   * single-use `authToken` bound to its `(jobKey, printerTargetId)`, verified +
   * consumed BEFORE the spooler is touched. Omitted on the Linux exemplar (the
   * D1–D4 hardening is a Windows-certification concern, ADR-063 applicability).
   */
  authorizer?: JobTokenAuthorizer;
}): LoopbackPrintAgent {
  const spooler = deps?.spooler ?? createSimulatedCupsSpooler();
  const queueMap = deps?.queueMap;
  const authorizer = deps?.authorizer;
  // D5: cache of submitted outcomes keyed by jobKey. Rejections are NOT cached
  // (a rejected job never printed and may legitimately be retried).
  const submitted = new Map<string, AgentPrintJobResponse>();

  return {
    host: LOOPBACK_HOST,

    async health(): Promise<AgentHealth> {
      return { ok: true, host: LOOPBACK_HOST };
    },

    async submitJob(
      request: AgentPrintJobRequest,
    ): Promise<AgentPrintJobResponse> {
      const prior = submitted.get(request.jobKey);
      if (prior) {
        // D5: idempotent replay — return the prior outcome, do NOT re-spool.
        // A pure replay emits nothing, so it is gated by dedup (the authoritative
        // duplicate barrier), NOT by a fresh token (DEC-WIN-03).
        return prior;
      }

      // DEC-WIN-03: localhost auth for a FRESH spool. Every rejection happens
      // HERE, before the spooler is touched — a pre-acceptance rejection mapping
      // to `failed`/`transport_submission` at the adapter (§5.5 custody matrix).
      if (authorizer) {
        if (!isCompatibleProtocolVersion(request.protocolVersion)) {
          return {
            spoolerOutcome: 'rejected',
            rejectionReason: 'auth_rejected: incompatible_protocol_version',
          };
        }
        const verdict = authorizer.verifyAndConsume({
          token: request.authToken,
          jobKey: request.jobKey,
          printerTargetId: request.printerTargetId,
        });
        if (!verdict.ok) {
          return {
            spoolerOutcome: 'rejected',
            rejectionReason: `auth_rejected: ${verdict.reason}`,
          };
        }
      }

      const result = await spooler.submit({
        queue: resolveQueue(request.printerTargetId, queueMap),
        contentType: request.contentType,
        body: request.body,
      });

      if (result.outcome === 'rejected') {
        // D6: surface the rejection truthfully; not cached (retryable).
        return { spoolerOutcome: 'rejected', rejectionReason: result.reason };
      }

      const response: AgentPrintJobResponse = {
        spoolerOutcome: result.outcome,
        spoolerJobId: result.jobId,
      };
      submitted.set(request.jobKey, response);
      return response;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loopback agent client (the cups adapter's transport to the agent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cups adapter's view of the agent. Two realizations:
 *   - in-process (exemplar single-host + tests) — wraps a `LoopbackPrintAgent`,
 *   - HTTP (production) — POSTs over loopback to the agent process.
 */
export interface LoopbackAgentClient {
  health(): Promise<AgentHealth>;
  submitJob(request: AgentPrintJobRequest): Promise<AgentPrintJobResponse>;
}

/**
 * In-process client: the adapter and agent share a host and call directly. Used
 * by the exemplar (DEC-002 co-located host) and by deterministic tests.
 */
export function createInProcessAgentClient(
  agent: LoopbackPrintAgent,
): LoopbackAgentClient {
  return {
    health: () => agent.health(),
    submitJob: (request) => agent.submitJob(request),
  };
}

/** Hosts the HTTP client accepts — loopback only, consistent with the bind. */
function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return (
      hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

/** Narrow an unknown parsed body to a well-formed `AgentPrintJobResponse`. */
function isAgentPrintJobResponse(
  value: unknown,
): value is AgentPrintJobResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('spoolerOutcome' in value)
  ) {
    return false;
  }
  // `value` is narrowed by the `in` check — no type assertion required.
  const outcome: unknown = value.spoolerOutcome;
  return (
    outcome === 'accepted' || outcome === 'completed' || outcome === 'rejected'
  );
}

/**
 * HTTP client: POSTs jobs to the loopback agent (the production transport per
 * DEC-002 — "the cups adapter POSTs to 127.0.0.1"). Targets loopback ONLY.
 * Maps connectivity faults to `agent_unreachable` and unparseable bodies to
 * `malformed_agent_response` (DEC-006); a well-formed `rejected` body is
 * returned as-is for the adapter to map.
 */
export function createHttpLoopbackAgentClient(config: {
  baseUrl: string;
}): LoopbackAgentClient {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  if (!isLoopbackUrl(baseUrl)) {
    throw new Error(
      `Loopback agent client refuses non-loopback baseUrl "${config.baseUrl}" (NFR-4)`,
    );
  }

  return {
    async health(): Promise<AgentHealth> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/health`, { method: 'GET' });
      } catch (err) {
        throw new AgentTransportError(
          'agent_unreachable',
          `loopback agent health probe failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
      if (!response.ok) {
        throw new AgentTransportError(
          'agent_unreachable',
          `loopback agent health probe returned ${response.status}`,
        );
      }
      return { ok: true, host: LOOPBACK_HOST };
    },

    async submitJob(
      request: AgentPrintJobRequest,
    ): Promise<AgentPrintJobResponse> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/print`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
      } catch (err) {
        // Pre-submission connectivity fault — the job never reached the spooler.
        throw new AgentTransportError(
          'agent_unreachable',
          `loopback agent unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }

      if (!response.ok) {
        throw new AgentTransportError(
          'agent_unreachable',
          `loopback agent returned HTTP ${response.status}`,
        );
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        // The job MAY have spooled — post-submission ambiguity (DEC-006).
        throw new AgentTransportError(
          'malformed_agent_response',
          'loopback agent returned an unparseable body',
        );
      }
      if (!isAgentPrintJobResponse(parsed)) {
        throw new AgentTransportError(
          'malformed_agent_response',
          'loopback agent returned an unexpected response shape',
        );
      }
      return parsed;
    },
  };
}
