/**
 * Close Session Dialog Tests (PRD-038A WS4)
 *
 * Validates close reason UI, form reset behavior,
 * and artifact selection requirements.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TableSessionDTO } from '@/hooks/table-context/use-table-session';
import { CLOSE_REASON_OPTIONS } from '@/services/table-context/labels';

// Radix polyfills for jsdom (hasPointerCapture, scrollIntoView)
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = jest.fn();
});

// Mock hooks
const mockCloseTableSession = { mutateAsync: jest.fn(), isPending: false };

jest.mock('@/hooks/table-context/use-table-session', () => ({
  useCloseTableSession: () => mockCloseTableSession,
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

  it('does not render force close button', () => {
    render(<CloseSessionDialog {...defaultProps} />);

    const forceCloseButton = screen.queryByRole('button', {
      name: /force close/i,
    });
    expect(forceCloseButton).not.toBeInTheDocument();
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
