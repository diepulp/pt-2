'use client';

import { Pause, Play, RefreshCw, X } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useTransition,
} from 'react';
import { toast } from 'sonner';

import { CtrBanner } from '@/components/mtl/ctr-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGamingDay } from '@/hooks/casino/use-gaming-day';
import { usePatronDailyTotal } from '@/hooks/mtl/use-patron-daily-total';
import { checkCumulativeThreshold } from '@/hooks/mtl/use-threshold-notifications';
import { useCreateFinancialAdjustment } from '@/hooks/player-financial';
import {
  usePauseRatingSlip,
  useResumeRatingSlip,
} from '@/hooks/rating-slip/use-rating-slip-mutations';
import { useRatingSlipModalData } from '@/hooks/rating-slip-modal';
import { useRatingSlipModal } from '@/hooks/ui/use-rating-slip-modal';
import { useAuth } from '@/hooks/use-auth';
import type { AdjustmentReasonCode } from '@/services/player-financial/dtos';

import { AdjustmentModal } from './adjustment-modal';
import { FormSectionAverageBet } from './form-section-average-bet';
import { FormSectionCashIn } from './form-section-cash-in';
import { FormSectionChipsTaken } from './form-section-chips-taken';
import { FormSectionMovePlayer } from './form-section-move-player';
import { FormSectionStartTime } from './form-section-start-time';
import { RatingSlipModalSkeleton } from './rating-slip-modal-skeleton';

/**
 * Converts an ISO timestamp to datetime-local format in the user's local timezone.
 * Handles both UTC (Z suffix) and offset-based timestamps.
 *
 * @param isoTimestamp - ISO 8601 timestamp (e.g., "2025-12-27T00:04:00.000Z")
 * @returns datetime-local format string (YYYY-MM-DDTHH:mm) in local timezone
 */
function toLocalDateTimeString(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) {
    // Fallback: if parsing fails, try using the first 16 chars as-is
    return isoTimestamp.slice(0, 16);
  }

  // Format as local datetime-local string
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Form state type for action handlers.
 * Zustand store manages form state internally via useRatingSlipModal hook.
 */
export interface FormState {
  averageBet: string;
  startTime: string;
  cashIn: string; // Maps from newBuyIn for backward compatibility
  newBuyIn?: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
  /**
   * Player's current daily total (cash-in) for MTL threshold checking.
   * Passed from modal to parent save handler for threshold evaluation.
   * @see ISSUE-EEC1A683 - MTL threshold notification fix
   */
  playerDailyTotal?: number;
}

// Legacy DTO types for backward compatibility with preview page
// TODO: Remove once all consumers are updated to use service layer
export interface RatingSlipDto {
  id: string;
  playerName?: string;
  averageBet: number;
  cashIn: number;
  startTime: string;
  gameTableId: string;
  seatNumber: number;
  points?: number;
}

export interface RatingSlipTableDto {
  gaming_table_id: string;
  name: string;
  seats_available: number;
}

interface RatingSlipModalProps {
  /** Rating slip ID to load (null disables query) */
  slipId: string | null;

  /** Modal open state */
  isOpen: boolean;

  /** Close handler */
  onClose: () => void;

  /** Save changes handler - wrapped in useTransition internally */
  onSave: (formState: FormState) => void;

  /** Close session handler - wrapped in useTransition internally */
  onCloseSession: (formState: FormState) => void;

  /** Move player handler - called directly (parent handles async) */
  onMovePlayer: (formState: FormState) => void;

  /** Move player mutation pending state from parent */
  isMovePlayerPending?: boolean;

  /** Error message to display */
  error?: string | null;

  // Legacy props for backward compatibility (ignored if slipId is provided)
  /** @deprecated Use slipId instead */
  ratingSlip?: RatingSlipDto;
  /** @deprecated Loaded from service layer */
  tables?: RatingSlipTableDto[];
  /** @deprecated Managed by TanStack Query */
  isLoading?: boolean;
}

/**
 * Rating Slip Modal Component
 *
 * Integrated with service layer via TanStack Query.
 * Uses Zustand store for form state management (eliminates prop drilling).
 *
 * Data aggregated from 5 bounded contexts:
 * - Rating slip details
 * - Player identity
 * - Loyalty balance and suggestion
 * - Financial summary
 * - Available tables
 *
 * React 19 Patterns:
 * - useTransition for non-blocking async operations (no isSaving/isClosing props)
 * - Zustand store via useRatingSlipModal hook for form state
 * - Key-based reset pattern for store initialization
 *
 * @see PRD-008 WS4 Modal Service Integration
 * @see ZUSTAND-RSM for Zustand integration spec
 * @see useRatingSlipModalData hook for data fetching
 * @see useRatingSlipModal hook for form state
 *
 * @example
 * ```tsx
 * <RatingSlipModal
 *   slipId={selectedSlipId}
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSave={handleSave}
 *   onCloseSession={handleClose}
 *   onMovePlayer={handleMove}
 * />
 * ```
 */
export function RatingSlipModal({
  slipId,
  isOpen,
  onClose,
  onSave,
  onCloseSession,
  onMovePlayer,
  isMovePlayerPending = false,
  error = null,
  // Legacy props (ignored if slipId is provided)
  ratingSlip: legacyRatingSlip,
  tables: legacyTables,
  isLoading: legacyIsLoading,
}: RatingSlipModalProps) {
  // React 19: Use useTransition for non-blocking UI during async operations
  const [isPending, startTransition] = useTransition();

  // Fetch modal data from service layer (only when modal is open)
  const {
    data: modalData,
    isLoading,
    isFetching,
    error: fetchError,
    refetch,
  } = useRatingSlipModalData(isOpen ? slipId : null);

  // Zustand store for form state management (replaces useModalFormState)
  const { formState, originalState, initializeForm } = useRatingSlipModal();

  // Fetch canonical gaming day from server (respects casino timezone and cutoff)
  // ISSUE-CLIENT-GD-003: Must use server-side gaming day for MTL threshold calculations
  // PERF-005 WS4: Use new hook (returns GamingDayDTO) and extract .gaming_day string
  // to prevent [object Object] serialization bug in MTL query parameters
  const { data: gamingDayData } = useGamingDay();
  const gamingDay = gamingDayData?.gaming_day;

  // Fetch patron's daily total for MTL threshold checking (WS7)
  // Only fetch when modal is open and we have player data
  // ISSUE-EEC1A683: Use casinoId from modalData.slip (derived from visit) instead of prop
  const { data: patronDailyTotal } = usePatronDailyTotal(
    modalData?.slip.casinoId,
    modalData?.player?.id,
    gamingDay,
  );

  // Track which slipId we've initialized to prevent re-initialization on refetch
  // This preserves form state when user clicks "Refresh points balance"
  const initializedSlipIdRef = useRef<string | null>(null);

  // Initialize store ONLY when slip ID changes (not on refetch)
  // Bug fix: Previously reinitializing on every modalData change reset form state
  useEffect(() => {
    if (modalData && modalData.slip.id !== initializedSlipIdRef.current) {
      // New slip opened - initialize form with server data
      initializedSlipIdRef.current = modalData.slip.id;
      initializeForm({
        averageBet: modalData.slip.averageBet.toString(),
        startTime: toLocalDateTimeString(modalData.slip.startTime),
        newBuyIn: '0',
        newTableId: modalData.slip.tableId,
        newSeatNumber: modalData.slip.seatNumber || '',
        chipsTaken: '0',
      });
    }
  }, [modalData, initializeForm]);

  // Reset ref when modal closes to allow re-initialization on next open
  useEffect(() => {
    if (!isOpen) {
      initializedSlipIdRef.current = null;
    }
  }, [isOpen]);

  // Compute dirty state (derived, not stored)
  // React 19 Performance: Use field-by-field comparison instead of JSON.stringify
  // to avoid blocking the main thread on every render
  const isDirty = useMemo(() => {
    return (
      formState.averageBet !== originalState.averageBet ||
      formState.startTime !== originalState.startTime ||
      formState.newBuyIn !== originalState.newBuyIn ||
      formState.newTableId !== originalState.newTableId ||
      formState.newSeatNumber !== originalState.newSeatNumber ||
      formState.chipsTaken !== originalState.chipsTaken
    );
  }, [formState, originalState]);

  // Validation: Check if average bet is valid when buy-in is entered
  // FIX: Prevents double-entry bug where buy-in was recorded before average_bet validation failed
  const validationError = useMemo(() => {
    const averageBet = Number(formState.averageBet) || 0;
    const newBuyIn = Number(formState.newBuyIn) || 0;

    if (newBuyIn > 0 && averageBet <= 0) {
      return 'Average bet must be set before recording a buy-in';
    }
    return null;
  }, [formState.averageBet, formState.newBuyIn]);

  // React 19 Performance: Memoize tables array to prevent new reference on every render
  // IMPORTANT: All hooks must be called before any early returns (Rules of Hooks)
  const tables = useMemo(() => {
    if (!modalData) return legacyTables || [];
    return modalData.tables.map((t) => ({
      gaming_table_id: t.id,
      name: t.label,
      seats_available: t.seatsAvailable, // Now uses real value from game_settings
    }));
  }, [modalData?.tables, legacyTables]);

  // React 19 Performance: Extract inline handlers to useCallback for stable references
  // IMPORTANT: All hooks must be called before any early returns (Rules of Hooks)
  const handleMovePlayer = useCallback(() => {
    onMovePlayer({
      ...formState,
      cashIn: formState.newBuyIn,
    } as FormState);
  }, [formState, onMovePlayer]);

  const handleSave = useCallback(() => {
    startTransition(() => {
      // ISSUE-EEC1A683: Include playerDailyTotal for MTL threshold checking
      // patronDailyTotal.totalIn is in cents, convert to dollars for threshold calculation
      const playerDailyTotalDollars = patronDailyTotal
        ? patronDailyTotal.totalIn / 100
        : undefined;
      onSave({
        ...formState,
        cashIn: formState.newBuyIn,
        playerDailyTotal: playerDailyTotalDollars,
      } as FormState);
    });
  }, [formState, onSave, startTransition, patronDailyTotal]);

  const handleCloseSession = useCallback(() => {
    startTransition(() => {
      onCloseSession({
        ...formState,
        cashIn: formState.newBuyIn,
      } as FormState);
    });
  }, [formState, onCloseSession, startTransition]);

  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      await refetch();
    });
  }, [refetch, startTransition]);

  // CTR banner state - must be declared before early returns (Rules of Hooks)
  const [ctrBannerDismissed, setCtrBannerDismissed] = React.useState(false);
  const handleDismissCtrBanner = useCallback(() => {
    setCtrBannerDismissed(true);
  }, []);

  // Reset banner dismissed state when modal closes or player changes
  useEffect(() => {
    if (!isOpen) {
      setCtrBannerDismissed(false);
    }
  }, [isOpen, modalData?.player?.id]);

  // Check if CTR threshold is met for displaying banner (WS7)
  // Uses the current daily total + pending buy-in to determine if CTR is required
  // Note: patronDailyTotal values are in cents, threshold functions expect dollars
  // Must be before early returns (Rules of Hooks)
  const showCtrBanner = useMemo(() => {
    const newBuyInAmount = Number(formState.newBuyIn) || 0;
    const playerDailyTotalDollars = (patronDailyTotal?.totalIn ?? 0) / 100;
    if (!patronDailyTotal || newBuyInAmount <= 0) return false;
    const result = checkCumulativeThreshold(
      playerDailyTotalDollars,
      newBuyInAmount,
    );
    return result.requiresCtr;
  }, [patronDailyTotal, formState.newBuyIn]);

  // === ADJUSTMENT MODAL STATE ===
  // Allows staff to correct cash-in totals without editing/deleting original transactions

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] =
    React.useState(false);
  const [adjustmentError, setAdjustmentError] = React.useState<string | null>(
    null,
  );

  // Auth context for adjustment creation
  const { casinoId } = useAuth();

  // Adjustment mutation hook
  const createAdjustment = useCreateFinancialAdjustment();

  // Handler to open adjustment modal
  const handleOpenAdjustmentModal = useCallback(() => {
    setAdjustmentError(null);
    setIsAdjustmentModalOpen(true);
  }, []);

  // Handler to close adjustment modal
  const handleCloseAdjustmentModal = useCallback(() => {
    setIsAdjustmentModalOpen(false);
    setAdjustmentError(null);
  }, []);

  // Handler for adjustment submission
  const handleSubmitAdjustment = useCallback(
    async (data: {
      deltaAmount: number;
      reasonCode: AdjustmentReasonCode;
      note: string;
    }) => {
      if (!modalData || !casinoId || !modalData.player) {
        setAdjustmentError('Missing required data for adjustment');
        return;
      }

      try {
        await createAdjustment.mutateAsync({
          casino_id: casinoId,
          player_id: modalData.player.id,
          visit_id: modalData.slip.visitId,
          delta_amount: data.deltaAmount * 100, // Convert to cents
          reason_code: data.reasonCode,
          note: data.note,
        });

        toast.success('Adjustment created', {
          description: `${data.deltaAmount >= 0 ? '+' : ''}$${data.deltaAmount.toFixed(2)} adjustment recorded`,
        });

        handleCloseAdjustmentModal();
        // Modal data will refresh automatically via query invalidation
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create adjustment';
        setAdjustmentError(message);
      }
    },
    [modalData, casinoId, createAdjustment, handleCloseAdjustmentModal],
  );

  // Reset adjustment modal state when main modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsAdjustmentModalOpen(false);
      setAdjustmentError(null);
    }
  }, [isOpen]);

  // === PAUSE/RESUME SESSION STATE ===
  // Allows pit boss to pause a session when player steps away

  const pauseRatingSlip = usePauseRatingSlip();
  const resumeRatingSlip = useResumeRatingSlip();

  // Handler to pause the session
  const handlePauseSession = useCallback(() => {
    if (!modalData?.slip.id) return;

    pauseRatingSlip.mutate(modalData.slip.id, {
      onSuccess: () => {
        toast.success('Session paused', {
          description: 'Loyalty accrual and session timer have been paused',
        });
      },
      onError: (err) => {
        toast.error('Failed to pause session', {
          description: err.message,
        });
      },
    });
  }, [modalData?.slip.id, pauseRatingSlip]);

  // Handler to resume the session
  const handleResumeSession = useCallback(() => {
    if (!modalData?.slip.id) return;

    resumeRatingSlip.mutate(modalData.slip.id, {
      onSuccess: () => {
        toast.success('Session resumed', {
          description: 'Loyalty accrual and session timer have resumed',
        });
      },
      onError: (err) => {
        toast.error('Failed to resume session', {
          description: err.message,
        });
      },
    });
  }, [modalData?.slip.id, resumeRatingSlip]);

  // Derived state for pause/resume button visibility
  const isPauseResumeLoading =
    pauseRatingSlip.isPending || resumeRatingSlip.isPending;
  const canPause = modalData?.slip.status === 'open';
  const canResume = modalData?.slip.status === 'paused';
  const isPaused = modalData?.slip.status === 'paused';

  // === EARLY RETURNS (after all hooks) ===

  // Loading skeleton - mirrors actual modal structure
  if (isLoading || legacyIsLoading) {
    return <RatingSlipModalSkeleton isOpen={isOpen} onClose={onClose} />;
  }

  // Error state
  if (fetchError && !modalData) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error Loading Rating Slip</DialogTitle>
            <DialogDescription className="sr-only">
              An error occurred while loading the rating slip data.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-red-950/80 text-red-200 border border-red-800 rounded-lg font-medium">
            {fetchError.message || 'Failed to load rating slip data'}
          </div>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // No data state (shouldn't happen but handle gracefully)
  if (!modalData && !legacyRatingSlip) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Data Available</DialogTitle>
            <DialogDescription className="sr-only">
              Rating slip data could not be loaded.
            </DialogDescription>
          </DialogHeader>
          <p className="text-muted-foreground">
            Rating slip data is not available.
          </p>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // === DERIVED STATE (after early returns, uses modalData safely) ===

  // Legacy mode: use props if modalData not available
  // TODO: Remove once all consumers are updated
  const isLegacyMode = !modalData && legacyRatingSlip;

  // Extract data from service layer or legacy props
  const playerName = modalData
    ? modalData.player
      ? `${modalData.player.firstName} ${modalData.player.lastName}`
      : 'Ghost Visit'
    : legacyRatingSlip?.playerName || 'Unknown Player';

  const selectedTable =
    tables.find((t) => t.gaming_table_id === formState.newTableId) || null;

  // Get loyalty data
  const currentBalance = modalData?.loyalty?.currentBalance ?? 0;
  const suggestedPoints = modalData?.loyalty?.suggestion?.suggestedPoints;

  // Get financial data for display (in cents, convert to dollars)
  // Derive computed values from server data + form state (React 19 pattern: no useEffect sync)
  const totalCashIn = modalData ? modalData.financial.totalCashIn / 100 : 0;

  // Chips Taken from form is in dollars, server data is in cents
  // computedChipsOut = server chips out + pending chips taken
  const pendingChipsTaken = Number(formState.chipsTaken) || 0;
  const computedChipsOut = modalData
    ? (modalData.financial.totalChipsOut + pendingChipsTaken * 100) / 100
    : 0;

  // Net Position = Cash In - Chips Out (using computed chips out for reactivity)
  const computedNetPosition = totalCashIn - computedChipsOut;

  // Compute newBuyInAmount and playerDailyTotalDollars for CTR banner display
  const newBuyInAmount = Number(formState.newBuyIn) || 0;
  const playerDailyTotalDollars = (patronDailyTotal?.totalIn ?? 0) / 100;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <span>Rating Slip - {playerName}</span>
              {modalData?.player?.cardNumber && (
                <span className="text-sm text-muted-foreground">
                  (Card: {modalData.player.cardNumber})
                </span>
              )}
              {isPaused && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 animate-pulse">
                  <Pause className="h-3 w-3 mr-1" />
                  PAUSED
                </Badge>
              )}
            </DialogTitle>
            {/* Gaming Day Display (ADR-026) */}
            {modalData?.slip.gamingDay && (
              <DialogDescription>
                Gaming Day:{' '}
                {new Date(
                  modalData.slip.gamingDay + 'T00:00:00',
                ).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </DialogDescription>
            )}
            {!modalData?.slip.gamingDay && (
              <DialogDescription className="sr-only">
                Edit rating slip details including average bet, buy-in, and
                session time. Use form fields to make changes and save when
                ready.
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Key by slip ID to force form state reset on slip change (React 19 pattern) */}
          <div
            key={modalData?.slip.id}
            className="flex-1 overflow-y-auto space-y-6 pr-2"
          >
            {error && (
              <div className="p-3 bg-red-950/80 text-red-200 border border-red-800 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            {/* Client-side validation error (shown separately from server errors) */}
            {validationError && !error && (
              <div className="p-3 bg-yellow-950/80 text-yellow-200 border border-yellow-800 rounded-lg text-sm font-medium">
                {validationError}
              </div>
            )}

            {isLegacyMode && (
              <div className="p-3 bg-yellow-500/10 text-yellow-600 rounded-lg text-sm">
                Legacy Mode: Using prop data instead of service layer
              </div>
            )}

            {/* CTR Banner - displays when threshold is met (WS7) */}
            {showCtrBanner && !ctrBannerDismissed && patronDailyTotal && (
              <CtrBanner
                dailyTotal={playerDailyTotalDollars + newBuyInAmount}
                patronName={
                  modalData?.player
                    ? `${modalData.player.firstName} ${modalData.player.lastName}`
                    : undefined
                }
                onDismiss={handleDismissCtrBanner}
              />
            )}

            <FormSectionAverageBet />

            <FormSectionCashIn
              totalCashIn={totalCashIn}
              playerDailyTotal={playerDailyTotalDollars}
              onAdjust={
                modalData?.player ? handleOpenAdjustmentModal : undefined
              }
            />

            <FormSectionStartTime />

            <FormSectionMovePlayer
              tables={tables}
              selectedTable={selectedTable}
              seatError=""
              onMovePlayer={handleMovePlayer}
              isUpdating={isMovePlayerPending}
              disabled={
                isMovePlayerPending ||
                !formState.newTableId ||
                !formState.newSeatNumber
              }
            />

            <FormSectionChipsTaken />

            {/* Financial Summary (if available from service layer) */}
            {/* Uses computed values for reactive binding with Chips Taken input */}
            {modalData && (
              <div className="p-4 bg-card border border-border rounded-lg">
                <h3 className="text-sm font-semibold mb-3">
                  Financial Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash In:</span>
                    <span className="font-mono">${totalCashIn.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chips Out:</span>
                    <span className="font-mono">
                      ${computedChipsOut.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-semibold">Net Position:</span>
                    <span
                      className={`font-mono font-semibold ${
                        computedNetPosition >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      ${computedNetPosition.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Loyalty Points Display */}
            <div className="p-4 bg-card border border-border rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Current Points Balance
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-primary">
                    {currentBalance.toLocaleString()}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isFetching}
                    onClick={handleRefresh}
                    aria-label="Refresh points balance"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
              </div>

              {/* Session Reward Suggestion (for open and paused slips) */}
              {(modalData?.slip.status === 'open' ||
                modalData?.slip.status === 'paused') && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Session Reward Estimate
                      {isPaused && (
                        <span className="ml-2 text-amber-400 text-xs">
                          (frozen)
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-lg font-semibold ${isPaused ? 'text-amber-400' : 'text-green-600'}`}
                    >
                      {suggestedPoints != null
                        ? `+${suggestedPoints.toLocaleString()} pts`
                        : '--'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isPaused
                      ? 'Accrual paused — resume session to continue earning'
                      : 'Based on current session activity'}
                  </p>
                </div>
              )}

              {/* Player Tier (if available) */}
              {modalData?.loyalty?.tier && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Tier:{' '}
                  <span className="uppercase font-semibold">
                    {modalData.loyalty.tier}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Fixed at bottom */}
          <div className="flex gap-2 flex-shrink-0 pt-4 border-t border-border">
            <Button
              type="button"
              className="flex-1"
              onClick={handleSave}
              disabled={isPending || !isDirty || !!validationError || isPaused}
            >
              {isPending
                ? 'Saving...'
                : validationError
                  ? 'Fix Errors'
                  : isDirty
                    ? 'Save Changes'
                    : 'No Changes'}
            </Button>

            {/* Pause/Resume Toggle Button */}
            {canPause && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-400"
                onClick={handlePauseSession}
                disabled={isPauseResumeLoading || isPending}
                aria-label="Pause session - stops loyalty accrual and session timer"
              >
                {isPauseResumeLoading ? (
                  'Pausing...'
                ) : (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </>
                )}
              </Button>
            )}
            {canResume && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-400"
                onClick={handleResumeSession}
                disabled={isPauseResumeLoading || isPending}
                aria-label="Resume session - restarts loyalty accrual and session timer"
              >
                {isPauseResumeLoading ? (
                  'Resuming...'
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </>
                )}
              </Button>
            )}

            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={handleCloseSession}
              disabled={isPending || !!error}
            >
              {isPending ? (
                'Closing...'
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Close Session
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjustment Modal - for compliance-friendly cash-in corrections */}
      <AdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={handleCloseAdjustmentModal}
        onSubmit={handleSubmitAdjustment}
        currentTotal={totalCashIn}
        isPending={createAdjustment.isPending}
        error={adjustmentError}
      />
    </>
  );
}
