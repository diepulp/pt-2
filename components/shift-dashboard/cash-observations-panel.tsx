/**
 * Cash Observations Panel
 *
 * Displays cash observation telemetry data with clear visual distinction.
 * TELEMETRY-ONLY: These are observational metrics, NOT authoritative.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.2
 */

'use client';

import { EyeIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsTableRollupDTO,
} from '@/services/table-context/dtos';

export interface CashObservationsPanelProps {
  casinoData?: CashObsCasinoRollupDTO;
  pitsData?: CashObsPitRollupDTO[];
  tablesData?: CashObsTableRollupDTO[];
  isLoading?: boolean;
  view?: 'casino' | 'pit' | 'table';
}

/**
 * Format cents to currency string.
 */
function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Format timestamp to relative time.
 */
function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Casino-level summary card for telemetry.
 */
function CasinoSummary({
  data,
  isLoading,
}: {
  data?: CashObsCasinoRollupDTO;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">No casino observations</p>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      <div>
        <p className="text-xs text-muted-foreground">Estimated Total</p>
        <p className="text-xl font-semibold font-mono tabular-nums text-amber-600">
          {formatCurrency(data.cash_out_observed_estimate_total)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Confirmed Total</p>
        <p className="text-xl font-semibold font-mono tabular-nums text-amber-600">
          {formatCurrency(data.cash_out_observed_confirmed_total)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Observations</p>
        <p className="text-xl font-semibold font-mono tabular-nums">
          {data.cash_out_observation_count}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Last: {formatRelativeTime(data.cash_out_last_observed_at)}
        </p>
      </div>
    </div>
  );
}

/**
 * Pit-level observations table.
 */
function PitsTable({
  data,
  isLoading,
}: {
  data?: CashObsPitRollupDTO[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Pit</TableHead>
            <TableHead className="text-xs text-right">Estimated</TableHead>
            <TableHead className="text-xs text-right">Confirmed</TableHead>
            <TableHead className="text-xs text-right">Count</TableHead>
            <TableHead className="text-xs">Last</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No pit observations</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Pit</TableHead>
          <TableHead className="text-xs text-right">Estimated</TableHead>
          <TableHead className="text-xs text-right">Confirmed</TableHead>
          <TableHead className="text-xs text-right">Count</TableHead>
          <TableHead className="text-xs">Last</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((pit) => (
          <TableRow key={pit.pit}>
            <TableCell className="font-medium">{pit.pit}</TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600">
              {formatCurrency(pit.cash_out_observed_estimate_total)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600">
              {formatCurrency(pit.cash_out_observed_confirmed_total)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs">
              {pit.cash_out_observation_count}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {formatRelativeTime(pit.cash_out_last_observed_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Table-level observations table.
 */
function TablesTable({
  data,
  isLoading,
}: {
  data?: CashObsTableRollupDTO[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Table</TableHead>
            <TableHead className="text-xs">Pit</TableHead>
            <TableHead className="text-xs text-right">Estimated</TableHead>
            <TableHead className="text-xs text-right">Confirmed</TableHead>
            <TableHead className="text-xs text-right">Count</TableHead>
            <TableHead className="text-xs">Last</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No table observations</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Table</TableHead>
          <TableHead className="text-xs">Pit</TableHead>
          <TableHead className="text-xs text-right">Estimated</TableHead>
          <TableHead className="text-xs text-right">Confirmed</TableHead>
          <TableHead className="text-xs text-right">Count</TableHead>
          <TableHead className="text-xs">Last</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((table) => (
          <TableRow key={table.table_id}>
            <TableCell className="font-medium">{table.table_label}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {table.pit ?? '—'}
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600">
              {formatCurrency(table.cash_out_observed_estimate_total)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600">
              {formatCurrency(table.cash_out_observed_confirmed_total)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs">
              {table.cash_out_observation_count}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {formatRelativeTime(table.cash_out_last_observed_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CashObservationsPanel({
  casinoData,
  pitsData,
  tablesData,
  isLoading,
  view = 'casino',
}: CashObservationsPanelProps) {
  return (
    <Card className="border-dashed border-amber-500/30 bg-amber-50/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">
              Cash Observations
            </CardTitle>
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 text-[10px]"
            >
              TELEMETRY
            </Badge>
          </div>
          <span className="text-[10px] text-amber-600/70 uppercase tracking-wider">
            Observational Only
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'casino' && (
          <CasinoSummary data={casinoData} isLoading={isLoading} />
        )}
        {view === 'pit' && <PitsTable data={pitsData} isLoading={isLoading} />}
        {view === 'table' && (
          <TablesTable data={tablesData} isLoading={isLoading} />
        )}
      </CardContent>
    </Card>
  );
}
