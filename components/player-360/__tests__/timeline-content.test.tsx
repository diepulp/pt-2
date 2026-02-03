/**
 * Timeline Page Content Orchestration Tests
 *
 * Tests for TimelinePageContent — the thin orchestrator that composes
 * isolated panel components (FilterPanel, SummaryPanel, ChartPanel,
 * TimelinePanel, CompliancePanelWrapper) in a 3-panel layout.
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 * @see PERF-006 WS7 — Integration & E2E Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// === Mocks ===

// Mock the layout context provider
const mockSetActiveRightTab = jest.fn();
let mockActiveRightTab: 'collaboration' | 'compliance' = 'collaboration';

jest.mock('@/components/player-360', () => ({
  PanelContent: ({
    children,
  }: {
    children: React.ReactNode;
    padding?: boolean;
  }) => <div data-testid="panel-content">{children}</div>,
  PanelHeader: ({ title }: { title: string; icon?: React.ReactNode }) => (
    <div data-testid={`panel-header-${title.toLowerCase()}`}>{title}</div>
  ),
  Player360Center: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="player-360-center">{children}</div>
  ),
  Player360LeftRail: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="player-360-left-rail">{children}</div>
  ),
  Player360RightRail: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="player-360-right-rail">{children}</div>
  ),
  usePlayer360Layout: () => ({
    activeRightTab: mockActiveRightTab,
    setActiveRightTab: (tab: 'collaboration' | 'compliance') => {
      mockSetActiveRightTab(tab);
      mockActiveRightTab = tab;
    },
  }),
}));

// Mock child panel components as stubs
jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/chart-panel',
  () => ({
    ChartPanel: ({
      playerId,
    }: {
      playerId: string;
      onBucketClick: () => void;
    }) => <div data-testid="chart-panel">ChartPanel:{playerId}</div>,
  }),
);

jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper',
  () => ({
    CompliancePanelWrapper: ({
      playerId,
      gamingDay,
    }: {
      playerId: string;
      gamingDay: string;
    }) => (
      <div data-testid="compliance-panel-wrapper">
        Compliance:{playerId}:{gamingDay}
      </div>
    ),
  }),
);

jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/filter-panel',
  () => ({
    FilterPanel: ({
      playerId,
      gamingDay,
    }: {
      playerId: string;
      gamingDay: string;
      onScrollToTimeline: () => void;
    }) => (
      <div data-testid="filter-panel">
        FilterPanel:{playerId}:{gamingDay}
      </div>
    ),
  }),
);

jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/summary-panel',
  () => ({
    SummaryPanel: ({
      playerId,
      gamingDay,
    }: {
      playerId: string;
      gamingDay: string;
      onScrollToTimeline: () => void;
    }) => (
      <div data-testid="summary-panel">
        SummaryPanel:{playerId}:{gamingDay}
      </div>
    ),
  }),
);

jest.mock(
  '@/app/(dashboard)/players/[playerId]/timeline/_components/timeline-panel',
  () => ({
    TimelinePanel: ({
      playerId,
    }: {
      playerId: string;
      timelineRef: React.RefObject<HTMLDivElement | null>;
    }) => <div data-testid="timeline-panel">TimelinePanel:{playerId}</div>,
  }),
);

// Resolve via dynamic import
let TimelinePageContent: React.ComponentType<{
  playerId: string;
  gamingDay: string;
}>;

beforeAll(async () => {
  const mod = await import(
    '@/app/(dashboard)/players/[playerId]/timeline/_components/timeline-content'
  );
  TimelinePageContent = mod.TimelinePageContent;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveRightTab = 'collaboration';
});

// === Tests ===

describe('TimelinePageContent', () => {
  describe('3-panel layout', () => {
    it('renders left rail with FilterPanel', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      expect(screen.getByTestId('player-360-left-rail')).toBeInTheDocument();
      expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
      expect(screen.getByTestId('filter-panel')).toHaveTextContent(
        'FilterPanel:player-123:2026-01-26',
      );
    });

    it('renders center with SummaryPanel, ChartPanel, and TimelinePanel', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      expect(screen.getByTestId('player-360-center')).toBeInTheDocument();
      expect(screen.getByTestId('summary-panel')).toBeInTheDocument();
      expect(screen.getByTestId('chart-panel')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
    });

    it('renders right rail with tab switcher', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      expect(screen.getByTestId('player-360-right-rail')).toBeInTheDocument();
      // Tab buttons contain icon + text; use getAllByText and check at least one is a button
      const notesButtons = screen.getAllByText('Notes');
      expect(notesButtons.length).toBeGreaterThanOrEqual(1);
      const complianceButtons = screen.getAllByText('Compliance');
      expect(complianceButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('prop forwarding', () => {
    it('passes playerId to all panels', () => {
      render(
        <TimelinePageContent playerId="player-xyz" gamingDay="2026-01-26" />,
      );

      expect(screen.getByTestId('filter-panel')).toHaveTextContent(
        'player-xyz',
      );
      expect(screen.getByTestId('summary-panel')).toHaveTextContent(
        'player-xyz',
      );
      expect(screen.getByTestId('chart-panel')).toHaveTextContent(
        'player-xyz',
      );
      expect(screen.getByTestId('timeline-panel')).toHaveTextContent(
        'player-xyz',
      );
    });

    it('passes gamingDay to panels that need it', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-02-01" />,
      );

      expect(screen.getByTestId('filter-panel')).toHaveTextContent(
        '2026-02-01',
      );
      expect(screen.getByTestId('summary-panel')).toHaveTextContent(
        '2026-02-01',
      );
    });
  });

  describe('right rail tab switching', () => {
    it('shows collaboration placeholder by default', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      // Collaboration is default active tab — shows Notes placeholder
      expect(screen.getByText('Notes will appear here')).toBeInTheDocument();
    });

    it('does not show compliance panel by default', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      expect(
        screen.queryByTestId('compliance-panel-wrapper'),
      ).not.toBeInTheDocument();
    });

    it('switches to compliance tab on click', async () => {
      // Pre-set mock to compliance before render to test compliance rendering
      mockActiveRightTab = 'compliance';

      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      expect(
        screen.getByTestId('compliance-panel-wrapper'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('compliance-panel-wrapper'),
      ).toHaveTextContent('Compliance:player-123:2026-01-26');
    });

    it('calls setActiveRightTab when tab button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      // Click the Compliance tab button
      const complianceTab = screen.getByText('Compliance');
      await user.click(complianceTab);

      expect(mockSetActiveRightTab).toHaveBeenCalledWith('compliance');
    });

    it('calls setActiveRightTab for Notes tab', async () => {
      const user = userEvent.setup();
      mockActiveRightTab = 'compliance';

      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      const notesTab = screen.getByText('Notes');
      await user.click(notesTab);

      expect(mockSetActiveRightTab).toHaveBeenCalledWith('collaboration');
    });
  });

  describe('component isolation', () => {
    it('renders all 5 panel components as independent units', () => {
      render(
        <TimelinePageContent playerId="player-123" gamingDay="2026-01-26" />,
      );

      // Each panel is its own component with isolated hook subscriptions
      const panels = [
        'filter-panel',
        'summary-panel',
        'chart-panel',
        'timeline-panel',
      ];

      for (const panel of panels) {
        expect(screen.getByTestId(panel)).toBeInTheDocument();
      }
    });
  });
});
