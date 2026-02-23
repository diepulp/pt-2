/**
 * Step 3: Preview
 *
 * Shows summary cards and a sample data table (first 10 rows).
 * Highlights rows with warnings (missing identifiers).
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PREVIEW_ROW_COUNT = 10;

interface StepPreviewProps {
  rows: Record<string, string>[];
  headers: string[];
  mappings: Record<string, string>;
  totalRows: number;
  fileName: string;
  onNext: () => void;
  onBack: () => void;
}

export function StepPreview({
  rows,
  headers,
  mappings,
  totalRows,
  fileName,
  onNext,
  onBack,
}: StepPreviewProps) {
  const previewRows = rows.slice(0, PREVIEW_ROW_COUNT);
  const mappedFieldCount = Object.keys(mappings).length;
  const unmappedCount = headers.length - mappedFieldCount;

  // Check for rows missing identifiers
  const emailHeader = mappings.email;
  const phoneHeader = mappings.phone;
  const warningCount = rows.filter((row) => {
    const hasEmail = emailHeader && row[emailHeader]?.trim();
    const hasPhone = phoneHeader && row[phoneHeader]?.trim();
    return !hasEmail && !hasPhone;
  }).length;

  // Only show mapped columns in preview
  const mappedHeaders = Object.entries(mappings)
    .filter(([, csvHeader]) => csvHeader)
    .map(([canonical, csvHeader]) => ({
      canonical,
      csvHeader: csvHeader!,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview Import</CardTitle>
        <CardDescription>
          Review the data before uploading. Showing first {PREVIEW_ROW_COUNT} of{' '}
          {totalRows.toLocaleString()} rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{fileName}</Badge>
          <Badge variant="secondary">{totalRows.toLocaleString()} rows</Badge>
          <Badge variant="secondary">{mappedFieldCount} mapped fields</Badge>
          {unmappedCount > 0 && (
            <Badge variant="outline">{unmappedCount} unmapped (skipped)</Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="destructive">
              {warningCount} rows missing identifiers
            </Badge>
          )}
        </div>

        {/* Sample data table */}
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {mappedHeaders.map(({ canonical }) => (
                  <TableHead key={canonical} className="capitalize">
                    {canonical.replace('_', ' ')}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, idx) => {
                const hasEmail = emailHeader && row[emailHeader]?.trim();
                const hasPhone = phoneHeader && row[phoneHeader]?.trim();
                const isMissingIdentifier = !hasEmail && !hasPhone;

                return (
                  <TableRow
                    key={idx}
                    className={isMissingIdentifier ? 'bg-amber-50' : ''}
                  >
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {idx + 1}
                    </TableCell>
                    {mappedHeaders.map(({ canonical, csvHeader }) => (
                      <TableCell
                        key={canonical}
                        className="max-w-[200px] truncate text-sm"
                      >
                        {row[csvHeader] ?? ''}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {warningCount > 0 && (
          <p className="text-sm text-amber-700">
            {warningCount} row{warningCount > 1 ? 's' : ''} missing both email
            and phone will be rejected during execution.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Begin Upload</Button>
      </CardFooter>
    </Card>
  );
}
