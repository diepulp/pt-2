import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type TableStatus = Database['public']['Enums']['table_status'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

export type GamingTableDTO = Pick<
  GamingTableRow,
  'id' | 'casino_id' | 'label' | 'pit' | 'type' | 'status' | 'created_at'
>;

const getTablesSchema = z.object({
  casino_id: z.string().uuid(),
  status: z.enum(['inactive', 'active', 'closed']).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const { searchParams } = new URL(request.url);
    const casinoId = searchParams.get('casino_id');
    const status = searchParams.get('status') as TableStatus | null;

    const params = getTablesSchema.parse({
      casino_id: casinoId,
      status: status || undefined,
    });

    const supabase = await createClient();

    let query = supabase
      .from('gaming_table')
      .select('id, casino_id, label, pit, type, status, created_at')
      .eq('casino_id', params.casino_id);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query.order('label');

    if (error) throw error;

    return successResponse<GamingTableDTO[]>(ctx, data ?? []);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
