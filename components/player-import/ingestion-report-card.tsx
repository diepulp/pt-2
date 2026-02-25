/**
 * Ingestion Report Card (PRD-039)
 *
 * Displays worker ingestion report with row counts and overwrite warning.
 * Shown on the execute step before the user triggers the merge.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportIngestionReportV1 } from '@/services/player-import/dtos';

interface IngestionReportCardProps {
  report: ImportIngestionReportV1;
}

interface StatItem {
  label: string;
  value: number;
  colorClass: string;
}

export function IngestionReportCard({ report }: IngestionReportCardProps) {
  const stats: StatItem[] = [
    { label: 'Total', value: report.total_rows, colorClass: 'text-foreground' },
    {
      label: 'Valid',
      value: report.valid_rows,
      colorClass: 'text-emerald-600',
    },
    {
      label: 'Invalid',
      value: report.invalid_rows,
      colorClass: 'text-red-600',
    },
    {
      label: 'Duplicate',
      value: report.duplicate_rows,
      colorClass: 'text-amber-600',
    },
    {
      label: 'Parse Errors',
      value: report.parse_errors,
      colorClass: 'text-orange-600',
    },
  ];

  const durationSeconds = (report.duration_ms / 1000).toFixed(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingestion Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className={`text-2xl font-bold tabular-nums ${stat.colorClass}`}
              >
                {stat.value.toLocaleString()}
              </p>
              <p className="text-muted-foreground text-xs">{stat.label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Processed in {durationSeconds}s
        </p>

        {report.invalid_rows > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {report.invalid_rows.toLocaleString()} row
            {report.invalid_rows !== 1 ? 's were' : ' was'} invalid and will be
            skipped during execution. Only valid rows will be merged.
          </div>
        )}

        {report.duplicate_rows > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {report.duplicate_rows.toLocaleString()} duplicate row
            {report.duplicate_rows !== 1 ? 's were' : ' was'} detected and
            deduplicated automatically.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
