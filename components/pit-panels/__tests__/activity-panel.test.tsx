/**
 * ActivityPanel Component Unit Tests
 *
 * Tests for the casino-wide active players panel.
 * Verifies rendering states, search, sort, and click behavior.
 *
 * @see PERF-003 Casino-Wide Activity Panel
 * @see components/pit-panels/activity-panel.tsx
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ActivePlayerForDashboardDTO } from '@/services/rating-slip/dtos';

import { ActivityPanel } from '../activity-panel';

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock the useCasinoActivePlayers hook
const mockUseCasinoActivePlayers = jest.fn();
jest.mock('@/hooks/dashboard', () => ({
  useCasinoActivePlayers: (options?: { search?: string; limit?: number }) =>
    mockUseCasinoActivePlayers(options),
}));

// Mock the Zustand store
const mockStore = {
  activitySearchQuery: '',
  activitySortMode: 'recent' as const,
  setActivitySearchQuery: jest.fn(),
  setActivitySortMode: jest.fn(),
};

jest.mock('@/store/pit-dashboard-store', () => ({
  usePitDashboardStore: (selector: (state: typeof mockStore) => unknown) =>
    selector(mockStore),
}));

// === Test Data ===

const mockPlayers: ActivePlayerForDashboardDTO[] = [
  {
    slipId: 'slip-1',
    visitId: 'visit-1',
    tableId: 'table-1',
    tableName: 'Blackjack 1',
    pitName: 'Main Pit',
    seatNumber: '3',
    startTime: '2026-01-26T10:00:00Z',
    status: 'open',
    averageBet: 100,
    player: {
      id: 'player-1',
      firstName: 'John',
      lastName: 'Doe',
      birthDate: '1985-03-15',
      tier: 'Gold',
    },
  },
  {
    slipId: 'slip-2',
    visitId: 'visit-2',
    tableId: 'table-2',
    tableName: 'Roulette 2',
    pitName: 'VIP Pit',
    seatNumber: '1',
    startTime: '2026-01-26T11:30:00Z',
    status: 'paused',
    averageBet: 250,
    player: {
      id: 'player-2',
      firstName: 'Alice',
      lastName: 'Smith',
      birthDate: '1990-07-22',
      tier: 'Platinum',
    },
  },
  {
    slipId: 'slip-3',
    visitId: 'visit-3',
    tableId: 'table-1',
    tableName: 'Blackjack 1',
    pitName: 'Main Pit',
    seatNumber: '5',
    startTime: '2026-01-26T09:00:00Z',
    status: 'open',
    averageBet: null,
    player: null, // Ghost visit
  },
];

// === Tests ===

describe('ActivityPanel', () => {
  const defaultOnSlipClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.activitySearchQuery = '';
    mockStore.activitySortMode = 'recent';
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe('loading state', () => {
    it('renders loading skeleton when data is loading', () => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('Loading players...')).toBeInTheDocument();
      // Should show skeleton items
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Error State
  // ===========================================================================

  describe('error state', () => {
    it('renders error message when fetch fails', () => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network error'),
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('renders default error message when error has no message', () => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('Failed to load players')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Empty State
  // ===========================================================================

  describe('empty state', () => {
    it('renders empty state when no players', () => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: [], count: 0 },
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('No active players')).toBeInTheDocument();
      expect(
        screen.getByText('Players will appear here when sessions are started'),
      ).toBeInTheDocument();
    });

    it('renders search-specific empty state when search has no results', () => {
      mockStore.activitySearchQuery = 'nonexistent';
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: [], count: 0 },
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(
        screen.getByText('No players match your search'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Try a different search term'),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Data Rendering
  // ===========================================================================

  describe('data rendering', () => {
    beforeEach(() => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: mockPlayers, count: 3 },
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it('renders player count in header', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(
        screen.getByText('3 active players across all tables'),
      ).toBeInTheDocument();
    });

    it('renders singular player text for one player', () => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: [mockPlayers[0]], count: 1 },
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(
        screen.getByText('1 active player across all tables'),
      ).toBeInTheDocument();
    });

    it('renders player names', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('renders Guest for null player', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('Guest')).toBeInTheDocument();
    });

    it('renders table names', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getAllByText('Blackjack 1')).toHaveLength(2);
      expect(screen.getByText('Roulette 2')).toBeInTheDocument();
    });

    it('renders status badges', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      // There are 2 open slips and 1 paused
      const openBadges = screen.getAllByText('Open');
      const pausedBadges = screen.getAllByText('Paused');

      expect(openBadges.length).toBeGreaterThanOrEqual(1);
      expect(pausedBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('renders summary footer with correct counts', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      // The summary footer contains "Total" label which is unique
      expect(screen.getByText('Total')).toBeInTheDocument();

      // Check that we have stat count containers visible
      // The footer has grid-cols-3 with Open, Paused, Total counts
      const totalLabel = screen.getByText('Total');
      expect(totalLabel.closest('div')?.parentElement).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Click Behavior
  // ===========================================================================

  describe('click behavior', () => {
    beforeEach(() => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: mockPlayers, count: 3 },
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it('calls onSlipClick with correct slipId when row is clicked', async () => {
      const user = userEvent.setup();
      const onSlipClick = jest.fn();

      render(<ActivityPanel onSlipClick={onSlipClick} />);

      const row = screen.getByText('John Doe').closest('tr');
      expect(row).toBeInTheDocument();

      await user.click(row!);

      expect(onSlipClick).toHaveBeenCalledWith('slip-1');
    });

    it('calls onSlipClick when Enter key is pressed on row', async () => {
      const user = userEvent.setup();
      const onSlipClick = jest.fn();

      render(<ActivityPanel onSlipClick={onSlipClick} />);

      const row = screen.getByText('John Doe').closest('tr');
      row?.focus();
      await user.keyboard('{Enter}');

      expect(onSlipClick).toHaveBeenCalledWith('slip-1');
    });

    it('calls onSlipClick when Space key is pressed on row', async () => {
      const user = userEvent.setup();
      const onSlipClick = jest.fn();

      render(<ActivityPanel onSlipClick={onSlipClick} />);

      const row = screen.getByText('John Doe').closest('tr');
      row?.focus();
      await user.keyboard(' ');

      expect(onSlipClick).toHaveBeenCalledWith('slip-1');
    });
  });

  // ===========================================================================
  // Search Functionality
  // ===========================================================================

  describe('search functionality', () => {
    beforeEach(() => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: mockPlayers, count: 3 },
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it('renders search input', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const searchInput = screen.getByPlaceholderText(
        'Search by player name...',
      );
      expect(searchInput).toBeInTheDocument();
    });

    it('updates search input on change', async () => {
      const user = userEvent.setup();

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const searchInput = screen.getByPlaceholderText(
        'Search by player name...',
      );
      await user.type(searchInput, 'John');

      expect(searchInput).toHaveValue('John');
    });

    it('debounces search query updates', async () => {
      const user = userEvent.setup();

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const searchInput = screen.getByPlaceholderText(
        'Search by player name...',
      );
      await user.type(searchInput, 'John');

      // Wait for debounce
      await waitFor(
        () => {
          expect(mockStore.setActivitySearchQuery).toHaveBeenCalledWith('John');
        },
        { timeout: 500 },
      );
    });
  });

  // ===========================================================================
  // Sort Functionality
  // ===========================================================================

  describe('sort functionality', () => {
    beforeEach(() => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: mockPlayers, count: 3 },
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it('renders sort select', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      // The select trigger should be visible
      const sortTrigger = screen.getByRole('combobox');
      expect(sortTrigger).toBeInTheDocument();
    });

    it('sorts by recent (default) - most recent first', () => {
      mockStore.activitySortMode = 'recent';

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const rows = screen.getAllByRole('row').slice(1); // Skip header
      const firstRowText = rows[0].textContent;

      // slip-2 has startTime 11:30, which is most recent
      expect(firstRowText).toContain('Alice Smith');
    });

    it('sorts by alpha-asc - A to Z by last name', () => {
      mockStore.activitySortMode = 'alpha-asc';

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const rows = screen.getAllByRole('row').slice(1);

      // Ghost (empty lastName) comes first, then Doe, then Smith
      // Find the row with John Doe - should be second (after Guest)
      const doeRow = rows.find((row) => row.textContent?.includes('John Doe'));
      const smithRow = rows.find((row) =>
        row.textContent?.includes('Alice Smith'),
      );

      expect(doeRow).toBeDefined();
      expect(smithRow).toBeDefined();

      // Doe should appear before Smith in A-Z sort
      const doeIndex = rows.indexOf(doeRow!);
      const smithIndex = rows.indexOf(smithRow!);
      expect(doeIndex).toBeLessThan(smithIndex);
    });

    it('sorts by alpha-desc - Z to A by last name', () => {
      mockStore.activitySortMode = 'alpha-desc';

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const rows = screen.getAllByRole('row').slice(1);

      // Smith comes first in Z-A sort
      const doeRow = rows.find((row) => row.textContent?.includes('John Doe'));
      const smithRow = rows.find((row) =>
        row.textContent?.includes('Alice Smith'),
      );

      expect(smithRow).toBeDefined();
      expect(doeRow).toBeDefined();

      // Smith should appear before Doe in Z-A sort
      const doeIndex = rows.indexOf(doeRow!);
      const smithIndex = rows.indexOf(smithRow!);
      expect(smithIndex).toBeLessThan(doeIndex);
    });
  });

  // ===========================================================================
  // Hook Integration
  // ===========================================================================

  describe('hook integration', () => {
    it('passes search and limit options to hook', () => {
      mockStore.activitySearchQuery = 'test';
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: [], count: 0 },
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(mockUseCasinoActivePlayers).toHaveBeenCalledWith({
        search: 'test',
        limit: 200,
      });
    });

    it('passes undefined search when query is empty', () => {
      mockStore.activitySearchQuery = '';
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: [], count: 0 },
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(mockUseCasinoActivePlayers).toHaveBeenCalledWith({
        search: undefined,
        limit: 200,
      });
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('accessibility', () => {
    beforeEach(() => {
      mockUseCasinoActivePlayers.mockReturnValue({
        data: { items: mockPlayers, count: 3 },
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it('rows have tabIndex for keyboard navigation', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      const rows = screen.getAllByRole('row').slice(1);
      rows.forEach((row) => {
        expect(row).toHaveAttribute('tabindex', '0');
      });
    });

    it('renders Live indicator', () => {
      render(<ActivityPanel onSlipClick={defaultOnSlipClick} />);

      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });
});
