/**
 * Seat Context Menu
 *
 * Dropdown menu for seat actions in the table layout.
 * Actions vary based on seat occupancy state.
 *
 * Design: Minimal dropdown with brutalist typography.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS4
 */

"use client";

import { User, UserPlus, Pause, Play, X, ArrowRightLeft } from "lucide-react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  ActivePlayerForDashboardDTO,
  RatingSlipDTO,
  RatingSlipWithPlayerDTO,
} from "@/services/rating-slip/dtos";

export interface SeatOccupant {
  firstName: string;
  lastName: string;
  slipId?: string;
  slipStatus?: "open" | "paused";
}

interface SeatContextMenuProps {
  /** The trigger element (the seat button) */
  children: React.ReactNode;
  /** Seat number (1-based) */
  seatNumber: number;
  /** Current occupant info (null if empty) */
  occupant: SeatOccupant | null;
  /** Callback to start a new slip at this seat */
  onNewSlip?: (seatNumber: number) => void;
  /** Callback to pause the current slip */
  onPauseSlip?: (slipId: string) => void;
  /** Callback to resume the current slip */
  onResumeSlip?: (slipId: string) => void;
  /** Callback to close the current slip */
  onCloseSlip?: (slipId: string) => void;
  /** Callback to move player to another seat */
  onMovePlayer?: (slipId: string, fromSeat: number) => void;
  /** Whether the menu is disabled */
  disabled?: boolean;
}

export function SeatContextMenu({
  children,
  seatNumber,
  occupant,
  onNewSlip,
  onPauseSlip,
  onResumeSlip,
  onCloseSlip,
  onMovePlayer,
  disabled,
}: SeatContextMenuProps) {
  const isOccupied = occupant !== null;
  const isPaused = occupant?.slipStatus === "paused";
  const isOpen = occupant?.slipStatus === "open";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        {/* Seat header */}
        <DropdownMenuLabel
          className="text-xs font-bold uppercase tracking-widest"
          style={{ fontFamily: "monospace" }}
        >
          Seat {seatNumber}
        </DropdownMenuLabel>

        {isOccupied ? (
          <>
            {/* Occupant info */}
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">
                  {occupant.firstName} {occupant.lastName}
                </span>
              </div>
              {isPaused && (
                <span className="ml-5 mt-0.5 inline-block rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
                  Paused
                </span>
              )}
            </div>

            <DropdownMenuSeparator />

            {/* Occupied seat actions */}
            {isOpen && onPauseSlip && occupant.slipId && (
              <DropdownMenuItem
                onClick={() => onPauseSlip(occupant.slipId!)}
                className="gap-2"
              >
                <Pause className="h-4 w-4" />
                Pause Slip
              </DropdownMenuItem>
            )}

            {isPaused && onResumeSlip && occupant.slipId && (
              <DropdownMenuItem
                onClick={() => onResumeSlip(occupant.slipId!)}
                className="gap-2 text-green-600 focus:text-green-600 dark:text-green-400 dark:focus:text-green-400"
              >
                <Play className="h-4 w-4" />
                Resume Slip
              </DropdownMenuItem>
            )}

            {onMovePlayer && occupant.slipId && (
              <DropdownMenuItem
                onClick={() => onMovePlayer(occupant.slipId!, seatNumber)}
                className="gap-2"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Move Player
              </DropdownMenuItem>
            )}

            {onCloseSlip && occupant.slipId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onCloseSlip(occupant.slipId!)}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <X className="h-4 w-4" />
                  Close Slip
                </DropdownMenuItem>
              </>
            )}
          </>
        ) : (
          <>
            {/* Empty seat info */}
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Seat is available
            </div>

            <DropdownMenuSeparator />

            {/* Empty seat actions */}
            {onNewSlip && (
              <DropdownMenuItem
                onClick={() => onNewSlip(seatNumber)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Start New Slip
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// === Utility Types ===

/**
 * Maps rating slips to seat occupants for the context menu.
 * @deprecated Use mapActivePlayersToOccupants for real player names.
 */
export function mapSlipsToOccupants(
  slips: RatingSlipDTO[],
): Map<string, SeatOccupant> {
  const occupants = new Map<string, SeatOccupant>();

  for (const slip of slips) {
    if (
      slip.seat_number &&
      (slip.status === "open" || slip.status === "paused")
    ) {
      // Note: Player name would need to be fetched separately via visit → player join
      // For MVP, we show seat as occupied without full player details
      occupants.set(slip.seat_number, {
        firstName: "Player", // Placeholder - need visit/player join
        lastName: `#${slip.seat_number}`,
        slipId: slip.id,
        slipStatus: slip.status,
      });
    }
  }

  return occupants;
}

/**
 * Maps active player DTOs to seat occupants for the table layout.
 * Uses real player names from the joined visit → player data.
 *
 * @param players - Active players from casino-wide or table-filtered query
 * @param tableId - Optional table ID to filter players (if not already filtered)
 * @returns Map of seat number to occupant with real player names
 */
export function mapActivePlayersToOccupants(
  players: ActivePlayerForDashboardDTO[],
  tableId?: string,
): Map<string, SeatOccupant> {
  const occupants = new Map<string, SeatOccupant>();

  for (const player of players) {
    // Skip if filtering by table and doesn't match
    if (tableId && player.tableId !== tableId) continue;

    // Skip if no seat number
    if (!player.seatNumber) continue;

    // Use real player name, fallback to "Guest" for ghost visits
    const firstName = player.player?.firstName ?? "Guest";
    const lastName = player.player?.lastName ?? "";

    occupants.set(player.seatNumber, {
      firstName,
      lastName,
      slipId: player.slipId,
      slipStatus: player.status,
    });
  }

  return occupants;
}

/**
 * Gets list of occupied seat numbers from slips.
 */
export function getOccupiedSeats(slips: RatingSlipDTO[]): string[] {
  return slips
    .filter(
      (s) => s.seat_number && (s.status === "open" || s.status === "paused"),
    )
    .map((s) => s.seat_number!)
    .filter((seat): seat is string => seat !== null);
}

/**
 * Maps rating slips with embedded player data to seat occupants.
 * Uses real player names from the joined visit → player data.
 *
 * PERF-002: This is the optimized version that eliminates the need
 * for a separate useCasinoActivePlayers() call by using slips
 * that already have player names embedded.
 *
 * @param slips - Rating slips with player data from listActiveForTableWithPlayer()
 * @returns Map of seat number to occupant with real player names
 *
 * @see PERF-002 Pit Dashboard Data Flow Optimization
 */
export function mapSlipsWithPlayerToOccupants(
  slips: RatingSlipWithPlayerDTO[],
): Map<string, SeatOccupant> {
  const occupants = new Map<string, SeatOccupant>();

  for (const slip of slips) {
    // Skip if no seat number
    if (!slip.seat_number) continue;

    // Skip if not active (open or paused)
    if (slip.status !== "open" && slip.status !== "paused") continue;

    // Use real player name, fallback to "Guest" for ghost visits
    const firstName = slip.player?.firstName ?? "Guest";
    const lastName = slip.player?.lastName ?? "";

    occupants.set(slip.seat_number, {
      firstName,
      lastName,
      slipId: slip.id,
      slipStatus: slip.status,
    });
  }

  return occupants;
}
