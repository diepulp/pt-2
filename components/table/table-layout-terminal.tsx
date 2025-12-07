'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface SeatOccupant {
  firstName: string;
  lastName: string;
}

interface TableLayoutTerminalProps {
  seats: (SeatOccupant | null)[];
  onSeatClick?: (index: number, occupant: SeatOccupant | null) => void;
  isLoading?: boolean;
  dealerName?: string;
}

// Modern Minimalist Theme
// Uses Tailwind semantic tokens: background, card, accent, muted, etc.

/**
 * Calculate seat positions along a semi-circle arc
 * Uses percentage-based positioning for responsiveness
 */
function calculateSeatPositions(
  count: number,
): { left: string; top: string }[] {
  if (count === 0) return [];

  // Distribute seats along the top arc (180deg to 360deg)
  // Using percentages relative to container
  const startAngle = Math.PI; // 180deg (left side)
  const endAngle = 2 * Math.PI; // 360deg (right side)
  const step = (endAngle - startAngle) / Math.max(count - 1, 1);

  // Semi-circle parameters (percentage-based)
  const centerX = 50; // Center horizontally
  const centerY = 70; // Shifted down to place arc in upper portion
  const radiusX = 42; // Horizontal radius (percentage of width)
  const radiusY = 55; // Vertical radius (percentage of height)

  return Array.from({ length: count }).map((_, i) => {
    const angle = startAngle + step * i;
    const x = centerX + radiusX * Math.cos(angle);
    const y = centerY + radiusY * Math.sin(angle);
    return { left: `${x}%`, top: `${y}%` };
  });
}

export const TableLayoutTerminal = React.memo<TableLayoutTerminalProps>(
  function TableLayoutTerminal({
    seats,
    onSeatClick,
    isLoading = false,
    dealerName,
  }) {
    const positions = React.useMemo(
      () => calculateSeatPositions(seats.length),
      [seats.length],
    );

    return (
      <section aria-label="Table layout" className="relative w-full">
        {/* Ambient glow behind table */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] aspect-[3/2] rounded-full blur-3xl opacity-20 pointer-events-none bg-accent/20" />

        {/* Main table container - responsive with aspect ratio */}
        <div className="relative w-full max-w-[500px] mx-auto aspect-[16/10]">
          {/* Table surface */}
          <div
            className={cn(
              'absolute inset-x-[5%] top-[8%] bottom-0',
              'rounded-t-[50%]',
              'border border-border/50',
              'shadow-[inset_0_2px_40px_rgba(0,0,0,0.4),_0_16px_48px_-8px_rgba(0,0,0,0.4),_0_0_0_1px_rgba(255,255,255,0.05)]',
              'overflow-hidden',
              'bg-gradient-to-b from-card via-card/90 to-background',
            )}
          >
            {/* Subtle noise texture overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              }}
            />

            {/* Radial highlight at top */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--accent)/0.1),transparent)]" />

            {/* Subtle grid pattern */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:20px_20px]" />

            {/* Inner rail/border effect */}
            <div className="absolute inset-[6%] rounded-t-[50%] border border-border/20 pointer-events-none" />

            {/* Loading skeleton overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-3">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] sm:text-xs font-medium text-muted-foreground tracking-wide uppercase">
                    Loading table...
                  </span>
                </div>
              </div>
            )}

            {/* Dealer position */}
            <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10">
              <div className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-muted/50 border border-border/50 backdrop-blur-sm">
                <span className="text-[8px] sm:text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  Dealer
                </span>
              </div>
              {dealerName && (
                <span className="text-[10px] sm:text-xs text-foreground/80 font-medium">
                  {dealerName}
                </span>
              )}
            </div>
          </div>

          {/* Seats layer - positioned over the table */}
          <div className="absolute inset-0">
            {seats.map((occupant, i) => {
              const pos = positions[i];
              if (!pos) return null;

              return (
                <button
                  key={i}
                  onClick={() => onSeatClick?.(i, occupant)}
                  className={cn(
                    'group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-hidden',
                    'animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both',
                  )}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    animationDelay: `${i * 80}ms`,
                  }}
                  aria-label={
                    occupant
                      ? `Seat ${i + 1}, occupied by ${occupant.firstName} ${occupant.lastName}`
                      : `Seat ${i + 1}, empty`
                  }
                >
                  {/* Seat glow effect on hover/occupied */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-full blur-md transition-opacity duration-300',
                      occupant
                        ? 'bg-accent/40 opacity-100'
                        : 'bg-accent/20 opacity-0 group-hover:opacity-100',
                    )}
                    style={{ transform: 'scale(1.4)' }}
                  />

                  {/* Main seat circle - responsive sizing */}
                  <div
                    className={cn(
                      'relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full',
                      'border backdrop-blur-sm',
                      'transition-all duration-300 ease-out',
                      occupant
                        ? 'border-accent/60 bg-accent/20 shadow-[0_0_20px_hsl(var(--accent)/0.3)]'
                        : 'border-border/40 bg-card/40 shadow-[0_8px_20px_rgba(0,0,0,0.3)]',
                      'group-hover:scale-110 group-hover:border-accent/50 group-hover:bg-accent/10',
                      'group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                    )}
                  >
                    {/* Seat number */}
                    <span
                      className={cn(
                        'absolute inset-0 grid place-items-center font-semibold transition-all duration-300',
                        occupant
                          ? 'text-accent-foreground text-xs sm:text-sm'
                          : 'text-muted-foreground text-[10px] sm:text-xs group-hover:text-foreground',
                      )}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {i + 1}
                    </span>

                    {/* Inner ring for depth */}
                    <div className="absolute inset-1 sm:inset-1.5 rounded-full border border-white/5" />
                  </div>

                  {/* Status badge */}
                  <span
                    className={cn(
                      'absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2',
                      'rounded-full px-1.5 sm:px-2 py-0.5',
                      'text-[7px] sm:text-[9px] font-bold tracking-wider uppercase',
                      'transition-all duration-300',
                      'shadow-xs',
                      occupant
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted text-muted-foreground border border-border/50',
                      'group-hover:scale-105',
                    )}
                  >
                    {occupant ? 'Taken' : 'Open'}
                  </span>

                  {/* Player name tooltip on hover for occupied seats */}
                  {occupant && (
                    <div
                      className={cn(
                        'absolute -top-8 sm:-top-10 left-1/2 -translate-x-1/2',
                        'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md',
                        'bg-popover border border-border',
                        'text-[9px] sm:text-[11px] font-medium text-popover-foreground whitespace-nowrap',
                        'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
                        'transition-all duration-200',
                        'shadow-lg',
                        'pointer-events-none',
                        'z-20',
                      )}
                    >
                      {occupant.firstName} {occupant.lastName}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r border-border rotate-45" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table stats footer */}
        <div className="mt-4 flex justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.5)]" />
            <span className="text-muted-foreground font-medium">
              {seats.filter(Boolean).length} Occupied
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-muted border border-border/50" />
            <span className="text-muted-foreground/70 font-medium">
              {seats.filter((s) => !s).length} Available
            </span>
          </div>
        </div>
      </section>
    );
  },
);

export default TableLayoutTerminal;
