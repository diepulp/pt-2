'use client';

import { Layers, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUpdateReward } from '@/hooks/loyalty/use-reward-mutations';
import type {
  EntitlementBenefit,
  RewardDetailDTO,
  TierLevel,
} from '@/services/loyalty/reward/dtos';
import { TIER_LEVELS } from '@/services/loyalty/reward/dtos';

// === Types ===

interface TierRow {
  /** Local key for React rendering */
  key: string;
  tier: TierLevel;
  faceValueCents: number;
  instrumentType: 'match_play' | 'free_play';
}

// === Helpers ===

function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildInitialRows(reward: RewardDetailDTO): TierRow[] {
  return reward.entitlementTiers.map((et) => ({
    key: et.id,
    tier: et.tier,
    faceValueCents: et.benefit.face_value_cents,
    instrumentType: et.benefit.instrument_type,
  }));
}

// === Component Props ===

interface TierEntitlementFormProps {
  reward: RewardDetailDTO;
}

/**
 * Form for managing entitlement reward tier configurations.
 *
 * Displays a table of tier rows with:
 * - Tier level (select from TIER_LEVELS)
 * - Face value in cents (displayed as dollars)
 * - Instrument type (match_play / free_play)
 * - Add row / remove row controls
 *
 * Save calls useUpdateReward with replace-all entitlementTiers payload.
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export function TierEntitlementForm({ reward }: TierEntitlementFormProps) {
  const [rows, setRows] = useState<TierRow[]>(() => buildInitialRows(reward));
  const [isPending, startTransition] = useTransition();
  const updateReward = useUpdateReward();

  function handleAddRow() {
    // Find the first tier level not already assigned
    const usedTiers = new Set(rows.map((r) => r.tier));
    const nextTier = TIER_LEVELS.find((t) => !usedTiers.has(t)) ?? 'bronze';

    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        tier: nextTier,
        faceValueCents: 0,
        instrumentType: 'match_play',
      },
    ]);
  }

  function handleRemoveRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function handleRowChange(
    key: string,
    field: keyof TierRow,
    value: TierLevel | number | string,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function handleSave() {
    // Validate no duplicate tiers
    const tierSet = new Set<TierLevel>();
    for (const row of rows) {
      if (tierSet.has(row.tier)) {
        toast.error(`Duplicate tier: ${row.tier}. Each tier can appear once.`);
        return;
      }
      tierSet.add(row.tier);
    }

    // Validate face values
    for (const row of rows) {
      if (row.faceValueCents <= 0 || !Number.isInteger(row.faceValueCents)) {
        toast.error(
          `Face value for ${row.tier} must be a positive integer (in cents)`,
        );
        return;
      }
    }

    const entitlementTiers = rows.map((row) => ({
      tier: row.tier,
      benefit: {
        face_value_cents: row.faceValueCents,
        instrument_type: row.instrumentType,
      } satisfies EntitlementBenefit,
    }));

    startTransition(async () => {
      try {
        await updateReward.mutateAsync({
          id: reward.id,
          entitlementTiers:
            entitlementTiers.length > 0 ? entitlementTiers : null,
          idempotencyKey: `update-reward-${reward.id}-tiers-${Date.now()}`,
        });
        toast.success('Tier entitlements saved');
      } catch {
        toast.error('Failed to save tier entitlements');
      }
    });
  }

  function handleReset() {
    setRows(buildInitialRows(reward));
  }

  const canAddRow = rows.length < TIER_LEVELS.length;

  return (
    <Card
      className="border-2 border-border/50"
      data-testid="tier-entitlement-form"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Tier Entitlements
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleAddRow}
            disabled={!canAddRow || isPending}
            data-testid="add-tier-row-button"
          >
            <Plus className="h-3 w-3" />
            Add Tier
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <Card className="border-2 border-dashed border-border/50 bg-muted/20">
            <CardContent
              className="flex flex-col items-center justify-center py-8"
              data-testid="no-tiers-message"
            >
              <Layers className="mb-2 h-6 w-6 text-muted-foreground/40" />
              <div
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                No tier entitlements configured
              </div>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Click &quot;Add Tier&quot; to add one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-border/30">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Face Value</TableHead>
                  <TableHead>Display</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key} data-testid={`tier-row-${row.tier}`}>
                    {/* Tier Select */}
                    <TableCell>
                      <Select
                        value={row.tier}
                        onValueChange={(v) =>
                          handleRowChange(row.key, 'tier', v as TierLevel)
                        }
                      >
                        <SelectTrigger
                          className="w-[130px] font-mono"
                          aria-label={`Tier level for row`}
                          data-testid={`tier-select-${row.key}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIER_LEVELS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Face Value (cents input) */}
                    <TableCell>
                      <div className="space-y-1">
                        <Label className="sr-only">Face value in cents</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={row.faceValueCents}
                          onChange={(e) =>
                            handleRowChange(
                              row.key,
                              'faceValueCents',
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          className="w-[120px] font-mono tabular-nums"
                          aria-label="Face value in cents"
                          data-testid={`face-value-input-${row.key}`}
                        />
                      </div>
                    </TableCell>

                    {/* Display (dollars) */}
                    <TableCell>
                      <span
                        className="font-mono text-sm tabular-nums text-muted-foreground"
                        data-testid={`face-value-display-${row.key}`}
                      >
                        {formatCentsToDollars(row.faceValueCents)}
                      </span>
                    </TableCell>

                    {/* Instrument Type */}
                    <TableCell>
                      <Select
                        value={row.instrumentType}
                        onValueChange={(v) =>
                          handleRowChange(
                            row.key,
                            'instrumentType',
                            v as 'match_play' | 'free_play',
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-[140px] font-mono"
                          aria-label="Instrument type"
                          data-testid={`instrument-select-${row.key}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="match_play">Match Play</SelectItem>
                          <SelectItem value="free_play">Free Play</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Remove Button */}
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
                        onClick={() => handleRemoveRow(row.key)}
                        disabled={isPending}
                        aria-label={`Remove ${row.tier} tier`}
                        data-testid={`remove-tier-${row.key}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleReset}
            disabled={isPending}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleSave}
            disabled={isPending}
            data-testid="save-tiers-button"
          >
            <Save className="h-3 w-3" />
            {isPending ? 'Saving...' : 'Save Tiers'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
