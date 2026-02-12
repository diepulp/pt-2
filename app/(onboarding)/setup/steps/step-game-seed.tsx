'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';

import {
  GameSettingsForm,
  type GameSettingsFormData,
} from '../components/game-settings-form';

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

type FormMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; game: GameSettingsDTO };

interface StepGameSeedProps {
  games: GameSettingsDTO[];
  isPending: boolean;
  onSeed: () => void;
  onCreateGame: (data: GameSettingsFormData) => void;
  onUpdateGame: (id: string, data: GameSettingsFormData) => void;
  onDeleteGame: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepGameSeed({
  games,
  isPending,
  onSeed,
  onCreateGame,
  onUpdateGame,
  onDeleteGame,
  onNext,
  onBack,
}: StepGameSeedProps) {
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<GameSettingsDTO | null>(
    null,
  );

  const hasGames = games.length > 0;

  const groupedGames = useMemo(() => {
    const groups = new Map<string, GameSettingsDTO[]>();
    for (const game of games) {
      const existing = groups.get(game.game_type) ?? [];
      existing.push(game);
      groups.set(game.game_type, existing);
    }
    // Sort by defined order
    return GAME_TYPE_ORDER.filter((gt) => groups.has(gt)).map((gt) => ({
      gameType: gt,
      label: GAME_TYPE_LABELS[gt] ?? gt,
      items: groups.get(gt)!,
    }));
  }, [games]);

  function handleCreateSubmit(data: GameSettingsFormData) {
    onCreateGame(data);
    setFormMode({ type: 'closed' });
  }

  function handleEditSubmit(data: GameSettingsFormData) {
    if (formMode.type === 'edit') {
      onUpdateGame(formMode.game.id, data);
      setFormMode({ type: 'closed' });
    }
  }

  function handleConfirmDelete() {
    if (deleteTarget) {
      onDeleteGame(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game Settings</CardTitle>
        <CardDescription>
          Configure game settings for your casino. Seed defaults or add custom
          games.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={hasGames ? 'outline' : 'default'}
            size="sm"
            onClick={onSeed}
            disabled={isPending}
          >
            {isPending ? 'Seeding...' : 'Seed Default Games'}
          </Button>
          <Button
            variant={hasGames ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFormMode({ type: 'create' })}
            disabled={isPending || formMode.type !== 'closed'}
          >
            Add Custom Game
          </Button>
          {hasGames && (
            <Badge variant="secondary" className="ml-auto">
              {games.length} game{games.length !== 1 ? 's' : ''} configured
            </Badge>
          )}
        </div>

        {/* Game list grouped by game_type */}
        {hasGames && formMode.type === 'closed' && (
          <div className="space-y-4">
            {groupedGames.map((group) => (
              <div key={group.gameType}>
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-sm font-medium">{group.label}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {group.items.length}
                  </Badge>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right">House Edge</TableHead>
                        <TableHead className="text-right">
                          Decisions/hr
                        </TableHead>
                        <TableHead className="text-right">Seats</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((game) => (
                        <TableRow key={game.id}>
                          <TableCell className="font-medium">
                            {game.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {game.variant_name ?? '\u2014'}
                          </TableCell>
                          <TableCell className="text-right">
                            {game.house_edge}%
                          </TableCell>
                          <TableCell className="text-right">
                            {game.decisions_per_hour}
                          </TableCell>
                          <TableCell className="text-right">
                            {game.seats_available}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setFormMode({ type: 'edit', game })
                                }
                                disabled={isPending}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(game)}
                                disabled={isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasGames && formMode.type === 'closed' && (
          <p className="text-sm text-muted-foreground">
            No games configured yet. Seed defaults to get started quickly, or
            add a custom game.
          </p>
        )}

        {/* Create form */}
        {formMode.type === 'create' && (
          <div className="rounded-md border p-4">
            <h3 className="mb-3 text-sm font-medium">New Game Setting</h3>
            <GameSettingsForm
              mode="create"
              isPending={isPending}
              onSubmit={handleCreateSubmit}
              onCancel={() => setFormMode({ type: 'closed' })}
            />
          </div>
        )}

        {/* Edit form */}
        {formMode.type === 'edit' && (
          <div className="rounded-md border p-4">
            <h3 className="mb-3 text-sm font-medium">
              Edit: {formMode.game.name}
            </h3>
            <GameSettingsForm
              key={formMode.game.id}
              mode="edit"
              initialData={formMode.game}
              isPending={isPending}
              onSubmit={handleEditSubmit}
              onCancel={() => setFormMode({ type: 'closed' })}
            />
          </div>
        )}

        {/* Delete confirmation dialog */}
        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Game Setting</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{deleteTarget?.name}
                &rdquo;? This will also remove any associated side bets. This
                action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={isPending}
              >
                {isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={onNext} disabled={isPending || !hasGames}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
