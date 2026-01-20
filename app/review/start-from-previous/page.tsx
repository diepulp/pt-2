'use client';

import { Calendar, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import {
  GamingDayInfo,
  PlayerInfo,
  PlayerListItem,
  PlayerListPanel,
  SessionData,
  StartFromPreviousModal,
  StartFromPreviousPanel,
  useStartFromPreviousModal,
} from '@/components/player-sessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// Mock Data
// ============================================================================

// Gaming day is today's date (simulating casino temporal authority)
const mockGamingDay: GamingDayInfo = {
  gaming_day: new Date().toISOString().split('T')[0],
  timezone: 'America/Los_Angeles',
};

const mockPlayer: PlayerInfo = {
  player_id: 'player-001',
  name: 'John Smith',
  tier: 'Platinum',
  card_number: '•••• 4829',
};

// Gaming day scoped sessions (today only - closed sessions)
const mockRecentSessions: SessionData[] = [
  {
    visit_id: 'visit-001',
    visit_group_id: 'group-001',
    started_at: new Date(
      Date.now() - 4 * 60 * 60 * 1000 - 90 * 60 * 1000,
    ).toISOString(),
    ended_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    last_table_id: 'table-bj-01',
    last_table_name: 'BJ-01',
    last_seat_number: 5,
    total_duration_seconds: 5400, // 1h 30m
    total_buy_in: 300,
    total_cash_out: 450,
    net: 150,
    points_earned: 120,
    segment_count: 2,
  },
  {
    visit_id: 'visit-002',
    visit_group_id: 'group-002',
    started_at: new Date(
      Date.now() - 8 * 60 * 60 * 1000 - 2.75 * 60 * 60 * 1000,
    ).toISOString(),
    ended_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    last_table_id: 'table-rl-02',
    last_table_name: 'Roulette-02',
    last_seat_number: 8,
    total_duration_seconds: 9900, // 2h 45m
    total_buy_in: 1000,
    total_cash_out: 800,
    net: -200,
    points_earned: 350,
    segment_count: 1,
  },
];

// Player list mock data - all players with closed sessions (gaming day scoped)
const mockPlayerList: PlayerListItem[] = [
  {
    player_id: 'player-001',
    name: 'John Smith',
    tier: 'Platinum',
    card_number: '•••• 4829',
    last_session: {
      table_name: 'BJ-05',
      seat_number: 3,
      ended_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      net: 450,
    },
    session_count: 3,
    total_points_today: 620,
    total_net_today: 450,
  },
  {
    player_id: 'player-002',
    name: 'Sarah Chen',
    card_number: '•••• 7712',
    last_session: {
      table_name: 'BJ-03',
      seat_number: 1,
      ended_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      net: 250,
    },
    session_count: 2,
    total_points_today: 340,
    total_net_today: 250,
  },
  {
    player_id: 'player-003',
    name: 'Michael Rodriguez',
    tier: 'Gold',
    card_number: '•••• 3391',
    last_session: {
      table_name: 'Roulette-01',
      seat_number: 6,
      ended_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      net: -150,
    },
    session_count: 1,
    total_points_today: 180,
    total_net_today: -150,
  },
  {
    player_id: 'player-004',
    name: 'Emily Watson',
    tier: 'Diamond',
    card_number: '•••• 8847',
    last_session: {
      table_name: 'Baccarat-01',
      seat_number: 2,
      ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      net: 1200,
    },
    session_count: 4,
    total_points_today: 2100,
    total_net_today: 1200,
  },
  {
    player_id: 'player-005',
    name: 'David Kim',
    card_number: '•••• 2256',
    last_session: {
      table_name: 'BJ-02',
      seat_number: 7,
      ended_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      net: -400,
    },
    session_count: 1,
    total_points_today: 220,
    total_net_today: -400,
  },
  {
    player_id: 'player-006',
    name: 'Lisa Thompson',
    tier: 'Silver',
    card_number: '•••• 9934',
    last_session: {
      table_name: 'BJ-01',
      seat_number: 2,
      ended_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      net: 125,
    },
    session_count: 1,
    total_points_today: 85,
    total_net_today: 125,
  },
  {
    player_id: 'player-007',
    name: 'James Wilson',
    tier: 'Gold',
    card_number: '•••• 1128',
    last_session: {
      table_name: 'BJ-04',
      seat_number: 4,
      ended_at: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
      net: 300,
    },
    session_count: 2,
    total_points_today: 450,
    total_net_today: 300,
  },
  {
    player_id: 'player-008',
    name: 'Maria Garcia',
    card_number: '•••• 6673',
    last_session: {
      table_name: 'Roulette-02',
      seat_number: 3,
      ended_at: new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString(),
      net: 75,
    },
    session_count: 1,
    total_points_today: 95,
    total_net_today: 75,
  },
];

// Session data per player (for modal) - only closed sessions
const mockPlayerSessions: Record<string, SessionData[]> = {
  'player-001': mockRecentSessions,
  'player-002': [
    {
      visit_id: 'visit-sarah-001',
      visit_group_id: 'group-sarah-001',
      started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      ended_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      last_table_id: 'table-bj-03',
      last_table_name: 'BJ-03',
      last_seat_number: 1,
      total_duration_seconds: 5400,
      total_buy_in: 500,
      total_cash_out: 750,
      net: 250,
      points_earned: 340,
      segment_count: 1,
    },
  ],
  'player-003': [
    {
      visit_id: 'visit-michael-001',
      visit_group_id: 'group-michael-001',
      started_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ended_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      last_table_id: 'table-rl-01',
      last_table_name: 'Roulette-01',
      last_seat_number: 6,
      total_duration_seconds: 5400,
      total_buy_in: 400,
      total_cash_out: 250,
      net: -150,
      points_earned: 180,
      segment_count: 1,
    },
  ],
  'player-004': [
    {
      visit_id: 'visit-emily-001',
      visit_group_id: 'group-emily-001',
      started_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      last_table_id: 'table-bac-01',
      last_table_name: 'Baccarat-01',
      last_seat_number: 2,
      total_duration_seconds: 10800,
      total_buy_in: 3000,
      total_cash_out: 4200,
      net: 1200,
      points_earned: 2100,
      segment_count: 2,
    },
  ],
};

// ============================================================================
// Theme Toggle
// ============================================================================

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default function StartFromPreviousReviewPage() {
  // Panel demo state
  const [panelState, setPanelState] = React.useState<
    'with-sessions' | 'empty' | 'loading'
  >('with-sessions');

  // Player list state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isSearching, setIsSearching] = React.useState(false);

  // Modal state
  const [modalState, modalActions] = useStartFromPreviousModal();

  // Filter players by search
  const filteredPlayers = React.useMemo(() => {
    if (!searchQuery) return mockPlayerList;
    const query = searchQuery.toLowerCase();
    return mockPlayerList.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.card_number?.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  // Pagination
  const pageSize = 5;
  const totalPages = Math.ceil(filteredPlayers.length / pageSize);
  const paginatedPlayers = filteredPlayers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Handle search with debounce simulation
  const handleSearchChange = React.useCallback((query: string) => {
    setIsSearching(true);
    setSearchQuery(query);
    setCurrentPage(1);
    // Simulate API call
    setTimeout(() => setIsSearching(false), 300);
  }, []);

  // Handle player selection
  const handlePlayerSelect = React.useCallback(
    (player: PlayerListItem) => {
      modalActions.open(player);
      // Simulate API call to fetch session data
      setTimeout(() => {
        const sessions = mockPlayerSessions[player.player_id] || [];
        modalActions.setSessionData(sessions);
      }, 500);
    },
    [modalActions],
  );

  const handleStartFromPrevious = (sourceVisitId: string) => {
    alert(`Starting new visit from previous session: ${sourceVisitId}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Start From Previous — UI Review
              </h1>
              <p className="text-sm text-muted-foreground">
                PRD-017: Visit Continuation Feature (Gaming Day Scoped)
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="gap-1.5 font-mono text-xs">
                <Calendar className="h-3 w-3" />
                Gaming Day: {mockGamingDay.gaming_day}
              </Badge>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  Static Preview
                </span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto p-6">
          <Tabs defaultValue="list" className="space-y-8">
            <TabsList>
              <TabsTrigger value="list">Player List + Modal</TabsTrigger>
              <TabsTrigger value="panel">Panel States</TabsTrigger>
            </TabsList>

            {/* Player List View */}
            <TabsContent value="list" className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Player List Preview */}
                <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/20">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/60" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground ml-2">
                      PlayerListPanel — Click a player to open modal
                    </span>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-background via-background to-muted/20">
                    <PlayerListPanel
                      players={paginatedPlayers}
                      gamingDay={mockGamingDay}
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalPlayers={filteredPlayers.length}
                      pageSize={pageSize}
                      searchQuery={searchQuery}
                      isSearching={isSearching}
                      onSearchChange={handleSearchChange}
                      onPageChange={setCurrentPage}
                      onPlayerSelect={handlePlayerSelect}
                    />
                  </div>
                </div>

                {/* Documentation */}
                <div className="space-y-6">
                  <div className="rounded-xl border border-border/40 bg-card/30 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                      Player List Component
                    </h2>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Gaming day scoped closed sessions
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Search by name or card number
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Pagination with configurable page size
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Last session location and time
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Net results with color coding
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Click to open session modal
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        Loyalty tier badges
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-card/30 p-6">
                    <h2 className="text-lg font-semibold mb-4">Usage</h2>
                    <pre className="text-xs font-mono bg-muted/50 p-4 rounded-lg overflow-x-auto">
                      {`import {
  PlayerListPanel,
  StartFromPreviousModal,
  useStartFromPreviousModal,
} from '@/components/player-sessions';

function MyComponent() {
  const [modal, modalActions] = useStartFromPreviousModal();

  const handlePlayerSelect = (player) => {
    modalActions.open(player);
    // Fetch closed sessions for player...
    fetchClosedSessions(player.player_id).then(sessions => {
      modalActions.setSessionData(sessions);
    });
  };

  return (
    <>
      <PlayerListPanel
        players={players}
        gamingDay={gamingDay}
        onPlayerSelect={handlePlayerSelect}
        // ...other props
      />
      <StartFromPreviousModal
        open={modal.isOpen}
        onOpenChange={(open) => !open && modalActions.close()}
        player={modal.selectedPlayer}
        recentSessions={modal.recentSessions}
        gamingDay={gamingDay}
        isLoading={modal.isLoading}
        onStartFromPrevious={handleStartFromPrevious}
      />
    </>
  );
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Panel States View */}
            <TabsContent value="panel" className="space-y-8">
              {/* State Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground mr-2">
                  Preview State:
                </span>
                {(
                  [
                    { key: 'with-sessions', label: 'With Sessions' },
                    { key: 'empty', label: 'Empty State' },
                    { key: 'loading', label: 'Loading' },
                  ] as const
                ).map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={panelState === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPanelState(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Panel Preview */}
                <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/20">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/60" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground ml-2">
                      StartFromPreviousPanel (Gaming Day Scoped)
                    </span>
                  </div>
                  <div className="p-8 bg-gradient-to-br from-background via-background to-muted/20 min-h-[600px] flex items-start justify-center">
                    <StartFromPreviousPanel
                      player={mockPlayer}
                      recentSessions={
                        panelState === 'empty' ? [] : mockRecentSessions
                      }
                      gamingDay={mockGamingDay}
                      isLoading={panelState === 'loading'}
                      onStartFromPrevious={handleStartFromPrevious}
                    />
                  </div>
                </div>

                {/* Panel Documentation */}
                <div className="space-y-6">
                  <div className="rounded-xl border border-border/40 bg-card/30 p-6">
                    <h2 className="text-lg font-semibold mb-4">
                      Gaming Day Scope
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Sessions are now scoped to the current gaming day as
                      defined by the casino&apos;s temporal authority
                      (CasinoService).
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-accent mt-0.5">•</span>
                        Gaming day start time: Configured per casino (default
                        06:00)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-accent mt-0.5">•</span>
                        Timezone: Casino-specific (e.g., America/Los_Angeles)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-accent mt-0.5">•</span>
                        Sessions computed via{' '}
                        <code className="text-xs bg-muted px-1 rounded">
                          compute_gaming_day
                        </code>{' '}
                        RPC
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-accent mt-0.5">•</span>
                        Hook:{' '}
                        <code className="text-xs bg-muted px-1 rounded">
                          useGamingDay()
                        </code>
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-card/30 p-6">
                    <h2 className="text-lg font-semibold mb-4">Panel Props</h2>
                    <div className="space-y-4 text-sm">
                      <PropDoc
                        name="gamingDay"
                        type="GamingDayInfo"
                        description="Gaming day context from casino temporal authority"
                      />
                      <PropDoc
                        name="embedded"
                        type="boolean"
                        description="Render without Card wrapper (for modal usage)"
                      />
                      <PropDoc
                        name="onClose"
                        type="() => void"
                        description="Called when dismiss is triggered (modal usage)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* File References */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <ComponentCard
              name="PlayerListPanel"
              description="Paginated player list with search and gaming day scope"
              path="components/player-sessions/player-list-panel.tsx"
            />
            <ComponentCard
              name="StartFromPreviousPanel"
              description="Session history panel (gaming day scoped)"
              path="components/player-sessions/start-from-previous.tsx"
            />
            <ComponentCard
              name="StartFromPreviousModal"
              description="Dialog wrapper for session panel"
              path="components/player-sessions/start-from-previous-modal.tsx"
            />
            <ComponentCard
              name="useStartFromPreviousModal"
              description="Hook for modal state management"
              path="components/player-sessions/start-from-previous-modal.tsx"
            />
          </div>
        </div>
      </main>

      {/* Modal */}
      <StartFromPreviousModal
        open={modalState.isOpen}
        onOpenChange={(open) => !open && modalActions.close()}
        player={modalState.selectedPlayer}
        recentSessions={modalState.recentSessions}
        gamingDay={mockGamingDay}
        isLoading={modalState.isLoading}
        onStartFromPrevious={handleStartFromPrevious}
      />

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/30 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>PT-2 Pit Station • UI Review Mode</span>
            <span className="font-mono">PRD-017 Visit Continuation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function PropDoc({
  name,
  type,
  description,
}: {
  name: string;
  type: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-accent">
          {name}
        </code>
        <span className="text-xs text-muted-foreground font-mono">{type}</span>
      </div>
      <p className="text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function ComponentCard({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return (
    <div className="group p-4 rounded-lg border border-border/40 bg-card/30 hover:border-accent/30 hover:bg-card/50 transition-all">
      <h3 className="font-mono text-sm font-medium text-foreground group-hover:text-accent transition-colors">
        {name}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
      <p className="text-xs font-mono text-muted-foreground/60 mt-2 truncate">
        {path}
      </p>
    </div>
  );
}
