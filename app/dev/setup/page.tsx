import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';

import { mockCasinoSettingsRow, mockSeededGames } from './_mock-data';
import { SetupWizardDev } from './setup-wizard-dev';

/**
 * Dev-only setup wizard page.
 * No auth, no Supabase — serves mock prefetch data for UI debugging.
 * Access at: http://localhost:3000/dev/setup
 * Optional: ?step=0..4 to start at a specific step
 *           ?seeded=1 to start with pre-seeded game settings
 */
export default async function DevSetupPage(props: {
  searchParams: Promise<{ step?: string; done?: string; seeded?: string }>;
}) {
  const searchParams = await props.searchParams;

  if (searchParams.done === '1') {
    return (
      <div className="text-center space-y-4 py-20">
        <h1 className="text-2xl font-semibold">Setup Complete (Dev)</h1>
        <p className="text-muted-foreground">
          In production this redirects to /pit dashboard.
        </p>
        <a
          href="/dev/setup"
          className="inline-block text-sm underline text-primary"
        >
          Restart wizard
        </a>
      </div>
    );
  }

  const requestedStep = searchParams.step
    ? Math.max(0, Math.min(4, parseInt(searchParams.step, 10) || 0))
    : 0;

  const preSeeded = searchParams.seeded === '1';

  const mockSettings = mockCasinoSettingsRow({
    setup_status: 'not_started',
    timezone: preSeeded ? 'America/Los_Angeles' : '',
    table_bank_mode: 'INVENTORY_COUNT',
  });

  // When seeded=1, provide mock game settings for presentation
  const mockGames: GameSettingsDTO[] = preSeeded
    ? (mockSeededGames() as unknown as GameSettingsDTO[])
    : [];

  return (
    <SetupWizardDev
      casinoSettings={mockSettings}
      gameSettings={mockGames}
      gamingTables={[]}
      initialStep={requestedStep}
    />
  );
}
