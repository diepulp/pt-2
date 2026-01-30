/**
 * Player 360 Breadcrumb Component
 *
 * Displays breadcrumb navigation: Players > {Player Name}
 * Includes explicit "Back to search" control with returnTo param handling.
 *
 * @see PRD-022 WS3 Navigation Utilities
 */

'use client';

import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { decodeReturnTo } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface Player360BreadcrumbProps {
  playerName?: string;
  className?: string;
}

export function Player360Breadcrumb({
  playerName = 'Player',
  className,
}: Player360BreadcrumbProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = decodeReturnTo(searchParams.get('returnTo'));

  const handleBackClick = () => {
    router.push(returnTo);
  };

  return (
    <nav
      data-testid="player-breadcrumb"
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-2 border-b border-border/40 bg-background/95 backdrop-blur-sm',
        className,
      )}
    >
      {/* Breadcrumb Trail */}
      <div className="flex items-center gap-1.5 text-sm">
        <Link
          href={returnTo}
          data-testid="breadcrumb-players-link"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Players</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground truncate max-w-[200px]">
          {playerName}
        </span>
      </div>

      {/* Back to Search Control */}
      <button
        onClick={handleBackClick}
        data-testid="back-to-search"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to search</span>
      </button>
    </nav>
  );
}
