import * as React from "react";

type SeatPosition = { left: string; top: string };

const SEAT_LAYOUT = {
  startAngle: Math.PI,
  endAngle: 2 * Math.PI,
  centerX: 50,
  centerY: 70,
  radiusX: 42,
  radiusY: 55,
};

function calculateSeatPositions(count: number): SeatPosition[] {
  if (count === 0) return [];

  const step =
    (SEAT_LAYOUT.endAngle - SEAT_LAYOUT.startAngle) / Math.max(count - 1, 1);

  return Array.from({ length: count }).map((_, i) => {
    const angle = SEAT_LAYOUT.startAngle + step * i;
    const x = SEAT_LAYOUT.centerX + SEAT_LAYOUT.radiusX * Math.cos(angle);
    const y = SEAT_LAYOUT.centerY + SEAT_LAYOUT.radiusY * Math.sin(angle);
    return { left: `${x}%`, top: `${y}%` };
  });
}

export function useSeatPositions(count: number): SeatPosition[] {
  return React.useMemo(() => calculateSeatPositions(count), [count]);
}
