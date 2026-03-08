/**
 * Measurement Reports Dashboard
 *
 * Top-level client component for the measurement reports page.
 * Manages filter state and renders 4 metric widgets in a 2×2 grid.
 *
 * @see PRD-046 ADR-039 Measurement UI
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import { useState } from 'react';

import { useMeasurementSummary } from '@/hooks/measurement';
import type { MeasurementFilters } from '@/services/measurement';

import { AuditCorrelationWidget } from './audit-correlation-widget';
import { LoyaltyLiabilityWidget } from './loyalty-liability-widget';
import { MeasurementFilterBar } from './measurement-filter-bar';
import { RatingCoverageWidget } from './rating-coverage-widget';
import { TheoDiscrepancyWidget } from './theo-discrepancy-widget';

export function MeasurementReportsDashboard() {
  const [pitId, setPitId] = useState<string | undefined>();
  const [tableId, setTableId] = useState<string | undefined>();

  const filters: MeasurementFilters | undefined =
    pitId || tableId ? { pitId, tableId } : undefined;

  const { data, isLoading } = useMeasurementSummary(
    filters ? { pitId: filters.pitId, tableId: filters.tableId } : undefined,
  );

  const currentFilter = { pitId, tableId };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Measurement Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            ADR-039 measurement metrics — theo discrepancy, audit correlation,
            rating coverage, and loyalty liability
          </p>
        </div>
        <MeasurementFilterBar
          pitId={pitId}
          tableId={tableId}
          onPitChange={setPitId}
          onTableChange={setTableId}
        />
      </div>

      {/* 2×2 metric widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MEAS-001: Theo Discrepancy */}
        <TheoDiscrepancyWidget
          data={data?.theoDiscrepancy ?? null}
          error={data?.errors.theo_discrepancy}
          currentFilter={currentFilter}
          isLoading={isLoading}
        />

        {/* MEAS-002: Audit Correlation (casino-level only) */}
        <AuditCorrelationWidget
          data={data?.auditCorrelation ?? null}
          error={data?.errors.audit_correlation}
          currentFilter={currentFilter}
          isLoading={isLoading}
        />

        {/* MEAS-003: Rating Coverage */}
        <RatingCoverageWidget
          data={data?.ratingCoverage ?? null}
          error={data?.errors.rating_coverage}
          currentFilter={currentFilter}
          isLoading={isLoading}
        />

        {/* MEAS-004: Loyalty Liability (casino-level only) */}
        <LoyaltyLiabilityWidget
          data={data?.loyaltyLiability ?? null}
          error={data?.errors.loyalty_liability}
          currentFilter={currentFilter}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
