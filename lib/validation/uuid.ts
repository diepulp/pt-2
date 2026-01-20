/**
 * Shared UUID Validation Utilities
 *
 * Provides consistent UUID validation across the codebase.
 * Uses permissive format validation (8-4-4-4-12 hex) rather than
 * strict RFC 4122 validation to support mock/test UUIDs.
 *
 * @see ADR-013 Zod Validation Schemas
 */

import { z } from 'zod';

// === UUID Format Constants ===

/**
 * Permissive UUID format regex.
 *
 * Validates 8-4-4-4-12 hexadecimal format WITHOUT enforcing RFC 4122
 * version (position 13) or variant (position 17) bits.
 *
 * This allows:
 * - Standard RFC 4122 UUIDs (v1, v4, etc.)
 * - Mock/test UUIDs like `d1000000-0000-0000-0000-000000000001`
 * - Database-generated UUIDs that may not follow RFC strictly
 *
 * @example
 * UUID_REGEX.test("550e8400-e29b-41d4-a716-446655440000") // true (RFC 4122 v4)
 * UUID_REGEX.test("d1000000-0000-0000-0000-000000000001") // true (mock ID)
 * UUID_REGEX.test("not-a-uuid") // false
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// === Validation Functions ===

/**
 * Check if a string is a valid UUID format.
 *
 * @param value - String to validate
 * @returns true if valid UUID format, false otherwise
 *
 * @example
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000") // true
 * isValidUUID("not-a-uuid") // false
 * isValidUUID(null) // false
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validate UUID format with detailed error information.
 *
 * @param value - String to validate
 * @param fieldName - Name of the field for error messages
 * @returns Object with isValid boolean and optional error message
 *
 * @example
 * validateUUID("abc", "player_id")
 * // { isValid: false, error: "player_id: Invalid UUID format (expected 8-4-4-4-12 hex)" }
 */
export function validateUUID(
  value: unknown,
  fieldName = 'ID',
): { isValid: boolean; error?: string } {
  if (typeof value !== 'string') {
    return {
      isValid: false,
      error: `${fieldName}: Expected string, got ${typeof value}`,
    };
  }

  if (value.length === 0) {
    return {
      isValid: false,
      error: `${fieldName}: UUID cannot be empty`,
    };
  }

  if (!UUID_REGEX.test(value)) {
    return {
      isValid: false,
      error: `${fieldName}: Invalid UUID format "${value}" (expected 8-4-4-4-12 hex)`,
    };
  }

  return { isValid: true };
}

/**
 * Validate multiple UUIDs and collect all errors.
 *
 * @param fields - Object mapping field names to values
 * @returns Object with isValid boolean and array of error messages
 *
 * @example
 * validateUUIDs({ player_id: "abc", table_id: "123" })
 * // { isValid: false, errors: ["player_id: Invalid UUID format...", "table_id: Invalid UUID format..."] }
 */
export function validateUUIDs(fields: Record<string, unknown>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    const result = validateUUID(value, fieldName);
    if (!result.isValid && result.error) {
      errors.push(result.error);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// === Zod Schema Helpers ===

/**
 * Create a Zod schema for permissive UUID validation.
 *
 * Use this instead of `z.string().uuid()` which enforces RFC 4122.
 *
 * @param fieldName - Name of the field for error messages
 * @returns Zod string schema with UUID format validation
 *
 * @example
 * const schema = z.object({
 *   player_id: uuidSchema("player ID"),
 *   table_id: uuidSchema("table ID"),
 * });
 */
export function uuidSchema(fieldName = 'ID') {
  return z.string().regex(UUID_REGEX, `Invalid ${fieldName} format`);
}

/**
 * Zod schema for optional UUID fields.
 *
 * @param fieldName - Name of the field for error messages
 * @returns Zod schema that accepts string UUID or undefined
 */
export function uuidSchemaOptional(fieldName = 'ID') {
  return uuidSchema(fieldName).optional();
}

/**
 * Zod schema for nullable UUID fields.
 *
 * @param fieldName - Name of the field for error messages
 * @returns Zod schema that accepts string UUID or null
 */
export function uuidSchemaNullable(fieldName = 'ID') {
  return uuidSchema(fieldName).nullable();
}

// === Debug Logging ===

/**
 * Log UUID validation results for debugging.
 * Only logs in development environment.
 *
 * @param context - Description of validation context
 * @param fields - Object mapping field names to values
 */
export function debugLogUUIDs(
  context: string,
  fields: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;

  const results = Object.entries(fields).map(([name, value]) => {
    const validation = validateUUID(value, name);
    return {
      field: name,
      value: typeof value === 'string' ? value : String(value),
      valid: validation.isValid,
      error: validation.error,
    };
  });

  const hasInvalid = results.some((r) => !r.valid);

  if (hasInvalid) {
    console.group(`[UUID Validation] ${context}`);
    results.forEach((r) => {
      if (r.valid) {
        console.log(`  ✓ ${r.field}: ${r.value}`);
      } else {
        console.error(`  ✗ ${r.field}: ${r.value}`);
        console.error(`    ${r.error}`);
      }
    });
    console.groupEnd();
  }
}
