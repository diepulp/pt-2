'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import {
  Activity,
  ChevronLeft,
  LayoutGrid,
  Package,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Option C: Sheet-based Hover Drawer
 *
 * Custom sheet implementation with hover-triggered open/close
 * Optimized for speed with minimal animations
 */
export function SheetPanelDemo() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('tables');
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const tabs = [
    { id: 'tables', label: 'Tables', icon: LayoutGrid, notifications: 3 },
    { id: 'activity', label: 'Activity', icon: Activity, notifications: 2 },
    { id: 'inventory', label: 'Inventory', icon: Package, notifications: 0 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, notifications: 0 },
  ];

  return (
    <div className="h-full flex bg-zinc-950 relative overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Content Header */}
        <div className="border-b border-zinc-800/40 px-6 py-4 bg-zinc-900/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">Table BJ-01</h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Blackjack • 6 seats • Active
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-zinc-500">Live</span>
            </div>
          </div>
        </div>

        {/* Table Visualization */}
        <div className="flex-1 flex items-center justify-center p-8">
          <TableVisualization />
        </div>

        {/* Bottom stats */}
        <div className="border-t border-zinc-800/40 px-6 py-3 bg-zinc-900/30">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <StatBadge icon={Users} label="Players" value="3" />
              <StatBadge icon={Zap} label="Active Slips" value="3" accent />
            </div>
            <span className="text-zinc-600 font-mono">Hover right edge →</span>
          </div>
        </div>
      </div>

      {/* Hover Trigger Zone - invisible strip on right edge */}
      <div
        className="absolute right-0 top-0 bottom-0 w-4 z-30"
        onMouseEnter={handleMouseEnter}
      />

      {/* Collapsed Tab Strip - visible when closed */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-14 bg-zinc-900/95 border-l border-zinc-800/60',
          'flex flex-col items-center py-4 gap-1 z-20',
          'transition-opacity duration-200',
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
        onMouseEnter={handleMouseEnter}
      >
        <div className="text-[8px] text-zinc-600 uppercase tracking-wider mb-2 -rotate-90 whitespace-nowrap origin-center translate-y-6">
          Table Ops
        </div>
        <div className="flex-1" />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center relative',
                'transition-colors duration-75',
                activeTab === tab.id
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50',
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="w-4 h-4" />
              {tab.notifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      </div>

      {/* Expanded Panel - slides in from right */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-80 bg-zinc-900/98 border-l border-zinc-800/60',
          'flex flex-col z-40 shadow-2xl shadow-black/50',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-amber-500/80 rounded-full" />
            <span className="text-xs font-medium text-zinc-300">
              Table Operations
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors duration-75"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full justify-start gap-0 h-auto p-1 mx-3 mt-2 mb-1 rounded-lg bg-zinc-800/30 border border-zinc-800/40 shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'flex-1 gap-1 py-1.5 text-[10px] rounded transition-colors duration-75',
                    'data-[state=active]:bg-amber-500/10',
                    'data-[state=active]:text-amber-400',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto px-3 pb-3 min-h-0">
            <TabsContent value="tables" className="mt-0 space-y-2 h-full">
              <SectionHeader>Active Players</SectionHeader>
              {['John D.', 'Sarah M.', 'Mike R.'].map((name, i) => (
                <PlayerCard key={i} name={name} seat={i + 2} />
              ))}
            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-1.5 h-full">
              <SectionHeader>Recent</SectionHeader>
              {[
                { action: 'Slip opened', time: '2m', type: 'create' },
                { action: 'Bet increased', time: '5m', type: 'update' },
                { action: 'Player seated', time: '12m', type: 'info' },
              ].map((item, i) => (
                <ActivityCard key={i} {...item} />
              ))}
            </TabsContent>

            <TabsContent value="inventory" className="mt-0 space-y-2 h-full">
              <SectionHeader>Chips</SectionHeader>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { d: '$5', c: 48, color: 'bg-red-500' },
                  { d: '$25', c: 32, color: 'bg-emerald-500' },
                  { d: '$100', c: 16, color: 'bg-zinc-700' },
                  { d: '$500', c: 8, color: 'bg-violet-500' },
                ].map((chip) => (
                  <div
                    key={chip.d}
                    className="p-2 rounded bg-zinc-800/30 text-center"
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full mx-auto mb-1',
                        chip.color,
                      )}
                    />
                    <div className="text-[10px] font-mono text-zinc-400">
                      {chip.d}
                    </div>
                    <div className="text-[9px] text-zinc-600">×{chip.c}</div>
                  </div>
                ))}
              </div>
              <div className="p-2 rounded bg-zinc-800/30 flex justify-between items-center mt-2">
                <span className="text-[10px] text-zinc-500">Total</span>
                <span className="text-sm font-mono text-zinc-300">$6,640</span>
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 space-y-1.5 h-full">
              <SectionHeader>Stats</SectionHeader>
              {[
                { label: 'Win Rate', value: '52%', trend: '+2%' },
                { label: 'Avg Bet', value: '$125', trend: '+$15' },
                { label: 'Hands/Hr', value: '42', trend: '-3' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex justify-between p-2 rounded bg-zinc-800/20"
                >
                  <span className="text-[10px] text-zinc-500">
                    {stat.label}
                  </span>
                  <div className="flex gap-2">
                    <span className="text-xs font-mono text-zinc-300">
                      {stat.value}
                    </span>
                    <span className="text-[10px] text-emerald-400">
                      {stat.trend}
                    </span>
                  </div>
                </div>
              ))}
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="border-t border-zinc-800/40 px-3 py-2 flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] text-zinc-600 font-mono">Connected</span>
        </div>
      </div>
    </div>
  );
}

function TableVisualization() {
  return (
    <div className="relative">
      <div className="w-72 h-44 rounded-[90px] bg-emerald-900/20 border-4 border-emerald-800/40 relative">
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
            <span className="text-[10px] font-mono text-zinc-400">D</span>
          </div>
        </div>
        {[...Array(6)].map((_, i) => {
          const angle = (180 / 5) * i - 90;
          const x = Math.cos((angle * Math.PI) / 180) * 145 + 144;
          const y = Math.sin((angle * Math.PI) / 180) * 90 + 155;
          const isOccupied = [1, 2, 4].includes(i);
          return (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: x, top: y }}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center',
                  isOccupied
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-600',
                )}
              >
                {isOccupied ? (
                  <Users className="w-3 h-3" />
                ) : (
                  <span className="text-[10px]">{i + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-light text-emerald-600/50 tracking-widest">
            BJ-01
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] text-zinc-600 uppercase tracking-widest pt-1">
      {children}
    </div>
  );
}

function PlayerCard({ name, seat }: { name: string; seat: number }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/30 border border-zinc-800/40">
      <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <span className="text-[10px] font-medium text-amber-400">
          {name[0]}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-300 truncate">{name}</div>
        <div className="text-[9px] text-zinc-600">Seat {seat}</div>
      </div>
      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] h-4">
        $125
      </Badge>
    </div>
  );
}

function ActivityCard({
  action,
  time,
  type,
}: {
  action: string;
  time: string;
  type: string;
}) {
  const colors: Record<string, string> = {
    create: 'bg-emerald-500',
    update: 'bg-amber-500',
    info: 'bg-blue-500',
  };
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-zinc-800/20">
      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors[type])} />
      <span className="text-[10px] text-zinc-400 flex-1 truncate">
        {action}
      </span>
      <span className="text-[9px] text-zinc-600 font-mono">{time}</span>
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          'w-3.5 h-3.5',
          accent ? 'text-amber-500' : 'text-zinc-600',
        )}
      />
      <span className="text-zinc-500">{label}:</span>
      <span
        className={cn('font-mono', accent ? 'text-amber-400' : 'text-zinc-300')}
      >
        {value}
      </span>
    </div>
  );
}
