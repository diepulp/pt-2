import { NextResponse } from 'next/server';

import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type {
  OutboxAdminEventDTO,
  OutboxOperationalBacklogDTO,
  OutboxRelayHealthDTO,
} from '@/services/player-financial/dtos';

const VALID_STATUSES = new Set([
  'all',
  'pending',
  'processed',
  'failing',
  'poison',
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  // ── Step 1: session client — auth + role check ──────────────────────────
  // Two-client pattern: session client verifies identity + admin authority;
  // service-role client (below) calls service-role-only RPCs.
  const sessionClient = await createClient();

  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Direct staff table lookup — authoritative role source (same pattern as admin layout).
  const { data: staff } = await sessionClient
    .from('staff')
    .select('role, casino_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!staff || staff.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // casino_id is from the confirmed staff row — never from request input.
  const casinoId: string = staff.casino_id;

  // ── Step 2: input validation ────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get('event_type') ?? undefined;
  const statusParam = searchParams.get('status') ?? 'all';
  const searchIdParam = searchParams.get('search_id') ?? undefined;

  if (!VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  if (searchIdParam !== undefined && !UUID_RE.test(searchIdParam)) {
    return NextResponse.json({ error: 'Invalid search_id' }, { status: 400 });
  }

  // ── Step 3: service-role client — RPC calls ──────────────────────────────
  // Constructed only after authorization succeeds.
  const serviceClient = createServiceClient();

  const [healthResult, eventsResult, opClaimableResult, opDeadLetterResult] =
    await Promise.all([
      serviceClient.rpc('rpc_get_outbox_relay_health', {
        p_casino_id: casinoId,
      }),
      serviceClient.rpc('rpc_get_outbox_event_page', {
        p_casino_id: casinoId,
        p_event_type: eventType ?? undefined,
        p_status: statusParam,
        p_search_id: searchIdParam ?? undefined,
      }),
      // Phase 2.4: operational backlog breakdown (claimable vs dead-letter)
      serviceClient
        .from('finance_outbox')
        .select('*', { count: 'exact', head: true })
        .eq('casino_id', casinoId)
        .eq('fact_class', 'operational')
        .is('processed_at', null)
        .lt('delivery_attempts', 5),
      serviceClient
        .from('finance_outbox')
        .select('*', { count: 'exact', head: true })
        .eq('casino_id', casinoId)
        .eq('fact_class', 'operational')
        .is('processed_at', null)
        .gte('delivery_attempts', 5),
    ]);

  if (healthResult.error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch relay health',
        details: safeErrorDetails(healthResult.error),
      },
      { status: 500 },
    );
  }

  if (eventsResult.error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch outbox events',
        details: safeErrorDetails(eventsResult.error),
      },
      { status: 500 },
    );
  }

  const health = (healthResult.data?.[0] ??
    null) as OutboxRelayHealthDTO | null;
  const events = (eventsResult.data ?? []) as OutboxAdminEventDTO[];
  const operationalBacklog: OutboxOperationalBacklogDTO = {
    claimable: opClaimableResult.count ?? 0,
    deadLetter: opDeadLetterResult.count ?? 0,
  };

  return NextResponse.json({ health, events, operationalBacklog });
}
