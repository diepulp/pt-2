import { Gift } from 'lucide-react';

import { RewardListClient } from '@/components/admin/loyalty/rewards/reward-list-client';
import { SettingsContentSection } from '@/components/admin/settings-content-section';
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
    <SettingsContentSection
      title="Rewards"
      desc="Manage reward definitions, pricing, and tier entitlements."
      icon={Gift}
    >
      <RewardListClient initialData={rewards} />
    </SettingsContentSection>
  );
}
