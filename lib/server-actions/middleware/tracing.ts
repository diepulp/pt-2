import type { ServiceResult } from '@/lib/http/service-response';
import { mapDatabaseError } from '@/lib/server-actions/error-map';

import type { Middleware, MiddlewareContext } from './types';

/**
 * Tracing Middleware
 *
 * Responsibilities:
 * 1. Wrap handler execution to catch unhandled errors
 * 2. Map database/domain errors to ServiceResult
 * 3. Record accurate duration in result
 * 4. Ensure requestId and timestamp are present
 *
 * Future: OpenTelemetry span integration
 */
export function withTracing<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    try {
      const result = await next();

      // Ensure duration is accurate and metadata is complete
      return {
        ...result,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const mapped = mapDatabaseError(error);

      return {
        ok: false,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
        httpStatus: mapped.httpStatus,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      } as ServiceResult<T>;
    }
  };
}
