'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

import { TableRowForm } from '../components/table-row-form';
import type { TableFormRow } from '../components/table-row-form';

type GameType = Database['public']['Enums']['game_type'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

const GAME_TYPE_PREFIXES: Record<GameType, string> = {
  blackjack: 'BJ',
  poker: 'PK',
  roulette: 'RL',
  baccarat: 'BC',
  pai_gow: 'PG',
  carnival: 'CV',
};

const GAME_TYPE_LABELS: Record<GameType, string> = {
  blackjack: 'Blackjack',
  poker: 'Poker',
  roulette: 'Roulette',
  baccarat: 'Baccarat',
  pai_gow: 'Pai Gow',
  carnival: 'Carnival',
};

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `new-${rowCounter}`;
}

function createEmptyRow(defaultType: GameType): TableFormRow {
  return {
    id: nextRowId(),
    label: '',
    type: defaultType,
    pit: '',
    game_settings_id: null,
  };
}

function existingToFormRow(t: GamingTableRow): TableFormRow {
  return {
    id: t.id,
    label: t.label,
    type: t.type,
    pit: t.pit ?? '',
    game_settings_id: t.game_settings_id ?? null,
  };
}

interface StepCreateTablesProps {
  existingTables: GamingTableRow[];
  gameSettings: GameSettingsDTO[];
  isPending: boolean;
  onSave: (
    tables: Array<{
      label: string;
      type: string;
      pit?: string;
      game_settings_id?: string;
    }>,
  ) => void;
  onBack: () => void;
}

export function StepCreateTables({
  existingTables,
  gameSettings,
  isPending,
  onSave,
  onBack,
}: StepCreateTablesProps) {
  // Derive available game types from configured games (excludes roulette by design)
  const availableGameTypes: GameType[] = Array.from(
    new Set(gameSettings.map((gs) => gs.game_type as GameType)),
  );

  const defaultType = availableGameTypes[0] ?? 'blackjack';

  const [rows, setRows] = useState<TableFormRow[]>(() => {
    if (existingTables.length > 0) {
      return existingTables.map(existingToFormRow);
    }
    return [createEmptyRow(defaultType)];
  });

  // Derive game summary counts from configured games
  const gameTypeSummary = availableGameTypes.map((gt) => {
    const count = gameSettings.filter((gs) => gs.game_type === gt).length;
    return { type: gt, label: GAME_TYPE_LABELS[gt] ?? gt, count };
  });

  // Count variants that have no linked table row yet
  const variantsWithoutTables = gameSettings.filter(
    (gs) => !rows.some((r) => r.game_settings_id === gs.id),
  ).length;

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(defaultType)]);
  }

  /**
   * Generate one table row per configured game variant.
   * - Deterministic labels: BJ-01, BC-01, etc. (picks next available number)
   * - Auto-links game_settings_id
   * - Skips variants that already have a linked row (client-idempotent)
   */
  function generateFromGames() {
    setRows((prev) => {
      const linkedIds = new Set(
        prev.map((r) => r.game_settings_id).filter(Boolean),
      );
      const newRows: TableFormRow[] = [];

      for (const gs of gameSettings) {
        // Skip if this variant already has a linked table row
        if (linkedIds.has(gs.id)) continue;

        const gameType = gs.game_type as GameType;
        const prefix =
          GAME_TYPE_PREFIXES[gameType] ?? gameType.slice(0, 2).toUpperCase();

        // Find highest existing number for this prefix across all rows
        const allRows = [...prev, ...newRows];
        const existingNums = allRows
          .filter((r) => r.label.startsWith(`${prefix}-`))
          .map((r) => {
            const num = parseInt(r.label.split('-')[1], 10);
            return isNaN(num) ? 0 : num;
          });
        const nextNum =
          existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

        newRows.push({
          id: nextRowId(),
          label: `${prefix}-${String(nextNum).padStart(2, '0')}`,
          type: gameType,
          pit: '',
          game_settings_id: gs.id,
        });
      }

      if (newRows.length === 0) return prev;
      return [...prev, ...newRows];
    });
  }

  function updateRow(idx: number, updated: TableFormRow) {
    // Auto-link: if the game type has exactly one variant and no variant is selected, auto-set it
    const variants = gameSettings.filter((gs) => gs.game_type === updated.type);
    if (variants.length === 1 && updated.game_settings_id === null) {
      updated = { ...updated, game_settings_id: variants[0].id };
    }
    setRows((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleNext() {
    // Filter out empty rows
    const validRows = rows.filter((r) => r.label.trim() !== '');
    if (validRows.length === 0) return;

    // Check for S2-LINK-MULTI blockers: table unlinked with multi-variant type
    const hasUnlinkedMultiVariant = validRows.some((r) => {
      const variants = gameSettings.filter((gs) => gs.game_type === r.type);
      return r.game_settings_id === null && variants.length > 1;
    });
    if (hasUnlinkedMultiVariant) return;

    onSave(
      validRows.map((r) => ({
        label: r.label.trim(),
        type: r.type,
        pit: r.pit.trim() || undefined,
        game_settings_id: r.game_settings_id ?? undefined,
      })),
    );
  }

  const hasValidRows = rows.some((r) => r.label.trim() !== '');

  // Check if Next should be blocked (for button disabled state)
  const hasBlockers = (() => {
    const validRows = rows.filter((r) => r.label.trim() !== '');
    if (validRows.length === 0) return true;
    return validRows.some((r) => {
      const variants = gameSettings.filter((gs) => gs.game_type === r.type);
      return r.game_settings_id === null && variants.length > 1;
    });
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Tables</CardTitle>
        <CardDescription>
          Add your gaming tables. Labels must be unique within your casino.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Games Summary Banner */}
        {gameTypeSummary.length > 0 && (
          <Alert>
            <AlertTitle>
              You configured:{' '}
              {gameTypeSummary
                .map((g) => `${g.count} ${g.label}`)
                .join(' \u00B7 ')}
            </AlertTitle>
            {variantsWithoutTables > 0 && (
              <AlertDescription>
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/10 text-amber-600 text-xs"
                >
                  {variantsWithoutTables} variant
                  {variantsWithoutTables !== 1 ? 's' : ''} ha
                  {variantsWithoutTables !== 1 ? 've' : 's'} no tables yet
                </Badge>
              </AlertDescription>
            )}
          </Alert>
        )}

        <div className="space-y-2">
          {rows.map((row, idx) => (
            <TableRowForm
              key={row.id}
              row={row}
              gameSettings={gameSettings}
              availableGameTypes={availableGameTypes}
              onChange={(updated) => updateRow(idx, updated)}
              onRemove={() => removeRow(idx)}
              disabled={isPending}
            />
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={isPending}
          >
            + Add Table
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateFromGames}
            disabled={isPending || gameSettings.length === 0}
          >
            Generate from games
          </Button>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isPending || !hasValidRows || hasBlockers}
          >
            {isPending ? 'Saving tables...' : 'Next'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
