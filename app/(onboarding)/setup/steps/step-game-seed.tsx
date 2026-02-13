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
import { Checkbox } from '@/components/ui/checkbox';
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
  DEFAULT_GAME_TEMPLATES,
  type GameSettingsTemplate,
} from '@/services/casino/game-settings-templates';

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

type ViewMode = 'catalog' | 'configured';

interface StepGameSeedProps {
  games: GameSettingsDTO[];
  isPending: boolean;
  onSeedSelected: (templates: GameSettingsTemplate[]) => void;
  onCreateGame: (data: GameSettingsFormData) => void;
  onUpdateGame: (id: string, data: GameSettingsFormData) => void;
  onDeleteGame: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function groupByType<T extends { game_type: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const existing = groups.get(item.game_type) ?? [];
    existing.push(item);
    groups.set(item.game_type, existing);
  }
  return GAME_TYPE_ORDER.filter((gt) => groups.has(gt)).map((gt) => ({
    gameType: gt,
    label: GAME_TYPE_LABELS[gt] ?? gt,
    items: groups.get(gt)!,
  }));
}

export function StepGameSeed({
  games,
  isPending,
  onSeedSelected,
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
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(
    () => new Set(DEFAULT_GAME_TEMPLATES.map((t) => t.code)),
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    games.length > 0 ? 'configured' : 'catalog',
  );

  const hasGames = games.length > 0;
  const existingCodes = useMemo(
    () => new Set(games.map((g) => g.code)),
    [games],
  );

  // Templates not yet added to the casino
  const availableTemplates = useMemo(
    () => DEFAULT_GAME_TEMPLATES.filter((t) => !existingCodes.has(t.code)),
    [existingCodes],
  );

  const groupedTemplates = useMemo(
    () => groupByType(availableTemplates),
    [availableTemplates],
  );

  const groupedGames = useMemo(() => groupByType(games), [games]);

  const selectedCount = availableTemplates.filter((t) =>
    selectedCodes.has(t.code),
  ).length;

  function toggleCode(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedCount === availableTemplates.length) {
      // Deselect all available
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        for (const t of availableTemplates) {
          next.delete(t.code);
        }
        return next;
      });
    } else {
      // Select all available
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        for (const t of availableTemplates) {
          next.add(t.code);
        }
        return next;
      });
    }
  }

  function handleAddSelected() {
    const selected = availableTemplates.filter((t) =>
      selectedCodes.has(t.code),
    );
    if (selected.length > 0) {
      onSeedSelected(selected);
      setViewMode('configured');
    }
  }

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
          Select default games for your casino or add custom ones. You can edit
          any game after adding it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* View toggle + action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {hasGames && (
            <>
              <Button
                variant={viewMode === 'configured' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('configured')}
                disabled={isPending}
              >
                Your Games
              </Button>
              {availableTemplates.length > 0 && (
                <Button
                  variant={viewMode === 'catalog' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('catalog')}
                  disabled={isPending}
                >
                  Add from Catalog
                </Button>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setViewMode('configured');
              setFormMode({ type: 'create' });
            }}
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

        {/* ============================================= */}
        {/* CATALOG VIEW: Selectable template games       */}
        {/* ============================================= */}
        {viewMode === 'catalog' && formMode.type === 'closed' && (
          <div className="space-y-4">
            {availableTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All default games have been added. Use &ldquo;Add Custom
                Game&rdquo; to create additional games.
              </p>
            ) : (
              <>
                {/* Select all toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedCount === availableTemplates.length}
                      onCheckedChange={toggleAll}
                      disabled={isPending}
                    />
                    <label
                      htmlFor="select-all"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Select all ({availableTemplates.length} available)
                    </label>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddSelected}
                    disabled={isPending || selectedCount === 0}
                  >
                    {isPending
                      ? 'Adding...'
                      : `Add ${selectedCount} Selected Game${selectedCount !== 1 ? 's' : ''}`}
                  </Button>
                </div>

                {/* Template list grouped by game_type */}
                {groupedTemplates.map((group) => (
                  <div key={group.gameType}>
                    <h4 className="mb-2 text-sm font-medium">{group.label}</h4>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Name</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead className="text-right">
                              House Edge
                            </TableHead>
                            <TableHead className="text-right">
                              Decisions/hr
                            </TableHead>
                            <TableHead className="text-right">Seats</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((tmpl) => (
                            <TableRow
                              key={tmpl.code}
                              className="cursor-pointer"
                              onClick={() => toggleCode(tmpl.code)}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedCodes.has(tmpl.code)}
                                  onCheckedChange={() => toggleCode(tmpl.code)}
                                  disabled={isPending}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {tmpl.name}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {tmpl.variant_name ?? '\u2014'}
                              </TableCell>
                              <TableCell className="text-right">
                                {tmpl.house_edge}%
                              </TableCell>
                              <TableCell className="text-right">
                                {tmpl.decisions_per_hour}
                              </TableCell>
                              <TableCell className="text-right">
                                {tmpl.seats_available}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* CONFIGURED VIEW: Games already added          */}
        {/* ============================================= */}
        {viewMode === 'configured' &&
          hasGames &&
          formMode.type === 'closed' && (
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
                          <TableHead className="text-right">
                            House Edge
                          </TableHead>
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

        {/* Empty state — no games, catalog view */}
        {!hasGames && viewMode === 'catalog' && formMode.type !== 'closed' && (
          <p className="text-sm text-muted-foreground">
            No games configured yet. Select from the catalog above or add a
            custom game.
          </p>
        )}

        {/* Configured view with no games yet */}
        {viewMode === 'configured' &&
          !hasGames &&
          formMode.type === 'closed' && (
            <p className="text-sm text-muted-foreground">
              No games configured yet. Select games from the catalog or add a
              custom game.
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
