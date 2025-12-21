import { act, renderHook } from '@testing-library/react';

import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';
import { usePlayerDashboardStore } from '@/store/player-dashboard-store';

describe('usePlayerDashboard', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => usePlayerDashboardStore());
    act(() => {
      result.current.clearSelection();
    });
  });

  describe('hook returns store actions and state', () => {
    it('returns selectedPlayerId', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      expect(result.current.selectedPlayerId).toBe(null);
    });

    it('returns setSelectedPlayer action', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      expect(typeof result.current.setSelectedPlayer).toBe('function');
    });

    it('returns clearSelection action', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      expect(typeof result.current.clearSelection).toBe('function');
    });

    it('hook can select a player using setSelectedPlayer', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      act(() => {
        result.current.setSelectedPlayer('player-test-123');
      });

      expect(result.current.selectedPlayerId).toBe('player-test-123');
    });

    it('hook can clear selection using clearSelection', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      act(() => {
        result.current.setSelectedPlayer('player-test-456');
      });

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });
  });

  describe('usePlayerDashboard hook with useShallow', () => {
    it('renders correctly with initial null state', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      expect(result.current.selectedPlayerId).toBe(null);
    });

    it('updates when setSelectedPlayer is called', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      act(() => {
        result.current.setSelectedPlayer('player-345');
      });

      expect(result.current.selectedPlayerId).toBe('player-345');
    });

    it('maintains function identity across renders (selector optimization)', () => {
      const { result, rerender } = renderHook(() => usePlayerDashboard());

      const setSelectedPlayer1 = result.current.setSelectedPlayer;
      const clearSelection1 = result.current.clearSelection;

      // Re-render without changing state
      rerender();

      const setSelectedPlayer2 = result.current.setSelectedPlayer;
      const clearSelection2 = result.current.clearSelection;

      // Functions should be the same reference (useShallow optimization)
      expect(setSelectedPlayer1).toBe(setSelectedPlayer2);
      expect(clearSelection1).toBe(clearSelection2);
    });

    it('returns same selectedPlayerId reference for access', () => {
      const { result, rerender } = renderHook(() => usePlayerDashboard());

      const selectedId1 = result.current.selectedPlayerId;

      rerender();

      const selectedId2 = result.current.selectedPlayerId;

      // Should be referentially equal when state hasn't changed
      expect(selectedId1).toBe(selectedId2);
    });
  });

  describe('type inference', () => {
    it('properly types selectedPlayerId as string | null', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      // TypeScript should enforce this type at compile time
      const id: string | null = result.current.selectedPlayerId;
      expect(id).toBe(null);
    });

    it('properly types setSelectedPlayer as function', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      const setPlayer = result.current.setSelectedPlayer;
      expect(typeof setPlayer).toBe('function');
    });

    it('properly types clearSelection as function', () => {
      const { result } = renderHook(() => usePlayerDashboard());

      const clearFun = result.current.clearSelection;
      expect(typeof clearFun).toBe('function');
    });
  });
});
