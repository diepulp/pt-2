/**
 * Player Import Page
 *
 * Protected route for CSV player import wizard.
 * Client-side only — all data fetching via TanStack Query.
 *
 * @see PRD-037 CSV Player Import
 */

import type { Metadata } from 'next';

import { ImportWizard } from '@/components/player-import/import-wizard';

export const metadata: Metadata = {
  title: 'Import Players | PT-2',
  description: 'Import player data from vendor CSV exports',
};

export default function PlayerImportPage() {
  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Import Players</h1>
        <p className="text-muted-foreground mt-1">
          Upload a vendor CSV file to import player records into your casino.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
