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
import { useModal, usePitDashboardUI } from "@/hooks/ui";
import { useAuth } from "@/hooks/use-auth";
import { useGamingDay } from "@/hooks/use-casino";
import { useIsMobile } from "@/hooks/use-mobile";
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

  // Responsive: Detect mobile viewport
  const isMobile = useIsMobile();

  // Zustand: Modal state
  const {
    isOpen: isModalOpen,
    type: modalType,
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
  // PRD-020: Use targeted invalidation to prevent N×2 HTTP cascade
  const pauseMutation = useMutation({
    mutationFn: pauseRatingSlip,
    onSuccess: () => {
      // Targeted: only invalidate the selected table's slips
      if (selectedTableId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.activeSlips(selectedTableId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeRatingSlip,
    onSuccess: () => {
      // Targeted: only invalidate the selected table's slips
      if (selectedTableId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.activeSlips(selectedTableId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (slipId: string) => closeRatingSlip(slipId),
    onSuccess: () => {
      // Targeted: only invalidate the selected table's slips
      if (selectedTableId) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.activeSlips(selectedTableId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      // PRD-020: Do NOT invalidate tables.scope - prevents re-render cascade
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
      closeModal();
      setSelectedSlip(null);
    } catch (error) {
      logError(error, { component: "PitPanels", action: "closeSession" });
    }
  };

  // Modal callback: Move player to different table/seat
  // PRD-020: Fixed to close modal and clear state on success
  const handleMovePlayer = async (formState: FormState) => {
    if (!selectedSlipId || !selectedTableId) {
      return;
    }

    try {
      await movePlayer.mutateAsync({
        currentSlipId: selectedSlipId,
        sourceTableId: selectedTableId,
        destinationTableId: formState.newTableId,
        destinationSeatNumber: formState.newSeatNumber || null,
        averageBet: Number(formState.averageBet),
        casinoId,
      });
      // PRD-020: Close modal and clear state after successful move
      // (matches handleCloseSession behavior)
      closeModal();
      setSelectedSlip(null);
    } catch (error) {
      // Error: keep modal open so user can see error and retry
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

  // Handle slip click from active slips list
  const handleSlipClick = (slipId: string) => {
    setSelectedSlip(slipId);
    openModal("rating-slip", { slipId });
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

  // Shared props for both mobile drawer and desktop panel
  // PRD-013: Removed selectedTableId and onTableSelect (now in store)
  const panelProps = {
    casinoId,
    tableName: selectedTable?.label ?? "No Table",
    tables,
    selectedTable: selectedTable ?? null,
    seats,
    activeSlips,
    stats: stats ?? null,
    isLoading: tablesLoading || statsLoading,
    gamingDay: gamingDayString ? { date: gamingDayString } : null,
    realtimeConnected,
    realtimeError,
    onSeatClick: handleSeatClick,
    onNewSlip: handleNewSlip,
    onSlipClick: handleSlipClick,
  };

  return (
    <>
      {/* Desktop: Full panel container with sidebar (hidden on mobile) */}
      <div className="hidden md:block h-full">
        <PanelContainer {...panelProps} />
      </div>

      {/* Mobile: Panel container with bottom navigation tabs */}
      <div className="md:hidden h-full">
        <PanelContainer {...panelProps} mobileMode />
      </div>

      {/* New Slip Modal */}
      {selectedTableId && (
        <NewSlipModal
          open={isModalOpen && modalType === "new-slip"}
          onOpenChange={(open) => {
            if (!open) closeModal();
          }}
          tableId={selectedTableId}
          casinoId={casinoId}
          initialSeatNumber={newSlipSeatNumber}
          occupiedSeats={occupiedSeats}
        />
      )}

      {/* Rating Slip Modal - uses useTransition internally for pending states */}
      <RatingSlipModal
        slipId={selectedSlipId}
        isOpen={isModalOpen && modalType === "rating-slip"}
        onClose={() => {
          closeModal();
          setSelectedSlip(null);
        }}
        onSave={handleSave}
        onCloseSession={handleCloseSession}
        onMovePlayer={handleMovePlayer}
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
