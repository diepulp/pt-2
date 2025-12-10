/**
 * Pit Dashboard Client Component
 *
 * Client-side wrapper for the pit dashboard that manages:
 * - Table selection state
 * - Real-time data fetching via React Query hooks
 * - Interactive table grid and expanded view
 * - Active slips panel with lifecycle actions
 * - New slip creation modal
 *
 * Design: Brutalist layout with exposed structure, high contrast.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS2, WS4, WS5
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { TableLayoutTerminal } from "@/components/table/table-layout-terminal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDashboardTables,
  useDashboardStats,
  useActiveSlipsForDashboard,
  useDashboardRealtime,
  RealtimeStatusIndicator,
  dashboardKeys,
} from "@/hooks/dashboard";
import { useGamingDay } from "@/hooks/use-casino";
import {
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
} from "@/services/rating-slip/http";

import { ActiveSlipsPanel } from "./active-slips-panel";
import { NewSlipModal } from "./new-slip-modal";
import { getOccupiedSeats, mapSlipsToOccupants } from "./seat-context-menu";
import { StatsBar } from "./stats-bar";
import { TableGrid } from "./table-grid";

interface PitDashboardClientProps {
  /** Casino ID from server context */
  casinoId: string;
}

export function PitDashboardClient({ casinoId }: PitDashboardClientProps) {
  const queryClient = useQueryClient();

  // State: Selected table ID
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(
    null,
  );

  // State: New slip modal
  const [newSlipModalOpen, setNewSlipModalOpen] = React.useState(false);
  const [newSlipSeatNumber, setNewSlipSeatNumber] = React.useState<
    string | undefined
  >();

  // Query: Dashboard tables with active slips count
  const {
    data: tables = [],
    isLoading: tablesLoading,
    error: tablesError,
  } = useDashboardTables(casinoId);

  // Query: Dashboard aggregate stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useDashboardStats(casinoId);

  // Query: Gaming day
  const { data: gamingDay } = useGamingDay(casinoId);

  // Query: Active slips for selected table
  const { data: activeSlips = [] } = useActiveSlipsForDashboard(
    selectedTableId ?? undefined,
  );

  // Realtime subscriptions (WS5)
  const { isConnected: realtimeConnected, error: realtimeError } =
    useDashboardRealtime({
      casinoId,
      selectedTableId,
      enabled: true,
    });

  // Mutations for slip actions
  const pauseMutation = useMutation({
    mutationFn: pauseRatingSlip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeRatingSlip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (slipId: string) => closeRatingSlip(slipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
    },
  });

  // Auto-select first active table if none selected
  React.useEffect(() => {
    if (!selectedTableId && tables.length > 0) {
      const firstActive = tables.find((t) => t.status === "active");
      if (firstActive) {
        setSelectedTableId(firstActive.id);
      } else {
        // Fallback to first table if no active tables
        setSelectedTableId(tables[0].id);
      }
    }
  }, [tables, selectedTableId]);

  // Get selected table details
  const selectedTable = React.useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId],
  );

  // Map slips to seat occupants
  const seatOccupants = React.useMemo(
    () => mapSlipsToOccupants(activeSlips),
    [activeSlips],
  );

  // Get occupied seat numbers
  const occupiedSeats = React.useMemo(
    () => getOccupiedSeats(activeSlips),
    [activeSlips],
  );

  // Build seats array with occupancy data
  const seats = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const seatNumber = String(i + 1);
      const occupant = seatOccupants.get(seatNumber);
      return occupant ?? null;
    });
  }, [seatOccupants]);

  // Handle seat click - open new slip modal or show context menu
  const handleSeatClick = (
    index: number,
    occupant: { firstName: string; lastName: string } | null,
  ) => {
    const seatNumber = String(index + 1);

    if (occupant) {
      // Seat is occupied - find the slip for this seat
      const slipOccupant = seatOccupants.get(seatNumber);
      if (slipOccupant?.slipId) {
        // For occupied seats, we could show a context menu
        // For MVP, let's handle through the active slips panel
      }
    } else {
      // Seat is empty - open new slip modal
      setNewSlipSeatNumber(seatNumber);
      setNewSlipModalOpen(true);
    }
  };

  // Handle opening new slip modal (from panel button)
  const handleNewSlip = () => {
    setNewSlipSeatNumber(undefined);
    setNewSlipModalOpen(true);
  };

  // Handle errors
  if (tablesError || statsError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-destructive/50 bg-destructive/10 p-12">
        <div
          className="text-sm font-bold uppercase tracking-widest text-destructive"
          style={{ fontFamily: "monospace" }}
        >
          Error Loading Dashboard
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tablesError?.message || statsError?.message || "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar with Realtime Indicator */}
      <div className="relative">
        <StatsBar
          activeTablesCount={stats?.activeTablesCount ?? 0}
          openSlipsCount={stats?.openSlipsCount ?? 0}
          checkedInPlayersCount={stats?.checkedInPlayersCount ?? 0}
          gamingDay={gamingDay ?? null}
          isLoading={statsLoading}
        />
        {/* Realtime status indicator */}
        <div className="absolute right-0 top-0 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Live
          </span>
          <RealtimeStatusIndicator
            isConnected={realtimeConnected}
            error={realtimeError}
          />
        </div>
      </div>

      {/* Main content grid: Selected table + Active slips panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Selected Table Expanded View - 2/3 width on large screens */}
        <div className="lg:col-span-2">
          {selectedTable ? (
            <Card className="border-2 border-accent/50 bg-accent/5">
              <CardHeader>
                <CardTitle
                  className="text-base font-bold uppercase tracking-widest"
                  style={{ fontFamily: "monospace" }}
                >
                  Table {selectedTable.label} — {selectedTable.type}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TableLayoutTerminal
                  seats={seats}
                  variant="full"
                  tableId={selectedTable.label}
                  gameType={selectedTable.type}
                  tableStatus={selectedTable.status}
                  activeSlipsCount={selectedTable.activeSlipsCount}
                  isSelected={true}
                  dealerName={undefined} // TODO: Get dealer name from staff record
                  onSeatClick={handleSeatClick}
                  onTableAction={(action) => {
                    // TODO: Handle table open/close actions
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2 border-dashed border-border/50 bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: "monospace" }}
                >
                  No Table Selected
                </div>
                <p className="mt-2 text-xs text-muted-foreground/70">
                  Select a table from the grid below
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Active Slips Panel - 1/3 width on large screens */}
        <div className="lg:col-span-1">
          <ActiveSlipsPanel
            tableId={selectedTableId ?? undefined}
            casinoId={casinoId}
            onNewSlip={handleNewSlip}
          />
        </div>
      </div>

      {/* Table Grid */}
      <TableGrid
        tables={tables}
        selectedTableId={selectedTableId}
        onTableSelect={setSelectedTableId}
        isLoading={tablesLoading}
      />

      {/* New Slip Modal */}
      {selectedTableId && (
        <NewSlipModal
          open={newSlipModalOpen}
          onOpenChange={setNewSlipModalOpen}
          tableId={selectedTableId}
          casinoId={casinoId}
          initialSeatNumber={newSlipSeatNumber}
          occupiedSeats={occupiedSeats}
        />
      )}
    </div>
  );
}
