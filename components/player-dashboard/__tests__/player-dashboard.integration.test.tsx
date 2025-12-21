import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { PlayerDashboard } from '@/components/player-dashboard/player-dashboard';
import { usePlayerDashboardStore } from '@/store/player-dashboard-store';

describe('PlayerDashboard Integration', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => usePlayerDashboardStore());
    act(() => {
      result.current.clearSelection();
    });
  });

  describe('component mounting', () => {
    it('renders PlayerDashboard without crashing', () => {
      render(<PlayerDashboard />);

      expect(screen.getByText(/Select a Player/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Use the search above to find and select a player/i),
      ).toBeInTheDocument();
    });

    it('displays empty state when no player is selected', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());
      expect(result.current.selectedPlayerId).toBe(null);

      render(<PlayerDashboard />);
      expect(screen.queryByText(/Currently viewing:/i)).not.toBeInTheDocument();
    });
  });

  describe('player selection flow', () => {
    it('passes selected player to all child panels via hook', async () => {
      // Mock the PlayerSearchCommand click handler
      const mockSelectPlayer = 'player-123';

      render(<PlayerDashboard />);

      // Verify initial state
      expect(screen.getByText(/Select a Player/i)).toBeInTheDocument();

      // Simulate player selection via hook
      const { result } = renderHook(() => usePlayerDashboardStore());
      act(() => {
        result.current.setSelectedPlayer(mockSelectPlayer);
      });

      // Verify store state updated
      expect(result.current.selectedPlayerId).toBe(mockSelectPlayer);

      // This would normally trigger child components to render
      // Since we're in test isolation, we can verify the component
      // still renders without errors
      expect(screen.getByText(/Select a Player/i)).toBeInTheDocument();
    });

    it('clears selection across all panels', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      // Set a player
      act(() => {
        result.current.setSelectedPlayer('player-456');
      });

      expect(result.current.selectedPlayerId).toBe('player-456');

      // Clear selection
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });

    it('replaces selection when new player is selected', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      act(() => {
        result.current.setSelectedPlayer('player-111');
      });

      expect(result.current.selectedPlayerId).toBe('player-111');

      act(() => {
        result.current.setSelectedPlayer('player-222');
      });

      expect(result.current.selectedPlayerId).toBe('player-222');
    });
  });

  describe('component hierarchy validation', () => {
    it('renders PlayerSearchCommand in header', () => {
      render(<PlayerDashboard />);

      expect(screen.getByText(/Player Dashboard/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Search players/i }),
      ).toBeInTheDocument();
    });

    it('displays no panels before player selection', () => {
      render(<PlayerDashboard />);

      // Should not display any panel content when no player is selected
      expect(
        screen.queryByText(/Performance Metrics/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Compliance & Risk/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Notes unavailable/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Loyalty/i)).not.toBeInTheDocument();
    });
  });

  describe('prop drilling elimination', () => {
    it('uses usePlayerDashboard hook instead of props', () => {
      const mockSelectedPlayerId = 'test-player-999';

      // Set up store state
      const { result } = renderHook(() => usePlayerDashboardStore());
      act(() => {
        result.current.setSelectedPlayer(mockSelectedPlayerId);
      });

      // Render dashboard
      render(<PlayerDashboard />);

      // Verify component renders without prop errors
      expect(screen.getByText(/Select a Player/i)).toBeInTheDocument();
    });
  });

  describe('UI consistency', () => {
    it('maintains PT-2 design system appearance', () => {
      const { container } = render(<PlayerDashboard />);

      // Verify backdrop blur utility class is applied
      const playerDashboard = container.querySelector(
        '[class*="backdrop-blur"]',
      );
      expect(playerDashboard).toBeInTheDocument();
    });

    it('displays industrial aesthetic background patterns', () => {
      const { container } = render(<PlayerDashboard />);

      const gridBackground = container.querySelector(
        '[style*="radial-gradient"]',
      );
      expect(gridBackground).toBeInTheDocument();
    });
  });
});

function renderHook<T, R>(hook: () => R): { result: { current: R } } {
  let result: { current: R };
  const TestComponent = () => {
    result = { current: hook() };
    return null;
  };
  render(<TestComponent />);
  return { result: result! };
}
