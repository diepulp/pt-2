'use client';

import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePromoPrograms } from '@/hooks/loyalty/promo-instruments/use-promo-programs';
import { formatCents } from '@/lib/format';
import type { PromoProgramDTO } from '@/services/loyalty/promo/dtos';

import { CreateProgramDialog } from './create-program-dialog';

/** Format an ISO date string for display */
function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Badge variant based on program status */
function statusVariant(
  status: PromoProgramDTO['status'],
): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'inactive':
      return 'secondary';
    case 'archived':
      return 'outline';
  }
}

/** Badge variant based on promo type */
function promoTypeVariant(
  promoType: PromoProgramDTO['promoType'],
): 'default' | 'secondary' {
  return promoType === 'match_play' ? 'default' : 'secondary';
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';

interface ProgramListClientProps {
  initialData?: PromoProgramDTO[];
}

/**
 * Client component for the promo programs list page.
 * Provides status filtering, data table, and create program action.
 */
export function ProgramListClient({ initialData }: ProgramListClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const query = statusFilter === 'all' ? {} : { status: statusFilter };

  const { data: programs, isLoading, isError, error } = usePromoPrograms(query);

  // Use initialData only on first mount before query resolves
  const displayPrograms = programs ?? initialData ?? [];

  return (
    <div className="flex flex-1 flex-col" data-testid="program-list">
      {/* Header — matches SettingsContentSection exemplar */}
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Megaphone className="h-6 w-6 text-accent" />
            <h3
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Programs
            </h3>
          </div>
          <CreateProgramDialog />
        </div>
        <p className="mt-1 pl-[34px] text-base text-muted-foreground">
          Manage promotional instrument programs and their coupon inventory.
        </p>
      </div>
      <Separator className="my-4 flex-none" />

      <div className="w-full max-w-4xl space-y-6 overflow-y-auto pe-4 pb-4">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm font-medium">
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger
                id="status-filter"
                className="w-[160px]"
                data-testid="status-filter-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error State */}
        {isError && (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 p-4"
            data-testid="program-list-error"
          >
            <p className="text-sm text-destructive">
              Failed to load programs
              {error instanceof Error ? `: ${error.message}` : '.'}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !initialData && (
          <div className="space-y-2" data-testid="program-list-loading">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {/* Data Table */}
        {(!isLoading || initialData) && !isError && (
          <Table data-testid="programs-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Face Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayPrograms.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No promo programs found.
                  </TableCell>
                </TableRow>
              ) : (
                displayPrograms.map((program) => (
                  <TableRow
                    key={program.id}
                    data-testid={`program-row-${program.id}`}
                  >
                    <TableCell>
                      <Link
                        href={`/admin/loyalty/promo-programs/${program.id}`}
                        className="font-medium text-primary hover:underline"
                        data-testid={`program-link-${program.id}`}
                      >
                        {program.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={promoTypeVariant(program.promoType)}>
                        {program.promoType === 'match_play'
                          ? 'Match Play'
                          : 'Free Play'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatCents(program.faceValueAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(program.status)}>
                        {program.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(program.startAt)}</TableCell>
                    <TableCell>{formatDate(program.endAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
