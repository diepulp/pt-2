'use client';

/**
 * Baseline Coverage Banner (PRD-055 WS6)
 *
 * Shows a degraded-coverage summary when some tables lack baselines.
 * Only renders when withoutBaseline > 0.
 */

import { InfoIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BaselineCoverageDTO } from '@/services/shift-intelligence/dtos';

interface BaselineCoverageBannerProps {
  coverage: BaselineCoverageDTO;
}

export function BaselineCoverageBanner({
  coverage,
}: BaselineCoverageBannerProps) {
  if (coverage.withoutBaseline <= 0) return null;

  const total = coverage.withBaseline + coverage.withoutBaseline;

  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>Baseline Coverage</AlertTitle>
      <AlertDescription>
        {coverage.withBaseline}/{total} tables have baselines.{' '}
        {coverage.withoutBaseline} table
        {coverage.withoutBaseline === 1 ? '' : 's'}: insufficient data.
      </AlertDescription>
    </Alert>
  );
}
