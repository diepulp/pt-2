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
import { toast, useModal, usePitDashboardUI } from "@/hooks/ui";
import { useAuth } from "@/hooks/use-auth";
import { useGamingDay } from "@/hooks/use-casino";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getErrorMessage,
  logError,
  isFetchError,
} from "@/lib/errors/error-utils";
import { createBrowserComponentClient } from "@/lib/supabase/client";
import {
  groupTablesByPit,
  findPitIdForTable,
  findPitLabelForTable,
} from "@/lib/utils/group-tables-by-pit";
import {
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
} from "@/services/rating-slip/http";
import { resolveCurrentSlipContext } from "@/services/rating-slip-modal/rpc";

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
    setSelectedPitLabel,
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

  // Compute pits from tables for pit map selector
  const pits = React.useMemo(() => groupTablesByPit(tables), [tables]);

  // Find current pit ID based on selected table
  const selectedPitId = React.useMemo(
    () => findPitIdForTable(pits, selectedTableId),
    [pits, selectedTableId],
  );

  // Sync pit label to store for header breadcrumb
  React.useEffect(() => {
    const pitLabel = findPitLabelForTable(pits, selectedTableId);
    setSelectedPitLabel(pitLabel);
  }, [pits, selectedTableId, setSelectedPitLabel]);

  // Handle table selection from pit map selector
  const handleSelectTable = React.useCallback(
    (tableId: string, _pitId: string) => {
      setSelectedTable(tableId);
    },
    [setSelectedTable],
  );

  // Handle pit selection (select first table in pit)
  const handleSelectPit = React.useCallback(
    (pitId: string) => {
      const pit = pits.find((p) => p.id === pitId);
      if (pit && pit.tables.length > 0) {
        setSelectedTable(pit.tables[0].id);
      }
    },
    [pits, setSelectedTable],
  );

  // Map slips to seat occupants
  // Optimistic updates now handled via TanStack Query cache in useMovePlayer
  const seatOccupants = React.useMemo(
    () => mapSlipsToOccupants(activeSlips),
    [activeSlips],
  );

  // Get occupied seat numbers
  const occupiedSeats = React.useMemo(() => {
    return Array.from(seatOccupants.keys());
  }, [seatOccupants]);

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
      // ISSUE-EEC1A683: Pass playerDailyTotal for MTL threshold checking
      await saveWithBuyIn.mutateAsync({
        slipId: selectedSlipId,
        visitId: modalData.slip.visitId,
        playerId: modalData.player?.id ?? null,
        casinoId,
        tableId: modalData.slip.tableId,
        staffId,
        averageBet: Number(formState.averageBet),
        newBuyIn: Number(formState.newBuyIn || formState.cashIn || 0),
        playerDailyTotal: formState.playerDailyTotal,
      });
      toast.success("Changes saved");
    } catch (error) {
      // Show user-friendly error toast (same pattern as movePlayer)
      toast.error("Error", { description: getErrorMessage(error) });
      // Only log unexpected errors (not business validation errors)
      if (!isFetchError(error) || error.status >= 500) {
        logError(error, { component: "PitPanels", action: "saveWithBuyIn" });
      }
    }
  };

  // Modal callback: Close session with chips-taken
  const handleCloseSession = async (formState: FormState) => {
    if (!selectedSlipId || !modalData || !selectedTableId) {
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
        tableId: selectedTableId,
        staffId,
        chipsTaken: Number(formState.chipsTaken || 0),
        averageBet: Number(formState.averageBet),
      });
      // Close modal after successful close
      closeModal();
      setSelectedSlip(null);
      toast.success("Session closed");
    } catch (error) {
      // Show user-friendly error toast (same pattern as movePlayer)
      toast.error("Error", { description: getErrorMessage(error) });
      // Only log unexpected errors (not business validation errors)
      if (!isFetchError(error) || error.status >= 500) {
        logError(error, { component: "PitPanels", action: "closeSession" });
      }
    }
  };

  // Modal callback: Move player to different table/seat
  // Optimistic updates handled via TanStack Query cache in useMovePlayer
  const handleMovePlayer = async (formState: FormState) => {
    if (!selectedSlipId) {
      logError(new Error("Move failed: No slip selected"), {
        component: "PitPanels",
        action: "movePlayer",
      });
      return;
    }

    // Capture slip ID before closing modal (selectedSlipId may change)
    const slipIdToMove = selectedSlipId;

    // Close modal immediately for responsive UX
    closeModal();
    setSelectedSlip(null);

    try {
      // Only include averageBet if it's positive (schema requires positive if provided)
      const averageBet = Number(formState.averageBet);
      // ISSUE-752833A6: Added playerId for loyalty accrual on move
      await movePlayer.mutateAsync({
        currentSlipId: slipIdToMove,
        sourceTableId: selectedTableId!,
        destinationTableId: formState.newTableId,
        destinationSeatNumber: formState.newSeatNumber || null,
        casinoId,
        playerId: modalData?.player?.id ?? null,
        ...(averageBet > 0 ? { averageBet } : {}),
      });
      // Show success toast after successful move
      toast.success("Player moved");
    } catch (error) {
      // Show error toast with specific message since modal is already closed
      // TanStack Query rollback in use-move-player.ts handles cache rollback
      toast.error("Error", { description: getErrorMessage(error) });
      // Only log unexpected errors (not business errors like SEAT_OCCUPIED)
      if (!isFetchError(error) || error.status >= 500) {
        logError(error, { component: "PitPanels", action: "movePlayer" });
      }
    }
  };

  // Handle seat click - open new slip modal or show context menu
  // GAP-ADR-026-UI-SHIPPABLE: Uses entry gate for occupied seats
  const handleSeatClick = async (
    index: number,
    occupant: { firstName: string; lastName: string } | null,
  ) => {
    const seatNumber = String(index + 1);

    if (occupant) {
      // Seat is occupied - use entry gate via handleSlipClick
      const slipOccupant = seatOccupants.get(seatNumber);
      if (slipOccupant?.slipId) {
        await handleSlipClick(slipOccupant.slipId);
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
  // GAP-ADR-026-UI-SHIPPABLE: Entry gate ensures current gaming day context
  const handleSlipClick = async (slipId: string) => {
    try {
      const supabase = createBrowserComponentClient();
      const ctx = await resolveCurrentSlipContext(supabase, slipId);

      setSelectedSlip(ctx.slipIdCurrent);
      openModal("rating-slip", { slipId: ctx.slipIdCurrent });

      if (ctx.rolledOver) {
        toast.info("Session rolled over to today's gaming day.");
      }
      if (ctx.readOnly) {
        toast.info("Read-only: no player bound to this slip.");
      }
    } catch (error) {
      toast.error("Error", { description: getErrorMessage(error) });
      logError(error, { component: "PitPanels", action: "handleSlipClick" });
    }
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
    // Pit navigation
    pits,
    selectedPitId,
    onSelectTable: handleSelectTable,
    onSelectPit: handleSelectPit,
    // Callbacks
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
          // Reset mutation states to prevent stale errors affecting other slips
          saveWithBuyIn.reset();
          closeWithFinancial.reset();
        }}
        onSave={handleSave}
        onCloseSession={handleCloseSession}
        onMovePlayer={handleMovePlayer}
        isMovePlayerPending={movePlayer.isPending}
      />
    </>
  );
}
