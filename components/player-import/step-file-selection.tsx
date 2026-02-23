/**
 * Step 1: File Selection
 *
 * Drag-and-drop file picker with 10MB / 10K row validation.
 * Triggers Papa Parse on file selection.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_ROWS = 10_000;

interface StepFileSelectionProps {
  onFileAccepted: (file: File) => void;
  onNext: () => void;
  vendorLabel: string;
  onVendorLabelChange: (label: string) => void;
  parsedRowCount: number | null;
  isParsing: boolean;
}

export function StepFileSelection({
  onFileAccepted,
  onNext,
  vendorLabel,
  onVendorLabelChange,
  parsedRowCount,
  isParsing,
}: StepFileSelectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function validateAndAccept(file: File) {
    setError(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
      return;
    }

    setSelectedFile(file);
    onFileAccepted(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndAccept(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndAccept(file);
  }

  const rowCountError =
    parsedRowCount !== null && parsedRowCount > MAX_ROWS
      ? `File has ${parsedRowCount.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select CSV File</CardTitle>
          <CardDescription>
            Upload a vendor CSV export containing player data. Maximum{' '}
            {MAX_FILE_SIZE_MB}MB and {MAX_ROWS.toLocaleString()} rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Vendor label */}
          <div className="space-y-2">
            <Label htmlFor="vendor-label">Vendor Label (optional)</Label>
            <Input
              id="vendor-label"
              placeholder="e.g. Konami, IGT, Scientific Games"
              value={vendorLabel}
              onChange={(e) => onVendorLabelChange(e.target.value)}
              maxLength={255}
            />
          </div>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {selectedFile ? (
                  <>
                    <span className="font-medium text-foreground">
                      {selectedFile.name}
                    </span>{' '}
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </>
                ) : (
                  <>
                    Drag and drop a CSV file here, or{' '}
                    <span className="text-primary font-medium underline">
                      browse
                    </span>
                  </>
                )}
              </p>
              {isParsing && (
                <p className="text-muted-foreground mt-2 text-xs animate-pulse">
                  Parsing file...
                </p>
              )}
              {parsedRowCount !== null && !isParsing && (
                <p className="text-muted-foreground mt-2 text-xs">
                  {parsedRowCount.toLocaleString()} rows detected
                </p>
              )}
            </div>
          </div>

          {/* Errors */}
          {(error ?? rowCountError) && (
            <p className="text-sm text-red-600">{error ?? rowCountError}</p>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={onNext}
            disabled={
              !selectedFile ||
              isParsing ||
              parsedRowCount === null ||
              parsedRowCount === 0 ||
              parsedRowCount > MAX_ROWS ||
              !!error
            }
          >
            Continue to Mapping
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
