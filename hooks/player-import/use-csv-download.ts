/**
 * CSV Download Hook
 *
 * Generates a sanitized CSV blob from import rows and triggers browser download.
 * Applies OWASP tab-prefix sanitization to prevent formula injection.
 *
 * @see PRD-037 CSV Player Import — SEC Note T4
 * @see lib/csv/csv-sanitize.ts
 */

'use client';

import { useTransition } from 'react';

import { sanitizeCellValue } from '@/lib/csv/csv-sanitize';
import type { ImportRowDTO } from '@/services/player-import/dtos';

/**
 * Hook for generating and downloading CSV report files.
 *
 * Sanitizes all cell values to prevent formula injection in spreadsheet apps.
 * Uses `useTransition` for non-blocking CSV generation.
 */
export function useCsvDownload() {
  const [isPending, startTransition] = useTransition();

  function downloadRows(rows: ImportRowDTO[], fileName: string) {
    startTransition(() => {
      const csvContent = buildCsv(rows);
      triggerDownload(csvContent, fileName);
    });
  }

  return { downloadRows, isPending };
}

/** CSV column headers for the export */
const EXPORT_COLUMNS = [
  'row_number',
  'status',
  'reason_code',
  'reason_detail',
  'matched_player_id',
  'email',
  'phone',
  'first_name',
  'last_name',
] as const;

function buildCsv(rows: ImportRowDTO[]): string {
  const headerLine = EXPORT_COLUMNS.join(',');

  const dataLines = rows.map((row) => {
    const payload = row.normalized_payload as Record<string, unknown> | null;
    const identifiers = (payload?.identifiers ?? {}) as Record<string, string>;
    const profile = (payload?.profile ?? {}) as Record<string, string>;

    const values: string[] = [
      String(row.row_number),
      row.status,
      row.reason_code ?? '',
      row.reason_detail ?? '',
      row.matched_player_id ?? '',
      identifiers.email ?? '',
      identifiers.phone ?? '',
      profile.first_name ?? '',
      profile.last_name ?? '',
    ];

    return values.map((v) => escapeCsvField(sanitizeCellValue(v))).join(',');
  });

  return [headerLine, ...dataLines].join('\n');
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerDownload(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
