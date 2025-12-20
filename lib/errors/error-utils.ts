/**
 * Error Utilities
 *
 * Standardized error handling utilities for PT-2 application.
 * Provides consistent error logging, message extraction, and serialization.
 *
 * @see docs/70-governance/ERROR_HANDLING_STANDARD.md
 * @see docs/20-architecture/specs/ERROR_TAXONOMY_AND_RESILIENCE.md
 */

import { FetchError } from "@/lib/http/fetch-json";

import { DomainError } from "./domain-errors";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serializable error representation for logging.
 * Error objects have non-enumerable properties, so we extract them explicitly.
 */
export interface SerializableError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
  retryable?: boolean;
  stack?: string;
}

/**
 * Component error context for structured logging.
 */
export interface ErrorContext {
  component: string;
  action: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERROR SERIALIZATION
// ============================================================================

/**
 * Converts any error to a serializable object for logging.
 *
 * Error objects in JavaScript have non-enumerable properties (message, name, stack).
 * This function explicitly extracts all relevant properties for proper console logging.
 *
 * @param error - Any error object
 * @returns Serializable error object with all properties visible
 */
export function serializeError(error: unknown): SerializableError {
  if (error instanceof FetchError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
      stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    };
  }

  if (error instanceof DomainError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.httpStatus,
      details: error.details,
      retryable: error.retryable,
      stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    };
  }

  // Handle non-Error objects
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  return { name: "UnknownError", message: String(error) };
}

// ============================================================================
// ERROR MESSAGE EXTRACTION
// ============================================================================

/**
 * Extract clean, user-friendly error message from Error objects.
 *
 * Handles FetchError by removing technical prefixes and extracting
 * the domain-specific error message.
 *
 * @param error - Error object to extract message from
 * @returns Clean error message suitable for user display
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred";

  if (error instanceof FetchError) {
    // FetchError.message already includes the clean domain message
    // Remove "FetchError: " prefix if present
    return error.message.replace(/^FetchError:\s*/i, "");
  }

  if (error instanceof DomainError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred";
}

/**
 * Get the error code if available.
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof FetchError) {
    return error.code;
  }
  if (error instanceof DomainError) {
    return error.code;
  }
  return undefined;
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DomainError) {
    return error.retryable;
  }

  // Network errors are typically retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // 5xx errors are typically retryable
  if (error instanceof FetchError && error.status >= 500) {
    return true;
  }

  return false;
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

/**
 * Log an error with structured context (development only).
 *
 * This function:
 * - Only logs in development environment
 * - Serializes errors properly (no `{}` output)
 * - Includes component and action context
 * - Respects production logging rules
 *
 * @example
 * ```ts
 * logError(error, { component: 'NewSlipModal', action: 'createSlip' });
 * ```
 */
export function logError(error: unknown, context: ErrorContext): void {
  // Only log in development
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const serialized = serializeError(error);

  console.error(`[${context.component}] ${context.action} Error:`, {
    ...serialized,
    ...(context.metadata && { metadata: context.metadata }),
  });
}

/**
 * Log an error and return a user-facing message.
 *
 * Convenience function that combines logging and message extraction.
 *
 * @example
 * ```ts
 * const message = logAndGetMessage(error, { component: 'Modal', action: 'save' });
 * setError(message);
 * ```
 */
export function logAndGetMessage(
  error: unknown,
  context: ErrorContext,
): string {
  logError(error, context);
  return getErrorMessage(error);
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Check if error is a FetchError.
 */
export function isFetchError(error: unknown): error is FetchError {
  return error instanceof FetchError;
}

/**
 * Check if error is a DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Check if error is a validation error.
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return error.code === "VALIDATION_ERROR";
  }
  if (error instanceof DomainError) {
    return error.code === "VALIDATION_ERROR";
  }
  return false;
}

/**
 * Check if error is a not found error.
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return error.status === 404 || error.code.includes("NOT_FOUND");
  }
  if (error instanceof DomainError) {
    return error.httpStatus === 404 || error.code.includes("NOT_FOUND");
  }
  return false;
}

/**
 * Check if error is a conflict error (unique violation, duplicate, etc).
 */
export function isConflictError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return (
      error.status === 409 ||
      error.code === "UNIQUE_VIOLATION" ||
      error.code.includes("DUPLICATE") ||
      error.code.includes("ALREADY")
    );
  }
  if (error instanceof DomainError) {
    return (
      error.httpStatus === 409 ||
      error.code === "UNIQUE_VIOLATION" ||
      error.code.includes("DUPLICATE") ||
      error.code.includes("ALREADY")
    );
  }
  return false;
}

// ============================================================================
// VALIDATION ERROR FORMATTING
// ============================================================================

interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

/**
 * Format validation error details into a user-friendly message.
 */
export function formatValidationError(error: unknown): string {
  if (!isFetchError(error) || error.code !== "VALIDATION_ERROR") {
    return getErrorMessage(error);
  }

  const details = error.details as ValidationDetails | undefined;
  if (!details) {
    return error.message;
  }

  const parts: string[] = [];

  if (details.fieldErrors) {
    const fieldParts = Object.entries(details.fieldErrors)
      .map(([field, errors]) => `${field}: ${errors.join(", ")}`)
      .filter(Boolean);
    if (fieldParts.length > 0) {
      parts.push(fieldParts.join("; "));
    }
  }

  if (details.formErrors && details.formErrors.length > 0) {
    parts.push(details.formErrors.join("; "));
  }

  return parts.length > 0 ? parts.join(" | ") : error.message;
}
