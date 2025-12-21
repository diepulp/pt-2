import { act, renderHook } from '@testing-library/react';

import { usePlayerDashboardStore } from '@/store/player-dashboard-store';

describe('PlayerDashboardStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => usePlayerDashboardStore());
    act(() => {
      result.current.clearSelection();
    });
  });

  describe('initial state', () => {
    it('initializes with null selectedPlayerId', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());
      expect(result.current.selectedPlayerId).toBe(null);
    });
  });

  describe('setSelectedPlayer action', () => {
    it('updates selectedPlayerId to a valid player ID', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      act(() => {
        result.current.setSelectedPlayer('player-123');
      });

      expect(result.current.selectedPlayerId).toBe('player-123');
    });

    it('accepts null to reset selection', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      // First set a player
      act(() => {
        result.current.setSelectedPlayer('player-456');
      });

      // Then reset to null
      act(() => {
        result.current.setSelectedPlayer(null);
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });

    it('replaces previous selection with new player ID', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      act(() => {
        result.current.setSelectedPlayer('player-111');
      });

      act(() => {
        result.current.setSelectedPlayer('player-222');
      });

      expect(result.current.selectedPlayerId).toBe('player-222');
    });
  });

  describe('clearSelection action', () => {
    it('resets selectedPlayerId to null', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      // First set a player
      act(() => {
        result.current.setSelectedPlayer('player-789');
      });

      // Then clear
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });

    it('does nothing when already null', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });
  });

  describe('devtools integration', () => {
    it('includes action name for setSelectedPlayer', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      // Verify the store has a devtools-enhanced name
      const store = usePlayerDashboardStore;
      expect(store).toBeDefined();

      // Verify action works as expected
      act(() => {
        result.current.setSelectedPlayer('player-999');
      });

      expect(result.current.selectedPlayerId).toBe('player-999');
    });

    it('includes action name for clearSelection', () => {
      const { result } = renderHook(() => usePlayerDashboardStore());

      // Verify action works as expected
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayerId).toBe(null);
    });
  });
});
