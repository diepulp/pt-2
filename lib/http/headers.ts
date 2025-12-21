/**
 * HTTP Header Constants
 *
 * Centralized header names to prevent drift.
 * @see IETF draft-ietf-httpapi-idempotency-key-header
 * @see docs/25-api-data/api-surface.openapi.yaml
 * @see ADR-021 Idempotency Header Standardization
 */

/**
 * Idempotency-Key header per IETF standard.
 * HTTP headers are case-insensitive - use canonical title case.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key" as const;

/** Request correlation ID header */
export const REQUEST_ID_HEADER = "x-request-id" as const;
