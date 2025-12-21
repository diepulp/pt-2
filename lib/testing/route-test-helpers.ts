/**
 * Route Handler Test Helpers
 *
 * Minimal utilities for testing Next.js API route handlers.
 * Created for QA-ROUTE-TESTING (ISSUE-607F9CCB).
 */

import { NextRequest } from "next/server";

export interface MockRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Create a mock NextRequest for route handler testing.
 */
export function createMockRequest(
  method: string,
  url: string,
  options: MockRequestOptions = {},
): NextRequest {
  const { headers = {}, body, searchParams } = options;

  const fullUrl = new URL(url, "http://localhost:3000");
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) =>
      fullUrl.searchParams.set(k, v),
    );
  }

  return new NextRequest(fullUrl, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create mock route params matching Next.js 15 App Router signature.
 * Route params are now async (Promise) in Next.js 15.
 */
export function createMockRouteParams<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
