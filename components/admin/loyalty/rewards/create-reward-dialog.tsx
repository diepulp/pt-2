'use client';

import { Gift, Hash, Tag } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useCreateReward } from '@/hooks/loyalty/use-reward-mutations';
import type {
  FulfillmentType,
  RewardFamily,
} from '@/services/loyalty/reward/dtos';

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

interface CreateRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// === Form State ===

interface CreateRewardFormState {
  family: RewardFamily;
  code: string;
  name: string;
  kind: string;
  fulfillment: FulfillmentType | '';
}

const INITIAL_FORM_STATE: CreateRewardFormState = {
  family: 'points_comp',
  code: '',
  name: '',
  kind: '',
  fulfillment: '',
};

/**
 * Dialog for creating a new reward catalog entry.
 *
 * Family is selected first, then shared fields (code, name, kind, fulfillment).
 * Child configs (pricePoints, entitlementTiers) are NOT required at create time
 * per cross-field policy -- they are configured on the detail page.
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export function CreateRewardDialog({
  open,
  onOpenChange,
}: CreateRewardDialogProps) {
  const [form, setForm] = useState<CreateRewardFormState>(INITIAL_FORM_STATE);
  const [isPending, startTransition] = useTransition();
  const createReward = useCreateReward();

  function resetForm() {
    setForm(INITIAL_FORM_STATE);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.code.trim() || !form.name.trim() || !form.kind.trim()) {
      toast.error('Code, name, and kind are required');
      return;
    }

    startTransition(async () => {
      try {
        await createReward.mutateAsync({
          casinoId: '', // RLS derives casino from auth context
          code: form.code.trim(),
          family: form.family,
          kind: form.kind.trim(),
          name: form.name.trim(),
          fulfillment: form.fulfillment || undefined,
          idempotencyKey: `create-reward-${Date.now()}`,
        });
        toast.success(`Reward "${form.name}" created`);
        handleOpenChange(false);
      } catch {
        toast.error('Failed to create reward');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="create-reward-dialog">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Create Reward
          </DialogTitle>
          <DialogDescription className="text-sm">
            Define a new reward catalog entry. Pricing and tier entitlements can
            be configured after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Classification ── */}
          <div className="space-y-3">
            <SectionHeader icon={Gift} label="Classification" />

            <div className="space-y-1.5">
              <Label
                htmlFor="reward-family"
                className="text-sm text-muted-foreground"
              >
                Family
              </Label>
              <Select
                value={form.family}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    family: v as RewardFamily,
                  }))
                }
              >
                <SelectTrigger
                  id="reward-family"
                  aria-label="Reward family"
                  className="font-mono"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="points_comp">Points Comp</SelectItem>
                  <SelectItem value="entitlement">Entitlement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* ── Identity ── */}
          <div className="space-y-3">
            <SectionHeader icon={Tag} label="Identity" />

            <div className="space-y-1.5">
              <Label
                htmlFor="reward-code"
                className="text-sm text-muted-foreground"
              >
                Code
              </Label>
              <Input
                id="reward-code"
                data-testid="reward-code-input"
                placeholder="e.g., COMP_MEAL_BRONZE"
                maxLength={50}
                value={form.code}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, code: e.target.value }))
                }
                required
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="reward-name"
                className="text-sm text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="reward-name"
                data-testid="reward-name-input"
                placeholder="e.g., Comp Meal (Bronze)"
                maxLength={200}
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="reward-kind"
                className="text-sm text-muted-foreground"
              >
                Kind
              </Label>
              <Input
                id="reward-kind"
                data-testid="reward-kind-input"
                placeholder="e.g., comp_meal"
                maxLength={100}
                value={form.kind}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, kind: e.target.value }))
                }
                required
                className="font-mono"
              />
            </div>
          </div>

          <Separator />

          {/* ── Fulfillment ── */}
          <div className="space-y-3">
            <SectionHeader icon={Hash} label="Fulfillment" />

            <div className="space-y-1.5">
              <Label
                htmlFor="reward-fulfillment"
                className="text-sm text-muted-foreground"
              >
                Type
                <span className="ml-1 text-xs text-muted-foreground/50">
                  optional
                </span>
              </Label>
              <Select
                value={form.fulfillment || 'none_selected'}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    fulfillment:
                      v === 'none_selected' ? '' : (v as FulfillmentType),
                  }))
                }
              >
                <SelectTrigger
                  id="reward-fulfillment"
                  aria-label="Fulfillment type"
                  className="font-mono"
                >
                  <SelectValue placeholder="Select fulfillment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none_selected">-- None --</SelectItem>
                  <SelectItem value="comp_slip">Comp Slip</SelectItem>
                  <SelectItem value="coupon">Coupon</SelectItem>
                  <SelectItem value="none">No Fulfillment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Actions ── */}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold uppercase tracking-wider"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
              disabled={isPending}
              data-testid="create-reward-submit"
            >
              {isPending ? 'Creating...' : 'Create Reward'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
