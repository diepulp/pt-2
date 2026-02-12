'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Database } from '@/types/database.types';

type GameSettingsSummary = {
  id: string;
  name: string;
  game_type: Database['public']['Enums']['game_type'];
};

interface StepGameSeedProps {
  games: GameSettingsSummary[];
  isPending: boolean;
  onSeed: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepGameSeed({
  games,
  isPending,
  onSeed,
  onNext,
  onBack,
}: StepGameSeedProps) {
  const isSeeded = games.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game Settings</CardTitle>
        <CardDescription>
          Seed default game configurations (house edge, decisions per hour,
          seats, etc.) for your casino.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSeeded ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{games.length} games configured</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {games.map((g) => (
                <Badge key={g.id} variant="outline" className="capitalize">
                  {g.game_type.replace('_', ' ')}
                  {g.name !== g.game_type ? ` — ${g.name}` : ''}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Games are already configured. You can proceed to the next step.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will create default game settings for common table games. You
              can customize individual settings later.
            </p>
            <Button onClick={onSeed} disabled={isPending}>
              {isPending ? 'Seeding...' : 'Seed Default Games'}
            </Button>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={onNext} disabled={isPending || !isSeeded}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
