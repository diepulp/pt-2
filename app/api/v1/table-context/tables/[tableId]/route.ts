import { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type TableStatus = Database['public']['Enums']['table_status'];

export type TableStatusDTO = {
  tableId: string;
  status: TableStatus;
  currentDealer: { id: string; name: string } | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const { tableId } = await params;
    const supabase = await createClient();

    const { data: table, error } = await supabase
      .from('gaming_table')
      .select('id, status')
      .eq('id', tableId)
      .single();

    if (error || !table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    const { data: rotation } = await supabase
      .from('dealer_rotation')
      .select('staff:staff_id (id, first_name, last_name)')
      .eq('table_id', tableId)
      .is('ended_at', null)
      .single();

    const currentDealer = rotation?.staff
      ? {
          id: (rotation.staff as any).id,
          name: `${(rotation.staff as any).first_name} ${(rotation.staff as any).last_name}`,
        }
      : null;

    const result: TableStatusDTO = {
      tableId: table.id,
      status: table.status,
      currentDealer,
    };

    return successResponse<TableStatusDTO>(ctx, result);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
