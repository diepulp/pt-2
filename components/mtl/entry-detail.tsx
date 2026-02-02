/**
 * MTL Entry Detail Component
 *
 * Displays detailed view of an MTL entry with its audit trail.
 * Shows transaction details, entry badge, and all audit notes.
 *
 * Features:
 * - Full transaction details
 * - Entry badge (Tier 1)
 * - Audit notes timeline
 * - Add note form (for pit_boss/admin)
 *
 * @see hooks/mtl/use-mtl-entries.ts - Data fetching
 * @see services/mtl/dtos.ts - DTOs
 * @see PRD-005 MTL Service
 */

'use client';

import { format } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Clock,
  FileText,
  MapPin,
  Receipt,
  User,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMtlEntry } from '@/hooks/mtl/use-mtl-entries';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MtlAuditNoteDTO } from '@/services/mtl/dtos';

import { AuditNoteForm } from './audit-note-form';
import { EntryBadge } from './entry-badge';

export interface EntryDetailProps {
  /** Entry ID to display */
  entryId: string;
  /** Show audit note form (requires pit_boss/admin) */
  canAddNotes?: boolean;
  /** Current staff ID for note attribution */
  staffId?: string;
  className?: string;
}

/**
 * Format datetime for display
 */
function formatDateTime(isoString: string): string {
  return format(new Date(isoString), "MMM d, yyyy 'at' h:mm:ss a");
}

/**
 * Transaction type display labels
 */
const TXN_TYPE_LABELS: Record<string, string> = {
  buy_in: 'Buy-in',
  cash_out: 'Cash Out',
  marker: 'Marker',
  front_money: 'Front Money',
  chip_fill: 'Chip Fill',
};

/**
 * Source display labels
 */
const SOURCE_LABELS: Record<string, string> = {
  table: 'Table',
  cage: 'Cage',
  kiosk: 'Kiosk',
  other: 'Other',
};

/**
 * Entry Detail Component
 *
 * @example
 * // Basic usage
 * <EntryDetail entryId={selectedEntryId} />
 *
 * @example
 * // With add note capability
 * <EntryDetail
 *   entryId={selectedEntryId}
 *   canAddNotes
 *   staffId={currentStaffId}
 * />
 */
export function EntryDetail({
  entryId,
  canAddNotes = false,
  staffId,
  className,
}: EntryDetailProps) {
  const { data: entry, isLoading, error } = useMtlEntry(entryId);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <EntryDetailSkeleton />
      </div>
    );
  }

  // Error state
  if (error || !entry) {
    return (
      <Card className={cn('border-destructive/50', className)}>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>
            {error?.message ?? 'Entry not found'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isInflow = entry.direction === 'in';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Transaction Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isInflow ? (
                <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              <CardTitle className="text-lg">
                {TXN_TYPE_LABELS[entry.txn_type] ?? entry.txn_type}
              </CardTitle>
            </div>
            <EntryBadge badge={entry.entry_badge} showLabel />
          </div>
          <CardDescription>
            {SOURCE_LABELS[entry.source] ?? entry.source}
            {entry.area && ` - ${entry.area}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount */}
          <div
            className={cn(
              'text-3xl font-bold tabular-nums',
              isInflow
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {isInflow ? '+' : '-'}
            {formatCents(entry.amount)}
          </div>

          {/* Details Grid */}
          <div className="grid gap-3 text-sm">
            <DetailRow
              icon={Calendar}
              label="Gaming Day"
              value={entry.gaming_day ?? 'Not set'}
            />
            <DetailRow
              icon={Clock}
              label="Transaction Time"
              value={formatDateTime(entry.occurred_at)}
            />
            <DetailRow
              icon={Receipt}
              label="Recorded At"
              value={formatDateTime(entry.created_at)}
            />
            {entry.staff_id && (
              <DetailRow icon={User} label="Staff" value={entry.staff_id} />
            )}
            {entry.rating_slip_id && (
              <DetailRow
                icon={FileText}
                label="Rating Slip"
                value={entry.rating_slip_id}
              />
            )}
            {entry.area && (
              <DetailRow icon={MapPin} label="Area" value={entry.area} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Notes Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Audit Trail ({entry.audit_notes.length})
          </CardTitle>
          <CardDescription>
            {entry.audit_notes.length === 0
              ? 'No audit notes recorded'
              : 'Notes are append-only and cannot be edited'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing Notes */}
          {entry.audit_notes.length > 0 && (
            <div className="space-y-3">
              {entry.audit_notes.map((note) => (
                <AuditNoteCard key={note.id} note={note} />
              ))}
            </div>
          )}

          {/* Add Note Form */}
          {canAddNotes && staffId && (
            <div className="pt-2 border-t">
              <AuditNoteForm entryId={entry.id} staffId={staffId} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Detail row component for consistent layout
 */
function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * Audit note card component
 */
function AuditNoteCard({ note }: { note: MtlAuditNoteDTO }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="whitespace-pre-wrap">{note.note}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span>{note.staff_id ?? 'Unknown'}</span>
        <span>·</span>
        <span>{format(new Date(note.created_at), 'MMM d, h:mm a')}</span>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for entry detail
 */
function EntryDetailSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
      </CardContent>
    </Card>
  );
}

export { EntryDetailSkeleton };
