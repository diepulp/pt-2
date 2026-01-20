'use client';

import { LayoutGrid } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { EnrollPlayerModal } from '@/components/enrollment/enroll-player-modal';
import { TableLayoutTerminal } from '@/components/table';
import type { PitMapPit } from '@/components/table/pit-map-selector';
import { TableLimitsDialog } from '@/components/table/table-limits-dialog';
import {
  TableToolbar,
  TableToolbarCompact,
} from '@/components/table/table-toolbar';
import type { DashboardTableDTO } from '@/hooks/dashboard/types';
import {
  useTableSettings,
  useUpdateTableLimits,
} from '@/hooks/table-context/use-table-settings';
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';

interface SeatOccupant {
  firstName: string;
  lastName: string;
  slipId?: string;
}

interface TablesPanelProps {
  // Data
  tableName: string;
  selectedTable: DashboardTableDTO | null;
  seats: (SeatOccupant | null)[];
  activeSlips: RatingSlipDTO[];
  isLoading: boolean;
  /** Casino ID for enrollment */
  casinoId: string;

  // Pit navigation
  pits?: PitMapPit[];
  selectedPitId?: string | null;
  onSelectTable?: (tableId: string, pitId: string) => void;
  onSelectPit?: (pitId: string) => void;

  // Callbacks
  onSeatClick: (index: number, occupant: SeatOccupant | null) => void;
  onNewSlip: () => void;
}

/**
 * Tables Panel - Table layout visualization with seat management
 * Displays real-time table data with PT-2 dark industrial design
 */
export function TablesPanel({
  tableName,
  selectedTable,
  seats,
  activeSlips,
  isLoading,
  casinoId,
  pits,
  selectedPitId,
  onSelectTable,
  onSelectPit,
  onSeatClick,
  onNewSlip,
}: TablesPanelProps) {
  // Get last activity time for header context
  const lastActivity = React.useMemo(() => {
    if (activeSlips.length === 0) return 'No activity';

    const latest = activeSlips.reduce((latest, slip) => {
      const slipTime = new Date(slip.start_time).getTime();
      return slipTime > latest ? slipTime : latest;
    }, 0);

    return new Date(latest).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }, [activeSlips]);

  // Table limits state and hooks
  const [limitsDialogOpen, setLimitsDialogOpen] = React.useState(false);
  // Enroll player modal state
  const [enrollModalOpen, setEnrollModalOpen] = React.useState(false);
  const tableId = selectedTable?.id ?? '';
  const { data: tableSettings } = useTableSettings(tableId);
  const { mutateAsync: updateLimits, isPending: isUpdatingLimits } =
    useUpdateTableLimits(tableId);

  const handleSaveLimits = React.useCallback(
    async (minBet: number, maxBet: number) => {
      try {
        await updateLimits({ min_bet: minBet, max_bet: maxBet });
        toast.success('Table limits updated');
        setLimitsDialogOpen(false);
      } catch {
        toast.error('Failed to update limits');
      }
    },
    [updateLimits],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/20">
              <LayoutGrid className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Table Layout
              </h2>
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col p-3 gap-3">
          <div className="h-20 animate-pulse rounded-lg bg-muted/50 shrink-0" />
          <div className="flex-1 animate-pulse rounded-lg bg-muted/50" />
        </div>
      </div>
    );
  }

  if (!selectedTable) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-sm font-medium text-muted-foreground">
          Select a table to view layout
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel Header - Minimal, table identity only */}
      <div className="flex items-center px-3 py-2 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <LayoutGrid className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {tableName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Last: {lastActivity}
            </p>
          </div>
        </div>
      </div>

      {/* Panel Content - No scroll, flex layout */}
      <div className="flex-1 flex flex-col p-2 sm:p-3 gap-2 sm:gap-3 min-h-0">
        {/* Loop-Centric Toolbar - Replaces redundant stat badges */}
        {/* Responsive: Compact on mobile, full on desktop */}
        <div className="shrink-0">
          <TableToolbar
            tableId={selectedTable.id}
            tableStatus={selectedTable.status}
            onNewSlip={onNewSlip}
            onEditLimits={() => setLimitsDialogOpen(true)}
            onEnrollPlayer={() => setEnrollModalOpen(true)}
            pits={pits}
            selectedPitId={selectedPitId}
            selectedTableId={selectedTable.id}
            onSelectTable={onSelectTable}
            onSelectPit={onSelectPit}
            className="hidden sm:flex"
          />
          <TableToolbarCompact
            tableId={selectedTable.id}
            tableStatus={selectedTable.status}
            onNewSlip={onNewSlip}
            onEditLimits={() => setLimitsDialogOpen(true)}
            onEnrollPlayer={() => setEnrollModalOpen(true)}
            pits={pits}
            selectedPitId={selectedPitId}
            selectedTableId={selectedTable.id}
            onSelectTable={onSelectTable}
            onSelectPit={onSelectPit}
            className="flex sm:hidden"
          />
        </div>

        {/* Table Layout - Fills remaining space */}
        <div className="flex-1 relative overflow-hidden rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm flex flex-col min-h-0">
          {/* Section Header - Compact, responsive */}

          {/* Table Terminal - Centered, responsive padding */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-3 bg-gradient-to-b from-background/50 to-background/80 min-h-0">
            <TableLayoutTerminal
              seats={seats}
              dealerName={undefined}
              tableId={selectedTable.label}
              gameType={selectedTable.type}
              tableStatus={selectedTable.status}
              activeSlipsCount={selectedTable.activeSlipsCount}
              minBet={tableSettings?.min_bet}
              maxBet={tableSettings?.max_bet}
              onEditLimits={() => setLimitsDialogOpen(true)}
              variant="full"
              onSeatClick={onSeatClick}
            />
          </div>
        </div>
      </div>

      {/* Table Limits Dialog */}
      <TableLimitsDialog
        open={limitsDialogOpen}
        onOpenChange={setLimitsDialogOpen}
        currentMinBet={tableSettings?.min_bet ?? 0}
        currentMaxBet={tableSettings?.max_bet ?? 0}
        onSave={handleSaveLimits}
        isLoading={isUpdatingLimits}
      />

      {/* Enroll Player Modal */}
      <EnrollPlayerModal
        open={enrollModalOpen}
        onOpenChange={setEnrollModalOpen}
        casinoId={casinoId}
        tableId={selectedTable.id}
      />
    </div>
  );
}
