import { notFound } from 'next/navigation';

import { RewardDetailClient } from '@/components/admin/loyalty/rewards/reward-detail-client';
import { createClient } from '@/lib/supabase/server';
import { createRewardService } from '@/services/loyalty/reward';

/**
 * Reward Detail Admin Page (RSC)
 *
 * Server-fetches a single reward with child records and hydrates RewardDetailClient.
 * Uses Next.js 16 async params pattern.
 *
 * @see PRD-LOYALTY-ADMIN-CATALOG WS3
 */
export default async function RewardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const rewardService = createRewardService(supabase);
  const reward = await rewardService.getReward(id);

  if (!reward) {
    notFound();
  }

  return (
    <div className="space-y-6 p-6">
      <RewardDetailClient initialData={reward} />
    </div>
  );
}
