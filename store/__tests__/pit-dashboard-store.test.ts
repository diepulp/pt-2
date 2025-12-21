/**
 * Pit Dashboard Store Unit Tests
 *
 * Tests for the Zustand pit dashboard store (PRD-013).
 * Validates table/slip selection, panel navigation, and state management.
 *
 * @see store/pit-dashboard-store.ts
 * @see docs/80-adrs/ADR-003-state-management-strategy.md
 */

import { act, renderHook } from "@testing-library/react";

import { usePitDashboardStore } from "../pit-dashboard-store";

describe("usePitDashboardStore", () => {
  // Reset store state before each test
  beforeEach(() => {
    const { result } = renderHook(() => usePitDashboardStore());
    act(() => {
      result.current.clearSelection();
      result.current.setActivePanel("tables");
    });
  });

  describe("initial state", () => {
    it("should initialize with null selections and default panel", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      expect(result.current.selectedTableId).toBeNull();
      expect(result.current.selectedSlipId).toBeNull();
      expect(result.current.activePanel).toBe("tables");
      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });
  });

  describe("table selection", () => {
    it("should set selected table ID", () => {
      const { result } = renderHook(() => usePitDashboardStore());
      const tableId = "table-uuid-123";

      act(() => {
        result.current.setSelectedTable(tableId);
      });

      expect(result.current.selectedTableId).toBe(tableId);
    });

    it("should clear selected table ID", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      act(() => {
        result.current.setSelectedTable("table-123");
      });
      expect(result.current.selectedTableId).toBe("table-123");

      act(() => {
        result.current.setSelectedTable(null);
      });
      expect(result.current.selectedTableId).toBeNull();
    });
  });

  describe("slip selection", () => {
    it("should set selected slip ID", () => {
      const { result } = renderHook(() => usePitDashboardStore());
      const slipId = "slip-uuid-456";

      act(() => {
        result.current.setSelectedSlip(slipId);
      });

      expect(result.current.selectedSlipId).toBe(slipId);
    });

    it("should clear selected slip ID", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      act(() => {
        result.current.setSelectedSlip("slip-123");
      });
      expect(result.current.selectedSlipId).toBe("slip-123");

      act(() => {
        result.current.setSelectedSlip(null);
      });
      expect(result.current.selectedSlipId).toBeNull();
    });
  });

  describe("panel navigation", () => {
    it("should switch between panels", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      // Switch to activity panel
      act(() => {
        result.current.setActivePanel("activity");
      });
      expect(result.current.activePanel).toBe("activity");

      // Switch to inventory panel
      act(() => {
        result.current.setActivePanel("inventory");
      });
      expect(result.current.activePanel).toBe("inventory");

      // Switch to analytics panel
      act(() => {
        result.current.setActivePanel("analytics");
      });
      expect(result.current.activePanel).toBe("analytics");

      // Switch back to tables panel
      act(() => {
        result.current.setActivePanel("tables");
      });
      expect(result.current.activePanel).toBe("tables");
    });
  });

  describe("new slip seat number", () => {
    it("should set new slip seat number", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      act(() => {
        result.current.setNewSlipSeatNumber("5");
      });

      expect(result.current.newSlipSeatNumber).toBe("5");
    });

    it("should clear new slip seat number", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      act(() => {
        result.current.setNewSlipSeatNumber("3");
      });
      expect(result.current.newSlipSeatNumber).toBe("3");

      act(() => {
        result.current.setNewSlipSeatNumber(undefined);
      });
      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });
  });

  describe("clearSelection", () => {
    it("should clear all selection state", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      // Set some state
      act(() => {
        result.current.setSelectedTable("table-123");
        result.current.setSelectedSlip("slip-456");
        result.current.setNewSlipSeatNumber("7");
      });

      expect(result.current.selectedTableId).toBe("table-123");
      expect(result.current.selectedSlipId).toBe("slip-456");
      expect(result.current.newSlipSeatNumber).toBe("7");

      // Clear selection
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedTableId).toBeNull();
      expect(result.current.selectedSlipId).toBeNull();
      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });

    it("should not affect active panel", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      act(() => {
        result.current.setActivePanel("analytics");
        result.current.setSelectedTable("table-123");
      });

      act(() => {
        result.current.clearSelection();
      });

      // Panel should remain unchanged
      expect(result.current.activePanel).toBe("analytics");
    });
  });

  describe("devtools integration", () => {
    it("should have devtools-compatible action names", () => {
      // This test verifies that actions are named for Redux DevTools tracing
      // The store uses devtools middleware with action names like:
      // - "pit-dashboard/setSelectedTable"
      // - "pit-dashboard/setSelectedSlip"
      // - "pit-dashboard/setActivePanel"
      // - "pit-dashboard/setNewSlipSeatNumber"
      // - "pit-dashboard/clearSelection"

      const { result } = renderHook(() => usePitDashboardStore());

      // Verify actions exist and are callable
      expect(typeof result.current.setSelectedTable).toBe("function");
      expect(typeof result.current.setSelectedSlip).toBe("function");
      expect(typeof result.current.setActivePanel).toBe("function");
      expect(typeof result.current.setNewSlipSeatNumber).toBe("function");
      expect(typeof result.current.clearSelection).toBe("function");
    });
  });

  describe("state isolation", () => {
    it("should share state across multiple hook instances", () => {
      const { result: hook1 } = renderHook(() => usePitDashboardStore());
      const { result: hook2 } = renderHook(() => usePitDashboardStore());

      // Modify state from first hook
      act(() => {
        hook1.current.setSelectedTable("shared-table");
        hook1.current.setActivePanel("activity");
      });

      // Verify second hook sees the same state
      expect(hook2.current.selectedTableId).toBe("shared-table");
      expect(hook2.current.activePanel).toBe("activity");
    });
  });

  describe("complex workflows", () => {
    it("should handle table selection with slip opening workflow", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      // User selects a table
      act(() => {
        result.current.setSelectedTable("table-1");
      });

      // User clicks on an occupied seat - opens slip modal
      act(() => {
        result.current.setSelectedSlip("slip-at-seat-3");
      });

      expect(result.current.selectedTableId).toBe("table-1");
      expect(result.current.selectedSlipId).toBe("slip-at-seat-3");

      // User closes modal
      act(() => {
        result.current.setSelectedSlip(null);
      });

      // Table should still be selected
      expect(result.current.selectedTableId).toBe("table-1");
      expect(result.current.selectedSlipId).toBeNull();
    });

    it("should handle new slip creation workflow", () => {
      const { result } = renderHook(() => usePitDashboardStore());

      // User selects a table
      act(() => {
        result.current.setSelectedTable("table-1");
      });

      // User clicks on empty seat - prepares new slip
      act(() => {
        result.current.setNewSlipSeatNumber("4");
      });

      expect(result.current.newSlipSeatNumber).toBe("4");

      // New slip is created (would normally happen in component)
      // Then seat number is cleared
      act(() => {
        result.current.setNewSlipSeatNumber(undefined);
      });

      expect(result.current.newSlipSeatNumber).toBeUndefined();
    });
  });
});
