import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  let dbStatus: 'connected' | 'unreachable' = 'unreachable';

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('casino').select('id').limit(1);
    if (!error) {
      dbStatus = 'connected';
    }
  } catch {
    // DB unreachable — report in response, don't crash health endpoint
  }

  const status = dbStatus === 'connected' ? 'healthy' : 'degraded';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      environment: process.env.VERCEL_ENV ?? 'development',
      db: dbStatus,
      latencyMs: Date.now() - start,
    },
    { status: dbStatus === 'connected' ? 200 : 503 },
  );
}
