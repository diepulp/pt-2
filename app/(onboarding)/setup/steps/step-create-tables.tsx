'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `new-${rowCounter}`;
}

function createEmptyRow(gameType: GameType = 'blackjack'): TableFormRow {
  return { id: nextRowId(), label: '', type: gameType, pit: '' };
}

function existingToFormRow(t: GamingTableRow): TableFormRow {
  return {
    id: t.id,
    label: t.label,
    type: t.type,
    pit: t.pit ?? '',
  };
}

interface StepCreateTablesProps {
  existingTables: GamingTableRow[];
  isPending: boolean;
  onSave: (
    tables: Array<{ label: string; type: string; pit?: string }>,
  ) => void;
  onBack: () => void;
}

export function StepCreateTables({
  existingTables,
  isPending,
  onSave,
  onBack,
}: StepCreateTablesProps) {
  const [rows, setRows] = useState<TableFormRow[]>(() => {
    if (existingTables.length > 0) {
      return existingTables.map(existingToFormRow);
    }
    return [createEmptyRow()];
  });

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function addBulk(gameType: GameType, count: number) {
    const prefix = GAME_TYPE_PREFIXES[gameType];
    // Find highest existing number for this prefix
    const existingNums = rows
      .filter((r) => r.label.startsWith(`${prefix}-`))
      .map((r) => {
        const num = parseInt(r.label.split('-')[1], 10);
        return isNaN(num) ? 0 : num;
      });
    const startNum =
      existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

    const newRows: TableFormRow[] = Array.from({ length: count }, (_, i) => ({
      id: nextRowId(),
      label: `${prefix}-${String(startNum + i).padStart(2, '0')}`,
      type: gameType,
      pit: '',
    }));

    setRows((prev) => [...prev, ...newRows]);
  }

  function updateRow(idx: number, updated: TableFormRow) {
    setRows((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleNext() {
    // Filter out empty rows
    const validRows = rows.filter((r) => r.label.trim() !== '');
    if (validRows.length === 0) return;

    onSave(
      validRows.map((r) => ({
        label: r.label.trim(),
        type: r.type,
        pit: r.pit.trim() || undefined,
      })),
    );
  }

  const hasValidRows = rows.some((r) => r.label.trim() !== '');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Tables</CardTitle>
        <CardDescription>
          Add your gaming tables. Labels must be unique within your casino.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <TableRowForm
              key={row.id}
              row={row}
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
            onClick={() => addBulk('blackjack', 4)}
            disabled={isPending}
          >
            + 4 Blackjack
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addBulk('poker', 2)}
            disabled={isPending}
          >
            + 2 Poker
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addBulk('roulette', 2)}
            disabled={isPending}
          >
            + 2 Roulette
          </Button>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={handleNext} disabled={isPending || !hasValidRows}>
            {isPending ? 'Saving tables...' : 'Next'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
