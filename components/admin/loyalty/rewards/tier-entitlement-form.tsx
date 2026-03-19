'use client';

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
    <Card data-testid="tier-entitlement-form">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tier Entitlements</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddRow}
            disabled={!canAddRow || isPending}
            data-testid="add-tier-row-button"
          >
            Add Tier
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p
            className="py-4 text-center text-sm text-muted-foreground"
            data-testid="no-tiers-message"
          >
            No tier entitlements configured. Click &quot;Add Tier&quot; to add
            one.
          </p>
        ) : (
          <div className="rounded-md border">
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
                          className="w-[130px]"
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
                          className="w-[120px]"
                          aria-label="Face value in cents"
                          data-testid={`face-value-input-${row.key}`}
                        />
                      </div>
                    </TableCell>

                    {/* Display (dollars) */}
                    <TableCell>
                      <span
                        className="text-sm text-muted-foreground"
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
                          className="w-[140px]"
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
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveRow(row.key)}
                        disabled={isPending}
                        aria-label={`Remove ${row.tier} tier`}
                        data-testid={`remove-tier-${row.key}`}
                      >
                        &times;
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
          <Button variant="outline" onClick={handleReset} disabled={isPending}>
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            data-testid="save-tiers-button"
          >
            {isPending ? 'Saving...' : 'Save Tiers'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
