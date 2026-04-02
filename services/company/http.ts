/**
 * CompanyService HTTP Fetchers
 *
 * Client-side fetch functions for CompanyService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import { fetchJSON } from '@/lib/http/fetch-json';
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

import type { RegisterCompanyInput, RegisterCompanyResult } from './dtos';

const BASE = '/api/v1/company';

/**
 * Register a new company.
 * Calls the registration server action endpoint.
 */
export async function registerCompanyHttp(
  input: RegisterCompanyInput,
): Promise<RegisterCompanyResult> {
  return fetchJSON<RegisterCompanyResult>(`${BASE}/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
}
