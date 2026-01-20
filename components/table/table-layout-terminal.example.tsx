/**
 * Usage Examples for Enhanced TableLayoutTerminal
 *
 * WS1: PRD-006 Implementation
 *
 * This file demonstrates the 7 new dashboard props added to TableLayoutTerminal:
 * 1. tableId - Display label (T1, T2, etc.)
 * 2. gameType - Game type badge (blackjack, poker, etc.)
 * 3. tableStatus - Visual status indicator ('active' | 'inactive' | 'closed')
 * 4. activeSlipsCount - Badge showing active slips count
 * 5. variant - Size variant ('full' | 'compact')
 * 6. isSelected - Highlight when selected
 * 7. onTableAction - Quick actions callback
 */

import { TableLayoutTerminal } from './table-layout-terminal';

// Example 1: Compact variant for dashboard grid
function CompactTableExample() {
  const mockSeats = [
    { firstName: 'John', lastName: 'Doe' },
    null,
    { firstName: 'Jane', lastName: 'Smith' },
    null,
    null,
    { firstName: 'Bob', lastName: 'Wilson' },
  ];

  return (
    <TableLayoutTerminal
      seats={mockSeats}
      variant="compact"
      tableId="T1"
      gameType="blackjack"
      tableStatus="active"
      activeSlipsCount={3}
      isSelected={false}
    />
  );
}

// Example 2: Full variant with metadata and actions
function FullTableExample() {
  const mockSeats = [
    { firstName: 'John', lastName: 'Doe' },
    null,
    { firstName: 'Jane', lastName: 'Smith' },
    null,
    null,
    { firstName: 'Bob', lastName: 'Wilson' },
    { firstName: 'Alice', lastName: 'Johnson' },
  ];

  const handleTableAction = (action: 'open' | 'close' | 'details') => {
    console.log(`Table action: ${action}`);
  };

  const handleSeatClick = (
    index: number,
    occupant: { firstName: string; lastName: string } | null,
  ) => {
    console.log(`Seat ${index + 1} clicked:`, occupant);
  };

  return (
    <TableLayoutTerminal
      seats={mockSeats}
      variant="full"
      tableId="T1"
      gameType="blackjack"
      tableStatus="active"
      activeSlipsCount={3}
      isSelected={true}
      dealerName="Mike Thompson"
      onTableAction={handleTableAction}
      onSeatClick={handleSeatClick}
    />
  );
}

// Example 3: Backward compatibility (existing usage)
function BackwardCompatibleExample() {
  const mockSeats = [
    { firstName: 'John', lastName: 'Doe' },
    null,
    { firstName: 'Jane', lastName: 'Smith' },
  ];

  return (
    <TableLayoutTerminal
      seats={mockSeats}
      dealerName="Sarah Miller"
      onSeatClick={(index, occupant) => {
        console.log('Seat clicked', index, occupant);
      }}
    />
  );
}

// Example 4: Table grid with multiple compact tables
function TableGridExample() {
  const tables = [
    {
      id: 'T1',
      seats: [{ firstName: 'John', lastName: 'Doe' }, null, null],
      gameType: 'blackjack',
      status: 'active' as const,
      activeSlips: 1,
    },
    {
      id: 'T2',
      seats: [null, null, null, null],
      gameType: 'poker',
      status: 'inactive' as const,
      activeSlips: 0,
    },
    {
      id: 'T3',
      seats: [
        { firstName: 'Jane', lastName: 'Smith' },
        { firstName: 'Bob', lastName: 'Wilson' },
        null,
      ],
      gameType: 'roulette',
      status: 'active' as const,
      activeSlips: 2,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {tables.map((table) => (
        <TableLayoutTerminal
          key={table.id}
          seats={table.seats}
          variant="compact"
          tableId={table.id}
          gameType={table.gameType}
          tableStatus={table.status}
          activeSlipsCount={table.activeSlips}
          isSelected={false}
        />
      ))}
    </div>
  );
}

export {
  CompactTableExample,
  FullTableExample,
  BackwardCompatibleExample,
  TableGridExample,
};
