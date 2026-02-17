import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ShiftDashboardV3 } from '@/components/shift-dashboard-v3';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Shift Dashboard V3 | PT-2',
  description:
    'Three-panel shift dashboard with sticky rails and chart visualizations',
};

export default async function ShiftDashboardV3Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  return <ShiftDashboardV3 />;
}
