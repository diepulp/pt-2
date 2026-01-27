/**
 * Player 360 Breadcrumb Component Tests
 *
 * Tests for breadcrumb navigation and "Back to search" control.
 *
 * @see PRD-022 WS10 Unit + Integration Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Player360Breadcrumb } from '../breadcrumb';

// Mock Next.js navigation
const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe('Player360Breadcrumb', () => {
  beforeEach(() => {
    mockPush.mockClear();
    // Reset search params
    mockSearchParams.delete('returnTo');
  });

  describe('rendering', () => {
    it('renders breadcrumb container', () => {
      render(<Player360Breadcrumb />);
      expect(screen.getByTestId('player-breadcrumb')).toBeInTheDocument();
    });

    it('renders Players link', () => {
      render(<Player360Breadcrumb />);
      expect(screen.getByTestId('breadcrumb-players-link')).toBeInTheDocument();
      expect(screen.getByText('Players')).toBeInTheDocument();
    });

    it('renders default player name', () => {
      render(<Player360Breadcrumb />);
      expect(screen.getByText('Player')).toBeInTheDocument();
    });

    it('renders custom player name', () => {
      render(<Player360Breadcrumb playerName="John Smith" />);
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    it('renders back to search control', () => {
      render(<Player360Breadcrumb />);
      expect(screen.getByTestId('back-to-search')).toBeInTheDocument();
      expect(screen.getByText('Back to search')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /players by default when no returnTo', async () => {
      const user = userEvent.setup();
      render(<Player360Breadcrumb />);

      await user.click(screen.getByTestId('back-to-search'));

      expect(mockPush).toHaveBeenCalledWith('/players');
    });

    it('navigates to decoded returnTo when present', async () => {
      const user = userEvent.setup();
      mockSearchParams.set(
        'returnTo',
        encodeURIComponent('/players?query=smith'),
      );

      render(<Player360Breadcrumb />);

      await user.click(screen.getByTestId('back-to-search'));

      expect(mockPush).toHaveBeenCalledWith('/players?query=smith');
    });

    it('falls back to /players for invalid returnTo', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('returnTo', encodeURIComponent('//evil.com'));

      render(<Player360Breadcrumb />);

      await user.click(screen.getByTestId('back-to-search'));

      expect(mockPush).toHaveBeenCalledWith('/players');
    });

    it('Players link navigates to returnTo destination', () => {
      mockSearchParams.set(
        'returnTo',
        encodeURIComponent('/players?query=john'),
      );

      render(<Player360Breadcrumb />);

      const link = screen.getByTestId('breadcrumb-players-link');
      expect(link).toHaveAttribute('href', '/players?query=john');
    });
  });

  describe('accessibility', () => {
    it('has nav landmark', () => {
      render(<Player360Breadcrumb />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
