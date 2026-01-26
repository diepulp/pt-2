/**
 * Filter Tile Component Tests
 *
 * Tests for the compact interactive filter tile in the Left Rail.
 * Verifies rendering, click behavior, and active state visualization.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see WS7 Testing & QA
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FilterTile } from '../left-rail/filter-tile';

describe('FilterTile', () => {
  const defaultProps = {
    title: 'Sessions',
    value: '12',
    category: 'session' as const,
    isActive: false,
    onFilter: jest.fn(),
    onClear: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the filter tile', () => {
      render(<FilterTile {...defaultProps} />);

      expect(screen.getByTestId('filter-tile-session')).toBeInTheDocument();
    });

    it('displays title and value', () => {
      render(<FilterTile {...defaultProps} title="Sessions" value="12" />);

      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('displays optional delta', () => {
      render(<FilterTile {...defaultProps} delta="+3" />);

      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('styles positive delta with emerald color', () => {
      render(<FilterTile {...defaultProps} delta="+5" />);

      const delta = screen.getByText('+5');
      expect(delta).toHaveClass('text-emerald-400');
    });

    it('styles negative delta with red color', () => {
      render(<FilterTile {...defaultProps} delta="-2" />);

      const delta = screen.getByText('-2');
      expect(delta).toHaveClass('text-red-400');
    });

    it('does not show clear button when inactive', () => {
      render(<FilterTile {...defaultProps} isActive={false} />);

      expect(
        screen.queryByRole('button', { name: 'Clear filter' }),
      ).not.toBeInTheDocument();
    });

    it('shows clear button when active', () => {
      render(<FilterTile {...defaultProps} isActive={true} />);

      expect(
        screen.getByRole('button', { name: 'Clear filter' }),
      ).toBeInTheDocument();
    });
  });

  describe('click behavior', () => {
    it('calls onFilter when tile is clicked while inactive', async () => {
      const user = userEvent.setup();
      const onFilter = jest.fn();

      render(
        <FilterTile {...defaultProps} isActive={false} onFilter={onFilter} />,
      );

      await user.click(screen.getByTestId('filter-tile-session'));

      expect(onFilter).toHaveBeenCalledTimes(1);
    });

    it('calls onClear when tile is clicked while active', async () => {
      const user = userEvent.setup();
      const onClear = jest.fn();

      render(
        <FilterTile {...defaultProps} isActive={true} onClear={onClear} />,
      );

      await user.click(screen.getByTestId('filter-tile-session'));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('calls onClear when clear button is clicked', async () => {
      const user = userEvent.setup();
      const onClear = jest.fn();

      render(
        <FilterTile {...defaultProps} isActive={true} onClear={onClear} />,
      );

      await user.click(screen.getByRole('button', { name: 'Clear filter' }));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('clear button click does not trigger tile click', async () => {
      const user = userEvent.setup();
      const onFilter = jest.fn();
      const onClear = jest.fn();

      render(
        <FilterTile
          {...defaultProps}
          isActive={true}
          onFilter={onFilter}
          onClear={onClear}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Clear filter' }));

      // Only onClear should be called, not onFilter
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('active state styling', () => {
    it('has ring-2 ring-primary when active', () => {
      render(<FilterTile {...defaultProps} isActive={true} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('ring-2', 'ring-primary');
    });

    it('has bg-primary/5 when active', () => {
      render(<FilterTile {...defaultProps} isActive={true} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('bg-primary/5');
    });

    it('does not have ring classes when inactive', () => {
      render(<FilterTile {...defaultProps} isActive={false} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).not.toHaveClass('ring-2');
    });

    it('has aria-pressed=true when active', () => {
      render(<FilterTile {...defaultProps} isActive={true} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveAttribute('aria-pressed', 'true');
    });

    it('has aria-pressed=false when inactive', () => {
      render(<FilterTile {...defaultProps} isActive={false} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('different categories', () => {
    it('renders with financial category', () => {
      render(<FilterTile {...defaultProps} category="financial" />);

      expect(screen.getByTestId('filter-tile-financial')).toBeInTheDocument();
    });

    it('renders with gaming category', () => {
      render(<FilterTile {...defaultProps} category="gaming" />);

      expect(screen.getByTestId('filter-tile-gaming')).toBeInTheDocument();
    });

    it('renders with loyalty category', () => {
      render(<FilterTile {...defaultProps} category="loyalty" />);

      expect(screen.getByTestId('filter-tile-loyalty')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('tile is a button element', () => {
      render(<FilterTile {...defaultProps} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile.tagName).toBe('BUTTON');
    });

    it('button has type=button', () => {
      render(<FilterTile {...defaultProps} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveAttribute('type', 'button');
    });

    it('is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onFilter = jest.fn();

      render(
        <FilterTile {...defaultProps} isActive={false} onFilter={onFilter} />,
      );

      await user.tab();
      await user.keyboard('{Enter}');

      expect(onFilter).toHaveBeenCalledTimes(1);
    });

    it('clear button has accessible name', () => {
      render(<FilterTile {...defaultProps} isActive={true} />);

      const clearButton = screen.getByRole('button', { name: 'Clear filter' });
      expect(clearButton).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('accepts additional className prop', () => {
      render(<FilterTile {...defaultProps} className="my-custom-class" />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('my-custom-class');
    });

    it('has base styling classes', () => {
      render(<FilterTile {...defaultProps} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('w-full', 'rounded-md', 'border');
    });

    it('has transition class for hover effects', () => {
      render(<FilterTile {...defaultProps} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('transition-all');
    });
  });

  describe('layout', () => {
    it('has flex layout for content arrangement', () => {
      render(<FilterTile {...defaultProps} />);

      const tile = screen.getByTestId('filter-tile-session');
      expect(tile).toHaveClass('flex', 'items-center', 'justify-between');
    });
  });
});
