'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Package, Pencil, Settings, X } from 'lucide-react';
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
import { RewardLimitsForm } from './reward-limits-form';
import { TierEntitlementForm } from './tier-entitlement-form';

// === Family Display Helpers ===

const FAMILY_LABELS: Record<string, string> = {
  points_comp: 'Points Comp',
  entitlement: 'Entitlement',
};

const FAMILY_BADGE_CLASSES: Record<string, string> = {
  points_comp: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  entitlement: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

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
        className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
        onClick={() => router.push('/admin/loyalty/rewards')}
        data-testid="back-to-rewards"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Rewards
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
              data-testid="reward-detail-name"
            >
              {detail.name}
            </h1>
            <Badge
              variant="outline"
              className={
                FAMILY_BADGE_CLASSES[detail.family] ??
                'bg-blue-500/10 text-blue-400 border-blue-500/30'
              }
            >
              {FAMILY_LABELS[detail.family] ?? detail.family}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {detail.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              detail.isActive
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }
          >
            {detail.isActive ? 'Active' : 'Inactive'}
          </Badge>
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
      <Card className="border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Reward Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Identity ── */}
          <div className="space-y-3">
            <SectionHeader icon={Package} label="Identity" />

            {/* Name Field */}
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Name</Label>
              {editingField === 'name' ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={200}
                    className="font-mono"
                    data-testid="edit-name-input"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleSaveField('name')}
                    disabled={isPending || !editName.trim()}
                    data-testid="save-name-button"
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleCancelEdit('name')}
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-sm"
                    data-testid="display-name"
                  >
                    {detail.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => {
                      setEditName(detail.name);
                      setEditingField('name');
                    }}
                    data-testid="edit-name-button"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              )}
            </div>

            {/* Kind Field */}
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Kind</Label>
              {editingField === 'kind' ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value)}
                    maxLength={100}
                    className="font-mono"
                    data-testid="edit-kind-input"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleSaveField('kind')}
                    disabled={isPending || !editKind.trim()}
                    data-testid="save-kind-button"
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleCancelEdit('kind')}
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-sm"
                    data-testid="display-kind"
                  >
                    {detail.kind}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => {
                      setEditKind(detail.kind);
                      setEditingField('kind');
                    }}
                    data-testid="edit-kind-button"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Configuration ── */}
          <div className="space-y-3">
            <SectionHeader icon={Settings} label="Configuration" />

            {/* Fulfillment Field */}
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">
                Fulfillment
              </Label>
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
                      className="w-[200px] font-mono"
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
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleSaveField('fulfillment')}
                    disabled={isPending}
                    data-testid="save-fulfillment-button"
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => handleCancelEdit('fulfillment')}
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-sm"
                    data-testid="display-fulfillment"
                  >
                    {detail.fulfillment ?? 'Not set'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs font-semibold uppercase tracking-wider"
                    onClick={() => {
                      setEditFulfillment(detail.fulfillment);
                      setEditingField('fulfillment');
                    }}
                    data-testid="edit-fulfillment-button"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditional Config Section */}
      {detail.family === 'points_comp' && <PointsPricingForm reward={detail} />}

      {detail.family === 'entitlement' && (
        <TierEntitlementForm reward={detail} />
      )}

      {/* PRD-061: Frequency Rules (all families) */}
      <RewardLimitsForm reward={detail} />
    </div>
  );
}
