/**
 * @jest-environment jsdom
 *
 * Metric Widget + Freshness Badge Component Tests
 *
 * Tests error states, unsupported filter, freshness badge variants,
 * and casino-level-only widgets with active filters.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { WidgetError } from '@/services/measurement';

import { FreshnessBadge } from '../freshness-badge';
import { MetricWidget } from '../metric-widget';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('FreshnessBadge', () => {
  it('renders "Live" for request-time freshness', () => {
    render(<FreshnessBadge freshness="request-time" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders "As of {date}" for periodic freshness', () => {
    render(
      <FreshnessBadge
        freshness="periodic"
        snapshotDate="2026-03-15T12:00:00Z"
      />,
    );
    expect(screen.getByText(/As of/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 15, 2026/)).toBeInTheDocument();
  });

  it('renders "As of Unknown" when periodic without date', () => {
    render(<FreshnessBadge freshness="periodic" />);
    expect(screen.getByText('As of Unknown')).toBeInTheDocument();
  });
});

describe('MetricWidget', () => {
  it('renders loading skeleton when isLoading', () => {
    const { container } = render(
      <MetricWidget title="Test Metric" freshness="request-time" isLoading>
        <p>Content</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    // Should not render the title text or content
    expect(screen.queryByText('Test Metric')).not.toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    // Should have skeleton elements
    expect(
      container.querySelectorAll('[class*="animate-pulse"]').length,
    ).toBeGreaterThan(0);
  });

  it('renders error state with retry button', () => {
    const error: WidgetError = {
      code: 'query_failed',
      message: 'Metric query failed — please retry',
    };

    render(
      <MetricWidget title="Test Metric" freshness="request-time" error={error}>
        <p>Content</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('Metric unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Metric query failed — please retry'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // Should not render children
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders "Casino-level only" when filter applied but unsupported', () => {
    render(
      <MetricWidget
        title="Audit Correlation"
        freshness="request-time"
        supportedDimensions={[]}
        currentFilter={{ pitId: 'pit-1' }}
      >
        <p>Content</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Audit Correlation')).toBeInTheDocument();
    expect(screen.getByText('Casino-level only')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders children when no error and filter supported', () => {
    render(
      <MetricWidget
        title="Theo Discrepancy"
        freshness="request-time"
        supportedDimensions={['pit', 'table']}
        currentFilter={{ pitId: 'pit-1' }}
      >
        <p>Content</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Theo Discrepancy')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders children when no filters applied', () => {
    render(
      <MetricWidget
        title="Test"
        freshness="request-time"
        supportedDimensions={[]}
      >
        <p>Content</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('MEAS-002 widget shows "Casino-level only" with active filters', () => {
    render(
      <MetricWidget
        title="Audit Correlation"
        freshness="request-time"
        supportedDimensions={[]}
        currentFilter={{ tableId: 'table-1' }}
      >
        <p>Audit data</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Casino-level only')).toBeInTheDocument();
    expect(screen.queryByText('Audit data')).not.toBeInTheDocument();
  });

  it('MEAS-004 widget shows "Casino-level only" with active filters', () => {
    render(
      <MetricWidget
        title="Loyalty Liability"
        freshness="periodic"
        snapshotDate="2026-03-01"
        supportedDimensions={[]}
        currentFilter={{ pitId: 'pit-1', tableId: 'table-1' }}
      >
        <p>Loyalty data</p>
      </MetricWidget>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('Casino-level only')).toBeInTheDocument();
    expect(screen.queryByText('Loyalty data')).not.toBeInTheDocument();
  });
});
