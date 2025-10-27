/**
 * Telemetry Emission
 * Wave 2 Track 0: Future-ready telemetry wrapper
 *
 * Provides thin abstraction layer for structured logging.
 * Serves as future swap point for queue workers and observability systems.
 *
 * Production Evolution:
 * 1. Wave 2: Structured console logging (development)
 * 2. Wave 3+: Queue-based async telemetry (e.g., SQS, Redis)
 * 3. Future: OpenTelemetry integration for distributed tracing
 */

import { getCorrelationId } from '@/lib/correlation';

/**
 * Canonical telemetry event schema
 * Ensures consistency across all telemetry events
 */
export interface TelemetryEvent {
  eventType: string; // Domain event type (e.g., 'loyalty.manual_reward')
  timestamp: string; // ISO 8601 timestamp
  correlationId: string | null; // Request correlation ID
  playerId?: string; // Player UUID (if applicable)
  staffId?: string; // Staff UUID (if applicable)
  metadata?: Record<string, unknown>; // Additional context
  severity?: 'debug' | 'info' | 'warn' | 'error'; // Event severity
}

/**
 * Emit structured telemetry event
 *
 * Currently logs to console in structured format.
 * In production, this will be swapped for async queue workers.
 *
 * @param event - Canonical telemetry event
 *
 * @example
 * ```typescript
 * emitTelemetry({
 *   eventType: 'loyalty.manual_reward',
 *   timestamp: new Date().toISOString(),
 *   correlationId: getCorrelationId(),
 *   playerId: 'player-uuid',
 *   staffId: 'staff-uuid',
 *   metadata: {
 *     pointsChange: 100,
 *     balanceBefore: 500,
 *     balanceAfter: 600
 *   },
 *   severity: 'info'
 * });
 * ```
 */
export function emitTelemetry(event: TelemetryEvent): void {
  // Enrich event with correlation ID if not provided
  const enrichedEvent: TelemetryEvent = {
    ...event,
    correlationId: event.correlationId ?? getCorrelationId(),
    timestamp: event.timestamp || new Date().toISOString(),
    severity: event.severity || 'info',
  };

  // Development: Structured console logging
  if (process.env.NODE_ENV !== 'production') {
    const logLevel = enrichedEvent.severity || 'info';

    // Use appropriate console method based on severity
    if (logLevel === 'error') {
      console.error('[TELEMETRY]', JSON.stringify(enrichedEvent, null, 2));
    } else if (logLevel === 'warn') {
      console.warn('[TELEMETRY]', JSON.stringify(enrichedEvent, null, 2));
    } else {
      // info/debug - structured logging for observability
      // eslint-disable-next-line no-console
      console.log('[TELEMETRY]', JSON.stringify(enrichedEvent, null, 2));
    }
    return;
  }

  // Production: Queue-based async telemetry (future implementation)
  // TODO: Replace with SQS/Redis queue in Wave 3+
  // await queueTelemetryEvent(enrichedEvent);

  // Fallback: console logging for production (minimal impact)
  // eslint-disable-next-line no-console
  console.log('[TELEMETRY]', JSON.stringify(enrichedEvent));
}

/**
 * Emit loyalty event telemetry
 * Convenience wrapper for loyalty domain events
 *
 * @param eventType - Loyalty event type (e.g., 'manual_reward', 'tier_upgrade')
 * @param playerId - Player UUID
 * @param metadata - Additional context
 */
export function emitLoyaltyEvent(
  eventType: string,
  playerId: string,
  metadata?: Record<string, unknown>,
): void {
  emitTelemetry({
    eventType: `loyalty.${eventType}`,
    timestamp: new Date().toISOString(),
    correlationId: getCorrelationId(),
    playerId,
    metadata,
    severity: 'info',
  });
}
