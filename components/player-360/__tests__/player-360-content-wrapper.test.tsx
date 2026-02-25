/**
 * Player 360 Content Wrapper Tests
 *
 * Integration tests for Player360ContentWrapper:
 * - Filter reset on playerId change (PERF-006 P0-2)
 * - Recent players tracking
 * - Composition (header + body + timeline)
 * - Player selection navigation
 *
 * @see PERF-006 WS3 — State Isolation & Input Validation
 * @see PERF-006 WS7 — Integration & E2E Tests
 */

import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useTimelineFilterStore } from '@/hooks/player-360/use-timeline-filter';

// === Mocks ===

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const mockAddRecent = jest.fn();
const mockPlayerData = {
  id: 'player-abc-123',
  first_name: 'John',
  last_name: 'Doe',
};

jest.mock('@/hooks/player/use-player', () => ({
  usePlayer: jest.fn((playerId: string) => ({
    data: playerId === 'player-abc-123' ? mockPlayerData : null,
    isLoading: false,
    error: null,
  })),
}));

jest.mock('@/components/player-360', () => ({
  Player360Body: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="player-360-body">{children}</div>
  ),
  Player360Header: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="player-360-header">{children}</div>
  ),
  Player360HeaderContent: ({
    playerId,
    onSelectPlayer,
  }: {
    playerId: string;
    player: unknown;
    playerLoading: boolean;
    playerError: unknown;
    onSelectPlayer: (id: string) => void;
  }) => (
    <div data-testid="header-content">
      <span data-testid="header-player-id">{playerId}</span>
      <button
        data-testid="select-player-btn"
        onClick={() => onSelectPlayer('player-new-456')}
      >
        Select
      </button>
    </div>
  ),
  useRecentPlayers: () => ({ addRecent: mockAddRecent }),
}));

jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/timeline-content',
  () => ({
    TimelinePageContent: ({
      playerId,
      gamingDay,
    }: {
      playerId: string;
      gamingDay: string;
    }) => (
      <div data-testid="timeline-page-content">
        <span data-testid="timeline-player-id">{playerId}</span>
        <span data-testid="timeline-gaming-day">{gamingDay}</span>
      </div>
    ),
  }),
);

// Resolve via dynamic import because it's a 'use client' component
let Player360ContentWrapper: React.ComponentType<{
  playerId: string;
  gamingDay: string;
}>;

beforeAll(async () => {
  const mod =
    await import('@/app/(dashboard)/players/[[...playerId]]/_components/player-360-content-wrapper');
  Player360ContentWrapper = mod.Player360ContentWrapper;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset Zustand store to default state between tests
  act(() => {
    useTimelineFilterStore.getState().clearFilter();
    useTimelineFilterStore.getState().setTimeLens('12w');
  });
});

// === Tests ===

describe('Player360ContentWrapper', () => {
  describe('rendering', () => {
    it('renders the page container with data-testid', () => {
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(screen.getByTestId('player-360-page')).toBeInTheDocument();
    });

    it('renders header with player ID', () => {
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(screen.getByTestId('player-360-header')).toBeInTheDocument();
      expect(screen.getByTestId('header-player-id')).toHaveTextContent(
        'player-abc-123',
      );
    });

    it('renders body with TimelinePageContent', () => {
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(screen.getByTestId('player-360-body')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-page-content')).toBeInTheDocument();
    });

    it('passes playerId and gamingDay to TimelinePageContent', () => {
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(screen.getByTestId('timeline-player-id')).toHaveTextContent(
        'player-abc-123',
      );
      expect(screen.getByTestId('timeline-gaming-day')).toHaveTextContent(
        '2026-01-26',
      );
    });
  });

  describe('filter reset on player change (PERF-006 P0-2)', () => {
    it('clears active category filter when playerId changes', () => {
      // Set a filter before rendering
      act(() => {
        useTimelineFilterStore.getState().setCategory('session');
      });
      expect(useTimelineFilterStore.getState().activeCategory).toBe('session');

      const { rerender } = render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      // First render clears filter
      expect(useTimelineFilterStore.getState().activeCategory).toBeNull();

      // Set filter again
      act(() => {
        useTimelineFilterStore.getState().setCategory('financial');
      });
      expect(useTimelineFilterStore.getState().activeCategory).toBe(
        'financial',
      );

      // Re-render with new player ID
      rerender(
        <Player360ContentWrapper
          playerId="player-new-456"
          gamingDay="2026-01-26"
        />,
      );

      // Filter should be cleared again
      expect(useTimelineFilterStore.getState().activeCategory).toBeNull();
    });

    it('clears filter on initial mount', () => {
      act(() => {
        useTimelineFilterStore.getState().setCategory('loyalty');
      });

      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(useTimelineFilterStore.getState().activeCategory).toBeNull();
    });
  });

  describe('recent players tracking', () => {
    it('adds player to recent list when player data loads', () => {
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      expect(mockAddRecent).toHaveBeenCalledWith('player-abc-123', 'John Doe');
    });

    it('does not add to recent when player data is null', () => {
      render(
        <Player360ContentWrapper
          playerId="player-unknown"
          gamingDay="2026-01-26"
        />,
      );

      expect(mockAddRecent).not.toHaveBeenCalled();
    });
  });

  describe('player selection navigation', () => {
    it('navigates to new player on selection', async () => {
      const user = userEvent.setup();
      render(
        <Player360ContentWrapper
          playerId="player-abc-123"
          gamingDay="2026-01-26"
        />,
      );

      await user.click(screen.getByTestId('select-player-btn'));

      expect(mockReplace).toHaveBeenCalledWith('/players/player-new-456', {
        scroll: false,
      });
    });
  });
});
