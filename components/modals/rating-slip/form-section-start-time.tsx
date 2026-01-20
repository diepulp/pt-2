'use client';

import React, { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStartTimeField } from '@/hooks/ui';
import { cn } from '@/lib/utils';

/**
 * Calculates the time difference in minutes between two datetime strings.
 *
 * @param current - Current datetime-local string (YYYY-MM-DDTHH:mm)
 * @param original - Original datetime-local string (YYYY-MM-DDTHH:mm)
 * @returns Time difference in minutes (positive if current is later, negative if earlier)
 */
function calculateTimeDifference(current: string, original: string): number {
  if (!current || !original) return 0;

  const currentDate = new Date(current);
  const originalDate = new Date(original);

  // Return difference in minutes
  return Math.round(
    (currentDate.getTime() - originalDate.getTime()) / (1000 * 60),
  );
}

/**
 * Get current datetime in datetime-local format (YYYY-MM-DDTHH:mm).
 * Used for max attribute to prevent future times.
 */
function getCurrentDateTimeLocal(): string {
  const now = new Date();
  // Adjust for timezone offset to get local time in ISO format
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(now.getTime() - offsetMs);
  return localDate.toISOString().slice(0, 16);
}

/**
 * Validates the start time value.
 * Returns null if valid, or an error message string if invalid.
 */
function validateStartTime(value: string): string | null {
  if (!value) return null;

  const selectedTime = new Date(value);
  const now = new Date();

  if (selectedTime > now) {
    return 'Start time cannot be in the future';
  }

  return null;
}

/**
 * Start Time form section for Rating Slip Modal.
 * Uses native datetime-local input for reliable cross-browser time entry.
 *
 * React 19 Performance: Wrapped in React.memo to prevent parent re-renders
 * from triggering unnecessary reconciliation.
 *
 * PRD-019: Removed broken +15m/-15m increment buttons that had timezone
 * parsing issues causing incorrect time calculations.
 *
 * @returns Form section with datetime-local input and validation
 */
export const FormSectionStartTime = React.memo(function FormSectionStartTime() {
  const { value, originalValue, updateField, resetField } = useStartTimeField();

  // Calculate time difference for display
  const totalChange = calculateTimeDifference(value, originalValue);

  // Validation
  const validationError = useMemo(() => validateStartTime(value), [value]);
  const maxDateTime = useMemo(() => getCurrentDateTimeLocal(), []);

  // Event handlers - wrapped in useCallback for stable references
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('startTime', e.target.value);
    },
    [updateField],
  );

  const handleReset = React.useCallback(() => {
    resetField('startTime');
  }, [resetField]);

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="startTime" className="text-sm font-medium">
          Start Time
        </label>
        <Button onClick={handleReset} variant="outline" size="sm">
          Reset
        </Button>
      </div>
      <div className="mt-1">
        <Input
          id="startTime"
          type="datetime-local"
          value={value}
          onChange={handleChange}
          max={maxDateTime}
          className={cn(
            'h-12 text-lg text-center w-full',
            validationError &&
              'border-destructive focus-visible:ring-destructive',
          )}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'startTime-error' : undefined}
        />
      </div>
      {validationError && (
        <p id="startTime-error" className="text-sm mt-1 text-destructive">
          {validationError}
        </p>
      )}
      <div className="text-sm mt-1 text-muted-foreground">
        Total Change: {totalChange > 0 ? '+' : ''}
        {totalChange} minutes
      </div>
    </div>
  );
});
