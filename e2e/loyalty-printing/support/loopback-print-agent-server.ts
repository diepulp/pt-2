/**
 * Loopback print-agent test server (PRD-092 WS9 support)
 *
 * A thin HTTP front for the COMMITTED `createLoopbackAgent` (services/loyalty/
 * printing/agent/loopback-agent.ts). It exists so the WS9 happy-path E2E has a
 * real loopback transport for the dev server's cups adapter to POST to — the
 * production code path (`createHttpLoopbackAgentClient`) is exercised verbatim,
 * not stubbed.
 *
 * It is NOT production code and ships NO new transport logic: every outcome comes
 * from the real agent + the deterministic simulated CUPS spooler
 * (`createSimulatedCupsSpooler`, outcome `accepted` → adapter collapses to
 * `submitted`). The agent binds loopback ONLY (NFR-4), matching the real bind.
 *
 * Wire protocol (mirrors `createHttpLoopbackAgentClient`):
 *   GET  /health → 200 { ok, host }
 *   POST /print  → 200 AgentPrintJobResponse  (body: AgentPrintJobRequest)
 *
 * Run standalone (used by the WS9 run recipe in this folder's README):
 *   LOYALTY_PRINT_AGENT_PORT=9787 npx tsx \
 *     e2e/loyalty-printing/support/loopback-print-agent-server.ts
 *
 * @see PRD-092 / EXEC-092 WS5 (agent) / WS9 (E2E)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';

import {
  createCupsCommandSpooler,
  createEscPosCommandSpooler,
  createLoopbackAgent,
  createSimulatedCupsSpooler,
  LOOPBACK_HOST,
  type AgentPrintJobRequest,
  type CupsSpooler,
} from '../../../services/loyalty/printing/agent/loopback-agent';

const PORT = Number(process.env.LOYALTY_PRINT_AGENT_PORT ?? '9787');

// Spooler selection (GATE-HW-2):
//   LOYALTY_PRINT_SPOOLER=escpos → REAL ESC/POS raw spooler (`lp -d <queue> -o
//     raw` with ESC @ init + GS V cut). Use this for the TM-T88V: plain text
//     through the Epson raster driver renders BLANK; the raw ESC/POS path is
//     what actually marks the thermal head. RECOMMENDED for the full-template
//     hardware run.
//   LOYALTY_PRINT_SPOOLER=cups → REAL CUPS command spooler (`lp -d <queue>`,
//     plain text, no `-o raw`). Only correct if the queue's driver prints plain
//     text directly (most thermal raster drivers do not).
//   anything else (default) → deterministic in-memory simulated spooler (no
//     physical output) — the safe default for tests + type-check.
// The opaque printerTargetId the route sends (LOYALTY_PRINT_TARGET_ID, default
// 'loopback-cups') is mapped to the real CUPS queue (LOYALTY_PRINT_CUPS_QUEUE,
// default 'TM-T88V') in both real modes.
const SPOOLER_MODE = process.env.LOYALTY_PRINT_SPOOLER ?? 'simulated';
const INCOMING_TARGET_ID =
  process.env.LOYALTY_PRINT_TARGET_ID ?? 'loopback-cups';
const CUPS_QUEUE = process.env.LOYALTY_PRINT_CUPS_QUEUE ?? 'TM-T88V';

const useEscPos = SPOOLER_MODE === 'escpos';
const useCups = SPOOLER_MODE === 'cups';
const usePhysical = useEscPos || useCups;
const spooler: CupsSpooler = useEscPos
  ? createEscPosCommandSpooler()
  : useCups
    ? createCupsCommandSpooler()
    : createSimulatedCupsSpooler({ outcome: 'accepted' });

const agent = createLoopbackAgent({
  spooler,
  // In a physical mode, resolve the opaque target id to the real queue so the
  // agent spools to the device. Identity mapping otherwise.
  queueMap: usePhysical ? { [INCOMING_TARGET_ID]: CUPS_QUEUE } : undefined,
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, await agent.health());
        return;
      }
      if (req.method === 'POST' && req.url === '/print') {
        const raw = await readBody(req);
        const request = JSON.parse(raw) as AgentPrintJobRequest;
        const response = await agent.submitJob(request);
        sendJson(res, 200, response);
        return;
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      sendJson(res, 500, {
        error: 'agent_server_error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  })();
});

// Bind loopback ONLY — consistent with the real agent (NFR-4).
server.listen(PORT, LOOPBACK_HOST, () => {
  const mode = useEscPos
    ? `escpos (lp -d ${CUPS_QUEUE} -o raw + ESC/POS init/cut; target '${INCOMING_TARGET_ID}' → '${CUPS_QUEUE}')`
    : useCups
      ? `cups (lp -d ${CUPS_QUEUE}; target '${INCOMING_TARGET_ID}' → '${CUPS_QUEUE}')`
      : 'simulated (no physical output)';
  console.log(
    `[loopback-print-agent] listening on http://${LOOPBACK_HOST}:${PORT} · spooler=${mode}`,
  );
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
