'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Database } from '@/types/database.types';

type TableBankMode = Database['public']['Enums']['table_bank_mode'];

const TOOLTIP_BY_MODE: Record<TableBankMode, string> = {
  INVENTORY_COUNT:
    "Sometimes called the table's need baseline (not live fill need). Used for variance + fill-pressure heuristics in Inventory Count.",
  IMPREST_TO_PAR:
    'The fixed par level the tray is restored to at each shift change. Deviations trigger fill or credit actions.',
};

interface ParEntryRowProps {
  tableId: string;
  tableLabel: string;
  gameType: string;
  value: string;
  bankMode: TableBankMode | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ParEntryRow({
  tableId,
  tableLabel,
  gameType,
  value,
  bankMode,
  onChange,
  disabled,
}: ParEntryRowProps) {
  const tooltipText =
    bankMode && TOOLTIP_BY_MODE[bankMode]
      ? TOOLTIP_BY_MODE[bankMode]
      : "Sometimes called the table's need baseline (not live fill need). Used for variance + fill-pressure heuristics in Inventory Count.";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <Label htmlFor={`par-${tableId}`} className="text-sm font-medium">
          {tableLabel}
        </Label>
        <p className="text-xs text-muted-foreground capitalize">
          {gameType.replace('_', ' ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help">
                Target Bankroll (Par)
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px]">
              <p className="text-xs">{tooltipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="relative w-[140px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            $
          </span>
          <Input
            id={`par-${tableId}`}
            type="number"
            min="0"
            step="100"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pl-7"
            placeholder="0"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
