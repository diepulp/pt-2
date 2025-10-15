/**
 * ManualRewardDialog Component Tests
 * Phase 6 Wave 3 Track 2: Testing & Validation
 *
 * Test coverage:
 * - Form validation (points min 1, reason min 10 chars)
 * - Server action integration via useServiceMutation
 * - Success handling with toasts and dialog close
 * - Idempotency conflict handling (warning, not error)
 * - Error handling with error toasts
 * - Accessibility features
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

import { ManualRewardDialog } from '@/components/loyalty/manual-reward-dialog'

// Create mocks
const mockManualReward = jest.fn()
const mockToast = jest.fn()

// Mock modules
jest.mock('@/app/actions/loyalty-actions', () => ({
  manualReward: (...args: unknown[]) => mockManualReward(...args),
}))

jest.mock('@/hooks/ui', () => ({
  toast: (props: unknown) => mockToast(props),
}))

describe('ManualRewardDialog', () => {
  let queryClient: QueryClient
  const mockOnOpenChange = jest.fn()
  const mockOnSuccess = jest.fn()

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    playerId: 'player-123',
    playerName: 'John Doe',
    currentBalance: 1000,
    currentTier: 'SILVER',
    onSuccess: mockOnSuccess,
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    jest.clearAllMocks()
  })

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ManualRewardDialog {...defaultProps} {...props} />
      </QueryClientProvider>,
    )
  }

  // ============================================================================
  // Test 1: Form Rendering
  // ============================================================================

  it('renders dialog with correct player information', () => {
    renderComponent()

    expect(screen.getByText('Award Loyalty Points')).toBeInTheDocument()
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument()
    expect(screen.getByText('1000 pts')).toBeInTheDocument()
    expect(screen.getByText('SILVER')).toBeInTheDocument()
  })

  it('renders form inputs with correct labels', () => {
    renderComponent()

    expect(screen.getByLabelText(/points to award/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /award points/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  // ============================================================================
  // Test 2: Form Validation
  // ============================================================================

  it('validates points field (minimum 1)', async () => {
    const user = userEvent.setup()
    renderComponent()

    const submitButton = screen.getByRole('button', { name: /award points/i })

    // Try to submit with empty points
    await user.click(submitButton)

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('validates reason field (minimum 10 characters)', async () => {
    const user = userEvent.setup()
    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    // Fill points with valid value
    await user.type(pointsInput, '100')

    // Try to submit with empty reason
    await user.click(submitButton)

    // Should show validation error
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Test 3: Successful Submission
  // ============================================================================

  it('submits form successfully with valid data', async () => {
    const user = userEvent.setup()

    mockManualReward.mockResolvedValue({
      success: true,
      data: {
        ledgerId: 'ledger-123',
        playerId: 'player-123',
        pointsChange: 100,
        balanceBefore: 1000,
        balanceAfter: 1100,
        tierBefore: 'SILVER',
        tierAfter: 'SILVER',
        idempotencyKey: 'idempotency-123',
        correlationId: 'correlation-123',
        isIdempotent: false,
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    })

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'High roller welcome bonus')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockManualReward).toHaveBeenCalledWith({
        playerId: 'player-123',
        pointsChange: 100,
        reason: 'High roller welcome bonus',
      })
    })
  })

  it('shows success toast after successful submission', async () => {
    const user = userEvent.setup()

    mockManualReward.mockResolvedValue({
      success: true,
      data: {
        ledgerId: 'ledger-123',
        playerId: 'player-123',
        pointsChange: 100,
        balanceBefore: 1000,
        balanceAfter: 1100,
        tierBefore: 'SILVER',
        tierAfter: 'SILVER',
        idempotencyKey: 'idempotency-123',
        correlationId: 'correlation-123',
        isIdempotent: false,
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    })

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'Valid reason for bonus')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled()
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })
  })

  // ============================================================================
  // Test 4: Idempotency Handling
  // ============================================================================

  it('handles idempotency conflict gracefully', async () => {
    const user = userEvent.setup()

    mockManualReward.mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: 'IDEMPOTENT_DUPLICATE',
        message: 'This reward was already processed',
        details: {
          code: 'IDEMPOTENT_DUPLICATE',
        },
      },
      status: 409,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    })

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'Duplicate attempt')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled()
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })
  })

  // ============================================================================
  // Test 5: Error Handling
  // ============================================================================

  it('shows error toast on server action failure', async () => {
    const user = userEvent.setup()

    mockManualReward.mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
      },
      status: 429,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    })

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'Test error handling')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Test 6: Accessibility
  // ============================================================================

  it('has proper ARIA labels for form inputs', () => {
    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)

    expect(pointsInput).toHaveAttribute('aria-invalid')
    expect(reasonInput).toHaveAttribute('aria-invalid')
  })

  it('displays error messages with role="alert"', async () => {
    const user = userEvent.setup()
    renderComponent()

    const submitButton = screen.getByRole('button', { name: /award points/i })
    await user.click(submitButton)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })

  it('dialog has correct role and structure', () => {
    renderComponent()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // ============================================================================
  // Test 7: Loading State
  // ============================================================================

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()

    mockManualReward.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              data: {
                ledgerId: 'ledger-123',
                playerId: 'player-123',
                pointsChange: 100,
                balanceBefore: 1000,
                balanceAfter: 1100,
                tierBefore: 'SILVER',
                tierAfter: 'SILVER',
                idempotencyKey: 'idempotency-123',
                correlationId: 'correlation-123',
                isIdempotent: false,
              },
              error: null,
              status: 200,
              timestamp: new Date().toISOString(),
              requestId: 'request-123',
            })
          }, 100)
        }),
    )

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'Testing loading state')
    await user.click(submitButton)

    expect(screen.getByText(/awarding\.\.\./i)).toBeInTheDocument()
    expect(submitButton).toBeDisabled()

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )
  })

  // ============================================================================
  // Test 8: Form Reset
  // ============================================================================

  it('resets form when dialog closes and reopens', async () => {
    const { rerender } = renderComponent({ open: true })

    const user = userEvent.setup()
    const pointsInput = screen.getByLabelText(/points to award/i)

    await user.type(pointsInput, '100')

    // Close dialog
    rerender(
      <QueryClientProvider client={queryClient}>
        <ManualRewardDialog {...defaultProps} open={false} />
      </QueryClientProvider>,
    )

    // Reopen dialog
    rerender(
      <QueryClientProvider client={queryClient}>
        <ManualRewardDialog {...defaultProps} open={true} />
      </QueryClientProvider>,
    )

    // Form should be reset
    await waitFor(() => {
      expect(screen.getByLabelText(/points to award/i)).toHaveValue(null)
    })
  })

  // ============================================================================
  // Test 9: Cache Invalidation
  // ============================================================================

  it('invalidates player loyalty query on success', async () => {
    const user = userEvent.setup()

    mockManualReward.mockResolvedValue({
      success: true,
      data: {
        ledgerId: 'ledger-123',
        playerId: 'player-123',
        pointsChange: 100,
        balanceBefore: 1000,
        balanceAfter: 1100,
        tierBefore: 'SILVER',
        tierAfter: 'SILVER',
        idempotencyKey: 'idempotency-123',
        correlationId: 'correlation-123',
        isIdempotent: false,
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    })

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    renderComponent()

    const pointsInput = screen.getByLabelText(/points to award/i)
    const reasonInput = screen.getByLabelText(/reason/i)
    const submitButton = screen.getByRole('button', { name: /award points/i })

    await user.type(pointsInput, '100')
    await user.type(reasonInput, 'Cache invalidation test')
    await user.click(submitButton)

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['loyalty', 'player', 'player-123'],
      })
    })
  })
})
