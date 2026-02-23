/**
 * CSV Download Button
 *
 * Downloads import results as a sanitized CSV file.
 * Uses OWASP tab-prefix sanitization for formula injection prevention.
 *
 * @see PRD-037 CSV Player Import — SEC Note T4
 */

'use client';

import { Button } from '@/components/ui/button';
import { useCsvDownload } from '@/hooks/player-import/use-csv-download';
import type { ImportRowDTO } from '@/services/player-import/dtos';

interface CsvDownloadButtonProps {
  rows: ImportRowDTO[];
  fileName: string;
}

export function CsvDownloadButton({ rows, fileName }: CsvDownloadButtonProps) {
  const { downloadRows, isPending } = useCsvDownload();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending || rows.length === 0}
      onClick={() => downloadRows(rows, fileName)}
    >
      {isPending ? 'Generating...' : 'Download CSV'}
    </Button>
  );
}
