import { create } from 'zustand';

/**
 * Modal configuration types
 */
type ModalType = 'create' | 'edit' | 'delete' | 'confirm' | null;

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  data?: unknown;
}

/**
 * Global UI Store Interface
 * Manages ephemeral UI state across the application
 */
interface UIStore {
  // Modal state
  modal: ModalState;

  // Navigation state
  sidebarOpen: boolean;

  // Toast/notification state
  toastQueue: Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>;

  // Actions
  openModal: (type: ModalType, data?: unknown) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

/**
 * Global UI Store
 *
 * Handles ephemeral UI state including:
 * - Modal dialogs (open/close, type, data)
 * - Sidebar navigation state
 * - Toast notifications
 *
 * DO NOT use for:
 * - Server data (use React Query)
 * - Persistent state (use database)
 * - User session (use Next.js auth)
 */
export const useUIStore = create<UIStore>((set) => ({
  // Initial state
  modal: {
    isOpen: false,
    type: null,
    data: undefined,
  },
  sidebarOpen: true,
  toastQueue: [],

  // Modal actions
  openModal: (type, data) =>
    set({
      modal: {
        isOpen: true,
        type,
        data,
      },
    }),

  closeModal: () =>
    set({
      modal: {
        isOpen: false,
        type: null,
        data: undefined,
      },
    }),

  // Sidebar actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Toast actions
  addToast: (message, type) =>
    set((state) => ({
      toastQueue: [
        ...state.toastQueue,
        { id: crypto.randomUUID(), message, type },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toastQueue: state.toastQueue.filter((toast) => toast.id !== id),
    })),
}));

/**
 * Selectors for optimized component re-renders
 */
export const selectModal = (state: UIStore) => state.modal;
export const selectSidebarOpen = (state: UIStore) => state.sidebarOpen;
export const selectToastQueue = (state: UIStore) => state.toastQueue;
