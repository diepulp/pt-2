/**
 * Pit Panels Client Component
 *
 * Client-side wrapper for the pit panels system that manages:
 * - Table selection state
 * - Real-time data fetching via React Query hooks
 * - Tab-based panel navigation (Tables, Inventory, Analytics)
 * - Active slips with lifecycle actions
 * - New slip creation and rating slip modals
 *
 * Design: Dark industrial design with LED accents, grid overlays.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see components/pit-panels - Panel components
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  RatingSlipModal,
  type FormState,
} from "@/components/modals/rating-slip/rating-slip-modal";
import {
  useDashboardTables,
  useDashboardStats,
  useActiveSlipsForDashboard,
  useDashboardRealtime,
  dashboardKeys,
} from "@/hooks/dashboard";
import {
  useSaveWithBuyIn,
  useCloseWithFinancial,
  useMovePlayer,
  useRatingSlipModalData,
} from "@/hooks/rating-slip-modal";
import { useAuth } from "@/hooks/use-auth";
import { useGamingDay } from "@/hooks/use-casino";
import { logError } from "@/lib/errors/error-utils";
import {
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
} from "@/services/rating-slip/http";

import { NewSlipModal } from "../dashboard/new-slip-modal";
import {
  getOccupiedSeats,
  mapSlipsToOccupants,
} from "../dashboard/seat-context-menu";

import { PanelContainer } from "./panel-container";

interface PitPanelsClientProps {
  /** Casino ID from server context */
  casinoId: string;
}

export function PitPanelsClient({ casinoId }: PitPanelsClientProps) {
  const queryClient = useQueryClient();

  // Auth: Get staff ID from authenticated user
  const { staffId } = useAuth();

  // State: Selected table ID
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(
    null,
  );

  // State: New slip modal
  const [newSlipModalOpen, setNewSlipModalOpen] = React.useState(false);
  const [newSlipSeatNumber, setNewSlipSeatNumber] = React.useState<
    string | undefined
  >();

  // State: Rating slip modal
  const [selectedSlipId, setSelectedSlipId] = React.useState<string | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = React.useState(false);

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

  // Query: Gaming day (returns string)
  const { data: gamingDayString } = useGamingDay(casinoId);

  // Query: Active slips for selected table
  const { data: activeSlips = [] } = useActiveSlipsForDashboard(
    selectedTableId ?? undefined,
  );

  // Realtime subscriptions
  const { isConnected: realtimeConnected, error: realtimeError } =
    useDashboardRealtime({
      casinoId,
      selectedTableId,
      enabled: true,
    });

  // Query: Modal data (fetched when modal is open)
  const { data: modalData } = useRatingSlipModalData(
    isModalOpen ? selectedSlipId : null,
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

  // Modal callback: Save with optional buy-in
  const handleSave = async (formState: FormState) => {
    if (!selectedSlipId || !modalData) {
      return;
    }

    if (!staffId) {
      return;
    }

    try {
      await saveWithBuyIn.mutateAsync({
        slipId: selectedSlipId,
        visitId: modalData.slip.visitId,
        playerId: modalData.player?.id ?? null,
        casinoId,
        staffId,
        averageBet: Number(formState.averageBet),
        newBuyIn: Number(formState.newBuyIn || formState.cashIn || 0),
      });
    } catch (error) {
      // Structured logging; mutation state handles UI feedback
      logError(error, { component: "PitPanels", action: "saveWithBuyIn" });
    }
  };

  // Modal callback: Close session with chips-taken
  const handleCloseSession = async (formState: FormState) => {
    if (!selectedSlipId || !modalData) {
      return;
    }

    if (!staffId) {
      return;
    }

    try {
      await closeWithFinancial.mutateAsync({
        slipId: selectedSlipId,
        visitId: modalData.slip.visitId,
        playerId: modalData.player?.id ?? null,
        casinoId,
        staffId,
        chipsTaken: Number(formState.chipsTaken || 0),
        averageBet: Number(formState.averageBet),
      });
      // Close modal after successful close
      setIsModalOpen(false);
      setSelectedSlipId(null);
    } catch (error) {
      logError(error, { component: "PitPanels", action: "closeSession" });
    }
  };

  // Modal callback: Move player to different table/seat
  const handleMovePlayer = async (formState: FormState) => {
    if (!selectedSlipId) {
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
      setSelectedSlipId(result.newSlipId);
    } catch (error) {
      logError(error, { component: "PitPanels", action: "movePlayer" });
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
        setSelectedSlipId(slipOccupant.slipId);
        setIsModalOpen(true);
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

  // Handle slip click from active slips list
  const handleSlipClick = (slipId: string) => {
    setSelectedSlipId(slipId);
    setIsModalOpen(true);
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
    <>
      <PanelContainer
        casinoId={casinoId}
        tableName={selectedTable?.label ?? "No Table"}
        // Tables data
        tables={tables}
        selectedTableId={selectedTableId}
        selectedTable={selectedTable ?? null}
        seats={seats}
        activeSlips={activeSlips}
        stats={stats ?? null}
        isLoading={tablesLoading || statsLoading}
        gamingDay={gamingDayString ? { date: gamingDayString } : null}
        realtimeConnected={realtimeConnected}
        realtimeError={realtimeError}
        // Callbacks
        onTableSelect={setSelectedTableId}
        onSeatClick={handleSeatClick}
        onNewSlip={handleNewSlip}
        onSlipClick={handleSlipClick}
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

      {/* Rating Slip Modal */}
      <RatingSlipModal
        slipId={selectedSlipId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSlipId(null);
        }}
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
    </>
  );
}
