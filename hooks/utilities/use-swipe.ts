import * as React from "react";

interface SwipeState {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

interface UseSwipeOptions {
  /** Minimum distance in pixels to trigger swipe (default: 50) */
  threshold?: number;
  /** Maximum vertical distance to still count as horizontal swipe (default: 100) */
  verticalTolerance?: number;
  /** Callback when swipe left is detected */
  onSwipeLeft?: () => void;
  /** Callback when swipe right is detected */
  onSwipeRight?: () => void;
  /** Callback when swipe up is detected */
  onSwipeUp?: () => void;
  /** Callback when swipe down is detected */
  onSwipeDown?: () => void;
}

/**
 * Hook for detecting swipe gestures on touch devices
 * Returns handlers to attach to a container element
 */
export function useSwipe({
  threshold = 50,
  verticalTolerance = 100,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
}: UseSwipeOptions = {}) {
  const [swiping, setSwiping] = React.useState(false);
  const stateRef = React.useRef<SwipeState>({
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
  });

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    stateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
    };
    setSwiping(true);
  }, []);

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (!swiping) return;

      const touch = e.touches[0];
      stateRef.current.deltaX = touch.clientX - stateRef.current.startX;
      stateRef.current.deltaY = touch.clientY - stateRef.current.startY;
    },
    [swiping],
  );

  const handleTouchEnd = React.useCallback(() => {
    if (!swiping) return;
    setSwiping(false);

    const { deltaX, deltaY } = stateRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine if this is a horizontal or vertical swipe
    if (absX > absY && absX >= threshold && absY < verticalTolerance) {
      // Horizontal swipe
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else if (absY > absX && absY >= threshold) {
      // Vertical swipe
      if (deltaY > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }

    // Reset state
    stateRef.current = {
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
    };
  }, [
    swiping,
    threshold,
    verticalTolerance,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  ]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    swiping,
    deltaX: stateRef.current.deltaX,
    deltaY: stateRef.current.deltaY,
  };
}
