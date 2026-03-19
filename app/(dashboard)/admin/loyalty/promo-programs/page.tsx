import { ProgramListClient } from '@/components/admin/loyalty/promo-programs/program-list-client';
import { createClient } from '@/lib/supabase/server';
import { createPromoService } from '@/services/loyalty/promo';

/**
 * Promo Programs list page (RSC).
 * Prefetches program list server-side and passes as initialData.
 *
 * Layout guard: app/(dashboard)/admin/layout.tsx restricts to admin/pit_boss.
 */
export default async function PromoProgamsPage() {
  const supabase = await createClient();
  const promoService = createPromoService(supabase);

  let initialData;
  try {
    initialData = await promoService.listPrograms();
  } catch {
    // Graceful degradation — client component will refetch
    initialData = undefined;
  }

  return <ProgramListClient initialData={initialData} />;
}
