'use client';

import { useMemo } from 'react';

interface Position {
  left: number; // pixel position left
  top: number; // pixel position top
}

/**
 * Calculate seat positions around a semi-circle table layout
 * Positions are distributed along the top arc of a semi-circle
 */
export function useSeatPositions(
  count: number,
  radius = 140,
  center = { x: 200, y: 165 },
): Position[] {
  return useMemo(() => {
    if (count === 0) return [];

    // Arrange seats along a semi-circle (top arc)
    const start = Math.PI; // 180deg (left)
    const end = 2 * Math.PI; // 360deg (right)
    const step = (end - start) / Math.max(count - 1, 1);

    return Array.from({ length: count }).map((_, i) => {
      const angle = start + step * i;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      return { left: x, top: y };
    });
  }, [count, radius, center.x, center.y]);
}
