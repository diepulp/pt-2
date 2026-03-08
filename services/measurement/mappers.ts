/**
 * MeasurementService Mappers
 *
 * Pure row-to-DTO transformation functions for ADR-039 metrics.
 * Handle null/missing columns gracefully (view columns are nullable).
 *
 * @see EXEC-046 WS1 — Service Layer
 */

import type {
  TheoDiscrepancyDto,
  TheoDiscrepancyBreakdownRow,
  AuditCorrelationDto,
  RatingCoverageDto,
  RatingCoverageBreakdownRow,
  LoyaltyLiabilityDto,
} from './dtos';
import type {
  TheoDiscrepancyQueryResult,
  AuditCorrelationQueryResult,
  RatingCoverageQueryResult,
  LoyaltyLiabilityQueryResult,
} from './queries';

// === MEAS-001: Theo Discrepancy ===

/**
 * Map rating_slip rows to TheoDiscrepancyDto.
 * Formula: ABS(computed - legacy) / NULLIF(legacy, 0)
 */
export function mapTheoDiscrepancyRows(
  result: TheoDiscrepancyQueryResult,
  hasFilter: boolean,
): TheoDiscrepancyDto {
  const rows = result.rows;
  const totalSlips = rows.length;

  let discrepantSlips = 0;
  let totalDiscrepancyCents = 0;
  let sumDiscrepancyPercent = 0;
  let discrepancyPercentCount = 0;

  // Group by table_id for breakdown when filtered
  const tableGroups = new Map<
    string,
    {
      slipCount: number;
      discrepantCount: number;
      totalDiscrepancyCents: number;
    }
  >();

  for (const row of rows) {
    const computed = row.computed_theo_cents ?? 0;
    const legacy = row.legacy_theo_cents ?? 0;
    const absDiff = Math.abs(computed - legacy);

    if (absDiff > 0) {
      discrepantSlips++;
      totalDiscrepancyCents += absDiff;

      if (legacy !== 0) {
        sumDiscrepancyPercent += absDiff / Math.abs(legacy);
        discrepancyPercentCount++;
      }
    }

    if (hasFilter) {
      const tableId = row.table_id;
      const group = tableGroups.get(tableId) ?? {
        slipCount: 0,
        discrepantCount: 0,
        totalDiscrepancyCents: 0,
      };
      group.slipCount++;
      if (absDiff > 0) {
        group.discrepantCount++;
        group.totalDiscrepancyCents += absDiff;
      }
      tableGroups.set(tableId, group);
    }
  }

  const discrepancyRate = totalSlips > 0 ? discrepantSlips / totalSlips : 0;
  const avgDiscrepancyPercent =
    discrepancyPercentCount > 0
      ? sumDiscrepancyPercent / discrepancyPercentCount
      : 0;

  let breakdown: TheoDiscrepancyBreakdownRow[] | null = null;
  if (hasFilter && tableGroups.size > 0) {
    breakdown = Array.from(tableGroups.entries()).map(
      ([tableId, group]): TheoDiscrepancyBreakdownRow => ({
        groupName: tableId,
        slipCount: group.slipCount,
        discrepantCount: group.discrepantCount,
        discrepancyRate:
          group.slipCount > 0 ? group.discrepantCount / group.slipCount : 0,
        totalDiscrepancyCents: group.totalDiscrepancyCents,
      }),
    );
  }

  return {
    totalSlips,
    discrepantSlips,
    discrepancyRate,
    totalDiscrepancyCents,
    avgDiscrepancyPercent,
    breakdown,
    supportedDimensions: ['pit', 'table'],
  };
}

// === MEAS-002: Audit Correlation ===

/**
 * Map audit correlation view rows to AuditCorrelationDto.
 * CRITICAL: Uses DISTINCT counting to handle Cartesian fan-out.
 */
export function mapAuditCorrelationRows(
  result: AuditCorrelationQueryResult,
): AuditCorrelationDto {
  const rows = result.rows;

  // Use Sets for DISTINCT counting (Cartesian fan-out mitigation)
  const slipIds = new Set<string>();
  const pftIds = new Set<string>();
  const mtlIds = new Set<string>();
  const loyaltyIds = new Set<string>();

  // Track which slips have all three artifact types
  const slipHasPft = new Set<string>();
  const slipHasMtl = new Set<string>();
  const slipHasLoyalty = new Set<string>();

  for (const row of rows) {
    const slipId = row.rating_slip_id;
    if (slipId) {
      slipIds.add(slipId);

      if (row.pft_id) {
        pftIds.add(row.pft_id);
        slipHasPft.add(slipId);
      }
      if (row.mtl_entry_id) {
        mtlIds.add(row.mtl_entry_id);
        slipHasMtl.add(slipId);
      }
      if (row.loyalty_ledger_id) {
        loyaltyIds.add(row.loyalty_ledger_id);
        slipHasLoyalty.add(slipId);
      }
    }
  }

  const totalSlips = slipIds.size;

  // Full chain = slip has at least one PFT AND MTL AND loyalty entry
  let fullChainCount = 0;
  for (const slipId of slipIds) {
    if (
      slipHasPft.has(slipId) &&
      slipHasMtl.has(slipId) &&
      slipHasLoyalty.has(slipId)
    ) {
      fullChainCount++;
    }
  }

  return {
    totalSlips,
    slipsWithPft: slipHasPft.size,
    slipsWithMtl: slipHasMtl.size,
    slipsWithLoyalty: slipHasLoyalty.size,
    fullChainCount,
    fullChainRate: totalSlips > 0 ? fullChainCount / totalSlips : 0,
    supportedDimensions: [],
  };
}

// === MEAS-003: Rating Coverage ===

/**
 * Map rating coverage view rows to RatingCoverageDto.
 */
export function mapRatingCoverageRows(
  result: RatingCoverageQueryResult,
  hasFilter: boolean,
): RatingCoverageDto {
  const rows = result.rows;
  const totalSessions = rows.length;

  let sumCoverageRatio = 0;
  let coverageCount = 0;
  let totalRatedSeconds = 0;
  let totalOpenSeconds = 0;
  let totalUntrackedSeconds = 0;

  // Group by gaming_table_id for breakdown when filtered
  const tableGroups = new Map<
    string,
    {
      sessionCount: number;
      sumRatio: number;
      ratioCount: number;
      ratedSeconds: number;
      openSeconds: number;
    }
  >();

  for (const row of rows) {
    const ratio = row.rated_ratio ?? 0;
    const rated = row.rated_seconds ?? 0;
    const open = row.open_seconds ?? 0;
    const untracked = row.untracked_seconds ?? 0;

    sumCoverageRatio += ratio;
    coverageCount++;
    totalRatedSeconds += rated;
    totalOpenSeconds += open;
    totalUntrackedSeconds += untracked;

    if (hasFilter && row.gaming_table_id) {
      const tableId = row.gaming_table_id;
      const group = tableGroups.get(tableId) ?? {
        sessionCount: 0,
        sumRatio: 0,
        ratioCount: 0,
        ratedSeconds: 0,
        openSeconds: 0,
      };
      group.sessionCount++;
      group.sumRatio += ratio;
      group.ratioCount++;
      group.ratedSeconds += rated;
      group.openSeconds += open;
      tableGroups.set(tableId, group);
    }
  }

  const avgCoverageRatio =
    coverageCount > 0 ? sumCoverageRatio / coverageCount : 0;

  let breakdown: RatingCoverageBreakdownRow[] | null = null;
  if (hasFilter && tableGroups.size > 0) {
    breakdown = Array.from(tableGroups.entries()).map(
      ([tableId, group]): RatingCoverageBreakdownRow => ({
        groupName: tableId,
        sessionCount: group.sessionCount,
        avgCoverageRatio:
          group.ratioCount > 0 ? group.sumRatio / group.ratioCount : 0,
        ratedSeconds: group.ratedSeconds,
        openSeconds: group.openSeconds,
      }),
    );
  }

  return {
    totalSessions,
    avgCoverageRatio,
    ratedSeconds: totalRatedSeconds,
    openSeconds: totalOpenSeconds,
    untrackedSeconds: totalUntrackedSeconds,
    breakdown,
    supportedDimensions: ['pit', 'table'],
  };
}

// === MEAS-004: Loyalty Liability ===

/**
 * Map loyalty snapshot + policy to LoyaltyLiabilityDto.
 * Returns null if no snapshot exists (valid initial state).
 */
export function mapLoyaltyLiabilityRow(
  result: LoyaltyLiabilityQueryResult,
): LoyaltyLiabilityDto | null {
  const { snapshot, policy } = result;

  if (!snapshot) {
    return null;
  }

  return {
    totalOutstandingPoints: snapshot.total_outstanding_points,
    estimatedMonetaryValueCents: snapshot.estimated_monetary_value_cents,
    centsPerPoint: policy?.cents_per_point ?? null,
    playerCount: snapshot.player_count,
    snapshotDate: snapshot.snapshot_date,
    supportedDimensions: [],
  };
}
