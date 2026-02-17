/**
 * Z-Index Scale
 *
 * Single source of truth for z-index layering across the application.
 * Sonner toasts use library default z-[999999999] (always above).
 * shadcn/Radix portals (modals, drawers, sheets) use z-50 by default.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */
export const Z = {
  TOASTER: 10000,
  LOCK_SCREEN: 9000,
  MODAL: 8000,
} as const;
