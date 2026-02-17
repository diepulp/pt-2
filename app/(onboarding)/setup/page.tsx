import { redirect } from 'next/navigation';

import {
  DEV_RLS_CONTEXT,
  isDevAuthBypassEnabled,
} from '@/lib/supabase/dev-context';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { listGameSettings } from '@/services/casino/game-settings-crud';
import type { Database } from '@/types/database.types';

import { SetupWizard } from './setup-wizard';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];

/**
 * Deterministic resume-step algorithm.
 * Computes the initial wizard step from server-fetched state.
 */
function computeInitialStep(
  settings: CasinoSettingsRow | null,
  gameCount: number,
  tableCount: number,
): number {
  // Step 0: Casino Basics — missing timezone or table_bank_mode
  if (!settings?.timezone || !settings?.table_bank_mode) return 0;
  // Tiebreaker: tables exist but not seeded → route to Step 1 (seed first)
  if (gameCount === 0) return 1;
  // Step 2: Create Tables
  if (tableCount === 0) return 2;
  // Step 3: Par Targets (recommended but optional — user can skip to review)
  return 3;
}

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let casinoId: string;
  // Client used for DB queries — service role when dev bypass active (no RLS session)
  let queryClient = supabase;

  const devBypass = !user && isDevAuthBypassEnabled();

  if (user) {
    const cid = user.app_metadata?.casino_id;
    if (!cid) {
      redirect('/bootstrap');
    }
    casinoId = cid;
  } else if (devBypass) {
    // DEV MODE: Use mock context + service client for RLS-free queries
    casinoId = DEV_RLS_CONTEXT.casinoId;
    queryClient = createServiceClient();
  } else {
    redirect('/signin?redirect=/setup');
  }

  // Fetch casino_settings
  const { data: settings } = await queryClient
    .from('casino_settings')
    .select('*')
    .eq('casino_id', casinoId)
    .single();

  // Already completed — redirect to gateway (skip in dev bypass to allow re-entry)
  if (settings?.setup_status === 'ready' && !devBypass) {
    redirect('/start');
  }

  // Fetch full game_settings via CRUD (returns GameSettingsDTO[])
  const gameSettings = await listGameSettings(queryClient);

  // Fetch gaming_tables (to detect existing tables for re-entry)
  const { data: gamingTables } = await queryClient
    .from('gaming_table')
    .select('*')
    .eq('casino_id', casinoId)
    .order('created_at', { ascending: true });

  const tables = gamingTables ?? [];
  const initialStep = computeInitialStep(
    settings,
    gameSettings.length,
    tables.length,
  );

  return (
    <SetupWizard
      casinoSettings={settings}
      gameSettings={gameSettings}
      gamingTables={tables}
      initialStep={initialStep}
    />
  );
}
