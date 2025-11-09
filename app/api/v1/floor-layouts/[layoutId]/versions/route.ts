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

const paramsSchema = z.object({
  layoutId: z.string().uuid(),
});

const versionQuerySchema = z.object({
  status: z.enum(['draft', 'pending_activation', 'active', 'retired']).optional(),
  include_slots: z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      if (typeof value === 'string') {
        return value === 'true' || value === '1';
      }
      return value;
    }, z.boolean())
    .optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: { layoutId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const { layoutId } = parseParams(context.params, paramsSchema);
    const query = parseQuery(request, versionQuerySchema);
    const supabase = await createClient();

    let dbQuery = supabase
      .from('floor_layout_version')
      .select('*')
      .eq('layout_id', layoutId)
      .order('version_no', { ascending: false });

    if (query.status) {
      dbQuery = dbQuery.eq('status', query.status);
    }

    const { data, error } = await dbQuery;
    if (error) {
      throw error;
    }

    const versions = data ?? [];
    const includeSlots = query.include_slots ?? false;

    if (!includeSlots || versions.length === 0) {
      return successResponse(ctx, { items: versions });
    }

    const versionIds = versions.map((v) => v.id);

    const [{ data: pits, error: pitsError }, { data: slots, error: slotsError }] =
      await Promise.all([
        supabase
          .from('floor_pit')
          .select('*')
          .in('layout_version_id', versionIds),
        supabase
          .from('floor_table_slot')
          .select('*')
          .in('layout_version_id', versionIds),
      ]);

    if (pitsError) throw pitsError;
    if (slotsError) throw slotsError;

    const pitsByVersion = new Map<string, any[]>();
    (pits ?? []).forEach((pit) => {
      const list = pitsByVersion.get(pit.layout_version_id) ?? [];
      list.push(pit);
      pitsByVersion.set(pit.layout_version_id, list);
    });

    const slotsByVersion = new Map<string, any[]>();
    (slots ?? []).forEach((slot) => {
      const list = slotsByVersion.get(slot.layout_version_id) ?? [];
      list.push(slot);
      slotsByVersion.set(slot.layout_version_id, list);
    });

    const enriched = versions.map((version) => ({
      ...version,
      pits: pitsByVersion.get(version.id) ?? [],
      table_slots: slotsByVersion.get(version.id) ?? [],
    }));

    return successResponse(ctx, { items: enriched });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
