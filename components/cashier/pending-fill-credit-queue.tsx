'use client';

/**
 * Pending Fill/Credit Queue
 *
 * Shows pending fills and credits awaiting cashier confirmation.
 * Each item can be confirmed inline with amount verification.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  TableCreditDTO,
  TableFillDTO,
} from '@/services/table-context/dtos';

import { AmountDisplay } from './amount-display';

// === Fill Queue ===

interface PendingFillQueueProps {
  fills: TableFillDTO[];
  onConfirm: (params: {
    fillId: string;
    confirmedAmountCents: number;
    discrepancyNote?: string;
  }) => void;
}

export function PendingFillQueue({ fills, onConfirm }: PendingFillQueueProps) {
  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Pending Fills
          </CardTitle>
          <Badge variant="secondary">{fills.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {fills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              No Pending Fills
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {fills.map((fill) => (
              <FillItem key={fill.id} fill={fill} onConfirm={onConfirm} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FillItem({
  fill,
  onConfirm,
}: {
  fill: TableFillDTO;
  onConfirm: PendingFillQueueProps['onConfirm'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmedCents, setConfirmedCents] = useState(
    String(fill.amount_cents / 100),
  );
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    const amountCents = Math.round(parseFloat(confirmedCents) * 100);
    const needsNote = amountCents !== fill.amount_cents && !note.trim();

    if (needsNote) return; // Discrepancy note required

    startTransition(() => {
      onConfirm({
        fillId: fill.id,
        confirmedAmountCents: amountCents,
        discrepancyNote: amountCents !== fill.amount_cents ? note : undefined,
      });
      setIsExpanded(false);
    });
  };

  const amountCents = Math.round(parseFloat(confirmedCents || '0') * 100);
  const hasDiscrepancy = amountCents !== fill.amount_cents;
  const needsNote = hasDiscrepancy && !note.trim();

  const chipSummary = Object.entries(fill.chipset || {})
    .map(([denom, qty]) => `${qty}x$${denom}`)
    .join(', ');

  return (
    <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-3 space-y-2 transition-all hover:border-accent/50">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono">
              Table: {fill.table_id.slice(0, 8)}...
            </span>
            <Badge
              variant="outline"
              className="bg-blue-500/10 text-blue-400 border-blue-500/30"
            >
              Fill
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            Requested: <AmountDisplay cents={fill.amount_cents} />
            {chipSummary && ` — ${chipSummary}`}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {new Date(fill.created_at).toLocaleTimeString()}
          </div>
        </div>
        {!isExpanded && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs font-semibold uppercase tracking-wider"
            onClick={() => setIsExpanded(true)}
          >
            Confirm
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t-2 border-border/30">
          <div className="space-y-1.5">
            <Label
              htmlFor={`fill-amount-${fill.id}`}
              className="text-sm text-muted-foreground"
            >
              Confirmed Amount ($)
            </Label>
            <Input
              id={`fill-amount-${fill.id}`}
              type="number"
              step="0.01"
              min="0.01"
              value={confirmedCents}
              onChange={(e) => setConfirmedCents(e.target.value)}
              className="h-8 font-mono tabular-nums"
            />
          </div>
          {hasDiscrepancy && (
            <div className="space-y-1.5">
              <Label
                htmlFor={`fill-note-${fill.id}`}
                className="text-xs text-destructive"
              >
                Discrepancy Note (required)
              </Label>
              <Textarea
                id={`fill-note-${fill.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain the amount difference..."
                className="min-h-[60px] text-sm font-mono"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending || needsNote || amountCents <= 0}
              className="h-7 text-xs font-semibold uppercase tracking-wider"
            >
              {isPending ? 'Confirming...' : 'Confirm Fill'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              disabled={isPending}
              className="h-7 text-xs font-semibold uppercase tracking-wider"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// === Credit Queue ===

interface PendingCreditQueueProps {
  credits: TableCreditDTO[];
  onConfirm: (params: {
    creditId: string;
    confirmedAmountCents: number;
    discrepancyNote?: string;
  }) => void;
}

export function PendingCreditQueue({
  credits,
  onConfirm,
}: PendingCreditQueueProps) {
  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Pending Credits
          </CardTitle>
          <Badge variant="secondary">{credits.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {credits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              No Pending Credits
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {credits.map((credit) => (
              <CreditItem
                key={credit.id}
                credit={credit}
                onConfirm={onConfirm}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreditItem({
  credit,
  onConfirm,
}: {
  credit: TableCreditDTO;
  onConfirm: PendingCreditQueueProps['onConfirm'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmedCents, setConfirmedCents] = useState(
    String(credit.amount_cents / 100),
  );
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    const amountCents = Math.round(parseFloat(confirmedCents) * 100);
    const needsNote = amountCents !== credit.amount_cents && !note.trim();

    if (needsNote) return;

    startTransition(() => {
      onConfirm({
        creditId: credit.id,
        confirmedAmountCents: amountCents,
        discrepancyNote: amountCents !== credit.amount_cents ? note : undefined,
      });
      setIsExpanded(false);
    });
  };

  const amountCents = Math.round(parseFloat(confirmedCents || '0') * 100);
  const hasDiscrepancy = amountCents !== credit.amount_cents;
  const needsNote = hasDiscrepancy && !note.trim();

  const chipSummary = Object.entries(credit.chipset || {})
    .map(([denom, qty]) => `${qty}x$${denom}`)
    .join(', ');

  return (
    <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-3 space-y-2 transition-all hover:border-accent/50">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono">
              Table: {credit.table_id.slice(0, 8)}...
            </span>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-400 border-amber-500/30"
            >
              Credit
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            Requested: <AmountDisplay cents={credit.amount_cents} />
            {chipSummary && ` — ${chipSummary}`}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {new Date(credit.created_at).toLocaleTimeString()}
          </div>
        </div>
        {!isExpanded && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs font-semibold uppercase tracking-wider"
            onClick={() => setIsExpanded(true)}
          >
            Confirm
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t-2 border-border/30">
          <div className="space-y-1.5">
            <Label
              htmlFor={`credit-amount-${credit.id}`}
              className="text-sm text-muted-foreground"
            >
              Confirmed Amount ($)
            </Label>
            <Input
              id={`credit-amount-${credit.id}`}
              type="number"
              step="0.01"
              min="0.01"
              value={confirmedCents}
              onChange={(e) => setConfirmedCents(e.target.value)}
              className="h-8 font-mono tabular-nums"
            />
          </div>
          {hasDiscrepancy && (
            <div className="space-y-1.5">
              <Label
                htmlFor={`credit-note-${credit.id}`}
                className="text-xs text-destructive"
              >
                Discrepancy Note (required)
              </Label>
              <Textarea
                id={`credit-note-${credit.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain the amount difference..."
                className="min-h-[60px] text-sm font-mono"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending || needsNote || amountCents <= 0}
              className="h-7 text-xs font-semibold uppercase tracking-wider"
            >
              {isPending ? 'Confirming...' : 'Confirm Credit'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              disabled={isPending}
              className="h-7 text-xs font-semibold uppercase tracking-wider"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
