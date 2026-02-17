/**
 * Wizard Validation — Pure validation functions for the setup wizard.
 *
 * No React imports, no hooks, no side effects.
 * Used by: WS2 (goNext gating), WS3 (review audit), WS5 (forward-jump gating).
 *
 * Rules are defined in the Validation Contract table of
 * EXECUTION-SPEC-GAP-SETUP-WIZARD.md.
 */

import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

export interface ValidationIssue {
  step: number;
  ruleId: string;
  severity: 'blocker' | 'warning';
  message: string;
  field?: string;
}

export interface StepValidationResult {
  valid: boolean; // true if no blockers (warnings are non-blocking)
  issues: ValidationIssue[];
}

export interface WizardState {
  settings: CasinoSettingsRow | null;
  games: GameSettingsDTO[];
  tables: GamingTableRow[];
}

function validateStep0(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!state.settings?.timezone) {
    issues.push({
      step: 0,
      ruleId: 'S0-TZ',
      severity: 'blocker',
      message: 'Timezone is required',
      field: 'timezone',
    });
  }

  if (!state.settings?.gaming_day_start_time) {
    issues.push({
      step: 0,
      ruleId: 'S0-GDS',
      severity: 'blocker',
      message: 'Gaming day start time is required',
      field: 'gaming_day_start_time',
    });
  }

  if (!state.settings?.table_bank_mode) {
    issues.push({
      step: 0,
      ruleId: 'S0-BM',
      severity: 'blocker',
      message: 'Bank mode is required',
      field: 'table_bank_mode',
    });
  }

  return issues;
}

function validateStep1(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (state.games.length === 0) {
    issues.push({
      step: 1,
      ruleId: 'S1-MIN',
      severity: 'blocker',
      message: 'At least one game must be configured',
    });
  }

  return issues;
}

function validateStep2(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (state.tables.length === 0) {
    issues.push({
      step: 2,
      ruleId: 'S2-MIN',
      severity: 'blocker',
      message: 'At least one table is required',
    });
    return issues;
  }

  // Build variant count per game type
  const variantsByType = new Map<string, GameSettingsDTO[]>();
  for (const gs of state.games) {
    const existing = variantsByType.get(gs.game_type) ?? [];
    existing.push(gs);
    variantsByType.set(gs.game_type, existing);
  }

  // Check each table
  for (const table of state.tables) {
    const variants = variantsByType.get(table.type) ?? [];

    if (table.game_settings_id === null && variants.length > 1) {
      issues.push({
        step: 2,
        ruleId: 'S2-LINK-MULTI',
        severity: 'blocker',
        message: `${table.label}: variant link required (multiple ${table.type.replace('_', ' ')} variants configured)`,
        field: `table_${table.id}_game_settings_id`,
      });
    } else if (table.game_settings_id === null && variants.length === 1) {
      issues.push({
        step: 2,
        ruleId: 'S2-LINK-SINGLE',
        severity: 'warning',
        message: `${table.label}: no variant linked — theo will use type-level defaults`,
        field: `table_${table.id}_game_settings_id`,
      });
    }
  }

  // Check for duplicate labels (case-insensitive)
  const labelCounts = new Map<string, number>();
  for (const table of state.tables) {
    const normalized = table.label.toLowerCase().trim();
    if (normalized) {
      labelCounts.set(normalized, (labelCounts.get(normalized) ?? 0) + 1);
    }
  }
  for (const [label, count] of labelCounts) {
    if (count > 1) {
      issues.push({
        step: 2,
        ruleId: 'S2-LABEL',
        severity: 'blocker',
        message: `Duplicate table label: ${label}`,
      });
    }
  }

  return issues;
}

function validateStep3(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasAnyPar = state.tables.some(
    (t) => t.par_total_cents != null && t.par_total_cents > 0,
  );

  if (!hasAnyPar && state.tables.length > 0) {
    issues.push({
      step: 3,
      ruleId: 'S3-SKIP',
      severity: 'warning',
      message: 'Par targets not configured — you can set them later',
    });
  }

  return issues;
}

const STEP_VALIDATORS: ((state: WizardState) => ValidationIssue[])[] = [
  validateStep0,
  validateStep1,
  validateStep2,
  validateStep3,
];

/** Validate a single step. Returns valid=true if no blockers. */
export function validateStep(
  step: number,
  state: WizardState,
): StepValidationResult {
  const validator = STEP_VALIDATORS[step];
  if (!validator) {
    return { valid: true, issues: [] };
  }
  const issues = validator(state);
  const valid = !issues.some((i) => i.severity === 'blocker');
  return { valid, issues };
}

/** Validate all steps (0-3). Returns aggregated issues. */
export function validateAllSteps(state: WizardState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let step = 0; step < STEP_VALIDATORS.length; step++) {
    issues.push(...STEP_VALIDATORS[step](state));
  }
  return issues;
}
