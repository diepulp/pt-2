import { Metadata } from "next";

import { PitMapContainer } from "./pit-map-container";

export const metadata: Metadata = {
  title: "Pit Map Navigation | PT-2",
  description: "Casino pit and table navigation interface",
};

/**
 * Pit Map Navigation Review Page
 *
 * Implements the "Left Pit Switcher + Table Grid" pattern from
 * docs/00-vision/pit_tables_navigation_ux.md
 *
 * Features:
 * - Left rail pit switcher with search, pins, recents
 * - Main area table grid (or list view)
 * - Command palette (⌘K) for quick navigation
 * - Mobile-responsive with bottom sheet pit selector
 * - Keyboard navigation support
 */
export default function PitMapPage() {
  return <PitMapContainer />;
}
