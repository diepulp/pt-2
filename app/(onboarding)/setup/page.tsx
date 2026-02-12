import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
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

  if (!user) {
    redirect('/signin?redirect=/setup');
  }

  const casinoId = user.app_metadata?.casino_id;
  if (!casinoId) {
    redirect('/bootstrap');
  }

  // Fetch casino_settings
  const { data: settings } = await supabase
    .from('casino_settings')
    .select('*')
    .eq('casino_id', casinoId)
    .single();

  // Already completed — redirect to gateway
  if (settings?.setup_status === 'ready') {
    redirect('/start');
  }

  // Fetch full game_settings via CRUD (returns GameSettingsDTO[])
  const gameSettings = await listGameSettings(supabase);

  // Fetch gaming_tables (to detect existing tables for re-entry)
  const { data: gamingTables } = await supabase
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
