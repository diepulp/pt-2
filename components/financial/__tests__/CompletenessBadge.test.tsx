import { render, screen } from '@testing-library/react';

import { CompletenessBadge } from '../CompletenessBadge';

describe('CompletenessBadge', () => {
  it('renders "Complete" for status=complete', () => {
    render(<CompletenessBadge status="complete" />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders "Partial" for status=partial', () => {
    render(<CompletenessBadge status="partial" />);
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('renders "Not computed" for status=unknown', () => {
    render(<CompletenessBadge status="unknown" />);
    expect(screen.getByText('Not computed')).toBeInTheDocument();
  });

  it('each status renders distinct visible text — not blank, not $0', () => {
    const { rerender } = render(<CompletenessBadge status="complete" />);
    expect(screen.getByTestId('completeness-badge')).not.toBeEmptyDOMElement();

    rerender(<CompletenessBadge status="partial" />);
    expect(screen.getByTestId('completeness-badge')).not.toBeEmptyDOMElement();

    rerender(<CompletenessBadge status="unknown" />);
    expect(screen.getByTestId('completeness-badge')).not.toBeEmptyDOMElement();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.getByText('Not computed')).toBeInTheDocument();
  });

  it('renders coverage percentage when provided and status is not unknown', () => {
    render(<CompletenessBadge status="partial" coverage={0.82} />);
    expect(screen.getByText(/82%/)).toBeInTheDocument();
  });

  it('does not render coverage percentage for status=unknown', () => {
    render(<CompletenessBadge status="unknown" coverage={0.5} />);
    expect(screen.queryByText(/50%/)).not.toBeInTheDocument();
  });

  it('coverage is not labeled "Attribution Ratio"', () => {
    render(<CompletenessBadge status="partial" coverage={0.73} />);
    expect(screen.queryByText(/Attribution Ratio/i)).not.toBeInTheDocument();
    expect(screen.getByText(/73%/)).toBeInTheDocument();
  });

  it('renders the data-status attribute on the badge element', () => {
    render(<CompletenessBadge status="complete" />);
    const badge = screen.getByTestId('completeness-badge');
    expect(badge).toHaveAttribute('data-status', 'complete');
  });
});
