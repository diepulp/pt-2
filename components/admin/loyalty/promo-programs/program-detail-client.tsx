'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpdatePromoProgram } from '@/hooks/loyalty/promo-instruments/use-promo-mutations';
import { usePromoProgram } from '@/hooks/loyalty/promo-instruments/use-promo-programs';
import type { PromoProgramDTO } from '@/services/loyalty/promo/dtos';

import { InventorySummary } from './inventory-summary';

/** Format a number as USD currency string */
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/** Convert ISO string to datetime-local input value */
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Format as YYYY-MM-DDTHH:MM
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ProgramStatus = PromoProgramDTO['status'];

interface ProgramDetailClientProps {
  programId: string;
  initialData?: PromoProgramDTO | null;
}

/**
 * Client component for the promo program detail page.
 * Supports inline editing of name, status, start/end dates.
 * Includes inventory summary section.
 *
 * D1 note: No tier-ladder UX -- deferred per PRD 7.2.
 */
export function ProgramDetailClient({
  programId,
  initialData,
}: ProgramDetailClientProps) {
  const {
    data: program,
    isLoading,
    isError,
    error,
  } = usePromoProgram(programId);
  const updateProgram = useUpdatePromoProgram();
  const [isPending, startTransition] = useTransition();

  // Resolve displayed program (query data > initialData)
  const displayed = program ?? initialData;

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDates, setEditingDates] = useState(false);
  const [startAtValue, setStartAtValue] = useState('');
  const [endAtValue, setEndAtValue] = useState('');
  const [updateError, setUpdateError] = useState<string | null>(null);

  // --- Status Change ---
  function handleStatusChange(newStatus: ProgramStatus) {
    if (!displayed || newStatus === displayed.status) return;
    setUpdateError(null);

    startTransition(async () => {
      try {
        await updateProgram.mutateAsync({
          id: programId,
          status: newStatus,
          idempotencyKey: `update-program-${programId}-status-${Date.now()}`,
        });
      } catch (err) {
        setUpdateError(
          err instanceof Error ? err.message : 'Failed to update status',
        );
      }
    });
  }

  // --- Name Edit ---
  function startEditingName() {
    if (!displayed) return;
    setNameValue(displayed.name);
    setEditingName(true);
    setUpdateError(null);
  }

  function saveName() {
    if (!displayed) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === displayed.name) {
      setEditingName(false);
      return;
    }

    startTransition(async () => {
      try {
        await updateProgram.mutateAsync({
          id: programId,
          name: trimmed,
          idempotencyKey: `update-program-${programId}-name-${Date.now()}`,
        });
        setEditingName(false);
      } catch (err) {
        setUpdateError(
          err instanceof Error ? err.message : 'Failed to update name',
        );
      }
    });
  }

  // --- Date Edit ---
  function startEditingDates() {
    if (!displayed) return;
    setStartAtValue(toDateTimeLocal(displayed.startAt));
    setEndAtValue(toDateTimeLocal(displayed.endAt));
    setEditingDates(true);
    setUpdateError(null);
  }

  function saveDates() {
    if (!displayed) return;

    const newStartAt = startAtValue
      ? new Date(startAtValue).toISOString()
      : null;
    const newEndAt = endAtValue ? new Date(endAtValue).toISOString() : null;

    startTransition(async () => {
      try {
        await updateProgram.mutateAsync({
          id: programId,
          startAt: newStartAt,
          endAt: newEndAt,
          idempotencyKey: `update-program-${programId}-dates-${Date.now()}`,
        });
        setEditingDates(false);
      } catch (err) {
        setUpdateError(
          err instanceof Error ? err.message : 'Failed to update dates',
        );
      }
    });
  }

  // --- Loading / Error ---
  if (isLoading && !initialData) {
    return (
      <div className="space-y-6" data-testid="program-detail-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError && !displayed) {
    return (
      <div
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4"
        data-testid="program-detail-error"
      >
        <p className="text-sm text-destructive">
          Failed to load program
          {error instanceof Error ? `: ${error.message}` : '.'}
        </p>
        <Link
          href="/admin/loyalty/promo-programs"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          Back to Programs
        </Link>
      </div>
    );
  }

  if (!displayed) {
    return (
      <div className="p-4" data-testid="program-not-found">
        <p className="text-sm text-muted-foreground">Program not found.</p>
        <Link
          href="/admin/loyalty/promo-programs"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          Back to Programs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="program-detail">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground">
        <Link
          href="/admin/loyalty/promo-programs"
          className="hover:underline text-primary"
        >
          Promo Programs
        </Link>
        {' / '}
        <span>{displayed.name}</span>
      </div>

      {/* Header: Name + Type Badge + Status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                data-testid="edit-name-input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                disabled={isPending}
                className="h-8 w-64"
              />
              <Button
                size="sm"
                onClick={saveName}
                disabled={isPending}
                data-testid="save-name-button"
              >
                {isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingName(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="text-2xl font-semibold tracking-tight cursor-pointer hover:text-primary/80 bg-transparent border-none p-0 text-left"
              onClick={startEditingName}
              data-testid="program-name"
              title="Click to edit"
            >
              {displayed.name}
            </button>
          )}
          <Badge
            variant={
              displayed.promoType === 'match_play' ? 'default' : 'secondary'
            }
          >
            {displayed.promoType === 'match_play' ? 'Match Play' : 'Free Play'}
          </Badge>
        </div>

        {/* Status Select */}
        <div className="flex items-center gap-2">
          <Label htmlFor="status-select" className="text-sm">
            Status
          </Label>
          <Select
            value={displayed.status}
            onValueChange={(v) => handleStatusChange(v as ProgramStatus)}
            disabled={isPending}
          >
            <SelectTrigger
              id="status-select"
              className="w-[140px]"
              data-testid="status-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Update Error */}
      {updateError && (
        <div
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3"
          data-testid="update-error"
        >
          <p className="text-sm text-destructive">{updateError}</p>
        </div>
      )}

      {/* Program Details Card */}
      <Card data-testid="program-details-card">
        <CardHeader>
          <CardTitle>Program Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Static fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Face Value</Label>
              <p className="text-sm font-medium">
                {formatUSD(displayed.faceValueAmount)}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">
                Required Match Wager
              </Label>
              <p className="text-sm font-medium">
                {formatUSD(displayed.requiredMatchWagerAmount)}
              </p>
            </div>
          </div>

          <Separator />

          {/* Editable dates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-muted-foreground">Date Range</Label>
              {!editingDates && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={startEditingDates}
                  data-testid="edit-dates-button"
                >
                  Edit
                </Button>
              )}
            </div>

            {editingDates ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="edit-start-at">Start</Label>
                    <Input
                      id="edit-start-at"
                      data-testid="edit-start-at-input"
                      type="datetime-local"
                      value={startAtValue}
                      onChange={(e) => setStartAtValue(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-end-at">End</Label>
                    <Input
                      id="edit-end-at"
                      data-testid="edit-end-at-input"
                      type="datetime-local"
                      value={endAtValue}
                      onChange={(e) => setEndAtValue(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveDates}
                    disabled={isPending}
                    data-testid="save-dates-button"
                  >
                    {isPending ? 'Saving...' : 'Save Dates'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDates(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm">
                    <span className="font-medium">Start: </span>
                    {displayed.startAt
                      ? new Date(displayed.startAt).toLocaleString('en-US')
                      : 'Not set (always valid)'}
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">End: </span>
                    {displayed.endAt
                      ? new Date(displayed.endAt).toLocaleString('en-US')
                      : 'Not set (no expiration)'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <Label className="text-muted-foreground">Created</Label>
              <p>{new Date(displayed.createdAt).toLocaleString('en-US')}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Last Updated</Label>
              <p>{new Date(displayed.updatedAt).toLocaleString('en-US')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Summary */}
      <InventorySummary promoProgramId={programId} />
    </div>
  );
}
