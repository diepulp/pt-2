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

import { BarChart3 } from 'lucide-react';
import { useState } from 'react';

import { Separator } from '@/components/ui/separator';
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
    <div className="flex flex-1 flex-col">
      {/* Header — matches SettingsContentSection exemplar */}
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-6 w-6 text-accent" />
            <h3
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Reports
            </h3>
          </div>
          <MeasurementFilterBar
            pitId={pitId}
            tableId={tableId}
            onPitChange={setPitId}
            onTableChange={setTableId}
          />
        </div>
        <p className="mt-1 pl-[34px] text-base text-muted-foreground">
          Measurement metrics — theo discrepancy, audit correlation, rating
          coverage, and loyalty liability.
        </p>
      </div>
      <Separator className="my-4 flex-none" />

      {/* 2×2 metric widget grid */}
      <div className="w-full overflow-y-auto pe-4 pb-4">
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
    </div>
  );
}
