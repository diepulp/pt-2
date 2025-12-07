import type { ServiceHttpResult } from './service-response';

/**
 * Error thrown when API returns non-ok response
 */
export class FetchError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Typed fetch wrapper for PT-2 API endpoints
 *
 * Features:
 * - Automatic JSON parsing
 * - Unwraps `data` from `ServiceHttpResult<T>` envelope
 * - Throws FetchError with details on non-ok responses
 * - Type-safe return type
 *
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @returns Promise resolving to the data payload
 * @throws FetchError if response is not ok
 */
export async function fetchJSON<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  const result = (await response.json()) as ServiceHttpResult<T>;

  if (!result.ok) {
    throw new FetchError(
      result.error ?? 'Request failed',
      result.status,
      result.code,
      result.details,
    );
  }

  return result.data as T;
}

/**
 * Typed mutation helper with idempotency key
 *
 * @param url - API endpoint URL
 * @param data - Request body data
 * @param idempotencyKey - Required idempotency key
 * @param options - Additional fetch options
 * @returns Promise resolving to the data payload
 */
export async function mutateJSON<T, D = unknown>(
  url: string,
  data: D,
  idempotencyKey: string,
  options?: Omit<RequestInit, 'method' | 'body'>,
): Promise<T> {
  return fetchJSON<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': idempotencyKey,
      ...options?.headers,
    },
    body: JSON.stringify(data),
    ...options,
  });
}
