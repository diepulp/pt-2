/**
 * Shift Dashboard V2 Page
 *
 * Route entry for the redesigned shift dashboard.
 * Available at /review/shift-dashboard-v2 during development.
 *
 * @see IMPLEMENTATION_STRATEGY.md §10 Migration Path
 */

import type { Metadata } from "next";

import { ShiftDashboardV2 } from "./shift-dashboard-v2";

export const metadata: Metadata = {
  title: "Shift Dashboard V2 | PT-2",
  description: "Redesigned shift dashboard with improved usability",
};

export default function ShiftDashboardV2Page() {
  return (
    <div className="container mx-auto py-6">
      <ShiftDashboardV2 />
    </div>
  );
}
