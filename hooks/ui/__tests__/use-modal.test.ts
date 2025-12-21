/**
 * useModal Hook Unit Tests
 *
 * Tests for the modal selector hook (PRD-013).
 * Validates useShallow pattern and state selection.
 *
 * @see hooks/ui/use-modal.ts
 * @see docs/70-governance/HOOKS_STANDARD.md
 */

import { act, renderHook } from "@testing-library/react";

import { useUIStore } from "@/store/ui-store";

import { useModal } from "../use-modal";

describe("useModal", () => {
  // Reset store state before each test
  beforeEach(() => {
    const { result } = renderHook(() => useUIStore());
    act(() => {
      result.current.closeModal();
    });
  });

  describe("state selection", () => {
    it("should return modal state properties", () => {
      const { result } = renderHook(() => useModal());

      expect(result.current).toMatchObject({
        isOpen: false,
        type: null,
        data: undefined,
      });
    });

    it("should return action methods", () => {
      const { result } = renderHook(() => useModal());

      expect(typeof result.current.open).toBe("function");
      expect(typeof result.current.close).toBe("function");
    });
  });

  describe("modal operations", () => {
    it("should open modal with type and data", () => {
      const { result } = renderHook(() => useModal());

      act(() => {
        result.current.open("rating-slip", { slipId: "test-123" });
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.type).toBe("rating-slip");
      expect(result.current.data).toEqual({ slipId: "test-123" });
    });

    it("should close modal", () => {
      const { result } = renderHook(() => useModal());

      // Open first
      act(() => {
        result.current.open("new-slip");
      });

      expect(result.current.isOpen).toBe(true);

      // Then close
      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.type).toBeNull();
    });
  });

  describe("useShallow behavior", () => {
    it("should provide stable references for unchanged state", () => {
      const { result, rerender } = renderHook(() => useModal());

      const initialOpen = result.current.open;
      const initialClose = result.current.close;

      // Rerender without state change
      rerender();

      // Functions should be same reference due to useShallow
      expect(result.current.open).toBe(initialOpen);
      expect(result.current.close).toBe(initialClose);
    });
  });

  describe("synchronization with store", () => {
    it("should reflect store changes", () => {
      const { result: modal } = renderHook(() => useModal());
      const { result: store } = renderHook(() => useUIStore());

      // Modify store directly
      act(() => {
        store.current.openModal("player-search", { query: "test" });
      });

      // Modal hook should reflect the change
      expect(modal.current.isOpen).toBe(true);
      expect(modal.current.type).toBe("player-search");
      expect(modal.current.data).toEqual({ query: "test" });
    });
  });
});
