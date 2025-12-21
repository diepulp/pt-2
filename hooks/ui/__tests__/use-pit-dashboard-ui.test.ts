/**
 * usePitDashboardUI Hook Unit Tests
 *
 * Tests for the pit dashboard UI selector hook (PRD-013).
 * Validates useShallow pattern and state selection.
 *
 * @see hooks/ui/use-pit-dashboard-ui.ts
 * @see docs/70-governance/HOOKS_STANDARD.md
 */

import { act, renderHook } from '@testing-library/react';

import { usePitDashboardStore } from '@/store/pit-dashboard-store';

import { usePitDashboardUI } from '../use-pit-dashboard-ui';

describe('usePitDashboardUI', () => {
  // Reset store state before each test
  beforeEach(() => {
    const { result } = renderHook(() => usePitDashboardStore());
    act(() => {
      result.current.clearSelection();
      result.current.setActivePanel('tables');
    });
  });

  describe('state selection', () => {
    it('should return all dashboard state properties', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      expect(result.current).toMatchObject({
        selectedTableId: null,
        selectedSlipId: null,
        activePanel: 'tables',
        newSlipSeatNumber: undefined,
      });
    });

    it('should return all action methods', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      expect(typeof result.current.setSelectedTable).toBe('function');
      expect(typeof result.current.setSelectedSlip).toBe('function');
      expect(typeof result.current.setActivePanel).toBe('function');
      expect(typeof result.current.setNewSlipSeatNumber).toBe('function');
      expect(typeof result.current.clearSelection).toBe('function');
    });
  });

  describe('table operations', () => {
    it('should set and clear selected table', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      act(() => {
        result.current.setSelectedTable('table-uuid');
      });
      expect(result.current.selectedTableId).toBe('table-uuid');

      act(() => {
        result.current.setSelectedTable(null);
      });
      expect(result.current.selectedTableId).toBeNull();
    });
  });

  describe('slip operations', () => {
    it('should set and clear selected slip', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      act(() => {
        result.current.setSelectedSlip('slip-uuid');
      });
      expect(result.current.selectedSlipId).toBe('slip-uuid');

      act(() => {
        result.current.setSelectedSlip(null);
      });
      expect(result.current.selectedSlipId).toBeNull();
    });
  });

  describe('panel navigation', () => {
    it('should navigate between panels', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      act(() => {
        result.current.setActivePanel('activity');
      });
      expect(result.current.activePanel).toBe('activity');

      act(() => {
        result.current.setActivePanel('analytics');
      });
      expect(result.current.activePanel).toBe('analytics');
    });
  });

  describe('new slip seat number', () => {
    it('should set and clear seat number', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      act(() => {
        result.current.setNewSlipSeatNumber('3');
      });
      expect(result.current.newSlipSeatNumber).toBe('3');

      act(() => {
        result.current.setNewSlipSeatNumber(undefined);
      });
      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });
  });

  describe('clear selection', () => {
    it('should clear all selections but keep panel', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      // Set up state
      act(() => {
        result.current.setSelectedTable('table-1');
        result.current.setSelectedSlip('slip-1');
        result.current.setNewSlipSeatNumber('5');
        result.current.setActivePanel('activity');
      });

      // Clear selection
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedTableId).toBeNull();
      expect(result.current.selectedSlipId).toBeNull();
      expect(result.current.newSlipSeatNumber).toBeUndefined();
      // Panel should remain
      expect(result.current.activePanel).toBe('activity');
    });
  });

  describe('useShallow behavior', () => {
    it('should provide stable references for unchanged state', () => {
      const { result, rerender } = renderHook(() => usePitDashboardUI());

      const initialSetSelectedTable = result.current.setSelectedTable;
      const initialClearSelection = result.current.clearSelection;

      // Rerender without state change
      rerender();

      // Functions should be same reference due to useShallow
      expect(result.current.setSelectedTable).toBe(initialSetSelectedTable);
      expect(result.current.clearSelection).toBe(initialClearSelection);
    });
  });

  describe('synchronization with store', () => {
    it('should reflect store changes', () => {
      const { result: hook } = renderHook(() => usePitDashboardUI());
      const { result: store } = renderHook(() => usePitDashboardStore());

      // Modify store directly
      act(() => {
        store.current.setSelectedTable('from-store');
        store.current.setActivePanel('inventory');
      });

      // Hook should reflect the change
      expect(hook.current.selectedTableId).toBe('from-store');
      expect(hook.current.activePanel).toBe('inventory');
    });
  });

  describe('component workflow simulation', () => {
    it('should handle table selection → slip modal workflow', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      // Simulate: User clicks on table in grid
      act(() => {
        result.current.setSelectedTable('blackjack-1');
      });
      expect(result.current.selectedTableId).toBe('blackjack-1');

      // Simulate: User clicks on occupied seat
      act(() => {
        result.current.setSelectedSlip('slip-at-seat-3');
      });
      expect(result.current.selectedSlipId).toBe('slip-at-seat-3');

      // Simulate: User closes modal
      act(() => {
        result.current.setSelectedSlip(null);
      });

      // Table selection should persist
      expect(result.current.selectedTableId).toBe('blackjack-1');
      expect(result.current.selectedSlipId).toBeNull();
    });

    it('should handle new slip creation workflow', () => {
      const { result } = renderHook(() => usePitDashboardUI());

      // Select table
      act(() => {
        result.current.setSelectedTable('roulette-2');
      });

      // Click empty seat - set seat number for new slip form
      act(() => {
        result.current.setNewSlipSeatNumber('4');
      });
      expect(result.current.newSlipSeatNumber).toBe('4');

      // Form submitted, clear seat number
      act(() => {
        result.current.setNewSlipSeatNumber(undefined);
      });
      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });
  });
});
