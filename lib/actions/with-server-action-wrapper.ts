/**
 * Server Action Wrapper
 * Following PT-2 canonical architecture
 *
 * Provides standardized error handling and audit logging for Next.js server actions.
 * Server actions call service layer functions which already return ServiceResult<T>.
 * This wrapper adds:
 * - Additional error handling layer
 * - Audit logging for production
 * - PostgreSQL error code mapping for better user messages
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServiceResult, ServiceError } from "@/services/shared/types";
import { generateRequestId } from "@/services/shared/utils";
import type { Database, Json } from "@/types/database.types";

export interface ServerActionContext {
  action: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  metadata?: Json;
}

/**
 * Maps PostgreSQL error codes to user-friendly error messages
 */
function mapDatabaseError(error: unknown): ServiceError {
  // Check if error has PostgreSQL error code
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: string }).code === "string"
  ) {
    const pgError = error as {
      code: string;
      message?: string;
      details?: unknown;
    };

    // Foreign key violation
    if (pgError.code === "23503") {
      return {
        code: "FOREIGN_KEY_VIOLATION",
        message: "Invalid reference: related record does not exist",
        details: pgError.details,
      };
    }

    // Unique constraint violation
    if (pgError.code === "23505") {
      return {
        code: "UNIQUE_VIOLATION",
        message: "A record with this information already exists",
        details: pgError.details,
      };
    }

    // Check constraint violation
    if (pgError.code === "23514") {
      return {
        code: "VALIDATION_ERROR",
        message: "Invalid data: check constraints failed",
        details: pgError.details,
      };
    }

    // PostgREST not found error
    if (pgError.code === "PGRST116") {
      return {
        code: "NOT_FOUND",
        message: "Record not found",
        details: pgError.details,
      };
    }

    // Not null violation
    if (pgError.code === "23502") {
      return {
        code: "VALIDATION_ERROR",
        message: "Required field is missing",
        details: pgError.details,
      };
    }
  }

  // Fallback for unknown errors
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";
  return {
    code: "INTERNAL_ERROR",
    message: errorMessage,
    details: error,
  };
}

/**
 * Writes audit log entry to AuditLog table (production only)
 */
async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  context: ServerActionContext,
  result: ServiceResult<unknown>,
): Promise<void> {
  // Only log in production
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  // Skip if no userId (anonymous actions)
  if (!context.userId) {
    return;
  }

  try {
    await supabase.from("AuditLog").insert({
      userId: context.userId,
      action: context.action,
      entity: context.entity || "unknown",
      entityId: context.entityId || "unknown",
      details: {
        success: result.success,
        status: result.status,
        requestId: result.requestId,
        metadata: context.metadata,
        error: result.error
          ? { code: result.error.code, message: result.error.message }
          : null,
      },
    });
  } catch (error) {
    // Audit logging failure should not break the action
    // Log to console for debugging
    console.error("Audit log write failed:", error);
  }
}

/**
 * Wraps a Next.js server action with standardized error handling and audit logging
 *
 * @param action - Server action function that returns ServiceResult<T>
 * @param supabase - Supabase client for audit logging
 * @param context - Action context (name, user, entity info)
 * @returns Wrapped action with error handling and audit logging
 *
 * @example
 * ```typescript
 * export async function createCasinoAction(data: CasinoCreateDTO) {
 *   const supabase = createClient();
 *   const session = await getSession();
 *
 *   return withServerAction(
 *     async () => {
 *       const casinoService = createCasinoService(supabase);
 *       return casinoService.create(data);
 *     },
 *     supabase,
 *     {
 *       action: 'create_casino',
 *       userId: session?.user?.id,
 *       entity: 'casino',
 *       metadata: { name: data.name, location: data.location }
 *     }
 *   );
 * }
 * ```
 */
export async function withServerAction<T>(
  action: () => Promise<ServiceResult<T>>,
  supabase: SupabaseClient<Database>,
  context: ServerActionContext,
): Promise<ServiceResult<T>> {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  try {
    // Execute the server action (which calls service layer)
    const result = await action();

    // Add audit log entry
    await writeAuditLog(supabase, context, result);

    return result;
  } catch (error: unknown) {
    // Catch any errors that escaped the service layer
    const mappedError = mapDatabaseError(error);

    const errorResult: ServiceResult<T> = {
      data: null,
      error: mappedError,
      success: false,
      status:
        mappedError.code === "NOT_FOUND"
          ? 404
          : mappedError.code === "VALIDATION_ERROR"
            ? 400
            : mappedError.code === "FOREIGN_KEY_VIOLATION"
              ? 400
              : mappedError.code === "UNIQUE_VIOLATION"
                ? 409
                : 500,
      timestamp,
      requestId,
    };

    // Log the error result
    await writeAuditLog(supabase, context, errorResult);

    return errorResult;
  }
}
