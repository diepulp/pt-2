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
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

import { ParEntryRow } from '../components/par-entry-row';

type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];
type TableBankMode = Database['public']['Enums']['table_bank_mode'];

interface StepParTargetsProps {
  tables: GamingTableRow[];
  gameSettings: GameSettingsDTO[];
  bankMode: TableBankMode | null;
  isPending: boolean;
  onSave: (
    entries: Array<{ tableId: string; parTotalCents: number | null }>,
  ) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function StepParTargets({
  tables,
  gameSettings,
  bankMode,
  isPending,
  onSave,
  onBack,
  onSkip,
}: StepParTargetsProps) {
  // Build lookup for variant names
  const gameSettingsMap = new Map<string, GameSettingsDTO>();
  for (const gs of gameSettings) {
    gameSettingsMap.set(gs.id, gs);
  }
  // Initialize par values from existing data (cents → dollars for display)
  const [parValues, setParValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const t of tables) {
      initial[t.id] =
        t.par_total_cents != null ? String(t.par_total_cents / 100) : '';
    }
    return initial;
  });

  function handleChange(tableId: string, value: string) {
    setParValues((prev) => ({ ...prev, [tableId]: value }));
  }

  function handleNext() {
    const entries = tables.map((t) => {
      const dollarStr = parValues[t.id] ?? '';
      const dollars = parseFloat(dollarStr);
      return {
        tableId: t.id,
        parTotalCents:
          isNaN(dollars) || dollars <= 0 ? null : Math.round(dollars * 100),
      };
    });
    onSave(entries);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Bankroll (Par)</CardTitle>
        <CardDescription>
          Set the target bankroll for each table. This step is optional — you
          can skip and configure par targets later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tables found. Go back and create tables first.
          </p>
        ) : (
          <div className="space-y-3">
            {tables.map((t) => {
              const linkedGame = t.game_settings_id
                ? gameSettingsMap.get(t.game_settings_id)
                : null;
              return (
                <ParEntryRow
                  key={t.id}
                  tableId={t.id}
                  tableLabel={t.label}
                  gameType={t.type}
                  variantName={linkedGame?.variant_name ?? undefined}
                  value={parValues[t.id] ?? ''}
                  bankMode={bankMode}
                  onChange={(v) => handleChange(t.id, v)}
                  disabled={isPending}
                />
              );
            })}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onSkip} disabled={isPending}>
              Skip
            </Button>
            <Button onClick={handleNext} disabled={isPending}>
              {isPending ? 'Saving...' : 'Next'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
