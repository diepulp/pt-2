/**
 * Exceptions & Approvals Data Hook
 *
 * Orchestrates data for the three tabs:
 * - Alerts: cash obs spike alerts + shift metrics exception flags
 * - Approvals: pending (unconfirmed) fills and credits
 * - Flags: tables with no telemetry coverage
 *
 * Composes existing hooks (useCashObsSummary, useShiftTableMetrics)
 * plus one direct Supabase query for pending fills/credits.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useCashObsSummary } from '@/hooks/shift-dashboard/use-cash-obs-summary';
import { useShiftTableMetrics } from '@/hooks/shift-dashboard/use-shift-table-metrics';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';
import type { ShiftTableMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

import { dashboardKeys } from './keys';

// === Types ===

export interface AlertItem {
  id: string;
  type: 'spike' | 'snapshot';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  time: string | null;
}

export interface ApprovalItem {
  id: string;
  type: 'fill' | 'credit';
  tableName: string;
  amountCents: number;
  createdAt: string;
}

export interface FlagItem {
  id: string;
  type: 'no_telemetry';
  title: string;
  description: string;
  tableLabel: string;
}

export interface ExceptionsData {
  alerts: AlertItem[];
  approvals: ApprovalItem[];
  flags: FlagItem[];
  isLoading: boolean;
}

// === Time Window ===

function getDefaultShiftWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

// === Derivation ===

function deriveAlerts(
  spikeAlerts: CashObsSpikeAlertDTO[],
  shiftTables: ShiftTableMetricsDTO[],
): AlertItem[] {
  const items: AlertItem[] = [];

  for (const alert of spikeAlerts) {
    items.push({
      id: `spike-${alert.entity_id}`,
      type: 'spike',
      severity:
        alert.severity === 'critical'
          ? 'high'
          : alert.severity === 'warn'
            ? 'medium'
            : 'low',
      title: `Cash Spike — ${alert.entity_label}`,
      description: alert.message,
      time: null,
    });
  }

  for (const table of shiftTables) {
    if (table.missing_opening_snapshot) {
      items.push({
        id: `snap-open-${table.table_id}`,
        type: 'snapshot',
        severity: 'medium',
        title: 'Missing Opening Snapshot',
        description: `${table.table_label} has no opening inventory count`,
        time: table.window_start,
      });
    }
    if (table.missing_closing_snapshot) {
      items.push({
        id: `snap-close-${table.table_id}`,
        type: 'snapshot',
        severity: 'low',
        title: 'Missing Closing Snapshot',
        description: `${table.table_label} has no closing inventory count`,
        time: table.window_end,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);

  return items;
}

function deriveFlags(shiftTables: ShiftTableMetricsDTO[]): FlagItem[] {
  const items: FlagItem[] = [];

  for (const table of shiftTables) {
    if (table.telemetry_quality === 'NONE') {
      items.push({
        id: `telem-${table.table_id}`,
        type: 'no_telemetry',
        title: 'No Telemetry Coverage',
        description: `${table.table_label} has zero cash observations this shift`,
        tableLabel: table.table_label,
      });
    }
  }

  return items;
}

// === Hook ===

/**
 * Orchestrates all data for the Exceptions & Approvals panel.
 *
 * @param casinoId - Casino UUID (undefined disables all queries)
 */
export function useExceptionsData(
  casinoId: string | undefined,
): ExceptionsData {
  const shiftWindow = getDefaultShiftWindow();

  const { data: cashObs, isLoading: cashObsLoading } = useCashObsSummary({
    window: shiftWindow,
    enabled: !!casinoId,
  });

  const { data: shiftTables, isLoading: shiftLoading } = useShiftTableMetrics({
    window: shiftWindow,
    enabled: !!casinoId,
  });

  const { data: approvals, isLoading: approvalsLoading } = useQuery({
    queryKey: dashboardKeys.pendingFillsCredits(casinoId!),
    queryFn: async (): Promise<ApprovalItem[]> => {
      const supabase = createBrowserComponentClient();

      const { data: fills, error: fillsErr } = await supabase
        .from('table_fill')
        .select(
          'id, amount_cents, created_at, table_id, gaming_table!inner(name)',
        )
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(20);

      if (fillsErr) throw fillsErr;

      const { data: credits, error: creditsErr } = await supabase
        .from('table_credit')
        .select(
          'id, amount_cents, created_at, table_id, gaming_table!inner(name)',
        )
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(20);

      if (creditsErr) throw creditsErr;

      const items: ApprovalItem[] = [];

      for (const f of fills ?? []) {
        const tableName =
          (f.gaming_table as unknown as { name: string })?.name ?? 'Unknown';
        items.push({
          id: f.id,
          type: 'fill',
          tableName,
          amountCents: f.amount_cents,
          createdAt: f.created_at,
        });
      }

      for (const c of credits ?? []) {
        const tableName =
          (c.gaming_table as unknown as { name: string })?.name ?? 'Unknown';
        items.push({
          id: c.id,
          type: 'credit',
          tableName,
          amountCents: c.amount_cents,
          createdAt: c.created_at,
        });
      }

      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return items;
    },
    enabled: !!casinoId,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const isLoading = cashObsLoading || shiftLoading || approvalsLoading;

  return {
    alerts: deriveAlerts(cashObs?.alerts ?? [], shiftTables ?? []),
    approvals: approvals ?? [],
    flags: deriveFlags(shiftTables ?? []),
    isLoading,
  };
}
