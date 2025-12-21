"use client";

import { useShallow } from "zustand/react/shallow";

import { useUIStore } from "@/store/ui-store";

/**
 * Selector hook for modal state management.
 * Uses useShallow to prevent unnecessary re-renders when only partial state changes.
 */
export function useModal() {
  return useUIStore(
    useShallow((s) => ({
      isOpen: s.modal.isOpen,
      type: s.modal.type,
      data: s.modal.data,
      open: s.openModal,
      close: s.closeModal,
    })),
  );
}
