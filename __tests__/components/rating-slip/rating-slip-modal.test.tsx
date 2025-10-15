/**
 * RatingSlipModal Loyalty Integration Tests
 * Phase 6 Wave 3 Track 2: Testing & Validation
 *
 * Test coverage:
 * - Displays loyalty result after successful session closure
 * - Shows manual reward dialog when bonus button clicked
 * - Handles loyalty errors gracefully with correlation ID display
 * - Loading state shows during session closure
 * - Manual reward button only visible when status === "OPEN"
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as ratingSlipActions from '@/app/actions/ratingslip-actions'
import { RatingSlipModal } from '@/components/rating-slip/rating-slip-modal'
import type {
  RatingSlipSnapshot,
  RatingSlipTable,
} from '@/components/rating-slip/rating-slip-modal'
import type { ServiceResult } from '@/services/shared/types'

// Mock the toast hook
const mockToast = jest.fn()
jest.mock('@/hooks/ui', () => ({
  toast: (props: unknown) => mockToast(props),
  useToast: () => ({ toast: mockToast }),
}))

// Mock server actions
jest.mock('@/app/actions/ratingslip-actions')
jest.mock('@/app/actions/loyalty-actions')

// Mock ManualRewardDialog to simplify testing
jest.mock('@/components/loyalty/manual-reward-dialog', () => ({
  ManualRewardDialog: ({
    open,
    onOpenChange,
    playerName,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    playerName: string
  }) => (
    <div data-testid="manual-reward-dialog" data-open={open}>
      <p>Manual Reward Dialog for {playerName}</p>
      <button onClick={() => onOpenChange(false)}>Close Dialog</button>
    </div>
  ),
}))

describe('RatingSlipModal - Loyalty Integration', () => {
  let queryClient: QueryClient
  const mockOnOpenChange = jest.fn()
  const mockOnSave = jest.fn()
  const mockOnMovePlayer = jest.fn()
  const mockOnCloseSession = jest.fn()

  const openSnapshot: RatingSlipSnapshot = {
    id: 'slip-123',
    status: 'OPEN',
    player: {
      id: 'player-123',
      name: 'Jane Smith',
      membershipId: 'MEM-123',
      tier: 'GOLD',
    },
    tableId: 'table-1',
    seatNumber: '3',
    averageBet: 50,
    cashIn: 1000,
    chipsTaken: 800,
    startTime: '2025-10-14T10:00:00',
    currentPoints: 2500,
  }

  const closedSnapshot: RatingSlipSnapshot = {
    ...openSnapshot,
    status: 'CLOSED',
  }

  const tables: RatingSlipTable[] = [
    { id: 'table-1', name: 'Blackjack 1', limit: '$25-$500', openSeats: 3 },
    { id: 'table-2', name: 'Poker 2', limit: '$10-$200', openSeats: 5 },
  ]

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    snapshot: openSnapshot,
    tables,
    onSave: mockOnSave,
    onMovePlayer: mockOnMovePlayer,
    onCloseSession: mockOnCloseSession,
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
        <RatingSlipModal {...defaultProps} {...props} />
      </QueryClientProvider>,
    )
  }

  // ============================================================================
  // Test 1: Loyalty Result Display After Successful Closure
  // ============================================================================

  it('displays loyalty result after successful session closure', async () => {
    const user = userEvent.setup()

    // Mock successful completion
    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 500,
          newBalance: 3000,
          tier: 'GOLD',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 500,
            balance_before: 2500,
            balance_after: 3000,
            tier_before: 'GOLD',
            tier_after: 'GOLD',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify completion result displayed
    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeInTheDocument()
      expect(screen.getByText(/\+500/i)).toBeInTheDocument() // Points earned
      expect(screen.getByText(/3000/i)).toBeInTheDocument() // New balance
      expect(screen.getByText(/GOLD/i)).toBeInTheDocument() // Tier
    })

    // Verify success toasts shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Session closed successfully',
      }),
    )

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('500 loyalty points'),
      }),
    )
  })

  it('shows tier upgrade celebration when tier changes', async () => {
    const user = userEvent.setup()

    // Mock completion with tier upgrade
    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 1000,
          newBalance: 5000,
          tier: 'PLATINUM',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 1000,
            balance_before: 4000,
            balance_after: 5000,
            tier_before: 'GOLD',
            tier_after: 'PLATINUM',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify tier upgrade toast shown with celebration emoji
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('🎉'),
          title: expect.stringContaining('PLATINUM'),
        }),
      )
    })
  })

  it('invalidates both rating-slip and loyalty queries on success', async () => {
    const user = userEvent.setup()

    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 500,
          newBalance: 3000,
          tier: 'GOLD',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 500,
            balance_before: 2500,
            balance_after: 3000,
            tier_before: 'GOLD',
            tier_after: 'GOLD',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify both query keys invalidated
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['rating-slip'],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['loyalty', 'player', 'player-123'],
      })
    })
  })

  // ============================================================================
  // Test 2: Manual Reward Dialog Integration
  // ============================================================================

  it('shows manual reward dialog when bonus button clicked', async () => {
    const user = userEvent.setup()
    renderComponent()

    // Verify bonus button visible for OPEN status
    const bonusButton = screen.getByRole('button', {
      name: /issue bonus points/i,
    })
    expect(bonusButton).toBeInTheDocument()

    // Click bonus button
    await user.click(bonusButton)

    // Verify dialog opened
    await waitFor(() => {
      const dialog = screen.getByTestId('manual-reward-dialog')
      expect(dialog).toHaveAttribute('data-open', 'true')
    })
  })

  it('hides manual reward button when session is CLOSED', () => {
    renderComponent({ snapshot: closedSnapshot })

    // Bonus button should NOT be visible
    expect(
      screen.queryByRole('button', { name: /issue bonus points/i }),
    ).not.toBeInTheDocument()
  })

  it('only shows manual reward button when status is OPEN', () => {
    const { rerender } = renderComponent({ snapshot: openSnapshot })

    // Button should be visible for OPEN status
    expect(
      screen.getByRole('button', { name: /issue bonus points/i }),
    ).toBeInTheDocument()

    // Change to CLOSED status
    rerender(
      <QueryClientProvider client={queryClient}>
        <RatingSlipModal {...defaultProps} snapshot={closedSnapshot} />
      </QueryClientProvider>,
    )

    // Button should be hidden for CLOSED status
    expect(
      screen.queryByRole('button', { name: /issue bonus points/i }),
    ).not.toBeInTheDocument()
  })

  // ============================================================================
  // Test 3: Error Handling with Correlation ID
  // ============================================================================

  it('handles loyalty errors gracefully with correlation ID display', async () => {
    const user = userEvent.setup()

    // Mock error response with correlation ID
    const mockErrorResult = {
      success: false,
      data: null,
      error: {
        code: 'PARTIAL_COMPLETION',
        message: 'Session closed but loyalty processing failed',
        metadata: {
          correlationId: 'correlation-xyz-789',
        },
      },
      status: 500,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockErrorResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify error alert displayed
    await waitFor(() => {
      expect(screen.getByText(/loyalty error/i)).toBeInTheDocument()
      expect(
        screen.getByText(/session closed but loyalty processing failed/i),
      ).toBeInTheDocument()
    })

    // Verify correlation ID displayed in alert
    expect(screen.getByText(/correlation-xyz-789/i)).toBeInTheDocument()

    // Verify error toast shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: expect.stringContaining('correlation-xyz-789'),
        variant: 'destructive',
      }),
    )
  })

  it('handles generic errors without correlation ID', async () => {
    const user = userEvent.setup()

    // Mock generic error
    const mockErrorResult = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Database connection failed',
      },
      status: 500,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockErrorResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify error displayed
    await waitFor(() => {
      expect(screen.getByText(/loyalty error/i)).toBeInTheDocument()
      expect(
        screen.getByText(/database connection failed/i),
      ).toBeInTheDocument()
    })

    // Verify error toast shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: 'Database connection failed',
        variant: 'destructive',
      }),
    )
  })

  // ============================================================================
  // Test 4: Loading States
  // ============================================================================

  it('shows loading state during session closure', async () => {
    const user = userEvent.setup()

    // Mock slow completion
    jest.spyOn(ratingSlipActions, 'completeRatingSlip').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              data: {
                slipId: 'slip-123',
                status: 'CLOSED' as const,
                loyalty: {
                  pointsEarned: 500,
                  newBalance: 3000,
                  tier: 'GOLD',
                  ledgerEntry: {
                    id: 'ledger-123',
                    player_id: 'player-123',
                    points_change: 500,
                    balance_before: 2500,
                    balance_after: 3000,
                    tier_before: 'GOLD',
                    tier_after: 'GOLD',
                    transaction_type: 'GAMEPLAY' as const,
                    created_at: new Date().toISOString(),
                  },
                },
              },
              error: null,
              status: 200,
              timestamp: new Date().toISOString(),
              requestId: 'request-123',
            })
          }, 100)
        }) as never,
    )

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify loading state shown
    await waitFor(() => {
      expect(screen.getByText(/closing\.\.\./i)).toBeInTheDocument()
    })

    // Verify button disabled during loading
    expect(closeButton).toBeDisabled()
  })

  it('disables close button when status is already CLOSED', () => {
    renderComponent({ snapshot: closedSnapshot })

    const closeButton = screen.getByRole('button', { name: /close session/i })

    // Button should be disabled for CLOSED status
    expect(closeButton).toBeDisabled()
  })

  it('enables close button for OPEN status', () => {
    renderComponent({ snapshot: openSnapshot })

    const closeButton = screen.getByRole('button', { name: /close session/i })

    // Button should be enabled for OPEN status
    expect(closeButton).not.toBeDisabled()
  })

  // ============================================================================
  // Test 5: Server Action Integration
  // ============================================================================

  it('calls completeRatingSlip with correct slip ID', async () => {
    const user = userEvent.setup()

    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 500,
          newBalance: 3000,
          tier: 'GOLD',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 500,
            balance_before: 2500,
            balance_after: 3000,
            tier_before: 'GOLD',
            tier_after: 'GOLD',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify server action called with correct slip ID
    await waitFor(() => {
      expect(ratingSlipActions.completeRatingSlip).toHaveBeenCalledWith(
        'slip-123',
      )
    })
  })

  it('calls onCloseSession callback on success', async () => {
    const user = userEvent.setup()

    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 500,
          newBalance: 3000,
          tier: 'GOLD',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 500,
            balance_before: 2500,
            balance_after: 3000,
            tier_before: 'GOLD',
            tier_after: 'GOLD',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Verify callback called with draft data
    await waitFor(() => {
      expect(mockOnCloseSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: 'table-1',
          seatNumber: '3',
          averageBet: '50',
        }),
      )
    })
  })

  it('closes modal after successful completion', async () => {
    const user = userEvent.setup()
    jest.useFakeTimers()

    const mockCompletionResult = {
      success: true,
      data: {
        slipId: 'slip-123',
        status: 'CLOSED' as const,
        loyalty: {
          pointsEarned: 500,
          newBalance: 3000,
          tier: 'GOLD',
          ledgerEntry: {
            id: 'ledger-123',
            player_id: 'player-123',
            points_change: 500,
            balance_before: 2500,
            balance_after: 3000,
            tier_before: 'GOLD',
            tier_after: 'GOLD',
            transaction_type: 'GAMEPLAY' as const,
            created_at: new Date().toISOString(),
          },
        },
      },
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: 'request-123',
    }

    jest
      .spyOn(ratingSlipActions, 'completeRatingSlip')
      .mockResolvedValue(mockCompletionResult as never)

    renderComponent()

    const closeButton = screen.getByRole('button', { name: /close session/i })
    await user.click(closeButton)

    // Wait for mutation to complete
    await waitFor(() => {
      expect(mockOnCloseSession).toHaveBeenCalled()
    })

    // Fast-forward timers to trigger modal close
    jest.advanceTimersByTime(2000)

    // Verify modal close called
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    jest.useRealTimers()
  })

  // ============================================================================
  // Test 6: Player Info Display
  // ============================================================================

  it('displays player information in header', () => {
    renderComponent()

    // Verify player name displayed
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()

    // Verify membership ID displayed
    expect(screen.getByText('#MEM-123')).toBeInTheDocument()

    // Verify tier displayed
    expect(screen.getByText('GOLD')).toBeInTheDocument()
  })

  it('displays current points from snapshot', () => {
    renderComponent()

    // Verify current points displayed
    expect(screen.getByText(/2,500/i)).toBeInTheDocument()
  })

  // ============================================================================
  // Test 7: Status Badge Display
  // ============================================================================

  it('displays OPEN status badge with correct styling', () => {
    renderComponent({ snapshot: openSnapshot })

    const statusBadge = screen.getByText('OPEN')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('uppercase')
  })

  it('displays CLOSED status badge with correct styling', () => {
    renderComponent({ snapshot: closedSnapshot })

    const statusBadge = screen.getByText('CLOSED')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('uppercase')
  })
})
