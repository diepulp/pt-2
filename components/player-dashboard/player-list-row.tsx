/**
 * Player List Row Component
 *
 * Row component for player search results that navigates to Player 360
 * on click with returnTo param encoding the current search context.
 *
 * @see PRD-022 WS4 Dashboard Demotion
 */

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { buildPlayerDetailUrl } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface PlayerListRowProps {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    player_card_id?: string | null;
    date_of_birth?: string | null;
  };
  isSelected?: boolean;
  className?: string;
}

export function PlayerListRow({
  player,
  isSelected,
  className,
}: PlayerListRowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleClick = () => {
    // Capture current location as returnTo (preserving query params)
    const currentUrl =
      pathname + (searchParams.toString() ? `?${searchParams}` : '');
    router.push(buildPlayerDetailUrl(player.id, currentUrl));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      data-testid={`player-row-${player.id}`}
      data-selected={isSelected}
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50',
        isSelected && 'bg-muted',
        className,
      )}
    >
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium">
            {player.first_name} {player.last_name}
          </span>
          {player.player_card_id && (
            <span className="text-xs text-muted-foreground">
              Card: {player.player_card_id}
            </span>
          )}
        </div>
      </td>
      {player.date_of_birth && (
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {new Date(player.date_of_birth).toLocaleDateString()}
        </td>
      )}
    </tr>
  );
}
