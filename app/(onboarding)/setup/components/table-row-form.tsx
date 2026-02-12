'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Database } from '@/types/database.types';

type GameType = Database['public']['Enums']['game_type'];

const GAME_TYPES: readonly GameType[] = [
  'blackjack',
  'poker',
  'roulette',
  'baccarat',
  'pai_gow',
  'carnival',
] as const satisfies readonly GameType[];

const GAME_TYPE_LABELS: Record<GameType, string> = {
  blackjack: 'Blackjack',
  poker: 'Poker',
  roulette: 'Roulette',
  baccarat: 'Baccarat',
  pai_gow: 'Pai Gow',
  carnival: 'Carnival',
};

export interface TableFormRow {
  id: string;
  label: string;
  type: GameType;
  pit: string;
}

interface TableRowFormProps {
  row: TableFormRow;
  onChange: (updated: TableFormRow) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function TableRowForm({
  row,
  onChange,
  onRemove,
  disabled,
}: TableRowFormProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={row.label}
        onChange={(e) => onChange({ ...row, label: e.target.value })}
        placeholder="Table label (e.g. BJ-01)"
        className="flex-1 min-w-0"
        disabled={disabled}
      />
      <Select
        value={row.type}
        onValueChange={(v) => onChange({ ...row, type: v as GameType })}
        disabled={disabled}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GAME_TYPES.map((gt) => (
            <SelectItem key={gt} value={gt}>
              {GAME_TYPE_LABELS[gt]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={row.pit}
        onChange={(e) => onChange({ ...row, pit: e.target.value })}
        placeholder="Pit (optional)"
        className="w-[120px]"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </Button>
    </div>
  );
}
