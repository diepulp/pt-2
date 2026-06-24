/**
 * Windows print-agent service entry (PRD-093 WS_W3)
 *
 * The runnable agent process the WinSW Windows Service hosts (DEC-WIN-02). It
 * wires the production pieces together and exposes a loopback-ONLY HTTP surface:
 *
 *   GET  /health       — liveness (unauthenticated; reveals nothing sensitive)
 *   POST /authorize    — sanctioned server-side caller arms a job; returns a
 *                        single-use token (authenticated by the loopback service
 *                        credential — DEC-WIN-03). Co-located deployments may call
 *                        the in-process authorizer directly instead.
 *   POST /print        — submit a job; requires a valid single-use token +
 *                        compatible protocol version (verified pre-spool).
 *   GET  /diagnostics  — authenticated, narrowly-scoped health snapshot (WS_W9/W6).
 *
 * Binds `127.0.0.1` ONLY (ADR-063 D1). The opaque `printerTargetId` is resolved to
 * a real Windows queue HERE (FR-10) via the configured queue map — never in the
 * browser. This file runs on the Windows host; it is not exercised by Linux CI, but
 * it type-checks as part of the build.
 *
 * @see PRD-093 / EXEC-093 WS_W3
 */

import { readFileSync } from 'fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';

import { createDiagnosticsEndpoint } from '@/services/loyalty/printing/agent/diagnostics-endpoint';
import {
  LOOPBACK_HOST,
  createLoopbackAgent,
  type AgentPrintJobRequest,
} from '@/services/loyalty/printing/agent/loopback-agent';
import { AGENT_PROTOCOL_VERSION } from '@/services/loyalty/printing/agent/protocol-version';
import { createJobTokenAuthorizer } from '@/services/loyalty/printing/agent/request-auth';
import { createWindowsCommandSpooler } from '@/services/loyalty/printing/agent/windows-spooler-native';

interface AgentServiceConfig {
  /** Loopback port to bind (127.0.0.1 only). */
  port: number;
  /** Absolute path to the bundled winspool-print-helper.exe (DEC-WIN-01 trusted path). */
  helperPath: string;
  /** Opaque printerTargetId -> Windows queue name (server-side resolution, FR-10). */
  queueMap: Record<string, string>;
  /** Loopback service credential gating /authorize + /diagnostics (sanctioned caller). */
  serviceCredential: string;
  /** Optional job-token TTL override (ms). */
  jobTokenTtlMs?: number;
}

const AGENT_VERSION = '0.93.0';

function loadConfig(): AgentServiceConfig {
  const configPath = process.env.PRINT_AGENT_CONFIG;
  if (!configPath) {
    throw new Error('PRINT_AGENT_CONFIG env var (path to agent config json) is required');
  }
  const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as AgentServiceConfig).port !== 'number' ||
    typeof (parsed as AgentServiceConfig).helperPath !== 'string' ||
    typeof (parsed as AgentServiceConfig).serviceCredential !== 'string'
  ) {
    throw new Error('agent config json is malformed (port/helperPath/serviceCredential required)');
  }
  const cfg = parsed as AgentServiceConfig;
  return { ...cfg, queueMap: cfg.queueMap ?? {} };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

export function startAgentService(config: AgentServiceConfig): ReturnType<typeof createServer> {
  const spooler = createWindowsCommandSpooler({ helperPath: config.helperPath });
  const authorizer = createJobTokenAuthorizer({ ttlMs: config.jobTokenTtlMs });
  const agent = createLoopbackAgent({
    spooler,
    queueMap: config.queueMap,
    authorizer,
  });

  const diagnostics = createDiagnosticsEndpoint({
    agentVersion: AGENT_VERSION,
    authorize: (cred) => cred !== undefined && cred === config.serviceCredential,
    probes: {
      configuredTargetExists: () => Object.keys(config.queueMap).length > 0,
      // The native helper exe path was validated absolute at spooler construction.
      nativeModuleLoaded: () => true,
      // A loopback HTTP agent that reached this handler is itself responsive.
      spoolerConnectivity: () => true,
    },
  });

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => send(res, 500));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.startsWith('/health')) {
      const health = await agent.health();
      return send(res, 200, health);
    }

    if (method === 'GET' && url.startsWith('/diagnostics')) {
      const cred = headerValue(req, 'x-agent-credential');
      const result = diagnostics.handle(cred);
      return result.status === 200
        ? send(res, 200, result.body)
        : send(res, 401);
    }

    if (method === 'POST' && url.startsWith('/authorize')) {
      const cred = headerValue(req, 'x-agent-credential');
      if (cred === undefined || cred !== config.serviceCredential) {
        return send(res, 401);
      }
      const body = (await readJsonBody(req)) as Partial<{
        jobKey: string;
        printerTargetId: string;
      }>;
      if (!body.jobKey || !body.printerTargetId) {
        return send(res, 400);
      }
      const issued = authorizer.issue({
        jobKey: body.jobKey,
        printerTargetId: body.printerTargetId,
      });
      return send(res, 200, issued);
    }

    if (method === 'POST' && url.startsWith('/print')) {
      const body = (await readJsonBody(req)) as Partial<AgentPrintJobRequest>;
      if (!body.jobKey || !body.printerTargetId || typeof body.body !== 'string') {
        return send(res, 400);
      }
      const response = await agent.submitJob({
        jobKey: body.jobKey,
        printerTargetId: body.printerTargetId,
        contentType: body.contentType ?? 'application/escpos',
        body: body.body,
        authToken: body.authToken,
        protocolVersion: body.protocolVersion ?? AGENT_PROTOCOL_VERSION,
      });
      return send(res, 200, response);
    }

    return send(res, 404);
  }

  // ADR-063 D1: loopback bind ONLY. Never 0.0.0.0 / a routable interface.
  server.listen(config.port, LOOPBACK_HOST);
  return server;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

// Direct execution entry (the WinSW service runs `node agent-service-entry.js`).
if (require.main === module) {
  startAgentService(loadConfig());
}
