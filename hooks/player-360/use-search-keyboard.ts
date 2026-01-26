/**
 * Search Keyboard Hook (WS7 - PRD-022-PATCH-OPTION-B)
 *
 * Provides keyboard shortcuts for Player 360 search:
 * - Ctrl/Cmd + K: Focus search input
 * - Esc: Clear search / collapse sidebar
 *
 * @see PRD-022-PATCH-OPTION-B-PLAYER-360-EMBEDDED-SEARCH.md
 * @see EXECUTION-SPEC-PRD-022-PATCH-OPTION-B.md WS7
 */

"use client";

import { useEffect, useCallback, useRef } from "react";

// === Types ===

interface UseSearchKeyboardOptions {
  /** Callback to focus the search input */
  onFocusSearch: () => void;
  /** Callback to clear the search query */
  onClearSearch: () => void;
  /** Callback to collapse the sidebar (optional, desktop only) */
  onCollapseSidebar?: () => void;
  /** Callback to close mobile drawer (optional, mobile only) */
  onCloseMobileDrawer?: () => void;
  /** Whether the feature is enabled (default: true) */
  enabled?: boolean;
}

interface UseSearchKeyboardReturn {
  /** Ref to attach to the search input */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  /** Manually trigger focus */
  focusSearch: () => void;
}

// === Hook ===

/**
 * Hook for search keyboard navigation.
 *
 * @example
 * ```tsx
 * const { searchInputRef, focusSearch } = useSearchKeyboard({
 *   onFocusSearch: () => {},
 *   onClearSearch: () => setSearchTerm(''),
 *   onCollapseSidebar: () => setCollapsed(true),
 * });
 *
 * return <input ref={searchInputRef} ... />
 * ```
 */
export function useSearchKeyboard({
  onFocusSearch,
  onClearSearch,
  onCollapseSidebar,
  onCloseMobileDrawer,
  enabled = true,
}: UseSearchKeyboardOptions): UseSearchKeyboardReturn {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Track escape press count for double-tap behavior
  const escPressedRef = useRef(false);
  const escTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    onFocusSearch();
  }, [onFocusSearch]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if user is typing in an input/textarea (except our search input)
      const target = event.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // === Cmd/Ctrl + K: Focus search ===
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }

      // === Escape key behavior ===
      if (event.key === "Escape") {
        const isOurSearchFocused =
          document.activeElement === searchInputRef.current;
        const inputHasValue = !!searchInputRef.current?.value;

        // If our search is focused
        if (isOurSearchFocused) {
          event.preventDefault();

          // First press: clear value if has value
          if (inputHasValue) {
            onClearSearch();
            return;
          }

          // Second press or empty value: collapse sidebar or close drawer
          if (escPressedRef.current) {
            // Double tap - collapse sidebar or close drawer
            onCollapseSidebar?.();
            onCloseMobileDrawer?.();
            searchInputRef.current?.blur();
            escPressedRef.current = false;
            if (escTimeoutRef.current) {
              clearTimeout(escTimeoutRef.current);
            }
          } else {
            // First tap with empty value
            escPressedRef.current = true;
            escTimeoutRef.current = setTimeout(() => {
              escPressedRef.current = false;
            }, 500); // 500ms window for double-tap
            searchInputRef.current?.blur();
          }
          return;
        }

        // If focused on another input, don't interfere
        if (isInInput) return;

        // Not in any input - close mobile drawer if open
        onCloseMobileDrawer?.();
      }
    },
    [
      enabled,
      focusSearch,
      onClearSearch,
      onCollapseSidebar,
      onCloseMobileDrawer,
    ],
  );

  // Attach global keyboard listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (escTimeoutRef.current) {
        clearTimeout(escTimeoutRef.current);
      }
    };
  }, [handleKeyDown, enabled]);

  return {
    searchInputRef,
    focusSearch,
  };
}

// === Utility: Detect OS for shortcut display ===

/**
 * Returns the appropriate modifier key symbol for the current platform.
 * @returns "⌘" for Mac, "Ctrl" for others
 */
export function useModifierKey(): string {
  // SSR-safe check
  if (typeof window === "undefined") return "Ctrl";

  // Use userAgentData when available (modern browsers), fallback to userAgent
  const isMac =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.platform?.toLowerCase().includes("mac") ??
    navigator.userAgent.toLowerCase().includes("mac");

  return isMac ? "⌘" : "Ctrl";
}
