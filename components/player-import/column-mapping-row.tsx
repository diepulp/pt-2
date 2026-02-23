/**
 * Column Mapping Row
 *
 * Single row in the column mapping UI: shows a CSV header on the left
 * and a dropdown to select the canonical field on the right.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CANONICAL_FIELDS,
  CANONICAL_FIELD_LABELS,
  type CanonicalField,
} from '@/lib/csv/column-auto-detect';

interface ColumnMappingRowProps {
  csvHeader: string;
  mappedField: CanonicalField | null;
  usedFields: Set<string>;
  onMap: (canonicalField: CanonicalField | null) => void;
}

export function ColumnMappingRow({
  csvHeader,
  mappedField,
  usedFields,
  onMap,
}: ColumnMappingRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code className="truncate rounded bg-muted px-2 py-0.5 text-sm font-medium">
          {csvHeader}
        </code>
        {mappedField && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            auto
          </Badge>
        )}
      </div>

      <div className="text-muted-foreground shrink-0 px-2 text-sm">→</div>

      <Select
        value={mappedField ?? '__unmapped__'}
        onValueChange={(value) => {
          onMap(value === '__unmapped__' ? null : (value as CanonicalField));
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Skip (unmapped)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unmapped__">Skip (unmapped)</SelectItem>
          {CANONICAL_FIELDS.map((field) => {
            const isUsed = usedFields.has(field) && field !== mappedField;
            return (
              <SelectItem key={field} value={field} disabled={isUsed}>
                {CANONICAL_FIELD_LABELS[field]}
                {isUsed ? ' (in use)' : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
