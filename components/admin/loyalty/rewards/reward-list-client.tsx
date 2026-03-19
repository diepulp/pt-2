'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRewards } from '@/hooks/loyalty/use-reward-catalog';
import { useToggleRewardActive } from '@/hooks/loyalty/use-reward-mutations';
import type {
  RewardCatalogDTO,
  RewardFamily,
} from '@/services/loyalty/reward/dtos';
import { rewardKeys } from '@/services/loyalty/reward/keys';

import { CreateRewardDialog } from './create-reward-dialog';

// === Family Display Helpers ===

const FAMILY_LABELS: Record<RewardFamily, string> = {
  points_comp: 'Points Comp',
  entitlement: 'Entitlement',
};

const FAMILY_VARIANTS: Record<RewardFamily, 'default' | 'secondary'> = {
  points_comp: 'default',
  entitlement: 'secondary',
};

// === Component Props ===

interface RewardListClientProps {
  initialData: RewardCatalogDTO[];
}

/**
 * Client component for the reward catalog list page.
 *
 * Features:
 * - Filter by family and active status
 * - Toggle active state inline via Switch
 * - Navigate to detail page on row click
 * - Create new rewards via dialog
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export function RewardListClient({ initialData }: RewardListClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Seed cache with server-fetched data
  queryClient.setQueryData(rewardKeys.list({}), initialData);

  // Filter state
  const [familyFilter, setFamilyFilter] = useState<RewardFamily | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Build query from filters
  const query = {
    family: familyFilter === 'all' ? undefined : familyFilter,
    isActive: activeFilter,
  };

  const { data: rewards = [], isLoading, isError } = useRewards(query);
  const toggleActive = useToggleRewardActive();
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(reward: RewardCatalogDTO) {
    startTransition(async () => {
      try {
        await toggleActive.mutateAsync({
          id: reward.id,
          isActive: !reward.isActive,
          idempotencyKey: `toggle-reward-${reward.id}-${Date.now()}`,
        });
        toast.success(
          `${reward.name} ${reward.isActive ? 'deactivated' : 'activated'}`,
        );
      } catch {
        toast.error('Failed to update reward status');
      }
    });
  }

  function handleRowClick(rewardId: string) {
    router.push(`/admin/loyalty/rewards/${rewardId}`);
  }

  if (isError) {
    return (
      <div
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        data-testid="reward-list-error"
      >
        Failed to load rewards. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="reward-list">
      {/* Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="reward-filters"
      >
        <Select
          value={familyFilter}
          onValueChange={(v) => setFamilyFilter(v as RewardFamily | 'all')}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by family">
            <SelectValue placeholder="All Families" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Families</SelectItem>
            <SelectItem value="points_comp">Points Comp</SelectItem>
            <SelectItem value="entitlement">Entitlement</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={activeFilter === undefined ? 'all' : String(activeFilter)}
          onValueChange={(v) =>
            setActiveFilter(v === 'all' ? undefined : v === 'true')
          }
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            data-testid="add-reward-button"
          >
            Add Reward
          </Button>
        </div>
      </div>

      {/* Rewards Table */}
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">
          Loading rewards...
        </div>
      ) : rewards.length === 0 ? (
        <div
          className="py-8 text-center text-muted-foreground"
          data-testid="reward-list-empty"
        >
          No rewards found. Create one to get started.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => (
                <TableRow
                  key={reward.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(reward.id)}
                  data-testid={`reward-row-${reward.id}`}
                >
                  <TableCell className="font-medium">{reward.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {reward.code}
                  </TableCell>
                  <TableCell>
                    <Badge variant={FAMILY_VARIANTS[reward.family]}>
                      {FAMILY_LABELS[reward.family]}
                    </Badge>
                  </TableCell>
                  <TableCell>{reward.kind}</TableCell>
                  <TableCell>
                    <Switch
                      checked={reward.isActive}
                      disabled={isPending}
                      aria-label={`Toggle ${reward.name} active`}
                      data-testid={`reward-active-toggle-${reward.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => handleToggleActive(reward)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Reward Dialog */}
      <CreateRewardDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
