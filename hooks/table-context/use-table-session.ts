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

import { dashboardKeys } from '@/hooks/dashboard/keys';
import { ratingSlipKeys } from '@/services/rating-slip/keys';
import type {
  TableSessionDTO,
  TableSessionStatus,
} from '@/services/table-context/dtos';
import {
  closeTableSession,
  fetchCurrentTableSession,
  forceCloseTableSession,
  openTableSession,
  startTableRundown,
} from '@/services/table-context/http';
import { tableContextKeys } from '@/services/table-context/keys';
import type {
  CloseTableSessionRequestBody,
  ForceCloseTableSessionRequestBody,
} from '@/services/table-context/schemas';
import { visitKeys } from '@/services/visit/keys';

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
    refetchOnMount: 'always', // EXEC-038A Bug 1: prevent stale cache after close
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
      // EXEC-038A Bug 3: Invalidate dashboard so grid badge shows session active
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
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
    onSuccess: async () => {
      const queryKey = tableContextKeys.sessions.current(tableId);
      // EXEC-038A Bug 1: cancel→set→invalidate pattern prevents stale refetch race
      // 1. Cancel in-flight fetches that could overwrite our optimistic cache write
      await queryClient.cancelQueries({ queryKey });
      // 2. Optimistic set to null — immediate UI feedback
      queryClient.setQueryData(queryKey, null);
      // 3. Background refetch for consistency
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      // 4. EXEC-038A Bug 3: Invalidate dashboard tables so grid badge updates
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
      // 5. PRD-057: Invalidate rating-slip and visit caches (stale after session close)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.forTable.scope,
      });
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      queryClient.invalidateQueries({ queryKey: visitKeys.root });
    },
  });
}

/**
 * Force-closes a table session (privileged roles only).
 * Bypasses closing artifact requirements.
 *
 * @param sessionId - Table session UUID
 * @param tableId - Gaming table UUID (for cache invalidation)
 * @see PRD-038A Close Guardrails — role-gated server-side (pit_boss, admin)
 */
export function useForceCloseTableSession(sessionId: string, tableId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['force-close-table-session', sessionId],
    mutationFn: async (input: ForceCloseTableSessionRequestBody) => {
      const idempotencyKey = crypto.randomUUID();
      return forceCloseTableSession(sessionId, input, idempotencyKey);
    },
    onSuccess: async () => {
      const queryKey = tableContextKeys.sessions.current(tableId);
      // EXEC-038A Bug 1: same cancel→set→invalidate pattern as standard close
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, null);
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      // EXEC-038A Bug 3: Invalidate dashboard tables so grid badge updates
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
      // PRD-057: Invalidate rating-slip and visit caches (consistency with standard close)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.forTable.scope,
      });
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      queryClient.invalidateQueries({ queryKey: visitKeys.root });
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
 * Uses ADR-028 D6 standardized labels.
 *
 * @see services/table-context/labels.ts for centralized label constants
 */
export function getSessionStatusLabel(status: TableSessionStatus): string {
  const labels: Record<TableSessionStatus, string> = {
    OPEN: 'Open',
    ACTIVE: 'In Play',
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
