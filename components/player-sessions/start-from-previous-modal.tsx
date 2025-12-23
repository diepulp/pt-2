"use client";

import { X } from "lucide-react";
import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { StartFromPreviousPanel } from "./start-from-previous";
import type {
  GamingDayInfo,
  PlayerInfo,
  SessionData,
} from "./start-from-previous";

// ============================================================================
// Types
// ============================================================================

export interface StartFromPreviousModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** Player data (null when modal is closed or loading) */
  player: PlayerInfo | null;
  /** Recent closed sessions (scoped to gaming day) */
  recentSessions: SessionData[];
  /** Gaming day context */
  gamingDay?: GamingDayInfo;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when Start from previous is clicked */
  onStartFromPrevious?: (sourceVisitId: string) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function StartFromPreviousModal({
  open,
  onOpenChange,
  player,
  recentSessions,
  gamingDay,
  isLoading = false,
  onStartFromPrevious,
  className,
}: StartFromPreviousModalProps) {
  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-lg p-0 gap-0 overflow-hidden", className)}
      >
        {/* Hidden accessible title for screen readers */}
        <DialogHeader className="sr-only">
          <DialogTitle>
            {player ? `Session History - ${player.name}` : "Session History"}
          </DialogTitle>
          <DialogDescription>
            View recent sessions and start a new visit from a previous session.
          </DialogDescription>
        </DialogHeader>

        {/* Panel Content */}
        {player ? (
          <StartFromPreviousPanel
            player={player}
            recentSessions={recentSessions}
            gamingDay={gamingDay}
            isLoading={isLoading}
            onStartFromPrevious={(sourceVisitId) => {
              onStartFromPrevious?.(sourceVisitId);
              handleClose();
            }}
            onClose={handleClose}
            embedded
            className="p-0"
          />
        ) : (
          <div className="p-6">
            <StartFromPreviousPanel
              player={{ player_id: "", name: "Loading..." }}
              recentSessions={[]}
              isLoading={true}
              embedded
              className="p-0"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Hook for managing modal state
// ============================================================================

export interface UseStartFromPreviousModalState {
  isOpen: boolean;
  selectedPlayer: PlayerInfo | null;
  recentSessions: SessionData[];
  isLoading: boolean;
}

export interface UseStartFromPreviousModalActions {
  open: (player: PlayerInfo) => void;
  close: () => void;
  setSessionData: (recentSessions: SessionData[]) => void;
  setLoading: (loading: boolean) => void;
}

export function useStartFromPreviousModal(): [
  UseStartFromPreviousModalState,
  UseStartFromPreviousModalActions,
] {
  const [state, setState] = React.useState<UseStartFromPreviousModalState>({
    isOpen: false,
    selectedPlayer: null,
    recentSessions: [],
    isLoading: false,
  });

  const actions: UseStartFromPreviousModalActions = React.useMemo(
    () => ({
      open: (player: PlayerInfo) => {
        setState({
          isOpen: true,
          selectedPlayer: player,
          recentSessions: [],
          isLoading: true,
        });
      },
      close: () => {
        setState((prev) => ({
          ...prev,
          isOpen: false,
        }));
      },
      setSessionData: (recentSessions: SessionData[]) => {
        setState((prev) => ({
          ...prev,
          recentSessions,
          isLoading: false,
        }));
      },
      setLoading: (loading: boolean) => {
        setState((prev) => ({
          ...prev,
          isLoading: loading,
        }));
      },
    }),
    [],
  );

  return [state, actions];
}
