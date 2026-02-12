'use client';

/**
 * Dev wizard orchestrator — thin copy of setup-wizard.tsx with dev action imports.
 * All step/UI components are imported from the production path (no duplication).
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { GameSettingsFormData } from '@/app/(onboarding)/setup/components/game-settings-form';
import { WizardStepper } from '@/app/(onboarding)/setup/components/wizard-stepper';
import { StepCasinoBasics } from '@/app/(onboarding)/setup/steps/step-casino-basics';
import { StepCreateTables } from '@/app/(onboarding)/setup/steps/step-create-tables';
import { StepGameSeed } from '@/app/(onboarding)/setup/steps/step-game-seed';
import { StepParTargets } from '@/app/(onboarding)/setup/steps/step-par-targets';
import { StepReviewComplete } from '@/app/(onboarding)/setup/steps/step-review-complete';
import { Button } from '@/components/ui/button';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import { SEED_TEMPLATES } from '@/services/casino/schemas';
import type { Database } from '@/types/database.types';

import {
  completeSetupAction,
  createCustomGameSettingsAction,
  createGamingTableAction,
  deleteGameSettingsAction,
  getSeededGamesAction,
  seedGameSettingsAction,
  updateCasinoSettingsAction,
  updateGameSettingsAction,
  updateTableParAction,
} from './_dev-actions';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

const STEP_LABELS = [
  'Casino Basics',
  'Game Settings',
  'Create Tables',
  'Par Targets',
  'Review & Complete',
] as const;

interface SetupWizardDevProps {
  casinoSettings: CasinoSettingsRow | null;
  gameSettings: GameSettingsDTO[];
  gamingTables: GamingTableRow[];
  initialStep: number;
}

export function SetupWizardDev({
  casinoSettings,
  gameSettings,
  gamingTables,
  initialStep,
}: SetupWizardDevProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [settings, setSettings] = useState(casinoSettings);
  const [games, setGames] = useState<GameSettingsDTO[]>(gameSettings);
  const [tables, setTables] = useState<GamingTableRow[]>(gamingTables);
  const [error, setError] = useState<string | null>(null);

  function goNext() {
    setError(null);
    setCurrentStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setError(null);
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  function handleSkip() {
    startTransition(async () => {
      setError(null);
      const result = await completeSetupAction({ skip: true });
      if (result.ok) {
        router.push('/dev/setup?done=1');
      } else {
        setError(result.error ?? 'Failed to skip setup');
      }
    });
  }

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

  function handleSeedGames() {
    startTransition(async () => {
      setError(null);
      const result = await seedGameSettingsAction({
        template: SEED_TEMPLATES[0],
      });
      if (result.ok && result.data) {
        // In dev mode, populate local state with mock seeded games
        const seeded = await getSeededGamesAction();
        setGames(seeded);
      } else {
        setError(result.error ?? 'Failed to seed game settings');
      }
    });
  }

  function handleCreateGame(data: GameSettingsFormData) {
    startTransition(async () => {
      setError(null);
      const result = await createCustomGameSettingsAction(data);
      if (result.ok && result.data) {
        setGames((prev) => [...prev, result.data!]);
      } else {
        setError(result.error ?? 'Failed to create game setting');
      }
    });
  }

  function handleUpdateGame(id: string, data: GameSettingsFormData) {
    startTransition(async () => {
      setError(null);
      const result = await updateGameSettingsAction({ id, ...data });
      if (result.ok && result.data) {
        setGames((prev) => prev.map((g) => (g.id === id ? result.data! : g)));
      } else {
        setError(result.error ?? 'Failed to update game setting');
      }
    });
  }

  function handleDeleteGame(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await deleteGameSettingsAction({ id });
      if (result.ok) {
        setGames((prev) => prev.filter((g) => g.id !== id));
      } else {
        setError(result.error ?? 'Failed to delete game setting');
      }
    });
  }

  function handleSaveTables(
    localTables: Array<{
      label: string;
      type: string;
      pit?: string;
      game_settings_id?: string;
    }>,
  ) {
    startTransition(async () => {
      setError(null);
      const savedTables: GamingTableRow[] = [];

      for (const t of localTables) {
        const result = await createGamingTableAction({
          label: t.label,
          type: t.type,
          pit: t.pit,
          game_settings_id: t.game_settings_id,
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

  function handleComplete() {
    startTransition(async () => {
      setError(null);
      const result = await completeSetupAction({ skip: false });
      if (result.ok) {
        router.push('/dev/setup?done=1');
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
            onCreateGame={handleCreateGame}
            onUpdateGame={handleUpdateGame}
            onDeleteGame={handleDeleteGame}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case 2:
        return (
          <StepCreateTables
            existingTables={tables}
            gameSettings={games}
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
            games={games}
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
    </div>
  );
}
