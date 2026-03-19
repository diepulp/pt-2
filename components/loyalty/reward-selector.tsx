/**
 * Reward Selector Panel
 *
 * Displays the reward catalog grouped by family for the issuance drawer.
 * Uses useRewards({ isActive: true }) to fetch active rewards only.
 * Casino scoping is automatic via RLS context.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see hooks/loyalty/use-reward-catalog.ts
 */

'use client';

import { Loader2, Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useRewards } from '@/hooks/loyalty/use-reward-catalog';
import type {
  RewardCatalogDTO,
  RewardFamily,
} from '@/services/loyalty/reward/dtos';

// === Types ===

export interface RewardSelectorProps {
  /** Callback when a reward is selected */
  onSelect: (reward: RewardCatalogDTO) => void;
}

// === Helpers ===

const FAMILY_LABELS: Record<RewardFamily, string> = {
  points_comp: 'Comps',
  entitlement: 'Entitlements',
};

const FAMILY_ORDER: RewardFamily[] = ['points_comp', 'entitlement'];

function groupByFamily(
  rewards: RewardCatalogDTO[],
): Map<RewardFamily, RewardCatalogDTO[]> {
  const groups = new Map<RewardFamily, RewardCatalogDTO[]>();
  for (const reward of rewards) {
    const existing = groups.get(reward.family) ?? [];
    existing.push(reward);
    groups.set(reward.family, existing);
  }
  return groups;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// === Component ===

/**
 * Reward catalog selector panel.
 *
 * Groups rewards by family with section headers.
 * Each reward card shows: name, family badge, points cost (comp) or
 * configured face value + instrument type (entitlement).
 */
export function RewardSelector({ onSelect }: RewardSelectorProps) {
  const { data: rewards, isLoading, error } = useRewards({ isActive: true });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading rewards...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load reward catalog. Please try again.
      </div>
    );
  }

  if (!rewards || rewards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          No rewards available
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Configure rewards in the admin catalog to enable issuance.
        </p>
      </div>
    );
  }

  const grouped = groupByFamily(rewards);

  return (
    <div className="space-y-6">
      {FAMILY_ORDER.map((family) => {
        const familyRewards = grouped.get(family);
        if (!familyRewards || familyRewards.length === 0) return null;

        return (
          <div key={family}>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {FAMILY_LABELS[family]}
            </h3>
            <div className="space-y-2">
              {familyRewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  reward={reward}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// === Reward Card ===

function RewardCard({
  reward,
  onSelect,
}: {
  reward: RewardCatalogDTO;
  onSelect: (reward: RewardCatalogDTO) => void;
}) {
  const metadata = reward.metadata as Record<string, unknown>;
  const faceValueCents =
    typeof metadata?.face_value_cents === 'number'
      ? metadata.face_value_cents
      : null;
  const instrumentType =
    typeof metadata?.instrument_type === 'string'
      ? metadata.instrument_type
      : null;

  return (
    <button
      type="button"
      className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent hover:border-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onSelect(reward)}
      data-testid={`reward-card-${reward.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{reward.name}</span>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {reward.family === 'points_comp' ? 'Comp' : 'Entitlement'}
            </Badge>
          </div>
          {reward.family === 'entitlement' && (
            <div className="mt-1 text-xs text-muted-foreground">
              {faceValueCents !== null && (
                <span>Value: {formatCents(faceValueCents)}</span>
              )}
              {instrumentType && (
                <span className="ml-2">
                  {instrumentType === 'match_play' ? 'Match Play' : 'Free Play'}
                </span>
              )}
            </div>
          )}
        </div>
        {reward.family === 'points_comp' && (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Points
          </span>
        )}
      </div>
    </button>
  );
}
