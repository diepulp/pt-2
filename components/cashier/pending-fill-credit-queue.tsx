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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pending Fills</CardTitle>
          <Badge variant="secondary">{fills.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {fills.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No pending fills for today.
          </p>
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
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Table: {fill.table_id.slice(0, 8)}...
            </span>
            <Badge variant="outline" className="text-xs">
              Fill
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Requested: <AmountDisplay cents={fill.amount_cents} />
            {chipSummary && ` — ${chipSummary}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(fill.created_at).toLocaleTimeString()}
          </div>
        </div>
        {!isExpanded && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsExpanded(true)}
          >
            Confirm
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="space-y-1">
            <Label
              htmlFor={`fill-amount-${fill.id}`}
              className="text-xs text-muted-foreground"
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
              className="h-8"
            />
          </div>
          {hasDiscrepancy && (
            <div className="space-y-1">
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
                className="min-h-[60px] text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending || needsNote || amountCents <= 0}
            >
              {isPending ? 'Confirming...' : 'Confirm Fill'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              disabled={isPending}
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pending Credits</CardTitle>
          <Badge variant="secondary">{credits.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {credits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No pending credits for today.
          </p>
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
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Table: {credit.table_id.slice(0, 8)}...
            </span>
            <Badge variant="outline" className="text-xs">
              Credit
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Requested: <AmountDisplay cents={credit.amount_cents} />
            {chipSummary && ` — ${chipSummary}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(credit.created_at).toLocaleTimeString()}
          </div>
        </div>
        {!isExpanded && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsExpanded(true)}
          >
            Confirm
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="space-y-1">
            <Label
              htmlFor={`credit-amount-${credit.id}`}
              className="text-xs text-muted-foreground"
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
              className="h-8"
            />
          </div>
          {hasDiscrepancy && (
            <div className="space-y-1">
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
                className="min-h-[60px] text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending || needsNote || amountCents <= 0}
            >
              {isPending ? 'Confirming...' : 'Confirm Credit'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
