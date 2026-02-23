/**
 * Report Summary Card
 *
 * Displays outcome counts from an import batch execution:
 * created, linked, skipped, conflict, error.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportBatchReportV1 } from '@/services/player-import/dtos';

interface ReportSummaryCardProps {
  report: ImportBatchReportV1;
}

interface StatItem {
  label: string;
  value: number;
  colorClass: string;
}

export function ReportSummaryCard({ report }: ReportSummaryCardProps) {
  const stats: StatItem[] = [
    { label: 'Total', value: report.total_rows, colorClass: 'text-foreground' },
    { label: 'Created', value: report.created, colorClass: 'text-emerald-600' },
    { label: 'Linked', value: report.linked, colorClass: 'text-blue-600' },
    { label: 'Skipped', value: report.skipped, colorClass: 'text-amber-600' },
    {
      label: 'Conflict',
      value: report.conflict,
      colorClass: 'text-orange-600',
    },
    { label: 'Error', value: report.error, colorClass: 'text-red-600' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className={`text-2xl font-bold tabular-nums ${stat.colorClass}`}
              >
                {stat.value}
              </p>
              <p className="text-muted-foreground text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
        {report.error_message && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {report.error_message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
