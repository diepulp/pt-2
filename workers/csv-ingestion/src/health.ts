/**
 * HTTP Health Server
 *
 * Provides Kubernetes-compatible liveness and readiness endpoints.
 * Used by the container orchestrator to determine whether the worker
 * should receive traffic (readiness) or be restarted (liveness).
 *
 * Endpoints:
 * - `GET /health`  — liveness probe: always 200 if the process is running
 * - `GET /healthz` — alias for `/health`
 * - `GET /ready`   — readiness probe: always 200 for now (stateless worker)
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import { createServer, type Server } from 'node:http';

import type { Config } from './config.js';
import type { Logger } from './logger.js';

/**
 * Start the HTTP health server on the configured port.
 *
 * The server is intentionally lightweight — it serves only health probes
 * and does not participate in batch processing.
 *
 * @param config - Validated worker configuration (HEALTH_PORT, WORKER_ID).
 * @param logger - Structured logger for server startup message.
 * @returns The running `http.Server` instance. Call `server.close()` during
 *          graceful shutdown.
 */
export function startHealthServer(config: Config, logger: Logger): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '';

    if (url === '/health' || url === '/healthz') {
      const body = JSON.stringify({
        status: 'ok',
        worker_id: config.WORKER_ID,
        timestamp: new Date().toISOString(),
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    if (url === '/ready') {
      const body = JSON.stringify({ status: 'ready' });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(config.HEALTH_PORT, () => {
    logger.info('Health server listening', { port: config.HEALTH_PORT });
  });

  return server;
}
