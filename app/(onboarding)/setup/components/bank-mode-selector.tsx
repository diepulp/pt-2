'use client';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Database } from '@/types/database.types';

type TableBankMode = Database['public']['Enums']['table_bank_mode'];

const BANK_MODES: Array<{
  value: TableBankMode;
  label: string;
  description: string;
}> = [
  {
    value: 'INVENTORY_COUNT',
    label: 'Inventory Count',
    description:
      'Count all chips in the tray at each shift change. Good for casinos that want full visibility into bankroll changes.',
  },
  {
    value: 'IMPREST_TO_PAR',
    label: 'Imprest to Par',
    description:
      'Restore the tray to a fixed par level at each shift change. Good for casinos that want to standardize starting bankrolls.',
  },
];

interface BankModeSelectorProps {
  value: TableBankMode | null;
  onChange: (mode: TableBankMode) => void;
}

export function BankModeSelector({ value, onChange }: BankModeSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BANK_MODES.map((mode) => {
        const isSelected = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className="text-left"
          >
            <Card
              className={`cursor-pointer transition-colors ${
                isSelected
                  ? 'border-primary ring-1 ring-primary'
                  : 'hover:border-muted-foreground/40'
              }`}
            >
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-medium">
                  {mode.label}
                </CardTitle>
                <CardDescription className="text-xs">
                  {mode.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
