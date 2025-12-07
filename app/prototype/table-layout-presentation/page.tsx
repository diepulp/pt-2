'use client';

import * as React from 'react';

import TableLayoutTerminal from '@/components/table/table-layout-terminal';

export default function TableLayoutPresentationPage() {
  const [seats, setSeats] = React.useState([
    { firstName: 'John', lastName: 'Doe' },
    null,
    { firstName: 'Jane', lastName: 'Smith' },
    null,
    { firstName: 'Bob', lastName: 'Johnson' },
    null,
    { firstName: 'Alice', lastName: 'Williams' },
  ]);

  const handleSeatClick = (index: number) => {
    setSeats((prev) => {
      const newSeats = [...prev];
      if (newSeats[index]) {
        newSeats[index] = null;
      } else {
        newSeats[index] = { firstName: 'New', lastName: 'Player' };
      }
      return newSeats;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Table Layout Terminal
        </h1>
        <p className="text-muted-foreground">
          Monochrome + Teal Accent Design System
        </p>
      </div>

      <div className="w-full max-w-4xl p-8 rounded-xl bg-card border border-border shadow-2xl">
        <TableLayoutTerminal
          seats={seats}
          onSeatClick={handleSeatClick}
          dealerName="Sarah Dealer"
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setSeats(Array(7).fill(null))}
          className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Clear All
        </button>
        <button
          onClick={() =>
            setSeats([
              { firstName: 'P1', lastName: 'A' },
              { firstName: 'P2', lastName: 'B' },
              { firstName: 'P3', lastName: 'C' },
              { firstName: 'P4', lastName: 'D' },
              { firstName: 'P5', lastName: 'E' },
              { firstName: 'P6', lastName: 'F' },
              { firstName: 'P7', lastName: 'G' },
            ])
          }
          className="px-4 py-2 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Fill All
        </button>
      </div>
    </div>
  );
}
