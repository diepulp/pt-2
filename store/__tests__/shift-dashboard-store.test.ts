/**
 * Shift Dashboard Store Unit Tests
 *
 * Tests for the Zustand shift dashboard store (ADR-035).
 * Validates time window state, lens navigation, compound actions, and session reset.
 *
 * @see store/shift-dashboard-store.ts
 * @see docs/80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md
 */

import { act, renderHook } from '@testing-library/react';

import {
  useShiftDashboardStore,
  SHIFT_DASHBOARD_INITIAL_STATE,
  type ShiftTimeWindow,
} from '../shift-dashboard-store';

describe('useShiftDashboardStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    const { result } = renderHook(() => useShiftDashboardStore());
    act(() => {
      result.current.resetSession();
    });
  });

  describe('initial state', () => {
    it('should initialize with defaults matching SHIFT_DASHBOARD_INITIAL_STATE', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      expect(result.current.timeWindow).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindow,
      );
      expect(result.current.timeWindowPreset).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindowPreset,
      );
      expect(result.current.lens).toBe(SHIFT_DASHBOARD_INITIAL_STATE.lens);
      expect(result.current.selectedPitId).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.selectedPitId,
      );
      expect(result.current.selectedTableId).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.selectedTableId,
      );
    });
  });

  describe('setLens', () => {
    it('should set lens to pit', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setLens('pit');
      });

      expect(result.current.lens).toBe('pit');
    });

    it('should set lens to table', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setLens('table');
      });

      expect(result.current.lens).toBe('table');
    });

    it('should set lens back to casino', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setLens('pit');
        result.current.setLens('casino');
      });

      expect(result.current.lens).toBe('casino');
    });
  });

  describe('setTimeWindow', () => {
    it('should set a time window with start and end timestamps', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      const window: ShiftTimeWindow = {
        start: '2026-02-18T08:00:00.000Z',
        end: '2026-02-18T16:00:00.000Z',
      };

      act(() => {
        result.current.setTimeWindow(window);
      });

      expect(result.current.timeWindow).toEqual(window);
    });

    it('should replace a previously set time window', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      const first: ShiftTimeWindow = {
        start: '2026-02-18T00:00:00.000Z',
        end: '2026-02-18T08:00:00.000Z',
      };
      const second: ShiftTimeWindow = {
        start: '2026-02-18T08:00:00.000Z',
        end: '2026-02-18T16:00:00.000Z',
      };

      act(() => {
        result.current.setTimeWindow(first);
      });
      act(() => {
        result.current.setTimeWindow(second);
      });

      expect(result.current.timeWindow).toEqual(second);
    });
  });

  describe('setTimeWindowPreset', () => {
    it('should set preset to 12h', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setTimeWindowPreset('12h');
      });

      expect(result.current.timeWindowPreset).toBe('12h');
    });

    it('should set preset to 24h', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setTimeWindowPreset('24h');
      });

      expect(result.current.timeWindowPreset).toBe('24h');
    });

    it('should set preset to custom', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.setTimeWindowPreset('custom');
      });

      expect(result.current.timeWindowPreset).toBe('custom');
    });
  });

  describe('drillDownToPit', () => {
    it('should set lens to table and selectedPitId', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.drillDownToPit('pit-uuid-001');
      });

      expect(result.current.lens).toBe('table');
      expect(result.current.selectedPitId).toBe('pit-uuid-001');
    });

    it('should replace a previously selected pit', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.drillDownToPit('pit-uuid-001');
      });
      act(() => {
        result.current.drillDownToPit('pit-uuid-002');
      });

      expect(result.current.selectedPitId).toBe('pit-uuid-002');
      expect(result.current.lens).toBe('table');
    });
  });

  describe('drillDownToTable', () => {
    it('should set lens to table and selectedTableId', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.drillDownToTable('table-uuid-abc');
      });

      expect(result.current.lens).toBe('table');
      expect(result.current.selectedTableId).toBe('table-uuid-abc');
      expect(result.current.selectedPitId).toBeNull();
    });

    it('should set selectedPitId when optional pitId is provided', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.drillDownToTable('table-uuid-abc', 'pit-uuid-001');
      });

      expect(result.current.lens).toBe('table');
      expect(result.current.selectedTableId).toBe('table-uuid-abc');
      expect(result.current.selectedPitId).toBe('pit-uuid-001');
    });

    it('should set selectedPitId to null when pitId is omitted', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      // Pre-set a pitId
      act(() => {
        result.current.drillDownToPit('pit-uuid-001');
      });

      // Drill down to table without a pitId — clears pit context
      act(() => {
        result.current.drillDownToTable('table-uuid-xyz');
      });

      expect(result.current.selectedPitId).toBeNull();
    });
  });

  describe('resetNavigation()', () => {
    it('should reset lens to casino and clear pit/table selections', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      act(() => {
        result.current.drillDownToTable('table-uuid-abc', 'pit-uuid-001');
      });
      expect(result.current.lens).toBe('table');

      act(() => {
        result.current.resetNavigation();
      });

      expect(result.current.lens).toBe('casino');
      expect(result.current.selectedPitId).toBeNull();
      expect(result.current.selectedTableId).toBeNull();
    });

    it('should NOT reset timeWindow or timeWindowPreset', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      const window: ShiftTimeWindow = {
        start: '2026-02-18T08:00:00.000Z',
        end: '2026-02-18T16:00:00.000Z',
      };

      act(() => {
        result.current.setTimeWindow(window);
        result.current.setTimeWindowPreset('24h');
        result.current.drillDownToPit('pit-uuid-001');
      });

      act(() => {
        result.current.resetNavigation();
      });

      // Navigation cleared
      expect(result.current.lens).toBe('casino');
      expect(result.current.selectedPitId).toBeNull();

      // Time window state preserved
      expect(result.current.timeWindow).toEqual(window);
      expect(result.current.timeWindowPreset).toBe('24h');
    });
  });

  describe('resetSession()', () => {
    it('should reset ALL data fields to SHIFT_DASHBOARD_INITIAL_STATE', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      const window: ShiftTimeWindow = {
        start: '2026-02-18T08:00:00.000Z',
        end: '2026-02-18T16:00:00.000Z',
      };

      // Set every data field to non-default values
      act(() => {
        result.current.setTimeWindow(window);
        result.current.setTimeWindowPreset('24h');
        result.current.setLens('pit');
        result.current.setSelectedPitId('pit-uuid-dirty');
        result.current.setSelectedTableId('table-uuid-dirty');
      });

      // Verify dirty state
      expect(result.current.timeWindow).toEqual(window);
      expect(result.current.timeWindowPreset).toBe('24h');
      expect(result.current.lens).toBe('pit');
      expect(result.current.selectedPitId).toBe('pit-uuid-dirty');
      expect(result.current.selectedTableId).toBe('table-uuid-dirty');

      // Reset
      act(() => {
        result.current.resetSession();
      });

      // Verify ALL fields match INITIAL_STATE (including timeWindow and timeWindowPreset
      // which resetNavigation() does NOT reset)
      expect(result.current.timeWindow).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindow,
      );
      expect(result.current.timeWindowPreset).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindowPreset,
      );
      expect(result.current.lens).toBe(SHIFT_DASHBOARD_INITIAL_STATE.lens);
      expect(result.current.selectedPitId).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.selectedPitId,
      );
      expect(result.current.selectedTableId).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.selectedTableId,
      );
    });

    it('should reset timeWindow and timeWindowPreset unlike resetNavigation() which preserves them', () => {
      const { result } = renderHook(() => useShiftDashboardStore());

      const window: ShiftTimeWindow = {
        start: '2026-02-18T08:00:00.000Z',
        end: '2026-02-18T16:00:00.000Z',
      };

      act(() => {
        result.current.setTimeWindow(window);
        result.current.setTimeWindowPreset('12h');
        result.current.drillDownToPit('pit-uuid-001');
      });

      // resetNavigation preserves time state
      act(() => {
        result.current.resetNavigation();
      });
      expect(result.current.timeWindow).toEqual(window);
      expect(result.current.timeWindowPreset).toBe('12h');

      // resetSession clears time state too
      act(() => {
        result.current.setLens('table');
        result.current.resetSession();
      });
      expect(result.current.timeWindow).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindow,
      );
      expect(result.current.timeWindowPreset).toBe(
        SHIFT_DASHBOARD_INITIAL_STATE.timeWindowPreset,
      );
    });
  });
});
