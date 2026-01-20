/**
 * Shift Dashboard Route
 *
 * Route page for the shift dashboard.
 * Requires authentication.
 *
 * @see PRD-Shift-Dashboards-v0.2
 */

import type { Metadata } from 'next';

import { ShiftDashboardPage } from '@/components/shift-dashboard';

export const metadata: Metadata = {
  title: 'Shift Dashboard | PT-2',
  description: 'Operational metrics and telemetry for the current shift',
};

export default function ShiftDashboardRoute() {
  return <ShiftDashboardPage />;
}
