/**
 * Table Session Query and Mutation Hooks
 *
 * Hooks for table session lifecycle operations.
 * State machine: OPEN → ACTIVE → RUNDOWN → CLOSED
 *
 * @see services/table-context/http.ts - HTTP fetchers
 * @see services/table-context/keys.ts - Query key factory
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  TableSessionDTO,
  TableSessionStatus,
} from '@/services/table-context/dtos';
import {
  closeTableSession,
  fetchCurrentTableSession,
  openTableSession,
  startTableRundown,
} from '@/services/table-context/http';
import { tableContextKeys } from '@/services/table-context/keys';
import type { CloseTableSessionRequestBody } from '@/services/table-context/schemas';

// === Query Hooks ===

/**
 * Fetches the current (non-closed) session for a gaming table.
 * Returns null if no active session exists.
 *
 * @param tableId - Gaming table UUID
 */
export function useCurrentTableSession(tableId: string) {
  return useQuery({
    queryKey: tableContextKeys.sessions.current(tableId),
    queryFn: () => fetchCurrentTableSession(tableId),
    enabled: !!tableId,
    staleTime: 30_000, // 30 seconds - sessions don't change frequently
  });
}

// === Mutation Hooks ===

/**
 * Opens a new table session.
 * Transitions table to ACTIVE state (OPEN → ACTIVE is implicit for MVP).
 * Invalidates current session query on success.
 *
 * @param tableId - Gaming table UUID
 */
export function useOpenTableSession(tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['open-table-session', tableId],
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      return openTableSession({ gaming_table_id: tableId }, idempotencyKey);
    },
    onSuccess: (data) => {
      // Update current session cache with returned data
      queryClient.setQueryData(
        tableContextKeys.sessions.current(tableId),
        data,
      );
      // Also cache by ID
      queryClient.setQueryData(tableContextKeys.sessions.byId(data.id), data);
    },
  });
}

/**
 * Starts rundown for a table session.
 * Transitions: ACTIVE/OPEN → RUNDOWN
 *
 * @param sessionId - Table session UUID
 * @param tableId - Gaming table UUID (for cache invalidation)
 */
export function useStartTableRundown(sessionId: string, tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['start-table-rundown', sessionId],
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      return startTableRundown(sessionId, idempotencyKey);
    },
    onSuccess: (data) => {
      // Update both caches
      queryClient.setQueryData(
        tableContextKeys.sessions.current(tableId),
        data,
      );
      queryClient.setQueryData(tableContextKeys.sessions.byId(sessionId), data);
    },
  });
}

/**
 * Closes a table session.
 * Transitions: RUNDOWN/ACTIVE → CLOSED
 * Requires at least one closing artifact (drop_event_id or closing_inventory_snapshot_id).
 *
 * @param sessionId - Table session UUID
 * @param tableId - Gaming table UUID (for cache invalidation)
 */
export function useCloseTableSession(sessionId: string, tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['close-table-session', sessionId],
    mutationFn: async (input: CloseTableSessionRequestBody) => {
      const idempotencyKey = crypto.randomUUID();
      return closeTableSession(sessionId, input, idempotencyKey);
    },
    onSuccess: () => {
      // Session is closed - clear current session cache (returns null)
      queryClient.setQueryData(
        tableContextKeys.sessions.current(tableId),
        null,
      );
      // Invalidate to refetch fresh state
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.sessions.scope,
      });
    },
  });
}

// === Utility Functions ===

/**
 * Determines if a session state allows opening a new session.
 * Can open if no session exists or current session is closed.
 */
export function canOpenSession(session: TableSessionDTO | null): boolean {
  return !session || session.status === 'CLOSED';
}

/**
 * Determines if a session can transition to rundown.
 * Valid from OPEN or ACTIVE states.
 */
export function canStartRundown(session: TableSessionDTO | null): boolean {
  if (!session) return false;
  return session.status === 'OPEN' || session.status === 'ACTIVE';
}

/**
 * Determines if a session can be closed.
 * Valid from RUNDOWN or ACTIVE states (ACTIVE allows shortcut close).
 */
export function canCloseSession(session: TableSessionDTO | null): boolean {
  if (!session) return false;
  return session.status === 'RUNDOWN' || session.status === 'ACTIVE';
}

/**
 * Gets display label for session status.
 */
export function getSessionStatusLabel(status: TableSessionStatus): string {
  const labels: Record<TableSessionStatus, string> = {
    OPEN: 'Open',
    ACTIVE: 'Active',
    RUNDOWN: 'Rundown',
    CLOSED: 'Closed',
  };
  return labels[status];
}

/**
 * Gets status color for visual indicators.
 */
export function getSessionStatusColor(
  status: TableSessionStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const colors: Record<
    TableSessionStatus,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    OPEN: 'outline',
    ACTIVE: 'default',
    RUNDOWN: 'secondary',
    CLOSED: 'destructive',
  };
  return colors[status];
}

// Re-export types for convenience
export type { TableSessionDTO, TableSessionStatus };
