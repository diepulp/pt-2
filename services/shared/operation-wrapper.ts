/**
 * Operation wrapper for standardized error handling and result transformation
 * Following PT-2 canonical service architecture
 */

import type { ServiceResult } from "./types";
import { generateRequestId } from "./utils";

export interface OperationOptions {
  label?: string;
  timeout?: number;
}

interface StructuredError {
  code: string;
  message: string;
  details?: unknown;
}

export async function executeOperation<T>(
  _label: string,
  operation: () => Promise<T>,
  _options?: OperationOptions,
): Promise<ServiceResult<T>> {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  try {
    const result = await operation();
    return {
      data: result,
      error: null,
      success: true,
      status: 200,
      timestamp,
      requestId,
    };
  } catch (err: unknown) {
    // Check if error is already structured with code
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      "message" in err
    ) {
      const structuredErr = err as StructuredError;
      return {
        data: null,
        error: {
          code: structuredErr.code,
          message: structuredErr.message,
          details: structuredErr.details,
        },
        success: false,
        status: 400,
        timestamp,
        requestId,
      };
    }

    // Fallback for unexpected errors
    const error = err as Error;
    return {
      data: null,
      error: {
        code: "OPERATION_FAILED",
        message: error.message,
        details: error,
      },
      success: false,
      status: 500,
      timestamp,
      requestId,
    };
  }
}
