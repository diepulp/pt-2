/**
 * Step 2: Column Mapping
 *
 * Shows auto-detected mappings and allows manual override via dropdowns.
 * Validates that at least one identifier (email or phone) is mapped.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { Alert } from '@/components/ui/alert';
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
import type { CanonicalField } from '@/lib/csv/column-auto-detect';

import { ColumnMappingRow } from './column-mapping-row';

interface StepColumnMappingProps {
  headers: string[];
  mappings: Record<string, string>;
  autoDetectedCount: number;
  isValid: boolean;
  onSetMapping: (canonicalField: CanonicalField, csvHeader: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepColumnMapping({
  headers,
  mappings,
  autoDetectedCount,
  isValid,
  onSetMapping,
  onNext,
  onBack,
}: StepColumnMappingProps) {
  // Invert mappings to get csvHeader → canonicalField
  const headerToCanonical = new Map<string, CanonicalField>();
  const usedFields = new Set<string>();

  for (const [canonical, csvHeader] of Object.entries(mappings)) {
    if (csvHeader) {
      headerToCanonical.set(csvHeader, canonical as CanonicalField);
      usedFields.add(canonical);
    }
  }

  function handleMap(csvHeader: string, field: CanonicalField | null) {
    // Remove previous mapping for this header
    const previousCanonical = headerToCanonical.get(csvHeader);
    if (previousCanonical) {
      onSetMapping(previousCanonical, '');
    }

    // Set new mapping
    if (field) {
      // Remove any other header mapped to this canonical field
      for (const [otherHeader, otherCanonical] of headerToCanonical.entries()) {
        if (otherCanonical === field && otherHeader !== csvHeader) {
          onSetMapping(field, '');
          break;
        }
      }
      onSetMapping(field, csvHeader);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Match CSV columns to player fields. At least email or phone is
              required.
            </CardDescription>
          </div>
          {autoDetectedCount > 0 && (
            <Badge variant="secondary">{autoDetectedCount} auto-detected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {headers.map((header) => (
          <ColumnMappingRow
            key={header}
            csvHeader={header}
            mappedField={headerToCanonical.get(header) ?? null}
            usedFields={usedFields}
            onMap={(field) => handleMap(header, field)}
          />
        ))}

        {!isValid && (
          <Alert variant="destructive" className="mt-4">
            At least one identifier (Email or Phone) must be mapped to proceed.
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!isValid}>
          Continue to Preview
        </Button>
      </CardFooter>
    </Card>
  );
}
