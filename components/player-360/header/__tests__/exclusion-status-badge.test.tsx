/**
 * Exclusion Status Badge Tests
 *
 * Verifies correct rendering for all 4 exclusion statuses.
 *
 * @see PRD-052 GAP-1
 * @see EXEC-052 WS6
 */

import { render, screen } from '@testing-library/react';

import { ExclusionStatusBadge } from '../exclusion-status-badge';

describe('ExclusionStatusBadge', () => {
  it('renders red badge with "Blocked" for blocked status', () => {
    render(<ExclusionStatusBadge status="blocked" />);

    const badge = screen.getByText('Blocked');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[class]')?.className).toContain('text-red-400');
  });

  it('renders amber badge with "Alert" for alert status', () => {
    render(<ExclusionStatusBadge status="alert" />);

    const badge = screen.getByText('Alert');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[class]')?.className).toContain('text-amber-400');
  });

  it('renders blue badge with "Watchlist" for watchlist status', () => {
    render(<ExclusionStatusBadge status="watchlist" />);

    const badge = screen.getByText('Watchlist');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[class]')?.className).toContain('text-blue-400');
  });

  it('renders nothing for clear status', () => {
    const { container } = render(<ExclusionStatusBadge status="clear" />);
    expect(container.innerHTML).toBe('');
  });
});
