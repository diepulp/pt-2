/**
 * Idempotency Key Generation
 *
 * Provides deterministic idempotency key generation for ledger operations.
 * Ensures repeated requests with same inputs produce identical keys.
 *
 * Key Design:
 * - Date-bucketed for manual rewards (allows multiple rewards per day)
 * - Supports external reward IDs for API-driven workflows
 * - Uses SHA-256 for collision resistance
 */

import { createHash } from "crypto";

/**
 * Generate deterministic idempotency key from components
 *
 * Uses SHA-256 hash of sorted component keys + values
 * Ensures identical inputs always produce identical keys
 *
 * @param components - Key-value pairs to include in idempotency key
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * // Manual reward: date-bucketed
 * hashIdempotencyKey({
 *   playerId: 'uuid-123',
 *   staffId: 'staff-456',
 *   date: '2025-10-13',
 *   sequence: '1'
 * })
 *
 * @example
 * // External reward: rewardId-based
 * hashIdempotencyKey({
 *   playerId: 'uuid-123',
 *   rewardId: 'promo-xyz-2025'
 * })
 */
export function hashIdempotencyKey(
  components: Record<string, unknown>,
): string {
  // Sort keys for deterministic ordering
  const sortedKeys = Object.keys(components).sort();

  // Build canonical string representation
  const canonicalString = sortedKeys
    .map((key) => {
      const value = components[key];
      // Normalize value to string
      const normalizedValue =
        value === null || value === undefined ? "" : String(value);
      return `${key}=${normalizedValue}`;
    })
    .join("&");

  // Generate SHA-256 hash
  const hash = createHash("sha256");
  hash.update(canonicalString);
  return hash.digest("hex");
}

/**
 * Generate date-bucketed idempotency key for manual rewards
 *
 * Allows multiple manual rewards per day by including sequence number
 *
 * @param playerId - Target player UUID
 * @param staffId - Staff member initiating reward
 * @param date - ISO date string (YYYY-MM-DD)
 * @param sequence - Optional sequence number (default: 1)
 * @returns Deterministic idempotency key
 */
export function generateManualRewardKey(
  playerId: string,
  staffId: string,
  date: string,
  sequence: number = 1,
): string {
  return hashIdempotencyKey({
    playerId,
    staffId,
    date,
    sequence,
    type: "manual_reward",
  });
}

/**
 * Generate external reward idempotency key
 *
 * For rewards triggered by external systems (APIs, integrations)
 *
 * @param playerId - Target player UUID
 * @param rewardId - External reward identifier
 * @returns Deterministic idempotency key
 */
export function generateExternalRewardKey(
  playerId: string,
  rewardId: string,
): string {
  return hashIdempotencyKey({
    playerId,
    rewardId,
    type: "external_reward",
  });
}
