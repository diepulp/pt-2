'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

type GameType = Database['public']['Enums']['game_type'];

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
  game_settings_id: string | null;
}

interface TableRowFormProps {
  row: TableFormRow;
  gameSettings: GameSettingsDTO[];
  /** Game types available for selection — derived from configured games */
  availableGameTypes: GameType[];
  onChange: (updated: TableFormRow) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function TableRowForm({
  row,
  gameSettings,
  availableGameTypes,
  onChange,
  onRemove,
  disabled,
}: TableRowFormProps) {
  // Filter variants to match current game_type
  const variants = gameSettings.filter((gs) => gs.game_type === row.type);

  // Show warning when unlinked and multiple variants exist for this type
  const needsVariantLink = row.game_settings_id === null && variants.length > 1;

  return (
    <div className="space-y-1">
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
          onValueChange={(v) =>
            onChange({ ...row, type: v as GameType, game_settings_id: null })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableGameTypes.map((gt) => (
              <SelectItem key={gt} value={gt}>
                {GAME_TYPE_LABELS[gt] ?? gt.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {variants.length > 0 && (
          <Select
            value={row.game_settings_id ?? '__none__'}
            onValueChange={(v) =>
              onChange({
                ...row,
                game_settings_id: v === '__none__' ? null : v,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Variant (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {variants.map((gs) => (
                <SelectItem key={gs.id} value={gs.id}>
                  {gs.variant_name ?? gs.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      {needsVariantLink && (
        <div className="flex items-center gap-1.5 pl-1">
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-600 text-xs"
          >
            Variant required
          </Badge>
          <span className="text-xs text-amber-600">
            Multiple {GAME_TYPE_LABELS[row.type] ?? row.type} variants
            configured — link one to enable theo calculations
          </span>
        </div>
      )}
    </div>
  );
}
