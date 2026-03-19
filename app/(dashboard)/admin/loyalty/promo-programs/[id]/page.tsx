import { notFound } from 'next/navigation';

import { ProgramDetailClient } from '@/components/admin/loyalty/promo-programs/program-detail-client';
import { createClient } from '@/lib/supabase/server';
import { createPromoService } from '@/services/loyalty/promo';

interface ProgramDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Promo Program detail page (RSC).
 * Prefetches program by ID server-side and passes as initialData.
 *
 * Layout guard: app/(dashboard)/admin/layout.tsx restricts to admin/pit_boss.
 * D1 note: No tier-ladder UX — deferred per PRD §7.2.
 */
export default async function ProgramDetailPage({
  params,
}: ProgramDetailPageProps) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const promoService = createPromoService(supabase);

  let initialData;
  try {
    initialData = await promoService.getProgram(id);
  } catch {
    // Graceful degradation — client component will refetch
    initialData = undefined;
  }

  if (initialData === null) {
    notFound();
  }

  return <ProgramDetailClient programId={id} initialData={initialData} />;
}
