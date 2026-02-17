'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

const BANK_MODE_LABELS: Record<
  Database['public']['Enums']['table_bank_mode'],
  string
> = {
  INVENTORY_COUNT: 'Inventory Count',
  IMPREST_TO_PAR: 'Imprest to Par',
};

const GAME_TYPE_LABELS: Record<string, string> = {
  blackjack: 'Blackjack',
  poker: 'Poker',
  roulette: 'Roulette',
  baccarat: 'Baccarat',
  pai_gow: 'Pai Gow',
  carnival: 'Carnival',
};

const GAME_TYPE_ORDER = [
  'blackjack',
  'baccarat',
  'pai_gow',
  'carnival',
  'poker',
  'roulette',
];

interface StepReviewCompleteProps {
  settings: CasinoSettingsRow | null;
  games: GameSettingsDTO[];
  tables: GamingTableRow[];
  isPending: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function StepReviewComplete({
  settings,
  games,
  tables,
  isPending,
  onComplete,
  onBack,
}: StepReviewCompleteProps) {
  const tablesWithPar = tables.filter(
    (t) => t.par_total_cents != null && t.par_total_cents > 0,
  );

  // Build a lookup map from game_settings_id to variant name
  const gameSettingsMap = useMemo(() => {
    const map = new Map<string, GameSettingsDTO>();
    for (const gs of games) {
      map.set(gs.id, gs);
    }
    return map;
  }, [games]);

  // Group games by game_type for summary
  const groupedGames = useMemo(() => {
    const groups = new Map<string, GameSettingsDTO[]>();
    for (const game of games) {
      const existing = groups.get(game.game_type) ?? [];
      existing.push(game);
      groups.set(game.game_type, existing);
    }
    return GAME_TYPE_ORDER.filter((gt) => groups.has(gt)).map((gt) => ({
      gameType: gt,
      label: GAME_TYPE_LABELS[gt] ?? gt,
      items: groups.get(gt)!,
    }));
  }, [games]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Complete</CardTitle>
        <CardDescription>
          Review your setup and complete the wizard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Casino Settings */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Casino Settings
          </h3>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Timezone: </span>
              <span className="font-medium">
                {settings?.timezone
                  ?.replace(/_/g, ' ')
                  .replace(/America\//, '')
                  .replace(/Pacific\//, '') ?? '\u2014'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Gaming Day Start: </span>
              <span className="font-medium">
                {settings?.gaming_day_start_time?.slice(0, 5) ?? '\u2014'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Bank Mode: </span>
              <span className="font-medium">
                {settings?.table_bank_mode
                  ? BANK_MODE_LABELS[settings.table_bank_mode]
                  : '\u2014'}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Game Settings */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Game Settings
            </h3>
            <Badge variant="secondary">
              {games.length} game{games.length !== 1 ? 's' : ''} configured
            </Badge>
          </div>
          {groupedGames.length > 0 && (
            <div className="grid gap-1 text-sm">
              {groupedGames.map((group) => (
                <div key={group.gameType} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {group.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    {group.items
                      .map((g) => g.variant_name ?? g.name)
                      .join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Tables */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Gaming Tables
          </h3>
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tables configured.
            </p>
          ) : (
            <div className="grid gap-1 text-sm">
              {tables.map((t) => {
                const linkedGame = t.game_settings_id
                  ? gameSettingsMap.get(t.game_settings_id)
                  : null;
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="font-medium">{t.label}</span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {t.type.replace('_', ' ')}
                    </Badge>
                    {linkedGame && (
                      <span className="text-muted-foreground text-xs">
                        {linkedGame.variant_name ?? linkedGame.name}
                      </span>
                    )}
                    {t.pit && (
                      <span className="text-muted-foreground text-xs">
                        Pit: {t.pit}
                      </span>
                    )}
                    {t.par_total_cents != null && t.par_total_cents > 0 && (
                      <span className="text-muted-foreground text-xs">
                        Par: ${(t.par_total_cents / 100).toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tablesWithPar.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {tablesWithPar.length} of {tables.length} tables have par targets
              set.
            </p>
          )}
        </div>

        <Separator />

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={onComplete} disabled={isPending}>
            {isPending ? 'Completing...' : 'Complete Setup'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
