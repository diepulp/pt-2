/**
 * Error Boundary Integration Tests
 *
 * Tests for PanelErrorBoundary and Player360Error (error.tsx).
 * Validates error isolation, recovery UI, retry logic, and
 * QueryErrorResetBoundary integration.
 *
 * @see ADR-012 Error Handling Architecture
 * @see PERF-006 WS2 — Error Boundaries & Route Resilience
 * @see PERF-006 WS7 — Integration & E2E Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { PanelErrorBoundary } from '../panel-error-boundary';

// === Mocks ===

const mockLogError = jest.fn();
const mockGetErrorMessage = jest.fn((error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred',
);
const mockIsRetryableError = jest.fn(() => false);

jest.mock('@/lib/errors/error-utils', () => ({
  getErrorMessage: (error: unknown) => mockGetErrorMessage(error),
  isRetryableError: (error: unknown) => mockIsRetryableError(error),
  logError: (error: unknown, ctx: unknown) => mockLogError(error, ctx),
}));

const mockQueryReset = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  QueryErrorResetBoundary: ({
    children,
  }: {
    children: (props: { reset: () => void }) => ReactNode;
  }) => <>{children({ reset: mockQueryReset })}</>,
}));

// === Test Helpers ===

function ThrowingChild({ message }: { message: string }): ReactNode {
  throw new Error(message);
}

function GoodChild() {
  return <div data-testid="good-child">Working panel</div>;
}

// Suppress React error boundary console noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// === Tests ===

describe('PanelErrorBoundary', () => {
  describe('rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <PanelErrorBoundary panelName="Timeline">
          <GoodChild />
        </PanelErrorBoundary>,
      );

      expect(screen.getByTestId('good-child')).toBeInTheDocument();
      expect(screen.getByText('Working panel')).toBeInTheDocument();
    });

    it('does not render fallback UI when no error', () => {
      render(
        <PanelErrorBoundary panelName="Timeline">
          <GoodChild />
        </PanelErrorBoundary>,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('catches thrown error and renders fallback UI', () => {
      render(
        <PanelErrorBoundary panelName="Timeline">
          <ThrowingChild message="Query failed" />
        </PanelErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Timeline unavailable')).toBeInTheDocument();
    });

    it('displays user-friendly error message via getErrorMessage', () => {
      mockGetErrorMessage.mockReturnValue('Connection timed out');

      render(
        <PanelErrorBoundary panelName="Metrics">
          <ThrowingChild message="ECONNREFUSED" />
        </PanelErrorBoundary>,
      );

      expect(screen.getByText('Connection timed out')).toBeInTheDocument();
      expect(mockGetErrorMessage).toHaveBeenCalled();
    });

    it('logs error via logError with panel context', () => {
      render(
        <PanelErrorBoundary panelName="Collaboration">
          <ThrowingChild message="Render failed" />
        </PanelErrorBoundary>,
      );

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          component: 'PanelErrorBoundary',
          action: 'componentDidCatch',
          metadata: { panelName: 'Collaboration' },
        }),
      );
    });

    it('isolates panel failure — sibling panels still render', () => {
      render(
        <div>
          <PanelErrorBoundary panelName="LeftRail">
            <ThrowingChild message="Left rail crash" />
          </PanelErrorBoundary>
          <PanelErrorBoundary panelName="Center">
            <GoodChild />
          </PanelErrorBoundary>
        </div>,
      );

      // Left rail shows error
      expect(screen.getByText('LeftRail unavailable')).toBeInTheDocument();
      // Center still works
      expect(screen.getByTestId('good-child')).toBeInTheDocument();
    });
  });

  describe('retry behavior', () => {
    it('hides retry button when error is not retryable', () => {
      mockIsRetryableError.mockReturnValue(false);

      render(
        <PanelErrorBoundary panelName="Timeline">
          <ThrowingChild message="Not retryable" />
        </PanelErrorBoundary>,
      );

      expect(
        screen.queryByRole('button', { name: /retry/i }),
      ).not.toBeInTheDocument();
    });

    it('shows retry button when error is retryable', () => {
      mockIsRetryableError.mockReturnValue(true);

      render(
        <PanelErrorBoundary panelName="Timeline">
          <ThrowingChild message="Network timeout" />
        </PanelErrorBoundary>,
      );

      expect(
        screen.getByRole('button', { name: /retry/i }),
      ).toBeInTheDocument();
    });

    it('calls QueryErrorResetBoundary reset on retry click', async () => {
      const user = userEvent.setup();
      mockIsRetryableError.mockReturnValue(true);

      render(
        <PanelErrorBoundary panelName="Timeline">
          <ThrowingChild message="Retryable error" />
        </PanelErrorBoundary>,
      );

      await user.click(screen.getByRole('button', { name: /retry/i }));

      expect(mockQueryReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('renders fallback with role="alert" for screen readers', () => {
      render(
        <PanelErrorBoundary panelName="Timeline">
          <ThrowingChild message="Error" />
        </PanelErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('displays panel name in heading for context', () => {
      render(
        <PanelErrorBoundary panelName="Compliance">
          <ThrowingChild message="Error" />
        </PanelErrorBoundary>,
      );

      expect(screen.getByText('Compliance unavailable')).toBeInTheDocument();
    });

    it('applies custom className to fallback', () => {
      render(
        <PanelErrorBoundary panelName="Timeline" className="custom-class">
          <ThrowingChild message="Error" />
        </PanelErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toHaveClass('custom-class');
    });
  });
});

describe('Player360Error (error.tsx)', () => {
  // Import dynamically to avoid 'use client' module issues
  let Player360Error: typeof import('@/app/(dashboard)/players/[[...playerId]]/error').default;

  beforeAll(async () => {
    const mod = await import('@/app/(dashboard)/players/[[...playerId]]/error');
    Player360Error = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRetryableError.mockReturnValue(false);
  });

  it('renders "Something went wrong" heading', () => {
    const error = Object.assign(new Error('Test error'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays error message via getErrorMessage', () => {
    mockGetErrorMessage.mockReturnValueOnce('Player data unavailable');
    const error = Object.assign(new Error('DB error'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(screen.getByText('Player data unavailable')).toBeInTheDocument();
  });

  it('displays error digest when present', () => {
    const error = Object.assign(new Error('Server error'), {
      digest: 'abc-123',
    });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(screen.getByText(/Error ID: abc-123/)).toBeInTheDocument();
  });

  it('hides error digest when not present', () => {
    const error = Object.assign(new Error('Error'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it('shows "Try again" button for retryable errors', () => {
    mockIsRetryableError.mockReturnValueOnce(true);
    const error = Object.assign(new Error('Timeout'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('hides "Try again" button for non-retryable errors', () => {
    mockIsRetryableError.mockReturnValueOnce(false);
    const error = Object.assign(new Error('Fatal'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it('calls reset when "Try again" is clicked', async () => {
    const user = userEvent.setup();
    mockIsRetryableError.mockReturnValueOnce(true);
    const mockReset = jest.fn();
    const error = Object.assign(new Error('Timeout'), { digest: undefined });
    render(<Player360Error error={error} reset={mockReset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders "Back to players" link', () => {
    const error = Object.assign(new Error('Error'), { digest: undefined });
    render(<Player360Error error={error} reset={jest.fn()} />);

    const link = screen.getByRole('link', { name: /back to players/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/players');
  });

  it('logs error on mount via logError', () => {
    const error = Object.assign(new Error('Render crash'), {
      digest: undefined,
    });
    render(<Player360Error error={error} reset={jest.fn()} />);

    expect(mockLogError).toHaveBeenCalledWith(error, {
      component: 'Player360Error',
      action: 'render',
    });
  });
});
