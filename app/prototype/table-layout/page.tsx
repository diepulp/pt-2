'use client';

import { Star, Users, UserX } from 'lucide-react';

import { TableLayoutTerminal } from '@/components/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Placeholder mock data for the prototype
const MOCK_TABLE = {
  id: 'table-001',
  name: 'Blackjack 1',
  status: 'ACTIVE' as const,
  minBet: 25,
  maxBet: 500,
  seatCount: 7,
};

// Mock seats - some occupied, some empty
const MOCK_SEATS: ({ firstName: string; lastName: string } | null)[] = [
  { firstName: 'John', lastName: 'Doe' },
  null,
  { firstName: 'Jane', lastName: 'Smith' },
  null,
  null,
  { firstName: 'Mike', lastName: 'Johnson' },
  null,
];

// Table Header Component
function TableHeader({
  table,
}: {
  table: { name: string; status: 'ACTIVE' | 'INACTIVE' };
}) {
  return (
    <CardHeader className="gap-2 md:gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="truncate text-xl md:text-2xl">
            {table.name}
          </CardTitle>
          <Badge
            variant={table.status === 'ACTIVE' ? 'default' : 'secondary'}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs',
              table.status === 'ACTIVE'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
            )}
          >
            {table.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        {/* Table selector placeholder */}
        <Button variant="outline" size="sm">
          Switch Table
        </Button>
      </div>
    </CardHeader>
  );
}

// Table Stats Component
function TableStats({
  activePlayerCount,
  seatCount,
  minBet,
  maxBet,
}: {
  activePlayerCount: number;
  seatCount: number;
  minBet: number;
  maxBet: number;
}) {
  const avgBet = Math.round((minBet + maxBet) / 2);

  return (
    <div className="flex items-center gap-6 px-6 pb-4">
      <div className="flex items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-neutral-500" />
        <span className="text-neutral-500">Players</span>
        <span className="font-semibold tabular-nums">
          {activePlayerCount}/{seatCount}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <UserX className="h-4 w-4 text-neutral-500" />
        <span className="text-neutral-500">Avg Bet</span>
        <span className="font-semibold tabular-nums">${avgBet}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Star className="h-4 w-4 text-amber-500" />
        <span className="text-neutral-500">Min/Max</span>
        <span className="font-semibold tabular-nums">
          ${minBet} / ${maxBet}
        </span>
      </div>
    </div>
  );
}

// Table Actions Component
function TableActions() {
  return (
    <section
      aria-label="Table actions"
      className="flex flex-wrap items-center gap-2"
    >
      <Button variant="secondary" className="rounded-full">
        Open Table
      </Button>
      <Button variant="secondary" className="rounded-full">
        Color Up
      </Button>
      <Button variant="secondary" className="rounded-full">
        Close Table
      </Button>
    </section>
  );
}

// Player List Component
function PlayerList({
  seats,
}: {
  seats: ({ firstName: string; lastName: string } | null)[];
}) {
  return (
    <section aria-label="Player list" className="mt-4">
      <h3 className="text-sm font-medium text-neutral-500 mb-2">
        Seated Players
      </h3>
      <div className="grid gap-2">
        {seats.map((player, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between rounded-md border px-3 py-2',
              'border-neutral-200/70 dark:border-neutral-800/70',
              player
                ? 'bg-neutral-50/70 dark:bg-neutral-900/40'
                : 'bg-transparent',
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full text-xs font-semibold',
                  player
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
                )}
              >
                {i + 1}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {player ? `${player.firstName} ${player.lastName}` : 'Empty'}
                </div>
                <div className="text-xs text-neutral-500">
                  {player ? 'Seated' : 'Tap a seat to add player'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TableLayoutPrototypePage() {
  const activePlayers = MOCK_SEATS.filter(Boolean);

  const handleSeatClick = (
    index: number,
    occupant: { firstName: string; lastName: string } | null,
  ) => {
    if (occupant) {
      alert(`Seat ${index + 1}: ${occupant.firstName} ${occupant.lastName}`);
    } else {
      alert(`Seat ${index + 1} is empty - would open player search`);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-neutral-900 dark:text-neutral-100">
          Pit Station Table Layout Prototype
        </h1>

        <Card className="w-full border-neutral-200/70 dark:border-neutral-800/70">
          <TableHeader table={MOCK_TABLE} />
          <TableStats
            activePlayerCount={activePlayers.length}
            seatCount={MOCK_TABLE.seatCount}
            minBet={MOCK_TABLE.minBet}
            maxBet={MOCK_TABLE.maxBet}
          />

          <div className="border-t border-neutral-200/70 dark:border-neutral-800/70" />

          <CardContent className="p-4 md:p-6">
            <div className="grid gap-6">
              {/* Table Layout */}
              <TableLayoutTerminal
                seats={MOCK_SEATS}
                onSeatClick={handleSeatClick}
                isLoading={false}
              />

              {/* Actions */}
              <TableActions />

              {/* Player List */}
              <PlayerList seats={MOCK_SEATS} />
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          This is a visual prototype derived from PT-1&apos;s casino table
          terminal. Click on seats to test interaction.
        </p>
      </div>
    </div>
  );
}
