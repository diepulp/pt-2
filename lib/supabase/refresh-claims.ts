import { createBrowserComponentClient } from '@/lib/supabase/client';

export interface RefreshResult {
  ok: boolean;
  error?: string;
}

const REQUIRED_CLAIMS = ['casino_id', 'staff_id', 'staff_role'] as const;
const AUTO_RETRY_DELAY_MS = 1000;

export async function refreshAndVerifyClaims(): Promise<RefreshResult> {
  const supabase = createBrowserComponentClient();

  // Two attempts: first refresh, then 1s wait + second refresh for stale-metadata edge case.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session) {
      return { ok: false, error: error?.message ?? 'Session refresh failed' };
    }

    const metadata = data.session.user.app_metadata;
    const missing = REQUIRED_CLAIMS.filter((key) => !metadata[key]);

    if (missing.length === 0) {
      return { ok: true };
    }

    // First attempt had stale metadata — wait briefly, then retry once.
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, AUTO_RETRY_DELAY_MS));
    }
  }

  // Both attempts failed — surface to UI for manual retry.
  return { ok: false, error: 'Claims not yet available. Please retry.' };
}
