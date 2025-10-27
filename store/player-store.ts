import { create } from 'zustand';

/**
 * Player status filter options
 */
type PlayerStatusFilter = 'all' | 'active' | 'inactive' | 'vip';

/**
 * Sort field options for player list
 */
type PlayerSortField = 'name' | 'lastVisit' | 'totalPoints' | 'tier';

/**
 * Sort direction
 */
type SortDirection = 'asc' | 'desc';

/**
 * Player UI Store Interface
 * Manages UI state specific to player-related views
 */
interface PlayerUIStore {
  // Filter state
  searchQuery: string;
  statusFilter: PlayerStatusFilter;

  // Sort state
  sortBy: PlayerSortField;
  sortDirection: SortDirection;

  // Pagination UI state (NOTE: actual data pagination handled by React Query)
  currentPage: number;
  itemsPerPage: number;

  // View mode state
  viewMode: 'grid' | 'list' | 'table';

  // Selected players (for bulk actions)
  selectedPlayerIds: Set<string>;

  // Filter actions
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: PlayerStatusFilter) => void;

  // Sort actions
  setSortBy: (field: PlayerSortField) => void;
  toggleSortDirection: () => void;

  // Pagination actions
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (items: number) => void;

  // View mode actions
  setViewMode: (mode: 'grid' | 'list' | 'table') => void;

  // Selection actions
  togglePlayerSelection: (playerId: string) => void;
  selectAllPlayers: (playerIds: string[]) => void;
  clearSelection: () => void;

  // Reset actions
  resetFilters: () => void;
}

/**
 * Initial state values
 */
const initialState = {
  searchQuery: '',
  statusFilter: 'all' as PlayerStatusFilter,
  sortBy: 'lastVisit' as PlayerSortField,
  sortDirection: 'desc' as SortDirection,
  currentPage: 1,
  itemsPerPage: 25,
  viewMode: 'table' as 'grid' | 'list' | 'table',
  selectedPlayerIds: new Set<string>(),
};

/**
 * Player UI Store
 *
 * Handles ephemeral UI state for player management including:
 * - Search and filtering UI state
 * - Sorting preferences
 * - Pagination UI state (page number, items per page)
 * - View mode (grid/list/table)
 * - Multi-selection for bulk actions
 *
 * DO NOT use for:
 * - Actual player data (use React Query)
 * - Persistent preferences (use database or localStorage)
 * - Server-side pagination data (use React Query)
 */
export const usePlayerUIStore = create<PlayerUIStore>((set) => ({
  // Initial state
  ...initialState,

  // Filter actions
  setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }), // Reset to page 1 on search

  setStatusFilter: (status) => set({ statusFilter: status, currentPage: 1 }), // Reset to page 1 on filter

  // Sort actions
  setSortBy: (field) =>
    set((state) => {
      // If same field, toggle direction instead
      if (state.sortBy === field) {
        return {
          sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      // New field, default to descending
      return {
        sortBy: field,
        sortDirection: 'desc',
      };
    }),

  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  // Pagination actions
  setCurrentPage: (page) => set({ currentPage: page }),

  setItemsPerPage: (items) => set({ itemsPerPage: items, currentPage: 1 }), // Reset to page 1 when changing page size

  // View mode actions
  setViewMode: (mode) => set({ viewMode: mode }),

  // Selection actions
  togglePlayerSelection: (playerId) =>
    set((state) => {
      const newSelection = new Set(state.selectedPlayerIds);
      if (newSelection.has(playerId)) {
        newSelection.delete(playerId);
      } else {
        newSelection.add(playerId);
      }
      return { selectedPlayerIds: newSelection };
    }),

  selectAllPlayers: (playerIds) =>
    set({ selectedPlayerIds: new Set(playerIds) }),

  clearSelection: () => set({ selectedPlayerIds: new Set() }),

  // Reset actions
  resetFilters: () =>
    set({
      searchQuery: initialState.searchQuery,
      statusFilter: initialState.statusFilter,
      sortBy: initialState.sortBy,
      sortDirection: initialState.sortDirection,
      currentPage: 1,
    }),
}));

/**
 * Selectors for optimized component re-renders
 */
export const selectPlayerFilters = (state: PlayerUIStore) => ({
  searchQuery: state.searchQuery,
  statusFilter: state.statusFilter,
});

export const selectPlayerSort = (state: PlayerUIStore) => ({
  sortBy: state.sortBy,
  sortDirection: state.sortDirection,
});

export const selectPlayerPagination = (state: PlayerUIStore) => ({
  currentPage: state.currentPage,
  itemsPerPage: state.itemsPerPage,
});

export const selectPlayerSelection = (state: PlayerUIStore) =>
  state.selectedPlayerIds;

export const selectPlayerViewMode = (state: PlayerUIStore) => state.viewMode;
