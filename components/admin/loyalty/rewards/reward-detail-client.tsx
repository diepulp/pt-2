'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useReward } from '@/hooks/loyalty/use-reward-catalog';
import {
  useToggleRewardActive,
  useUpdateReward,
} from '@/hooks/loyalty/use-reward-mutations';
import type {
  FulfillmentType,
  RewardDetailDTO,
} from '@/services/loyalty/reward/dtos';
import { rewardKeys } from '@/services/loyalty/reward/keys';

import { PointsPricingForm } from './points-pricing-form';
import { TierEntitlementForm } from './tier-entitlement-form';

// === Family Display Helpers ===

const FAMILY_LABELS: Record<string, string> = {
  points_comp: 'Points Comp',
  entitlement: 'Entitlement',
};

const FAMILY_VARIANTS: Record<string, 'default' | 'secondary'> = {
  points_comp: 'default',
  entitlement: 'secondary',
};

// === Component Props ===

interface RewardDetailClientProps {
  initialData: RewardDetailDTO;
}

/**
 * Client component for the reward detail page.
 *
 * Features:
 * - Header with name, code, family badge, active toggle
 * - Inline editing for name, kind, fulfillment
 * - Conditional config section based on family:
 *   - points_comp -> PointsPricingForm
 *   - entitlement -> TierEntitlementForm
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export function RewardDetailClient({ initialData }: RewardDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Seed cache with server-fetched data
  queryClient.setQueryData(rewardKeys.detail(initialData.id), initialData);

  const { data: reward } = useReward(initialData.id);
  const detail = (reward ?? initialData) as RewardDetailDTO;

  const updateReward = useUpdateReward();
  const toggleActive = useToggleRewardActive();

  // Inline edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editName, setEditName] = useState(detail.name);
  const [editKind, setEditKind] = useState(detail.kind);
  const [editFulfillment, setEditFulfillment] =
    useState<FulfillmentType | null>(detail.fulfillment);

  const [isPending, startTransition] = useTransition();

  function handleToggleActive() {
    startTransition(async () => {
      try {
        await toggleActive.mutateAsync({
          id: detail.id,
          isActive: !detail.isActive,
          idempotencyKey: `toggle-reward-${detail.id}-${Date.now()}`,
        });
        toast.success(
          `Reward ${detail.isActive ? 'deactivated' : 'activated'}`,
        );
      } catch {
        toast.error('Failed to update reward status');
      }
    });
  }

  function handleSaveField(field: string) {
    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = { id: detail.id };
        if (field === 'name') payload.name = editName.trim();
        if (field === 'kind') payload.kind = editKind.trim();
        if (field === 'fulfillment') payload.fulfillment = editFulfillment;

        await updateReward.mutateAsync({
          ...(payload as {
            id: string;
            name?: string;
            kind?: string;
            fulfillment?: FulfillmentType | null;
          }),
          idempotencyKey: `update-reward-${detail.id}-${field}-${Date.now()}`,
        });
        setEditingField(null);
        toast.success(
          `${field.charAt(0).toUpperCase() + field.slice(1)} updated`,
        );
      } catch {
        toast.error(`Failed to update ${field}`);
      }
    });
  }

  function handleCancelEdit(field: string) {
    if (field === 'name') setEditName(detail.name);
    if (field === 'kind') setEditKind(detail.kind);
    if (field === 'fulfillment') setEditFulfillment(detail.fulfillment);
    setEditingField(null);
  }

  return (
    <div className="space-y-6" data-testid="reward-detail">
      {/* Back Navigation */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push('/admin/loyalty/rewards')}
        data-testid="back-to-rewards"
      >
        &larr; Back to Rewards
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1
              className="text-2xl font-bold tracking-tight"
              data-testid="reward-detail-name"
            >
              {detail.name}
            </h1>
            <Badge variant={FAMILY_VARIANTS[detail.family] ?? 'default'}>
              {FAMILY_LABELS[detail.family] ?? detail.family}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {detail.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {detail.isActive ? 'Active' : 'Inactive'}
          </span>
          <Switch
            checked={detail.isActive}
            disabled={isPending}
            aria-label="Toggle reward active"
            data-testid="reward-detail-active-toggle"
            onCheckedChange={handleToggleActive}
          />
        </div>
      </div>

      <Separator />

      {/* Editable Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Reward Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name Field */}
          <div className="space-y-2">
            <Label>Name</Label>
            {editingField === 'name' ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={200}
                  data-testid="edit-name-input"
                />
                <Button
                  size="sm"
                  onClick={() => handleSaveField('name')}
                  disabled={isPending || !editName.trim()}
                  data-testid="save-name-button"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancelEdit('name')}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm" data-testid="display-name">
                  {detail.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditName(detail.name);
                    setEditingField('name');
                  }}
                  data-testid="edit-name-button"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Kind Field */}
          <div className="space-y-2">
            <Label>Kind</Label>
            {editingField === 'kind' ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value)}
                  maxLength={100}
                  data-testid="edit-kind-input"
                />
                <Button
                  size="sm"
                  onClick={() => handleSaveField('kind')}
                  disabled={isPending || !editKind.trim()}
                  data-testid="save-kind-button"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancelEdit('kind')}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm" data-testid="display-kind">
                  {detail.kind}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditKind(detail.kind);
                    setEditingField('kind');
                  }}
                  data-testid="edit-kind-button"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Fulfillment Field */}
          <div className="space-y-2">
            <Label>Fulfillment</Label>
            {editingField === 'fulfillment' ? (
              <div className="flex items-center gap-2">
                <Select
                  value={editFulfillment ?? 'null'}
                  onValueChange={(v) =>
                    setEditFulfillment(
                      v === 'null' ? null : (v as FulfillmentType),
                    )
                  }
                >
                  <SelectTrigger
                    className="w-[200px]"
                    aria-label="Fulfillment type"
                    data-testid="edit-fulfillment-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">None</SelectItem>
                    <SelectItem value="comp_slip">Comp Slip</SelectItem>
                    <SelectItem value="coupon">Coupon</SelectItem>
                    <SelectItem value="none">No Fulfillment</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => handleSaveField('fulfillment')}
                  disabled={isPending}
                  data-testid="save-fulfillment-button"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancelEdit('fulfillment')}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm" data-testid="display-fulfillment">
                  {detail.fulfillment ?? 'Not set'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditFulfillment(detail.fulfillment);
                    setEditingField('fulfillment');
                  }}
                  data-testid="edit-fulfillment-button"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conditional Config Section */}
      {detail.family === 'points_comp' && <PointsPricingForm reward={detail} />}

      {detail.family === 'entitlement' && (
        <TierEntitlementForm reward={detail} />
      )}
    </div>
  );
}
