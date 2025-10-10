import { renderHook, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui-store';

describe('UIStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useUIStore());
    act(() => {
      result.current.closeModal();
      result.current.setSidebarOpen(true);
      // Clear all toasts
      result.current.toastQueue.forEach((toast) => {
        result.current.removeToast(toast.id);
      });
    });
  });

  describe('Modal state', () => {
    it('should open modal with type and data', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('create', { title: 'Test Modal' });
      });

      expect(result.current.modal.isOpen).toBe(true);
      expect(result.current.modal.type).toBe('create');
      expect(result.current.modal.data).toEqual({ title: 'Test Modal' });
    });

    it('should close modal and clear data', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('edit', { id: '123' });
      });

      expect(result.current.modal.isOpen).toBe(true);

      act(() => {
        result.current.closeModal();
      });

      expect(result.current.modal.isOpen).toBe(false);
      expect(result.current.modal.type).toBeNull();
      expect(result.current.modal.data).toBeUndefined();
    });
  });

  describe('Sidebar state', () => {
    it('should toggle sidebar state', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.sidebarOpen).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(true);
    });

    it('should set sidebar state directly', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.sidebarOpen).toBe(true);
    });
  });

  describe('Toast notifications', () => {
    it('should add toast to queue', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addToast('Success message', 'success');
      });

      expect(result.current.toastQueue).toHaveLength(1);
      expect(result.current.toastQueue[0].message).toBe('Success message');
      expect(result.current.toastQueue[0].type).toBe('success');
      expect(result.current.toastQueue[0].id).toBeDefined();
    });

    it('should remove toast from queue', () => {
      const { result } = renderHook(() => useUIStore());

      let toastId: string;

      act(() => {
        result.current.addToast('Test toast', 'info');
      });

      // Get the toast ID after the act completes
      toastId = result.current.toastQueue[result.current.toastQueue.length - 1].id;
      const initialLength = result.current.toastQueue.length;
      expect(initialLength).toBeGreaterThan(0);

      act(() => {
        result.current.removeToast(toastId);
      });

      expect(result.current.toastQueue.length).toBe(initialLength - 1);
    });

    it('should handle multiple toasts', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addToast('Toast 1', 'info');
        result.current.addToast('Toast 2', 'success');
        result.current.addToast('Toast 3', 'error');
      });

      expect(result.current.toastQueue).toHaveLength(3);
    });
  });
});
