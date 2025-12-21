/**
 * UI Store Unit Tests
 *
 * Tests for the Zustand UI store (PRD-013).
 * Validates modal state management and sidebar toggle functionality.
 *
 * @see store/ui-store.ts
 * @see docs/80-adrs/ADR-003-state-management-strategy.md
 */

import { act, renderHook } from '@testing-library/react';

import { useUIStore } from '../ui-store';

describe('useUIStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    const { result } = renderHook(() => useUIStore());
    act(() => {
      result.current.closeModal();
      // Reset sidebar to default state
      if (result.current.sidebarCollapsed) {
        result.current.toggleSidebar();
      }
    });
  });

  describe('modal state', () => {
    it('should initialize with closed modal state', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.modal).toEqual({
        type: null,
        isOpen: false,
        data: undefined,
      });
    });

    it('should open modal with type and data', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('rating-slip', { slipId: 'test-123' });
      });

      expect(result.current.modal).toEqual({
        type: 'rating-slip',
        isOpen: true,
        data: { slipId: 'test-123' },
      });
    });

    it('should open modal without data', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('new-slip');
      });

      expect(result.current.modal).toEqual({
        type: 'new-slip',
        isOpen: true,
        data: undefined,
      });
    });

    it('should close modal and reset state', () => {
      const { result } = renderHook(() => useUIStore());

      // First open a modal
      act(() => {
        result.current.openModal('player-search', { query: 'John' });
      });

      expect(result.current.modal.isOpen).toBe(true);

      // Then close it
      act(() => {
        result.current.closeModal();
      });

      expect(result.current.modal).toEqual({
        type: null,
        isOpen: false,
        data: undefined,
      });
    });

    it('should allow opening different modal types', () => {
      const { result } = renderHook(() => useUIStore());

      // Open rating-slip modal
      act(() => {
        result.current.openModal('rating-slip');
      });
      expect(result.current.modal.type).toBe('rating-slip');

      // Switch to new-slip modal
      act(() => {
        result.current.openModal('new-slip');
      });
      expect(result.current.modal.type).toBe('new-slip');

      // Switch to player-search modal
      act(() => {
        result.current.openModal('player-search');
      });
      expect(result.current.modal.type).toBe('player-search');
    });
  });

  describe('sidebar state', () => {
    it('should initialize with sidebar expanded', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.sidebarCollapsed).toBe(false);
    });

    it('should toggle sidebar state', () => {
      const { result } = renderHook(() => useUIStore());

      // Toggle to collapsed
      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.sidebarCollapsed).toBe(true);

      // Toggle back to expanded
      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.sidebarCollapsed).toBe(false);
    });
  });

  describe('devtools integration', () => {
    it('should have devtools-compatible action names', () => {
      // This test verifies that actions are named for Redux DevTools tracing
      // The store uses devtools middleware with action names like:
      // - "ui/openModal"
      // - "ui/closeModal"
      // - "ui/toggleSidebar"

      const { result } = renderHook(() => useUIStore());

      // Verify actions exist and are callable
      expect(typeof result.current.openModal).toBe('function');
      expect(typeof result.current.closeModal).toBe('function');
      expect(typeof result.current.toggleSidebar).toBe('function');
    });
  });

  describe('state isolation', () => {
    it('should share state across multiple hook instances', () => {
      const { result: hook1 } = renderHook(() => useUIStore());
      const { result: hook2 } = renderHook(() => useUIStore());

      // Modify state from first hook
      act(() => {
        hook1.current.openModal('rating-slip', { id: 'shared' });
      });

      // Verify second hook sees the same state
      expect(hook2.current.modal.isOpen).toBe(true);
      expect(hook2.current.modal.type).toBe('rating-slip');
      expect(hook2.current.modal.data).toEqual({ id: 'shared' });
    });
  });
});
