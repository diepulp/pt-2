'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { GameSettingsTemplate } from '@/services/casino/game-settings-templates';
import type { Database } from '@/types/database.types';

import {
  completeSetupAction,
  createCustomGameSettingsAction,
  createGamingTableAction,
  deleteGameSettingsAction,
  seedSelectedGamesAction,
  updateCasinoSettingsAction,
  updateGameSettingsAction,
  updateTableParAction,
} from './_actions';
import type { GameSettingsFormData } from './components/game-settings-form';
import { WizardStepper } from './components/wizard-stepper';
import { validateStep } from './lib/wizard-validation';
import { StepCasinoBasics } from './steps/step-casino-basics';
import { StepCreateTables } from './steps/step-create-tables';
import { StepGameSeed } from './steps/step-game-seed';
import { StepParTargets } from './steps/step-par-targets';
import { StepReviewComplete } from './steps/step-review-complete';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

const STEP_LABELS = [
  'Casino Basics',
  'Game Settings',
  'Create Tables',
  'Par Targets',
  'Review & Complete',
] as const;

interface SetupWizardProps {
  casinoSettings: CasinoSettingsRow | null;
  gameSettings: GameSettingsDTO[];
  gamingTables: GamingTableRow[];
  initialStep: number;
}

/**
 * Refine the SSR-derived initialStep using validation rules.
 * The SSR heuristic (computeInitialStep in page.tsx) only checks counts;
 * this catches blockers like unlinked variants or duplicate labels.
 */
function computeClientResumeStep(
  ssrStep: number,
  settings: CasinoSettingsRow | null,
  games: GameSettingsDTO[],
  tables: GamingTableRow[],
): number {
  const state = { settings, games, tables };
  for (let step = 0; step < ssrStep; step++) {
    const result = validateStep(step, state);
    if (!result.valid) return step;
  }
  return ssrStep;
}

export function SetupWizard({
  casinoSettings,
  gameSettings,
  gamingTables,
  initialStep,
}: SetupWizardProps) {
  // Client-side resume refinement: check for blockers before SSR step
  const [currentStep, setCurrentStep] = useState(() =>
    computeClientResumeStep(
      initialStep,
      casinoSettings,
      gameSettings,
      gamingTables,
    ),
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Evolving wizard state from server prefetch
  const [settings, setSettings] = useState(casinoSettings);
  const [games, setGames] = useState<GameSettingsDTO[]>(gameSettings);
  const [tables, setTables] = useState<GamingTableRow[]>(gamingTables);
  const [error, setError] = useState<string | null>(null);

  // Validation display flag — only show after failed navigation attempt
  const [showValidation, setShowValidation] = useState(false);

  const canSkip =
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_ENABLE_SKIP_SETUP === 'true';

  // Derived validation state (not stored — auto-clears as data changes)
  const stepResult = showValidation
    ? validateStep(currentStep, { settings, games, tables })
    : { valid: true, issues: [] };

  // Navigation with validation gating
  function goNext() {
    setError(null);

    // Validate current step before advancing
    const result = validateStep(currentStep, { settings, games, tables });
    if (!result.valid) {
      setShowValidation(true);
      return;
    }

    setShowValidation(false);
    setCurrentStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setError(null);
    setShowValidation(false);
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  // Step-jump navigation (WS5): backward unconditional, forward validates
  function handleStepClick(targetStep: number) {
    setError(null);

    if (targetStep < currentStep) {
      setShowValidation(false);
      setCurrentStep(targetStep);
      return;
    }

    if (targetStep > currentStep) {
      for (let step = currentStep; step < targetStep; step++) {
        const result = validateStep(step, { settings, games, tables });
        if (!result.valid) {
          setShowValidation(true);
          setCurrentStep(step);
          return;
        }
      }
      setShowValidation(false);
      setCurrentStep(targetStep);
    }
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

  // Step 1: Seed selected game templates
  function handleSeedSelected(templates: GameSettingsTemplate[]) {
    startTransition(async () => {
      setError(null);
      const result = await seedSelectedGamesAction({ games: templates });
      if (result.ok && result.data) {
        setGames((prev) => [...prev, ...result.data!.created]);
      } else {
        setError(result.error ?? 'Failed to add selected games');
      }
    });
  }

  // Step 1: Create custom game
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

  // Step 1: Update game
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

  // Step 1: Delete game
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

  // Step 2: Save all tables on Next
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
            onSeedSelected={handleSeedSelected}
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
            gameSettings={games}
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
            onJumpToStep={handleStepClick}
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

      <WizardStepper
        steps={STEP_LABELS}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        optionalSteps={[3]}
      />

      {/* Server action errors */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Validation issues (derived, auto-clear) */}
      {stepResult.issues.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {stepResult.issues.length} issue
            {stepResult.issues.length !== 1 ? 's' : ''} to fix
            <ul className="mt-1 list-disc pl-4 text-sm">
              {stepResult.issues.map((issue) => (
                <li key={issue.ruleId}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
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
