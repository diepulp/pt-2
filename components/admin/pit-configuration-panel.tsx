/**
 * Pit Configuration Panel — PRD-067
 *
 * Admin-only panel for assigning / moving / clearing gaming tables in the
 * active floor-layout version's pit slots. Rendered inline on the Operations
 * settings page — no new top-level route.
 *
 * Reads aggregate pit-assignment state, renders slots grouped by pit, and
 * exposes admin-only mutation controls (Select to assign, Button to clear).
 * Mutation buttons/selects are absent for non-admin staff (defence-in-depth;
 * the server still rejects with FORBIDDEN_ADMIN_REQUIRED).
 *
 * @see docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md
 * @see docs/21-exec-spec/EXEC-067-admin-operations-pit-configuration.md §WS4
 */

'use client';

import { AlertCircle, LayoutGrid } from 'lucide-react';
import { useMemo, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAssignOrMoveTableToSlot,
  useClearSlotAssignment,
  usePitAssignmentState,
} from '@/hooks/floor-layout';
import { useAuth } from '@/hooks/use-auth';
import type {
  AssignedTableRef,
  FloorPitDTO,
  FloorTableSlotWithTableRefDTO,
} from '@/services/floor-layout/dtos';

// --- Component ---

export function PitConfigurationPanel() {
  const { casinoId, staffRole, isLoading: authLoading } = useAuth();
  const isAdmin = staffRole === 'admin';

  const {
    data: state,
    isLoading: stateLoading,
    error,
    refetch,
  } = usePitAssignmentState(casinoId);

  const assignMutation = useAssignOrMoveTableToSlot(casinoId);
  const clearMutation = useClearSlotAssignment(casinoId);
  const [isPending, startTransition] = useTransition();

  const isLoading = authLoading || stateLoading;
  const mutationError = assignMutation.error ?? clearMutation.error;

  // --- Loading state ---
  if (isLoading) {
    return <PitConfigurationSkeleton />;
  }

  // --- Error state ---
  if (error) {
    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div
              className="text-sm font-bold uppercase tracking-widest text-destructive"
              style={{ fontFamily: 'monospace' }}
            >
              Error Loading Pit Configuration
            </div>
            <p className="mt-1 text-sm text-destructive/80">
              Failed to load the active floor layout. Please try again.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs font-semibold uppercase tracking-wider"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Empty state: no active layout ---
  if (!state) {
    return (
      <Card className="border-2 border-dashed border-border/50 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
          <div
            className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            No Active Floor Layout
          </div>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Activate a floor layout version before configuring pit assignments.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group slots by pit_id (flat array → per-pit buckets). Slots without a
  // pit_id are not renderable in this panel and are dropped silently — the
  // active layout's RPC should not emit them, but types allow null.
  const slotsByPit = new Map<string, FloorTableSlotWithTableRefDTO[]>();
  for (const slot of state.slots) {
    if (!slot.pit_id) continue;
    const list = slotsByPit.get(slot.pit_id) ?? [];
    list.push(slot);
    slotsByPit.set(slot.pit_id, list);
  }

  // Sort pits by sequence; slots within a pit by slot_label
  const sortedPits = [...state.pits].sort((a, b) => a.sequence - b.sequence);

  function handleAssign(slotId: string, tableId: string) {
    startTransition(async () => {
      await assignMutation.mutateAsync({ slotId, tableId });
    });
  }

  function handleClear(slotId: string) {
    startTransition(async () => {
      await clearMutation.mutateAsync({ slotId });
    });
  }

  return (
    <div className="space-y-6">
      {/* Read-only banner for non-admin */}
      {!isAdmin && (
        <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-3 py-2.5">
          <p
            className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400"
            style={{ fontFamily: 'monospace' }}
          >
            Read-Only
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Only casino admins can change pit assignments. Contact your
            administrator for changes.
          </p>
        </div>
      )}

      {/* Mutation error banner */}
      {mutationError && (
        <div className="flex items-start gap-2.5 rounded-lg border-2 border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="min-w-0 break-words text-sm text-destructive">
            {mutationError.message ||
              'The pit-assignment change could not be saved.'}
          </p>
        </div>
      )}

      {/* Pits */}
      {sortedPits.length === 0 ? (
        <Card className="border-2 border-dashed border-border/50 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              No Pits in Active Layout
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedPits.map((pit) => (
            <PitCard
              key={pit.id}
              pit={pit}
              slots={slotsByPit.get(pit.id) ?? []}
              unassignedTables={state.unassigned_tables}
              isAdmin={isAdmin}
              isPending={isPending}
              onAssign={handleAssign}
              onClear={handleClear}
            />
          ))}
        </div>
      )}

      {/* Unassigned tables pool */}
      <UnassignedTablesCard tables={state.unassigned_tables} />
    </div>
  );
}

// --- Sub-components ---

interface PitCardProps {
  pit: FloorPitDTO;
  slots: FloorTableSlotWithTableRefDTO[];
  unassignedTables: AssignedTableRef[];
  isAdmin: boolean;
  isPending: boolean;
  onAssign: (slotId: string, tableId: string) => void;
  onClear: (slotId: string) => void;
}

function PitCard({
  pit,
  slots,
  unassignedTables,
  isAdmin,
  isPending,
  onAssign,
  onClear,
}: PitCardProps) {
  const sortedSlots = useMemo(
    () =>
      [...slots].sort((a, b) =>
        (a.slot_label ?? '').localeCompare(b.slot_label ?? '', undefined, {
          numeric: true,
        }),
      ),
    [slots],
  );

  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          {pit.label} ({sortedSlots.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedSlots.length === 0 ? (
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            No Slots
          </p>
        ) : (
          <div className="space-y-2">
            {sortedSlots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                unassignedTables={unassignedTables}
                isAdmin={isAdmin}
                isPending={isPending}
                onAssign={onAssign}
                onClear={onClear}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SlotRowProps {
  slot: FloorTableSlotWithTableRefDTO;
  unassignedTables: AssignedTableRef[];
  isAdmin: boolean;
  isPending: boolean;
  onAssign: (slotId: string, tableId: string) => void;
  onClear: (slotId: string) => void;
}

function SlotRow({
  slot,
  unassignedTables,
  isAdmin,
  isPending,
  onAssign,
  onClear,
}: SlotRowProps) {
  const assigned = slot.assigned_table;
  const isAssigned = assigned !== null;

  return (
    <div
      className={`group relative rounded-lg border-2 p-3 transition-all ${
        isAssigned
          ? 'border-accent/30 bg-accent/5 hover:border-accent/50'
          : 'border-border/30 bg-card/30 hover:border-accent/30'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Slot identity */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="rounded-md border-2 border-border/50 bg-muted/30 px-2 py-1 text-xs font-bold uppercase tracking-wider text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            {slot.slot_label ?? '—'}
          </div>
          {slot.game_type && (
            <span
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              {slot.game_type}
            </span>
          )}

          {/* Assigned table display */}
          {isAssigned && (
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_6px_rgba(0,188,212,0.5)]" />
              <span
                className="truncate text-sm font-bold text-accent"
                style={{ fontFamily: 'monospace' }}
              >
                {assigned.label}
              </span>
              {assigned.type && (
                <span className="text-xs text-muted-foreground">
                  ({assigned.type})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            {isAssigned ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
                disabled={isPending}
                onClick={() => onClear(slot.id)}
              >
                Clear
              </Button>
            ) : (
              <Select
                value=""
                disabled={isPending || unassignedTables.length === 0}
                onValueChange={(tableId) => {
                  if (tableId) onAssign(slot.id, tableId);
                }}
              >
                <SelectTrigger
                  id={`slot-${slot.id}`}
                  className="h-8 w-56 font-mono text-xs"
                >
                  <SelectValue
                    placeholder={
                      unassignedTables.length === 0
                        ? 'No unassigned tables'
                        : 'Assign table…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {table.label}
                      {table.type ? ` · ${table.type}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface UnassignedTablesCardProps {
  tables: AssignedTableRef[];
}

function UnassignedTablesCard({ tables }: UnassignedTablesCardProps) {
  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Unassigned Tables ({tables.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tables.length === 0 ? (
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            All Tables Assigned
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tables.map((table) => (
              <div
                key={table.id}
                className="rounded-md border-2 border-border/40 bg-card/40 px-2 py-1"
              >
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ fontFamily: 'monospace' }}
                >
                  {table.label}
                </span>
                {table.type && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {table.type}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Loading skeleton ---

function PitConfigurationSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i} className="border-2 border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="h-14 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
