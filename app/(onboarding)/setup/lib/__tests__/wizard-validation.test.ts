/**
 * Unit tests for wizard-validation.ts — Validation Contract rules.
 *
 * Tests all 9 rules: S0-TZ, S0-GDS, S0-BM, S1-MIN, S2-MIN,
 * S2-LINK-MULTI, S2-LINK-SINGLE, S2-LABEL, S3-SKIP.
 */

import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

import {
  validateAllSteps,
  validateStep,
  type WizardState,
} from '../wizard-validation';

type CasinoSettingsRow =
  Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

// ---------------------------------------------------------------------------
// Test fixture factories — only fields accessed by validation
// ---------------------------------------------------------------------------

function makeSettings(
  overrides: Partial<
    Pick<
      CasinoSettingsRow,
      'timezone' | 'gaming_day_start_time' | 'table_bank_mode'
    >
  > = {},
): CasinoSettingsRow {
  return {
    timezone: 'America/Los_Angeles',
    gaming_day_start_time: '06:00:00',
    table_bank_mode: 'INVENTORY_COUNT',
    ...overrides,
  } as CasinoSettingsRow;
}

function makeGame(
  id: string,
  game_type: string,
): GameSettingsDTO {
  return { id, game_type } as GameSettingsDTO;
}

function makeTable(
  overrides: {
    id: string;
    label: string;
    type: string;
    game_settings_id?: string | null;
    par_total_cents?: number | null;
  },
): GamingTableRow {
  return {
    game_settings_id: null,
    par_total_cents: null,
    ...overrides,
  } as GamingTableRow;
}

// ---------------------------------------------------------------------------
// Reusable valid state
// ---------------------------------------------------------------------------

function validState(): WizardState {
  const gs1 = makeGame('gs-bj1', 'blackjack');
  return {
    settings: makeSettings(),
    games: [gs1],
    tables: [
      makeTable({
        id: 't-1',
        label: 'BJ-01',
        type: 'blackjack',
        game_settings_id: 'gs-bj1',
      }),
    ],
  };
}

// ===========================================================================
// validateStep
// ===========================================================================

describe('validateStep', () => {
  // -----------------------------------------------------------------------
  // Step 0 — Casino Basics
  // -----------------------------------------------------------------------

  describe('Step 0 — Casino Basics', () => {
    it('S0-TZ: blocks when timezone missing', () => {
      const result = validateStep(0, {
        settings: makeSettings({ timezone: null }),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'S0-TZ', severity: 'blocker' }),
        ]),
      );
    });

    it('S0-GDS: blocks when gaming_day_start_time missing', () => {
      const result = validateStep(0, {
        settings: makeSettings({ gaming_day_start_time: null }),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'S0-GDS', severity: 'blocker' }),
        ]),
      );
    });

    it('S0-BM: blocks when table_bank_mode missing', () => {
      const result = validateStep(0, {
        settings: makeSettings({ table_bank_mode: null }),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'S0-BM', severity: 'blocker' }),
        ]),
      );
    });

    it('blocks when settings is null', () => {
      const result = validateStep(0, {
        settings: null,
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(3);
    });

    it('passes when all three fields present', () => {
      const result = validateStep(0, {
        settings: makeSettings(),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Step 1 — Game Settings
  // -----------------------------------------------------------------------

  describe('Step 1 — Game Settings', () => {
    it('S1-MIN: blocks when no games configured', () => {
      const result = validateStep(1, {
        settings: makeSettings(),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual([
        expect.objectContaining({ ruleId: 'S1-MIN', severity: 'blocker' }),
      ]);
    });

    it('passes when at least one game exists', () => {
      const result = validateStep(1, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [],
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Step 2 — Create Tables
  // -----------------------------------------------------------------------

  describe('Step 2 — Create Tables', () => {
    it('S2-MIN: blocks when no tables exist', () => {
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual([
        expect.objectContaining({ ruleId: 'S2-MIN', severity: 'blocker' }),
      ]);
    });

    it('S2-LINK-MULTI: blocks when table unlinked and multi-variant type', () => {
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [
          makeGame('gs-bj1', 'blackjack'),
          makeGame('gs-bj2', 'blackjack'),
        ],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            game_settings_id: null,
          }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'S2-LINK-MULTI',
            severity: 'blocker',
          }),
        ]),
      );
    });

    it('S2-LINK-SINGLE: warns when table unlinked and single-variant type', () => {
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [makeGame('gs-bj1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            game_settings_id: null,
          }),
        ],
      });
      // Warning does not block
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([
        expect.objectContaining({
          ruleId: 'S2-LINK-SINGLE',
          severity: 'warning',
        }),
      ]);
    });

    it('S2-LABEL: blocks on duplicate table labels (case-insensitive)', () => {
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            game_settings_id: 'gs-1',
          }),
          makeTable({
            id: 't-2',
            label: 'bj-01',
            type: 'blackjack',
            game_settings_id: 'gs-1',
          }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'S2-LABEL',
            severity: 'blocker',
          }),
        ]),
      );
    });

    it('passes when tables exist, all multi-variant linked, no duplicates', () => {
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [
          makeGame('gs-bj1', 'blackjack'),
          makeGame('gs-bj2', 'blackjack'),
        ],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            game_settings_id: 'gs-bj1',
          }),
          makeTable({
            id: 't-2',
            label: 'BJ-02',
            type: 'blackjack',
            game_settings_id: 'gs-bj2',
          }),
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('does not flag roulette tables with no configured variants', () => {
      // Roulette tables exist from prior config — no roulette game_settings
      const result = validateStep(2, {
        settings: makeSettings(),
        games: [makeGame('gs-bj1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            game_settings_id: 'gs-bj1',
          }),
          makeTable({
            id: 't-2',
            label: 'RL-01',
            type: 'roulette',
            game_settings_id: null,
          }),
        ],
      });
      // Roulette has 0 variants — neither S2-LINK-MULTI nor S2-LINK-SINGLE triggers
      expect(result.valid).toBe(true);
      const rouletteIssues = result.issues.filter((i) =>
        i.message.includes('RL-01'),
      );
      expect(rouletteIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Step 3 — Par Targets
  // -----------------------------------------------------------------------

  describe('Step 3 — Par Targets', () => {
    it('S3-SKIP: warns when no par values set (review-only suggestion)', () => {
      const result = validateStep(3, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            par_total_cents: null,
          }),
        ],
      });
      expect(result.issues).toEqual([
        expect.objectContaining({ ruleId: 'S3-SKIP', severity: 'warning' }),
      ]);
    });

    it('always returns valid regardless of par values (skippable)', () => {
      const noPar = validateStep(3, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            par_total_cents: null,
          }),
        ],
      });
      expect(noPar.valid).toBe(true);

      const withPar = validateStep(3, {
        settings: makeSettings(),
        games: [makeGame('gs-1', 'blackjack')],
        tables: [
          makeTable({
            id: 't-1',
            label: 'BJ-01',
            type: 'blackjack',
            par_total_cents: 500000,
          }),
        ],
      });
      expect(withPar.valid).toBe(true);
      expect(withPar.issues).toHaveLength(0);
    });

    it('does not warn when tables array is empty', () => {
      const result = validateStep(3, {
        settings: makeSettings(),
        games: [],
        tables: [],
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Out-of-range steps
  // -----------------------------------------------------------------------

  describe('Out-of-range steps', () => {
    it('returns valid for step 4 (no rules)', () => {
      const result = validateStep(4, validState());
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('returns valid for negative step', () => {
      const result = validateStep(-1, validState());
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});

// ===========================================================================
// validateAllSteps
// ===========================================================================

describe('validateAllSteps', () => {
  it('aggregates issues across all steps', () => {
    const issues = validateAllSteps({
      settings: null, // S0-TZ, S0-GDS, S0-BM
      games: [], // S1-MIN
      tables: [], // S2-MIN
    });
    expect(issues.length).toBeGreaterThanOrEqual(5);
    const ruleIds = issues.map((i) => i.ruleId);
    expect(ruleIds).toContain('S0-TZ');
    expect(ruleIds).toContain('S0-GDS');
    expect(ruleIds).toContain('S0-BM');
    expect(ruleIds).toContain('S1-MIN');
    expect(ruleIds).toContain('S2-MIN');
  });

  it('returns empty array when all steps valid', () => {
    const state = validState();
    // Add par to avoid S3-SKIP warning
    state.tables[0] = makeTable({
      id: 't-1',
      label: 'BJ-01',
      type: 'blackjack',
      game_settings_id: 'gs-bj1',
      par_total_cents: 500000,
    });
    const issues = validateAllSteps(state);
    expect(issues).toHaveLength(0);
  });

  it('separates blockers from warnings', () => {
    const issues = validateAllSteps({
      settings: makeSettings(),
      games: [makeGame('gs-1', 'blackjack')],
      tables: [
        makeTable({
          id: 't-1',
          label: 'BJ-01',
          type: 'blackjack',
          game_settings_id: null, // S2-LINK-SINGLE warning
          par_total_cents: null, // S3-SKIP warning
        }),
      ],
    });
    const blockers = issues.filter((i) => i.severity === 'blocker');
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(blockers).toHaveLength(0);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.ruleId)).toEqual(
      expect.arrayContaining(['S2-LINK-SINGLE', 'S3-SKIP']),
    );
  });
});
