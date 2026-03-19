import { RewardListClient } from '@/components/admin/loyalty/rewards/reward-list-client';
import { createClient } from '@/lib/supabase/server';
import { createRewardService } from '@/services/loyalty/reward';

/**
 * Reward Catalog Admin Page (RSC)
 *
 * Server-fetches all rewards and hydrates RewardListClient.
 * Admin layout guard ensures only admin/pit_boss roles reach this page.
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export default async function RewardsPage() {
  const supabase = await createClient();
  const rewardService = createRewardService(supabase);
  const rewards = await rewardService.listRewards();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reward Catalog</h1>
        <p className="text-muted-foreground">
          Manage reward definitions, pricing, and tier entitlements.
        </p>
      </div>
      <RewardListClient initialData={rewards} />
    </div>
  );
}
