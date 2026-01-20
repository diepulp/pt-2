/**
 * New Slip Modal
 *
 * Modal dialog for creating a new rating slip.
 * Includes player search and seat selection.
 *
 * Design: Brutalist modal with monospace typography.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS4
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, User, AlertCircle, Loader2, Info } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dashboardKeys } from '@/hooks/dashboard';
import {
  logError,
  getErrorMessage,
  formatValidationError,
  isFetchError,
  isConflictError,
  isValidationError,
} from '@/lib/errors/error-utils';
import { cn } from '@/lib/utils';
import { validateUUIDs, debugLogUUIDs } from '@/lib/validation';
import type { PlayerSearchResultDTO } from '@/services/player/dtos';
import { searchPlayers } from '@/services/player/http';
import type { CreateRatingSlipInput } from '@/services/rating-slip/dtos';
import { startRatingSlip } from '@/services/rating-slip/http';
import { startVisit, getActiveVisit } from '@/services/visit/http';

interface NewSlipModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback to close the modal */
  onOpenChange: (open: boolean) => void;
  /** Table ID to create the slip for */
  tableId: string;
  /** Casino ID for queries */
  casinoId: string;
  /** Pre-selected seat number (optional) */
  initialSeatNumber?: string;
  /** Occupied seat numbers (cannot select these) */
  occupiedSeats?: string[];
}

const SEAT_COUNT = 7; // Hardcoded for MVP per checkpoint decision

export function NewSlipModal({
  open,
  onOpenChange,
  tableId,
  casinoId,
  initialSeatNumber,
  occupiedSeats = [],
}: NewSlipModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedPlayer, setSelectedPlayer] =
    React.useState<PlayerSearchResultDTO | null>(null);
  const [selectedSeat, setSelectedSeat] = React.useState<string | null>(
    initialSeatNumber ?? null,
  );
  const [error, setError] = React.useState<string | null>(null);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedPlayer(null);
      setSelectedSeat(initialSeatNumber ?? null);
      setError(null);
    }
  }, [open, initialSeatNumber]);

  // Player search query
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['players', 'search', debouncedQuery],
    queryFn: () => searchPlayers(debouncedQuery, 10),
    enabled: debouncedQuery.length >= 2,
  });

  // Create slip mutation
  const createSlipMutation = useMutation({
    mutationFn: async (input: CreateRatingSlipInput) => {
      return startRatingSlip(input);
    },
    onSuccess: () => {
      // ISSUE-DD2C45CA: Targeted cache invalidation to prevent N×2 HTTP cascade
      // Only invalidate this table's active slips - not all slips via .scope
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(tableId),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      // TARGETED: Invalidate tables for this casino only (occupancy changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables(casinoId),
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      // Structured logging (development only, properly serialized)
      logError(err, { component: 'NewSlipModal', action: 'createSlip' });

      // Handle specific error cases with user-friendly messages
      if (isFetchError(err) && err.code === 'SEAT_ALREADY_OCCUPIED') {
        setError(
          'This seat already has an active rating slip. Please choose a different seat or close the existing slip.',
        );
      } else if (isValidationError(err)) {
        setError(formatValidationError(err));
      } else {
        setError(getErrorMessage(err));
      }
    },
  });

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlayer) {
      setError('Please select a player');
      return;
    }

    if (!selectedSeat) {
      setError('Please select a seat');
      return;
    }

    // Check if seat is occupied
    if (occupiedSeats.includes(selectedSeat)) {
      setError(
        'This seat already has an active rating slip. Please choose a different seat.',
      );
      return;
    }

    // Pre-validation: Check UUID formats before making API calls
    const uuidValidation = validateUUIDs({
      player_id: selectedPlayer.id,
      table_id: tableId,
    });

    if (!uuidValidation.isValid) {
      // Debug log UUID validation failures
      debugLogUUIDs('NewSlipModal Pre-validation', {
        player_id: selectedPlayer.id,
        table_id: tableId,
      });
      setError(`Invalid data: ${uuidValidation.errors.join('; ')}`);
      return;
    }

    try {
      // Debug logging for API call inputs
      if (process.env.NODE_ENV === 'development') {
        console.group('[NewSlipModal] Creating Slip');
        console.log('Player ID:', selectedPlayer.id);
        console.log('Table ID:', tableId);
        console.log('Seat Number:', selectedSeat);
        console.groupEnd();
      }

      // 1. Ensure player has an active visit (or start one)
      // ADR-026: startVisit now returns { visit, isNew, resumed, gamingDay }
      // and handles gaming-day-scoped visits automatically
      const activeVisitResponse = await getActiveVisit(selectedPlayer.id);
      let visitId: string;

      if (activeVisitResponse.has_active_visit && activeVisitResponse.visit) {
        visitId = activeVisitResponse.visit.id;
        if (process.env.NODE_ENV === 'development') {
          console.log('[NewSlipModal] Using existing visit:', visitId);
        }
      } else {
        // Start a new visit for the player (or resume same-day visit)
        const visitResult = await startVisit(selectedPlayer.id);
        visitId = visitResult.visit.id;

        // ADR-026: Show notification when resuming a same-day visit
        if (visitResult.resumed) {
          toast.info('Resuming session from earlier today', {
            description: `Gaming day: ${new Date(visitResult.gamingDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
            icon: <Info className="h-4 w-4" />,
          });
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('[NewSlipModal] Visit result:', {
            visitId,
            isNew: visitResult.isNew,
            resumed: visitResult.resumed,
            gamingDay: visitResult.gamingDay,
          });
        }
      }

      // Pre-validation: Check visit ID format before creating slip
      const visitValidation = validateUUIDs({ visit_id: visitId });
      if (!visitValidation.isValid) {
        debugLogUUIDs('NewSlipModal Visit ID Validation', {
          visit_id: visitId,
        });
        setError(`Invalid visit ID: ${visitValidation.errors.join('; ')}`);
        return;
      }

      // 2. Create the rating slip
      createSlipMutation.mutate({
        visit_id: visitId,
        table_id: tableId,
        seat_number: selectedSeat,
      });
    } catch (err) {
      // Structured logging (development only, properly serialized)
      logError(err, { component: 'NewSlipModal', action: 'visitSetup' });

      // Handle validation errors with detailed messages
      if (isValidationError(err)) {
        setError(formatValidationError(err));
      } else {
        setError(getErrorMessage(err));
      }
    }
  };

  // Handle player selection
  const handleSelectPlayer = (player: PlayerSearchResultDTO) => {
    setSelectedPlayer(player);
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-lg font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            New Rating Slip
          </DialogTitle>
          <DialogDescription>
            Search for a player and select a seat to start a new rating slip.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Player search */}
          <div className="space-y-2">
            <Label
              htmlFor="player-search"
              className="text-xs font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Player
            </Label>

            {selectedPlayer ? (
              <div className="flex items-center justify-between rounded-lg border-2 border-accent/50 bg-accent/10 p-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-accent" />
                  <span className="font-medium">
                    {selectedPlayer.full_name}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPlayer(null)}
                  className="h-7 text-xs"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="player-search"
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoComplete="off"
                />

                {/* Search results dropdown */}
                {searchQuery.length >= 2 && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border-2 border-border bg-card shadow-lg">
                    {isSearching ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No players found
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto py-1">
                        {searchResults.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => handleSelectPlayer(player)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10"
                          >
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{player.full_name}</span>
                            {player.enrollment_status === 'enrolled' && (
                              <span className="ml-auto rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                                Enrolled
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seat selection */}
          <div className="space-y-2">
            <Label
              className="text-xs font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Seat
            </Label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: SEAT_COUNT }, (_, i) => {
                const seatNumber = String(i + 1);
                const isOccupied = occupiedSeats.includes(seatNumber);
                const isSelected = selectedSeat === seatNumber;

                return (
                  <button
                    key={seatNumber}
                    type="button"
                    onClick={() => !isOccupied && setSelectedSeat(seatNumber)}
                    disabled={isOccupied}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg border-2 font-bold transition-all',
                      isOccupied
                        ? 'cursor-not-allowed border-muted bg-muted/50 text-muted-foreground opacity-50'
                        : isSelected
                          ? 'border-accent bg-accent text-accent-foreground'
                          : 'border-border bg-card hover:border-accent/50',
                    )}
                    style={{ fontFamily: 'monospace' }}
                  >
                    {seatNumber}
                  </button>
                );
              })}
            </div>
            {occupiedSeats.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Grayed seats are occupied and cannot be selected.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !selectedPlayer || !selectedSeat || createSlipMutation.isPending
              }
            >
              {createSlipMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Start Slip'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
