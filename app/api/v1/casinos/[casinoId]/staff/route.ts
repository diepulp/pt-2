/**
 * Casino Staff API
 *
 * NOTE: The 'dealer' role is included for scheduling queries, but dealers
 * are non-authenticated. Use the 'authenticated' filter to exclude dealers
 * when querying for staff that can log in to the application.
 *
 * Role Definitions:
 * - dealer: Non-authenticated, scheduling metadata only (user_id = null)
 * - pit_boss: Authenticated, operational permissions (user_id required)
 * - admin: Authenticated, administrative permissions (user_id required)
 *
 * See also:
 * - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md (Dealer Role Semantics)
 * - docs/30-security/SECURITY_TENANCY_UPGRADE.md (Dealer Role Exception)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const routeParamsSchema = z.object({
  casinoId: z.string().uuid(),
});

const staffListQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(['dealer', 'pit_boss', 'admin']).optional(),
  authenticated: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(), // Filter for authenticated staff only (excludes dealers)
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ casinoId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, routeParamsSchema);
    const query = parseQuery(request, staffListQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to CasinoService.listStaff
    void params;
    void query;

    // TODO: Invoke CasinoService.listStaff and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
