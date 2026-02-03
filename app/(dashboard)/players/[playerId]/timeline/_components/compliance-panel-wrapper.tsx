/**
 * Compliance Panel Wrapper — Isolated subscription boundary
 *
 * Owns useAuth + useGamingDaySummary hooks.
 * Renders CompliancePanel with CTR status.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 */

'use client';

import * as React from 'react';

import {
  CompliancePanel,
  type CtrStatus,
} from '@/components/player-360/compliance/panel';
import { useGamingDaySummary } from '@/hooks/mtl';
import { useAuth } from '@/hooks/use-auth';

interface CompliancePanelWrapperProps {
  playerId: string;
  gamingDay: string;
}

export function CompliancePanelWrapper({
  playerId,
  gamingDay,
}: CompliancePanelWrapperProps) {
  const { casinoId } = useAuth();
  const { data: complianceData, isLoading: isComplianceLoading } =
    useGamingDaySummary({
      casinoId: casinoId ?? '',
      gamingDay,
      patronId: playerId,
    });

  // Transform compliance data to panel props
  const ctrStatus: CtrStatus | null = React.useMemo(() => {
    if (!complianceData?.items?.[0]) return null;
    const item = complianceData.items[0];
    return {
      todayTotal: (item.total_in ?? 0) + (item.total_out ?? 0),
      threshold: 10000,
      isTriggered:
        item.agg_badge_in === 'agg_ctr_met' ||
        item.agg_badge_out === 'agg_ctr_met',
      isFiled: false,
      gamingDay: item.gaming_day,
    };
  }, [complianceData]);

  return (
    <CompliancePanel
      ctrStatus={ctrStatus}
      mtlEntries={[]}
      isLoading={isComplianceLoading}
    />
  );
}
