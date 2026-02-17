'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';

const GAME_TYPES = [
  { value: 'blackjack', label: 'Blackjack' },
  { value: 'poker', label: 'Poker' },
  { value: 'roulette', label: 'Roulette' },
  { value: 'baccarat', label: 'Baccarat' },
  { value: 'pai_gow', label: 'Pai Gow' },
  { value: 'carnival', label: 'Carnival' },
] as const;

const SHOE_DECKS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '6', label: '6' },
  { value: '8', label: '8' },
] as const;

const DECK_PROFILES = [
  { value: 'standard_52', label: 'Standard 52' },
  { value: 'with_joker_53', label: 'With Joker 53' },
  { value: 'spanish_48', label: 'Spanish 48' },
] as const;

export interface GameSettingsFormData {
  game_type: string;
  code: string;
  name: string;
  variant_name?: string | null;
  shoe_decks?: number | null;
  deck_profile?: string | null;
  house_edge: number;
  rating_edge_for_comp?: number | null;
  decisions_per_hour: number;
  seats_available: number;
  min_bet?: number | null;
  max_bet?: number | null;
  notes?: string | null;
}

interface GameSettingsFormProps {
  mode: 'create' | 'edit';
  initialData?: GameSettingsDTO;
  isPending: boolean;
  onSubmit: (data: GameSettingsFormData) => void;
  onCancel: () => void;
}

function toCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

export function GameSettingsForm({
  mode,
  initialData,
  isPending,
  onSubmit,
  onCancel,
}: GameSettingsFormProps) {
  const [gameType, setGameType] = useState(initialData?.game_type ?? '');
  const [code, setCode] = useState(initialData?.code ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [variantName, setVariantName] = useState(
    initialData?.variant_name ?? '',
  );
  const [shoeDecks, setShoeDecks] = useState<string>(
    initialData?.shoe_decks?.toString() ?? '',
  );
  const [deckProfile, setDeckProfile] = useState(
    initialData?.deck_profile ?? '',
  );
  const [houseEdge, setHouseEdge] = useState(
    initialData?.house_edge?.toString() ?? '1.5',
  );
  const [ratingEdge, setRatingEdge] = useState(
    initialData?.rating_edge_for_comp?.toString() ?? '',
  );
  const [decisionsPerHour, setDecisionsPerHour] = useState(
    initialData?.decisions_per_hour?.toString() ?? '70',
  );
  const [seatsAvailable, setSeatsAvailable] = useState(
    initialData?.seats_available?.toString() ?? '7',
  );
  const [minBet, setMinBet] = useState(initialData?.min_bet?.toString() ?? '');
  const [maxBet, setMaxBet] = useState(initialData?.max_bet?.toString() ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [autoCode, setAutoCode] = useState(mode === 'create');

  function handleNameChange(value: string) {
    setName(value);
    if (autoCode && mode === 'create') {
      setCode(toCode(value));
    }
  }

  function handleCodeChange(value: string) {
    setCode(value);
    setAutoCode(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const data: GameSettingsFormData = {
      game_type: gameType,
      code,
      name,
      variant_name: variantName || null,
      shoe_decks: shoeDecks ? Number(shoeDecks) : null,
      deck_profile: deckProfile || null,
      house_edge: Number(houseEdge),
      rating_edge_for_comp: ratingEdge ? Number(ratingEdge) : null,
      decisions_per_hour: Number(decisionsPerHour),
      seats_available: Number(seatsAvailable),
      min_bet: minBet ? Number(minBet) : null,
      max_bet: maxBet ? Number(maxBet) : null,
      notes: notes || null,
    };

    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Game Type */}
        <div className="space-y-2">
          <Label htmlFor="game_type">Game Category *</Label>
          <Select value={gameType} onValueChange={setGameType} required>
            <SelectTrigger id="game_type">
              <SelectValue placeholder="Select game type" />
            </SelectTrigger>
            <SelectContent>
              {GAME_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Game Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Game Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Blackjack 6-Deck"
            required
          />
        </div>

        {/* Game Code */}
        <div className="space-y-2">
          <Label htmlFor="code">Game Code *</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="e.g. bj_6d"
            required
            disabled={mode === 'edit'}
          />
          {mode === 'edit' && (
            <p className="text-xs text-muted-foreground">
              Code cannot be changed
            </p>
          )}
        </div>

        {/* Variant Name */}
        <div className="space-y-2">
          <Label htmlFor="variant_name">Variant</Label>
          <Input
            id="variant_name"
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
            placeholder="e.g. 6-deck shoe"
          />
        </div>

        {/* Shoe Decks */}
        <div className="space-y-2">
          <Label htmlFor="shoe_decks">Shoe Decks</Label>
          <Select value={shoeDecks} onValueChange={setShoeDecks}>
            <SelectTrigger id="shoe_decks">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {SHOE_DECKS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Deck Profile */}
        <div className="space-y-2">
          <Label htmlFor="deck_profile">Deck Profile</Label>
          <Select value={deckProfile} onValueChange={setDeckProfile}>
            <SelectTrigger id="deck_profile">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {DECK_PROFILES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* House Edge */}
        <div className="space-y-2">
          <Label htmlFor="house_edge">House Edge (%) *</Label>
          <Input
            id="house_edge"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={houseEdge}
            onChange={(e) => setHouseEdge(e.target.value)}
            required
          />
        </div>

        {/* Rating Edge */}
        <div className="space-y-2">
          <Label htmlFor="rating_edge_for_comp">Rating Edge (%)</Label>
          <Input
            id="rating_edge_for_comp"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={ratingEdge}
            onChange={(e) => setRatingEdge(e.target.value)}
          />
        </div>

        {/* Decisions Per Hour */}
        <div className="space-y-2">
          <Label htmlFor="decisions_per_hour">Decisions/Hour *</Label>
          <Input
            id="decisions_per_hour"
            type="number"
            min="1"
            value={decisionsPerHour}
            onChange={(e) => setDecisionsPerHour(e.target.value)}
            required
          />
        </div>

        {/* Seats */}
        <div className="space-y-2">
          <Label htmlFor="seats_available">Seats *</Label>
          <Input
            id="seats_available"
            type="number"
            min="1"
            value={seatsAvailable}
            onChange={(e) => setSeatsAvailable(e.target.value)}
            required
          />
        </div>

        {/* Min Bet */}
        <div className="space-y-2">
          <Label htmlFor="min_bet">Min Bet ($)</Label>
          <Input
            id="min_bet"
            type="number"
            min="0"
            value={minBet}
            onChange={(e) => setMinBet(e.target.value)}
          />
        </div>

        {/* Max Bet */}
        <div className="space-y-2">
          <Label htmlFor="max_bet">Max Bet ($)</Label>
          <Input
            id="max_bet"
            type="number"
            min="0"
            value={maxBet}
            onChange={(e) => setMaxBet(e.target.value)}
          />
        </div>
      </div>

      {/* Notes — full width */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about this game configuration"
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || !gameType || !name || !code}
        >
          {isPending
            ? mode === 'create'
              ? 'Adding...'
              : 'Saving...'
            : mode === 'create'
              ? 'Add Game'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
