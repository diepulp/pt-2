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

import {
  RatingSlipModal,
  type FormState,
} from "@/components/modals/rating-slip/rating-slip-modal";
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
import {
  useSaveWithBuyIn,
  useCloseWithFinancial,
  useMovePlayer,
  useRatingSlipModalData,
} from "@/hooks/rating-slip-modal";
import { useModal, usePitDashboardUI } from "@/hooks/ui";
import { useAuth } from "@/hooks/use-auth";
import { useGamingDay } from "@/hooks/use-casino";
import { logError } from "@/lib/errors/error-utils";
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

  // Auth: Get staff ID from authenticated user
  const { staffId } = useAuth();

  // Zustand: Modal state
  const {
    isOpen: isModalOpen,
    type: modalType,
    data: modalData,
    open: openModal,
    close: closeModal,
  } = useModal();

  // Zustand: Pit dashboard UI state
  const {
    selectedTableId,
    selectedSlipId,
    newSlipSeatNumber,
    setSelectedTable,
    setSelectedSlip,
    setNewSlipSeatNumber,
    clearSelection,
  } = usePitDashboardUI();

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

  // Query: Modal data (fetched when modal is open and type is rating-slip)
  const { data: ratingSlipModalData } = useRatingSlipModalData(
    isModalOpen && modalType === "rating-slip" ? selectedSlipId : null,
  );

  // Mutations: Modal operations
  const saveWithBuyIn = useSaveWithBuyIn();
  const closeWithFinancial = useCloseWithFinancial();
  const movePlayer = useMovePlayer();

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
        setSelectedTable(firstActive.id);
      } else {
        // Fallback to first table if no active tables
        setSelectedTable(tables[0].id);
      }
    }
  }, [tables, selectedTableId, setSelectedTable]);

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

  // Modal callback: Save with optional buy-in
  const handleSave = async (formState: FormState) => {
    if (!selectedSlipId || !ratingSlipModalData) {
      console.error("Save failed: No slip or modal data");
      return;
    }

    if (!staffId) {
      console.error(
        "Save failed: No staff ID available - authentication required",
      );
      return;
    }

    try {
      await saveWithBuyIn.mutateAsync({
        slipId: selectedSlipId,
        visitId: ratingSlipModalData.slip.visitId,
        playerId: ratingSlipModalData.player?.id ?? null,
        casinoId,
        staffId,
        averageBet: Number(formState.averageBet),
        newBuyIn: Number(formState.newBuyIn || formState.cashIn || 0),
      });
    } catch (error) {
      // Structured logging; mutation state handles UI feedback
      logError(error, { component: "PitDashboard", action: "saveWithBuyIn" });
    }
  };

  // Modal callback: Close session with chips-taken
  const handleCloseSession = async (formState: FormState) => {
    if (!selectedSlipId || !ratingSlipModalData) {
      console.error("Close failed: No slip or modal data");
      return;
    }

    if (!staffId) {
      console.error(
        "Close failed: No staff ID available - authentication required",
      );
      return;
    }

    try {
      await closeWithFinancial.mutateAsync({
        slipId: selectedSlipId,
        visitId: ratingSlipModalData.slip.visitId,
        playerId: ratingSlipModalData.player?.id ?? null,
        casinoId,
        staffId,
        chipsTaken: Number(formState.chipsTaken || 0),
        averageBet: Number(formState.averageBet),
      });
      // Close modal after successful close
      closeModal();
    } catch (error) {
      logError(error, { component: "PitDashboard", action: "closeSession" });
    }
  };

  // Modal callback: Move player to different table/seat
  const handleMovePlayer = async (formState: FormState) => {
    if (!selectedSlipId) {
      console.error("Move failed: No slip selected");
      return;
    }

    try {
      const result = await movePlayer.mutateAsync({
        currentSlipId: selectedSlipId,
        destinationTableId: formState.newTableId,
        destinationSeatNumber: formState.newSeatNumber || null,
        averageBet: Number(formState.averageBet),
      });
      // Switch to new slip after successful move
      setSelectedSlip(result.newSlipId);
    } catch (error) {
      logError(error, { component: "PitDashboard", action: "movePlayer" });
    }
  };

  // Handle seat click - open new slip modal or show context menu
  const handleSeatClick = (
    index: number,
    occupant: { firstName: string; lastName: string } | null,
  ) => {
    const seatNumber = String(index + 1);

    if (occupant) {
      // Seat is occupied - open modal for this slip
      const slipOccupant = seatOccupants.get(seatNumber);
      if (slipOccupant?.slipId) {
        setSelectedSlip(slipOccupant.slipId);
        openModal("rating-slip", { slipId: slipOccupant.slipId });
      }
    } else {
      // Seat is empty - open new slip modal
      setNewSlipSeatNumber(seatNumber);
      openModal("new-slip", { seatNumber });
    }
  };

  // Handle opening new slip modal (from panel button)
  const handleNewSlip = () => {
    setNewSlipSeatNumber(undefined);
    openModal("new-slip", {});
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
            onSlipClick={(slipId) => {
              setSelectedSlip(slipId);
              openModal("rating-slip", { slipId });
            }}
          />
        </div>
      </div>

      {/* Table Grid */}
      <TableGrid
        tables={tables}
        selectedTableId={selectedTableId}
        onTableSelect={setSelectedTable}
        isLoading={tablesLoading}
      />

      {/* New Slip Modal */}
      {selectedTableId && (
        <NewSlipModal
          open={isModalOpen && modalType === "new-slip"}
          onOpenChange={(open) => {
            if (!open) {
              closeModal();
            }
          }}
          tableId={selectedTableId}
          casinoId={casinoId}
          initialSeatNumber={newSlipSeatNumber}
          occupiedSeats={occupiedSeats}
        />
      )}

      {/* Rating Slip Modal */}
      <RatingSlipModal
        slipId={selectedSlipId}
        isOpen={isModalOpen && modalType === "rating-slip"}
        onClose={closeModal}
        onSave={handleSave}
        onCloseSession={handleCloseSession}
        onMovePlayer={handleMovePlayer}
        isSaving={saveWithBuyIn.isPending}
        isClosing={closeWithFinancial.isPending}
        isMoving={movePlayer.isPending}
        error={
          saveWithBuyIn.error?.message ||
          closeWithFinancial.error?.message ||
          movePlayer.error?.message ||
          null
        }
      />
    </div>
  );
}
