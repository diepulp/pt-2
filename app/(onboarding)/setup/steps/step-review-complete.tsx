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

interface StepReviewCompleteProps {
  settings: CasinoSettingsRow | null;
  gameCount: number;
  tables: GamingTableRow[];
  isPending: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function StepReviewComplete({
  settings,
  gameCount,
  tables,
  isPending,
  onComplete,
  onBack,
}: StepReviewCompleteProps) {
  const tablesWithPar = tables.filter(
    (t) => t.par_total_cents != null && t.par_total_cents > 0,
  );

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
                  .replace(/Pacific\//, '') ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Gaming Day Start: </span>
              <span className="font-medium">
                {settings?.gaming_day_start_time?.slice(0, 5) ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Bank Mode: </span>
              <span className="font-medium">
                {settings?.table_bank_mode
                  ? BANK_MODE_LABELS[settings.table_bank_mode]
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Game Settings */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Game Settings
          </h3>
          <Badge variant="secondary">{gameCount} games configured</Badge>
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
              {tables.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <Badge variant="outline" className="capitalize text-xs">
                    {t.type.replace('_', ' ')}
                  </Badge>
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
              ))}
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
