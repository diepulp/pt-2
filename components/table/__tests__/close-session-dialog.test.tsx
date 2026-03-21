/**
 * Close Session Dialog Tests (PRD-038A WS4)
 *
 * Validates close reason UI, force close privilege gating,
 * unresolved items guardrail, and form reset behavior.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CLOSE_REASON_OPTIONS,
  FORCE_CLOSE_PRIVILEGED_ROLES,
} from '@/services/table-context/labels';

import type { TableSessionDTO } from '@/hooks/table-context/use-table-session';

// Radix polyfills for jsdom (hasPointerCapture, scrollIntoView)
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = jest.fn();
});

// Mock hooks
const mockCloseTableSession = { mutateAsync: jest.fn(), isPending: false };
const mockForceCloseTableSession = { mutateAsync: jest.fn(), isPending: false };
let mockStaffRole: string | null = 'dealer';

jest.mock('@/hooks/table-context/use-table-session', () => ({
  useCloseTableSession: () => mockCloseTableSession,
  useForceCloseTableSession: () => mockForceCloseTableSession,
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    staffRole: mockStaffRole,
    staffId: 'staff-001',
    casinoId: 'casino-001',
    user: null,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/table-context/use-drop-events', () => ({
  useDropEvents: () => ({ data: [], isLoading: false }),
  formatDropEventLabel: () => 'Drop Event',
}));

jest.mock('@/hooks/table-context/use-inventory-snapshots', () => ({
  useInventorySnapshots: () => ({ data: [], isLoading: false }),
  calculateChipsetTotal: () => 0,
}));

jest.mock('@/lib/errors/error-utils', () => ({
  isFetchError: () => false,
}));

// Mock child dialogs to prevent render issues
jest.mock('../chip-count-capture-dialog', () => ({
  ChipCountCaptureDialog: () => null,
}));
jest.mock('../drop-event-dialog', () => ({
  DropEventDialog: () => null,
}));
jest.mock('../artifact-picker', () => ({
  ArtifactPicker: () => <div data-testid="artifact-picker" />,
}));

// Import after mocks
import { CloseSessionDialog } from '../close-session-dialog';

const baseSession: TableSessionDTO = {
  id: 'session-001',
  gaming_table_id: 'table-001',
  casino_id: 'casino-001',
  status: 'RUNDOWN',
  opened_by: 'staff-001',
  opened_at: '2026-02-26T00:00:00Z',
  closed_by: null,
  closed_at: null,
  close_reason: null,
  close_note: null,
  forced_close: false,
  forced_close_by: null,
  forced_close_at: null,
  requires_reconciliation: false,
  has_unresolved_items: false,
  notes: null,
  gaming_day: '2026-02-26',
  created_at: '2026-02-26T00:00:00Z',
  updated_at: '2026-02-26T00:00:00Z',
};

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  session: baseSession,
  tableId: 'table-001',
  casinoId: 'casino-001',
  currentStaffId: 'staff-001',
};

describe('CloseSessionDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStaffRole = 'dealer';
  });

  it('renders close reason select with exactly CLOSE_REASON_OPTIONS', async () => {
    render(<CloseSessionDialog {...defaultProps} />);

    // Open the select dropdown
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // Verify all options are present
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(CLOSE_REASON_OPTIONS.length);

    for (const expectedOption of CLOSE_REASON_OPTIONS) {
      const option = options.find(
        (o) => o.textContent === expectedOption.label,
      );
      expect(option).toBeTruthy();
    }
  });

  it('hides close note textarea by default (reason ≠ other)', () => {
    render(<CloseSessionDialog {...defaultProps} />);

    const closeNoteTextarea = screen.queryByLabelText(/note.*required.*other/i);
    expect(closeNoteTextarea).not.toBeInTheDocument();
  });

  it('shows close note textarea when "other" is selected', async () => {
    render(<CloseSessionDialog {...defaultProps} />);

    // Open the select and pick 'other'
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);
    const otherOption = screen.getByRole('option', { name: 'Other' });
    await userEvent.click(otherOption);

    const closeNoteTextarea = screen.getByLabelText(/note.*required.*other/i);
    expect(closeNoteTextarea).toBeInTheDocument();
  });

  it('disables standard close button when has_unresolved_items', () => {
    const sessionWithUnresolved = {
      ...baseSession,
      has_unresolved_items: true,
    };

    render(
      <CloseSessionDialog {...defaultProps} session={sessionWithUnresolved} />,
    );

    const closeButton = screen.getByRole('button', { name: /close session/i });
    expect(closeButton).toBeDisabled();
  });

  it('hides force close button for non-privileged role', () => {
    mockStaffRole = 'dealer';

    render(<CloseSessionDialog {...defaultProps} />);

    const forceCloseButton = screen.queryByRole('button', {
      name: /force close/i,
    });
    expect(forceCloseButton).not.toBeInTheDocument();
  });

  it('shows force close button for each privileged role', () => {
    for (const role of FORCE_CLOSE_PRIVILEGED_ROLES) {
      mockStaffRole = role;

      const { unmount } = render(<CloseSessionDialog {...defaultProps} />);

      const forceCloseButton = screen.getByRole('button', {
        name: /force close/i,
      });
      expect(forceCloseButton).toBeInTheDocument();

      unmount();
    }
  });

  it('enables force close even when no artifacts are selected', async () => {
    mockStaffRole = 'pit_boss';

    render(<CloseSessionDialog {...defaultProps} />);

    // Select a close reason (required for force close validation)
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);
    const endOfShift = screen.getByRole('option', { name: 'End of Shift' });
    await userEvent.click(endOfShift);

    // Force close should be enabled even without artifacts
    const forceCloseButton = screen.getByRole('button', {
      name: /force close/i,
    });
    expect(forceCloseButton).not.toBeDisabled();
  });

  it('resets form state when dialog is closed and reopened', async () => {
    const { rerender } = render(<CloseSessionDialog {...defaultProps} />);

    // Select 'Other' close reason
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);
    const otherOption = screen.getByRole('option', { name: 'Other' });
    await userEvent.click(otherOption);

    // Verify close note textarea appeared
    expect(screen.getByLabelText(/note.*required.*other/i)).toBeInTheDocument();

    // Close dialog
    rerender(<CloseSessionDialog {...defaultProps} open={false} />);

    // Reopen dialog
    rerender(<CloseSessionDialog {...defaultProps} open={true} />);

    // Close note textarea should be hidden again (reason reset to null)
    expect(
      screen.queryByLabelText(/note.*required.*other/i),
    ).not.toBeInTheDocument();
  });
});
