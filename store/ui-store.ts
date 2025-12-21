"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ModalType = "rating-slip" | "new-slip" | "player-search" | null;

interface ModalState {
  type: ModalType;
  isOpen: boolean;
  data?: unknown;
}

interface UIStore {
  modal: ModalState;
  openModal: (type: ModalType, data?: unknown) => void;
  closeModal: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      modal: {
        type: null,
        isOpen: false,
        data: undefined,
      },
      openModal: (type, data) =>
        set(
          {
            modal: {
              type,
              isOpen: true,
              data,
            },
          },
          undefined,
          "ui/openModal",
        ),
      closeModal: () =>
        set(
          {
            modal: {
              type: null,
              isOpen: false,
              data: undefined,
            },
          },
          undefined,
          "ui/closeModal",
        ),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set(
          (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
          undefined,
          "ui/toggleSidebar",
        ),
    }),
    { name: "ui-store" },
  ),
);
