/**
 * Player 360 Dashboard Layout (WS-UX-D)
 *
 * Three-panel layout for the Player 360 dashboard:
 * - Left rail: Key metrics (narrow)
 * - Center: Timeline (wide)
 * - Right rail: Collaboration (narrow)
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 * @see EXEC-SPEC-029.md WS-UX-D
 */

'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

// === Layout Context ===

interface Player360LayoutContextValue {
  /** Currently selected player ID */
  playerId: string | null;
  /** Whether the right rail (collaboration) is collapsed */
  isRightRailCollapsed: boolean;
  /** Toggle right rail collapse state */
  toggleRightRail: () => void;
  /** Active panel tab in right rail */
  activeRightTab: 'collaboration' | 'compliance';
  /** Set active right rail tab */
  setActiveRightTab: (tab: 'collaboration' | 'compliance') => void;
}

const Player360LayoutContext =
  React.createContext<Player360LayoutContextValue | null>(null);

/**
 * Hook to access Player 360 layout context.
 * Must be used within Player360LayoutProvider.
 */
export function usePlayer360Layout(): Player360LayoutContextValue {
  const context = React.useContext(Player360LayoutContext);
  if (!context) {
    throw new Error(
      'usePlayer360Layout must be used within Player360LayoutProvider',
    );
  }
  return context;
}

// === Layout Provider ===

interface Player360LayoutProviderProps {
  /** Player ID from route params */
  playerId: string | null;
  /** Children components */
  children: React.ReactNode;
}

/**
 * Provider for Player 360 layout state.
 */
export function Player360LayoutProvider({
  playerId,
  children,
}: Player360LayoutProviderProps) {
  const [isRightRailCollapsed, setIsRightRailCollapsed] = React.useState(false);
  const [activeRightTab, setActiveRightTab] = React.useState<
    'collaboration' | 'compliance'
  >('collaboration');

  const toggleRightRail = React.useCallback(() => {
    setIsRightRailCollapsed((prev) => !prev);
  }, []);

  const value = React.useMemo(
    () => ({
      playerId,
      isRightRailCollapsed,
      toggleRightRail,
      activeRightTab,
      setActiveRightTab,
    }),
    [playerId, isRightRailCollapsed, toggleRightRail, activeRightTab],
  );

  return (
    <Player360LayoutContext.Provider value={value}>
      {children}
    </Player360LayoutContext.Provider>
  );
}

// === Layout Components ===

interface Player360LayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Root layout component for Player 360 dashboard.
 * Provides the three-panel structure.
 */
export function Player360Layout({ children, className }: Player360LayoutProps) {
  return (
    <div
      className={cn(
        'flex flex-col h-full w-full overflow-hidden bg-background',
        className,
      )}
    >
      {children}
    </div>
  );
}

// === Header ===

interface Player360HeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky header component.
 * Contains player identity, status flags, and quick actions.
 */
export function Player360Header({ children, className }: Player360HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 shrink-0',
        'border-b border-border/40 bg-background/95 backdrop-blur-sm',
        'supports-[backdrop-filter]:bg-background/60',
        className,
      )}
    >
      {children}
    </header>
  );
}

// === Body (Three-Panel Container) ===

interface Player360BodyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Body container for the three-panel layout.
 */
export function Player360Body({ children, className }: Player360BodyProps) {
  return (
    <div className={cn('flex flex-1 min-h-0 overflow-hidden', className)}>
      {children}
    </div>
  );
}

// === Left Rail (Metrics) ===

interface Player360LeftRailProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Left rail component for key metrics.
 * Narrow, scrollable panel.
 */
export function Player360LeftRail({
  children,
  className,
}: Player360LeftRailProps) {
  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col',
        'w-72 xl:w-80 shrink-0',
        'border-r border-border/40',
        'bg-card/30',
        'overflow-y-auto',
        className,
      )}
    >
      {children}
    </aside>
  );
}

// === Center Panel (Timeline) ===

interface Player360CenterProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Center panel for the timeline.
 * Wide, scrollable panel that is the "center of gravity".
 */
export function Player360Center({ children, className }: Player360CenterProps) {
  return (
    <main
      className={cn(
        'flex flex-col flex-1 min-w-0',
        'overflow-hidden',
        className,
      )}
    >
      {children}
    </main>
  );
}

// === Right Rail (Collaboration) ===

interface Player360RightRailProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Right rail component for collaboration features.
 * Notes, tags, share to shift report.
 */
export function Player360RightRail({
  children,
  className,
}: Player360RightRailProps) {
  const { isRightRailCollapsed } = usePlayer360Layout();

  return (
    <aside
      className={cn(
        'hidden xl:flex flex-col',
        'shrink-0',
        'border-l border-border/40',
        'bg-card/30',
        'overflow-y-auto',
        'transition-all duration-200 ease-in-out',
        isRightRailCollapsed ? 'w-12' : 'w-80',
        className,
      )}
    >
      {children}
    </aside>
  );
}

// === Panel Components ===

interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Generic panel container with consistent styling.
 */
export function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg',
        'border border-border/40',
        'bg-card/50 backdrop-blur-sm',
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Panel header with icon, title, and optional actions.
 */
export function PanelHeader({
  icon,
  title,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3',
        'border-b border-border/40 bg-background/50',
        'shrink-0',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            {icon}
          </div>
        )}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface PanelContentProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

/**
 * Panel content area with optional padding.
 */
export function PanelContent({
  children,
  className,
  padding = true,
}: PanelContentProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto', padding && 'p-4', className)}>
      {children}
    </div>
  );
}

// === Grid Layouts ===

interface MetricsGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Grid layout for KPI tiles in metrics rail.
 */
export function MetricsGrid({ children, className }: MetricsGridProps) {
  return (
    <div className={cn('grid gap-3', 'grid-cols-1', className)}>{children}</div>
  );
}

// === Responsive Visibility ===

interface ResponsiveVisibleProps {
  children: React.ReactNode;
  /** Show only on specified breakpoints */
  breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Show above or below the breakpoint */
  direction?: 'up' | 'down';
  className?: string;
}

/**
 * Responsive visibility wrapper.
 */
export function ResponsiveVisible({
  children,
  breakpoint,
  direction = 'up',
  className,
}: ResponsiveVisibleProps) {
  const breakpointClasses = {
    sm: direction === 'up' ? 'hidden sm:block' : 'block sm:hidden',
    md: direction === 'up' ? 'hidden md:block' : 'block md:hidden',
    lg: direction === 'up' ? 'hidden lg:block' : 'block lg:hidden',
    xl: direction === 'up' ? 'hidden xl:block' : 'block xl:hidden',
    '2xl': direction === 'up' ? 'hidden 2xl:block' : 'block 2xl:hidden',
  };

  return (
    <div className={cn(breakpointClasses[breakpoint], className)}>
      {children}
    </div>
  );
}
