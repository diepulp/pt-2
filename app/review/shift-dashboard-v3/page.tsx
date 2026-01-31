import type { Metadata } from 'next';

import { ShiftDashboardV3 } from './shift-dashboard-v3';

export const metadata: Metadata = {
  title: 'Shift Dashboard V3 | PT-2',
  description:
    'Three-panel shift dashboard with sticky rails and chart visualizations',
};

export default function ShiftDashboardV3Page() {
  return <ShiftDashboardV3 />;
}
