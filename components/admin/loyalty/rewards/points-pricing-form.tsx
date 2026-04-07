'use client';

import { Coins, RotateCcw, Save } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUpdateReward } from '@/hooks/loyalty/use-reward-mutations';
import type { RewardDetailDTO } from '@/services/loyalty/reward/dtos';

// --- Section header ---

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <h4
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </h4>
    </div>
  );
}

// === Component Props ===

interface PointsPricingFormProps {
  reward: RewardDetailDTO;
}

/**
 * Form for managing points_comp reward pricing.
 *
 * Fields:
 * - pointsCost: integer number of loyalty points required
 * - allowOverdraw: whether to allow redemption when balance < cost
 *
 * Save calls useUpdateReward with nested pricePoints payload.
 * Displays current values from reward.pricePoints.
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export function PointsPricingForm({ reward }: PointsPricingFormProps) {
  const [pointsCost, setPointsCost] = useState<number>(
    reward.pricePoints?.pointsCost ?? 0,
  );
  const [allowOverdraw, setAllowOverdraw] = useState<boolean>(
    reward.pricePoints?.allowOverdraw ?? false,
  );
  const [isPending, startTransition] = useTransition();

  const updateReward = useUpdateReward();

  // Track if form has changed from saved values
  const hasChanges =
    pointsCost !== (reward.pricePoints?.pointsCost ?? 0) ||
    allowOverdraw !== (reward.pricePoints?.allowOverdraw ?? false);

  function handleSave() {
    if (pointsCost < 0 || !Number.isInteger(pointsCost)) {
      toast.error('Points cost must be a non-negative integer');
      return;
    }

    startTransition(async () => {
      try {
        await updateReward.mutateAsync({
          id: reward.id,
          pricePoints: {
            pointsCost,
            allowOverdraw,
          },
          idempotencyKey: `update-reward-${reward.id}-pricing-${Date.now()}`,
        });
        toast.success('Points pricing saved');
      } catch {
        toast.error('Failed to save points pricing');
      }
    });
  }

  function handleReset() {
    setPointsCost(reward.pricePoints?.pointsCost ?? 0);
    setAllowOverdraw(reward.pricePoints?.allowOverdraw ?? false);
  }

  return (
    <Card
      className="border-2 border-border/50"
      data-testid="points-pricing-form"
    >
      <CardHeader className="pb-3">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Points Pricing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <SectionHeader icon={Coins} label="Cost & Overdraw" />

          {/* Points Cost */}
          <div className="space-y-1.5">
            <Label
              htmlFor="points-cost"
              className="text-sm text-muted-foreground"
            >
              Points Cost
            </Label>
            <Input
              id="points-cost"
              type="number"
              min={0}
              step={1}
              value={pointsCost}
              onChange={(e) => setPointsCost(parseInt(e.target.value, 10) || 0)}
              className="font-mono tabular-nums"
              data-testid="points-cost-input"
            />
            <p className="text-xs text-muted-foreground/60">
              Number of loyalty points required to redeem this reward.
            </p>
          </div>

          {/* Allow Overdraw */}
          <div className="flex items-center justify-between rounded-lg border-2 border-border/30 p-3">
            <div className="space-y-0.5">
              <Label
                htmlFor="allow-overdraw"
                className="text-sm text-muted-foreground"
              >
                Allow Overdraw
              </Label>
              <p className="text-xs text-muted-foreground/60">
                Allow redemption even when player balance is below cost.
              </p>
            </div>
            <Switch
              id="allow-overdraw"
              checked={allowOverdraw}
              onCheckedChange={setAllowOverdraw}
              aria-label="Allow overdraw"
              data-testid="allow-overdraw-toggle"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleReset}
            disabled={isPending || !hasChanges}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
            data-testid="save-pricing-button"
          >
            <Save className="h-3 w-3" />
            {isPending ? 'Saving...' : 'Save Pricing'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
