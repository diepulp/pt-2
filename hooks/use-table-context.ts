import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableContextKeys } from '@/services/table-context/keys';
import type { TableEvent, TableState } from '@/services/table-context/table-state-machine';
import {
  getTables,
  getTableById,
  createTable,
  updateTable,
  deleteTable,
  getTableState,
  transitionTableState,
  getActiveRatingSlips,
  openTable,
  closeTable,
  startTableBreak,
  endTableBreak,
  reserveTable,
  unreserveTable,
  type TableDTO,
  type TableCreateDTO,
  type TableUpdateDTO,
} from '@/app/actions/table-context-actions';

/**
 * Fetch all tables, optionally filtered by casino
 */
export function useTables(casinoId?: string) {
  return useQuery({
    queryKey: tableContextKeys.tables({ casinoId }),
    queryFn: async () => {
      const result = await getTables(casinoId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!casinoId,
  });
}

/**
 * Fetch a single table by ID
 */
export function useTable(id: string) {
  return useQuery({
    queryKey: tableContextKeys.byTable(id),
    queryFn: async () => {
      const result = await getTableById(id);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new table
 */
export function useCreateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TableCreateDTO) => {
      const result = await createTable(input);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      // Invalidate all table lists
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.tables.scope,
      });
      // Set the newly created table in cache
      queryClient.setQueryData(tableContextKeys.byTable(data.id), data);
    },
  });
}

/**
 * Update a table
 */
export function useUpdateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TableUpdateDTO }) => {
      const result = await updateTable(id, data);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      // Invalidate all table lists
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.tables.scope,
      });
      // Update the specific table in cache
      queryClient.setQueryData(tableContextKeys.byTable(data.id), data);
    },
  });
}

/**
 * Delete a table (soft delete)
 */
export function useDeleteTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTable(id);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      // Invalidate all table lists
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.tables.scope,
      });
      // Remove the table from cache
      queryClient.removeQueries({
        queryKey: tableContextKeys.byTable(data.id),
      });
    },
  });
}

/**
 * Get the current logical state of a table
 */
export function useTableState(tableId: string) {
  return useQuery({
    queryKey: [...tableContextKeys.byTable(tableId), 'state'],
    queryFn: async () => {
      const result = await getTableState(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!tableId,
  });
}

/**
 * Transition a table to a new state
 */
export function useTransitionTableState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tableId, event }: { tableId: string; event: TableEvent }) => {
      const result = await transitionTableState(tableId, event);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      // Update the state in cache
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      // Invalidate the table to refresh full data
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.byTable(tableId),
      });
      // Invalidate all table lists
      queryClient.invalidateQueries({
        queryKey: tableContextKeys.tables.scope,
      });
    },
  });
}

/**
 * Get active rating slips for a table
 */
export function useActiveRatingSlips(tableId: string) {
  return useQuery({
    queryKey: [...tableContextKeys.byTable(tableId), 'rating-slips', 'active'],
    queryFn: async () => {
      const result = await getActiveRatingSlips(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!tableId,
  });
}

/**
 * Convenience hooks for common state transitions
 */

export function useOpenTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await openTable(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}

export function useCloseTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await closeTable(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}

export function useStartTableBreak() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await startTableBreak(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}

export function useEndTableBreak() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await endTableBreak(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}

export function useReserveTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await reserveTable(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}

export function useUnreserveTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tableId: string) => {
      const result = await unreserveTable(tableId);
      if (result.error) {
        throw new Error(result.error);
      }
      return { tableId, newState: result.data };
    },
    onSuccess: ({ tableId, newState }) => {
      queryClient.setQueryData([...tableContextKeys.byTable(tableId), 'state'], newState);
      queryClient.invalidateQueries({ queryKey: tableContextKeys.byTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableContextKeys.tables.scope });
    },
  });
}
