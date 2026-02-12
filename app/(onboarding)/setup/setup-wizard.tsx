'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { SEED_TEMPLATES } from '@/services/casino/schemas';
import type { Database } from '@/types/database.types';

import {
  completeSetupAction,
  createGamingTableAction,
  seedGameSettingsAction,
  updateCasinoSettingsAction,
  updateTableParAction,
} from './_actions';
import { WizardStepper } from './components/wizard-stepper';
import { StepCasinoBasics } from './steps/step-casino-basics';
import { StepCreateTables } from './steps/step-create-tables';
import { StepGameSeed } from './steps/step-game-seed';
import { StepParTargets } from './steps/step-par-targets';
import { StepReviewComplete } from './steps/step-review-complete';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

type GameSettingsSummary = {
  id: string;
  name: string;
  game_type: Database['public']['Enums']['game_type'];
};

const STEP_LABELS = [
  'Casino Basics',
  'Game Settings',
  'Create Tables',
  'Par Targets',
  'Review & Complete',
] as const;

interface SetupWizardProps {
  casinoSettings: CasinoSettingsRow | null;
  gameSettings: GameSettingsSummary[];
  gamingTables: GamingTableRow[];
  initialStep: number;
}

export function SetupWizard({
  casinoSettings,
  gameSettings,
  gamingTables,
  initialStep,
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Evolving wizard state from server prefetch
  const [settings, setSettings] = useState(casinoSettings);
  const [games, setGames] = useState<GameSettingsSummary[]>(gameSettings);
  const [tables, setTables] = useState<GamingTableRow[]>(gamingTables);
  const [error, setError] = useState<string | null>(null);

  const canSkip =
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_ENABLE_SKIP_SETUP === 'true';

  // Navigation
  function goNext() {
    setError(null);
    setCurrentStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setError(null);
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  // Skip setup — marks setup ready without completing steps
  function handleSkip() {
    startTransition(async () => {
      setError(null);
      const result = await completeSetupAction({ skip: true });
      if (result.ok) {
        router.push('/start');
      } else {
        setError(result.error ?? 'Failed to skip setup');
      }
    });
  }

  // Step 0: Save casino basics
  function handleSaveBasics(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result = await updateCasinoSettingsAction(formData);
      if (result.ok && result.data) {
        setSettings(result.data);
        goNext();
      } else {
        setError(result.error ?? 'Failed to save casino settings');
      }
    });
  }

  // Step 1: Seed game settings
  function handleSeedGames() {
    startTransition(async () => {
      setError(null);
      const result = await seedGameSettingsAction({
        template: SEED_TEMPLATES[0],
      });
      if (result.ok && result.data) {
        // Update local count indicator — full list reloads on re-entry
        const count = result.data.seeded_count;
        if (count > 0 && games.length === 0) {
          // Placeholder entries to indicate seeding succeeded
          setGames([
            {
              id: 'seeded',
              name: `${count} games seeded`,
              game_type: 'blackjack',
            },
          ]);
        }
        goNext();
      } else {
        setError(result.error ?? 'Failed to seed game settings');
      }
    });
  }

  // Step 2: Save all tables on Next
  function handleSaveTables(
    localTables: Array<{ label: string; type: string; pit?: string }>,
  ) {
    startTransition(async () => {
      setError(null);
      const savedTables: GamingTableRow[] = [];

      for (const t of localTables) {
        const result = await createGamingTableAction({
          label: t.label,
          type: t.type,
          pit: t.pit,
        });
        if (result.ok && result.data) {
          savedTables.push(result.data);
        } else {
          setError(
            `Failed to save table "${t.label}": ${result.error ?? 'Unknown error'}`,
          );
          return;
        }
      }

      setTables(savedTables);
      goNext();
    });
  }

  // Step 3: Save par targets on Next
  function handleSavePar(
    parEntries: Array<{ tableId: string; parTotalCents: number | null }>,
  ) {
    startTransition(async () => {
      setError(null);

      for (const entry of parEntries) {
        if (entry.parTotalCents !== null && entry.parTotalCents > 0) {
          const result = await updateTableParAction({
            tableId: entry.tableId,
            parTotalCents: entry.parTotalCents,
          });
          if (!result.ok) {
            setError(result.error ?? 'Failed to save par target');
            return;
          }
        }
      }

      goNext();
    });
  }

  // Step 4: Complete setup
  function handleComplete() {
    startTransition(async () => {
      setError(null);
      const result = await completeSetupAction({ skip: false });
      if (result.ok) {
        router.push('/start');
      } else {
        setError(result.error ?? 'Failed to complete setup');
      }
    });
  }

  function renderStep() {
    switch (currentStep) {
      case 0:
        return (
          <StepCasinoBasics
            settings={settings}
            isPending={isPending}
            onSave={handleSaveBasics}
          />
        );
      case 1:
        return (
          <StepGameSeed
            games={games}
            isPending={isPending}
            onSeed={handleSeedGames}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case 2:
        return (
          <StepCreateTables
            existingTables={tables}
            isPending={isPending}
            onSave={handleSaveTables}
            onBack={goBack}
          />
        );
      case 3:
        return (
          <StepParTargets
            tables={tables}
            bankMode={settings?.table_bank_mode ?? null}
            isPending={isPending}
            onSave={handleSavePar}
            onBack={goBack}
            onSkip={goNext}
          />
        );
      case 4:
        return (
          <StepReviewComplete
            settings={settings}
            gameCount={games.length}
            tables={tables}
            isPending={isPending}
            onComplete={handleComplete}
            onBack={goBack}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Setup Your Casino
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your workspace in a few steps
        </p>
      </div>

      <WizardStepper steps={STEP_LABELS} currentStep={currentStep} />

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {renderStep()}

      {canSkip && (
        <div className="text-center pt-2">
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={handleSkip}
            disabled={isPending}
          >
            {isPending ? 'Skipping...' : 'Skip Setup'}
          </Button>
        </div>
      )}
    </div>
  );
}
