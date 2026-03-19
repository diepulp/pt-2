'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useCreateReward } from '@/hooks/loyalty/use-reward-mutations';
import type {
  FulfillmentType,
  RewardFamily,
} from '@/services/loyalty/reward/dtos';

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
          <DialogTitle>Create Reward</DialogTitle>
          <DialogDescription>
            Define a new reward catalog entry. Pricing and tier entitlements can
            be configured after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Family Selector */}
          <div className="space-y-2">
            <Label htmlFor="reward-family">Family</Label>
            <Select
              value={form.family}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  family: v as RewardFamily,
                }))
              }
            >
              <SelectTrigger id="reward-family" aria-label="Reward family">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="points_comp">Points Comp</SelectItem>
                <SelectItem value="entitlement">Entitlement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="reward-code">Code</Label>
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
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="reward-name">Name</Label>
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
            />
          </div>

          {/* Kind */}
          <div className="space-y-2">
            <Label htmlFor="reward-kind">Kind</Label>
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
            />
          </div>

          {/* Fulfillment */}
          <div className="space-y-2">
            <Label htmlFor="reward-fulfillment">Fulfillment</Label>
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="create-reward-submit"
            >
              {isPending ? 'Creating...' : 'Create Reward'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
