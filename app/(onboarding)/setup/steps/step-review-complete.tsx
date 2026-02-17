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
import { Separator } from '@/components/ui/separator';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

import {
  validateAllSteps,
  type ValidationIssue,
} from '../lib/wizard-validation';

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
];

interface StepReviewCompleteProps {
  settings: CasinoSettingsRow | null;
  games: GameSettingsDTO[];
  tables: GamingTableRow[];
  isPending: boolean;
  onComplete: () => void;
  onBack: () => void;
  onJumpToStep: (step: number) => void;
}

function SectionStatus({ issues }: { issues: ValidationIssue[] }) {
  const hasBlockers = issues.some((i) => i.severity === 'blocker');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  if (hasBlockers) {
    return <Badge variant="destructive">Needs Fix</Badge>;
  }
  if (hasWarnings) {
    return (
      <Badge variant="secondary" className="border-amber-300 text-amber-600">
        Warning
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="border-green-300 text-green-600">
      Complete
    </Badge>
  );
}

function IssueList({
  issues,
  onFix,
}: {
  issues: ValidationIssue[];
  onFix: () => void;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 rounded-md border border-muted p-2">
      {issues.map((issue) => (
        <div
          key={issue.ruleId}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span
            className={
              issue.severity === 'blocker'
                ? 'text-destructive'
                : 'text-amber-600'
            }
          >
            {issue.message}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto shrink-0 px-2 py-0.5 text-xs"
            onClick={onFix}
          >
            Fix
          </Button>
        </div>
      ))}
    </div>
  );
}

export function StepReviewComplete({
  settings,
  games,
  tables,
  isPending,
  onComplete,
  onBack,
  onJumpToStep,
}: StepReviewCompleteProps) {
  // Derived validation audit — not stored as state
  const allIssues = validateAllSteps({ settings, games, tables });
  const hasBlockers = allIssues.some((i) => i.severity === 'blocker');
  const blockerCount = allIssues.filter((i) => i.severity === 'blocker').length;

  // Group issues by step
  const issuesByStep = new Map<number, ValidationIssue[]>();
  for (const issue of allIssues) {
    const existing = issuesByStep.get(issue.step) ?? [];
    existing.push(issue);
    issuesByStep.set(issue.step, existing);
  }

  const tablesWithPar = tables.filter(
    (t) => t.par_total_cents != null && t.par_total_cents > 0,
  );

  // Build lookup for variant names
  const gameSettingsMap = new Map<string, GameSettingsDTO>();
  for (const gs of games) {
    gameSettingsMap.set(gs.id, gs);
  }

  // Group games by type for summary
  const groups = new Map<string, GameSettingsDTO[]>();
  for (const game of games) {
    const existing = groups.get(game.game_type) ?? [];
    existing.push(game);
    groups.set(game.game_type, existing);
  }
  const groupedGames = GAME_TYPE_ORDER.filter((gt) => groups.has(gt)).map(
    (gt) => ({
      gameType: gt,
      label: GAME_TYPE_LABELS[gt] ?? gt,
      items: groups.get(gt)!,
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Complete</CardTitle>
        <CardDescription>
          {hasBlockers
            ? `${blockerCount} issue${blockerCount !== 1 ? 's' : ''} to resolve before completing setup`
            : 'Everything looks good. Complete your setup.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Audit Status Banner */}
        {hasBlockers && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Some steps have issues that need to be resolved before completing
            setup.
          </div>
        )}

        {/* Step 0: Casino Settings */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Casino Settings
            </h3>
            <SectionStatus issues={issuesByStep.get(0) ?? []} />
          </div>
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
          <IssueList
            issues={issuesByStep.get(0) ?? []}
            onFix={() => onJumpToStep(0)}
          />
        </div>

        <Separator />

        {/* Step 1: Game Settings */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Game Settings
            </h3>
            <Badge variant="secondary">
              {games.length} game{games.length !== 1 ? 's' : ''} configured
            </Badge>
            <SectionStatus issues={issuesByStep.get(1) ?? []} />
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
          <IssueList
            issues={issuesByStep.get(1) ?? []}
            onFix={() => onJumpToStep(1)}
          />
        </div>

        <Separator />

        {/* Step 2: Gaming Tables */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Gaming Tables
            </h3>
            <SectionStatus issues={issuesByStep.get(2) ?? []} />
          </div>
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
                  </div>
                );
              })}
            </div>
          )}
          <IssueList
            issues={issuesByStep.get(2) ?? []}
            onFix={() => onJumpToStep(2)}
          />
        </div>

        <Separator />

        {/* Step 3: Par Targets */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Par Targets
            </h3>
            <SectionStatus issues={issuesByStep.get(3) ?? []} />
          </div>
          {tablesWithPar.length > 0 ? (
            <div className="space-y-1">
              <div className="grid gap-1 text-sm">
                {tablesWithPar.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted-foreground text-xs">
                      Par: ${(t.par_total_cents! / 100).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tablesWithPar.length} of {tables.length} tables have par
                targets set.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No par targets configured.
            </p>
          )}
          <IssueList
            issues={issuesByStep.get(3) ?? []}
            onFix={() => onJumpToStep(3)}
          />
        </div>

        <Separator />

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={onComplete} disabled={isPending || hasBlockers}>
            {isPending ? 'Completing...' : 'Complete Setup'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
