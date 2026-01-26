/**
 * Summary Band Component Tests
 *
 * Tests for the 4-tile Summary Band displaying player metrics.
 * Verifies rendering, tile interactions, and filter state coordination.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see WS7 Testing & QA
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlayerSummaryDTO, SourceCategory } from '@/hooks/player-360';

import { SummaryBand } from '../summary/summary-band';

// === Test Data ===

const createMockSummary = (
  overrides: Partial<PlayerSummaryDTO> = {},
): PlayerSummaryDTO => ({
  playerId: 'player-123',
  sessionValue: {
    netWinLoss: 1250,
    theoEstimate: 890,
    lastActionAt: new Date().toISOString(),
    trendPercent: 12.5,
  },
  cashVelocity: {
    ratePerHour: 150,
    sessionTotal: 500,
    lastBuyInAt: new Date().toISOString(),
  },
  engagement: {
    status: 'active',
    durationMinutes: 45,
    lastSeenAt: new Date().toISOString(),
    isActive: true,
  },
  rewardsEligibility: {
    status: 'available',
    nextEligibleAt: null,
    reasonCodes: ['AVAILABLE'],
    guidance: null,
  },
  gamingDay: '2026-01-26',
  ...overrides,
});

describe('SummaryBand', () => {
  describe('rendering', () => {
    it('renders the summary band container', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('summary-band')).toBeInTheDocument();
    });

    it('renders all 4 summary tiles', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('summary-tile-session')).toBeInTheDocument();
      expect(screen.getByTestId('summary-tile-financial')).toBeInTheDocument();
      expect(screen.getByTestId('summary-tile-gaming')).toBeInTheDocument();
      expect(screen.getByTestId('summary-tile-loyalty')).toBeInTheDocument();
    });

    it('renders Session Value tile with formatted currency', () => {
      const data = createMockSummary({
        sessionValue: {
          netWinLoss: 1250,
          theoEstimate: 890,
          lastActionAt: new Date().toISOString(),
          trendPercent: 12.5,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Session Value')).toBeInTheDocument();
      expect(screen.getByText('$1.3k')).toBeInTheDocument();
      expect(screen.getByText('Theo: $890')).toBeInTheDocument();
    });

    it('renders negative values with minus sign', () => {
      const data = createMockSummary({
        sessionValue: {
          netWinLoss: -500,
          theoEstimate: -200,
          lastActionAt: new Date().toISOString(),
          trendPercent: -15,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('-$500')).toBeInTheDocument();
    });

    it('renders Cash Velocity with rate format', () => {
      const data = createMockSummary({
        cashVelocity: {
          ratePerHour: 150,
          sessionTotal: 500,
          lastBuyInAt: new Date().toISOString(),
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Cash Velocity')).toBeInTheDocument();
      expect(screen.getByText('$150/hr')).toBeInTheDocument();
    });

    it('renders Engagement status label', () => {
      const data = createMockSummary({
        engagement: {
          status: 'active',
          durationMinutes: 45,
          lastSeenAt: new Date().toISOString(),
          isActive: true,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Engagement')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('45m')).toBeInTheDocument();
    });

    it('renders Engagement with cooling status', () => {
      const data = createMockSummary({
        engagement: {
          status: 'cooling',
          durationMinutes: 120,
          lastSeenAt: new Date().toISOString(),
          isActive: false,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Cooling')).toBeInTheDocument();
      expect(screen.getByText('2h')).toBeInTheDocument();
    });

    it('renders Rewards eligibility status', () => {
      const data = createMockSummary({
        rewardsEligibility: {
          status: 'available',
          nextEligibleAt: null,
          reasonCodes: ['AVAILABLE'],
          guidance: null,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Rewards')).toBeInTheDocument();
      expect(screen.getByText('Eligible')).toBeInTheDocument();
    });

    it('renders Rewards as Not Eligible when not_available', () => {
      const data = createMockSummary({
        rewardsEligibility: {
          status: 'not_available',
          nextEligibleAt: null,
          reasonCodes: ['COOLDOWN_ACTIVE'],
          guidance: 'Wait 30 minutes',
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Not Eligible')).toBeInTheDocument();
    });

    it('renders Rewards as Unknown when status is unknown', () => {
      const data = createMockSummary({
        rewardsEligibility: {
          status: 'unknown',
          nextEligibleAt: null,
          reasonCodes: ['RULES_NOT_CONFIGURED'],
          guidance: 'Eligibility rules not configured',
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('tile interactions', () => {
    it('calls onCategoryChange with session when Session tile clicked', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={onCategoryChange}
        />,
      );

      await user.click(screen.getByTestId('summary-tile-session'));

      expect(onCategoryChange).toHaveBeenCalledWith('session');
    });

    it('calls onCategoryChange with financial when Cash Velocity tile clicked', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={onCategoryChange}
        />,
      );

      await user.click(screen.getByTestId('summary-tile-financial'));

      expect(onCategoryChange).toHaveBeenCalledWith('financial');
    });

    it('calls onCategoryChange with gaming when Engagement tile clicked', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={onCategoryChange}
        />,
      );

      await user.click(screen.getByTestId('summary-tile-gaming'));

      expect(onCategoryChange).toHaveBeenCalledWith('gaming');
    });

    it('calls onCategoryChange with loyalty when Rewards tile clicked', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={onCategoryChange}
        />,
      );

      await user.click(screen.getByTestId('summary-tile-loyalty'));

      expect(onCategoryChange).toHaveBeenCalledWith('loyalty');
    });

    it('toggles off filter when clicking active tile', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory="session"
          onCategoryChange={onCategoryChange}
        />,
      );

      await user.click(screen.getByTestId('summary-tile-session'));

      expect(onCategoryChange).toHaveBeenCalledWith(null);
    });
  });

  describe('active state', () => {
    it('shows ring indicator on active tile', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory="session"
          onCategoryChange={jest.fn()}
        />,
      );

      const sessionTile = screen.getByTestId('summary-tile-session');
      expect(sessionTile).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not show ring indicator on inactive tiles', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory="session"
          onCategoryChange={jest.fn()}
        />,
      );

      const financialTile = screen.getByTestId('summary-tile-financial');
      expect(financialTile).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows clear affordance (x) on active tile', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory="session"
          onCategoryChange={jest.fn()}
        />,
      );

      const sessionTile = screen.getByTestId('summary-tile-session');
      expect(sessionTile).toContainHTML('×');
    });
  });

  describe('trend indicators', () => {
    it('shows positive trend with up arrow', () => {
      const data = createMockSummary({
        sessionValue: {
          netWinLoss: 1000,
          theoEstimate: 800,
          lastActionAt: new Date().toISOString(),
          trendPercent: 25,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByLabelText('Up 25%')).toBeInTheDocument();
    });

    it('shows negative trend with down arrow', () => {
      const data = createMockSummary({
        sessionValue: {
          netWinLoss: 1000,
          theoEstimate: 800,
          lastActionAt: new Date().toISOString(),
          trendPercent: -15,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.getByText('15%')).toBeInTheDocument();
      expect(screen.getByLabelText('Down 15%')).toBeInTheDocument();
    });

    it('does not show trend when percentage is zero', () => {
      const data = createMockSummary({
        sessionValue: {
          netWinLoss: 1000,
          theoEstimate: 800,
          lastActionAt: new Date().toISOString(),
          trendPercent: 0,
        },
      });

      render(
        <SummaryBand
          data={data}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      expect(screen.queryByLabelText(/Up|Down/)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('all tiles are keyboard accessible', async () => {
      const user = userEvent.setup();
      const onCategoryChange = jest.fn();

      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={onCategoryChange}
        />,
      );

      // Tab to first tile and press Enter
      await user.tab();
      await user.keyboard('{Enter}');

      expect(onCategoryChange).toHaveBeenCalled();
    });

    it('tiles have aria-pressed attribute', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory="financial"
          onCategoryChange={jest.fn()}
        />,
      );

      const financialTile = screen.getByTestId('summary-tile-financial');
      expect(financialTile).toHaveAttribute('aria-pressed', 'true');

      const sessionTile = screen.getByTestId('summary-tile-session');
      expect(sessionTile).toHaveAttribute('aria-pressed', 'false');
    });

    it('tiles are buttons with type=button', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      const tiles = screen.getAllByRole('button');
      expect(tiles.length).toBe(4);

      tiles.forEach((tile) => {
        expect(tile).toHaveAttribute('type', 'button');
      });
    });
  });

  describe('responsive layout', () => {
    it('has correct grid classes for responsive layout', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={jest.fn()}
        />,
      );

      const band = screen.getByTestId('summary-band');
      expect(band).toHaveClass('grid', 'grid-cols-2', 'lg:grid-cols-4');
    });

    it('accepts additional className prop', () => {
      render(
        <SummaryBand
          data={createMockSummary()}
          activeCategory={null}
          onCategoryChange={jest.fn()}
          className="custom-class"
        />,
      );

      const band = screen.getByTestId('summary-band');
      expect(band).toHaveClass('custom-class');
    });
  });
});
