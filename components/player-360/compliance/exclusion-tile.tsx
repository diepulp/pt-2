/**
 * Exclusion Tile — Compliance Panel Section
 *
 * Displays exclusion status and active exclusion list.
 * Add/Lift buttons role-gated via useAuth (allowlist matching RLS).
 *
 * @see PRD-052 GAP-2, GAP-4, GAP-5
 * @see EXEC-052 WS4, WS5
 */

'use client';

import { AlertTriangle, Ban, Eye, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useActiveExclusions,
  useExclusionStatus,
} from '@/hooks/player/use-exclusions';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { PlayerExclusionDTO } from '@/services/player/exclusion-dtos';

import { CreateExclusionDialog } from './create-exclusion-dialog';
import { LiftExclusionDialog } from './lift-exclusion-dialog';

interface ExclusionTileProps {
  playerId: string;
  className?: string;
}

const ENFORCEMENT_COLORS: Record<string, string> = {
  hard_block: 'bg-red-500/10 text-red-400 border-red-500/30',
  soft_alert: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  monitor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

const STATUS_BORDER: Record<string, string> = {
  blocked: 'border-red-500/30 bg-red-500/5',
  alert: 'border-amber-500/30 bg-amber-500/5',
  watchlist: 'border-blue-500/30 bg-blue-500/5',
  clear: 'border-border/40 bg-card/50',
};

const STATUS_ICON: Record<string, typeof Ban> = {
  blocked: Ban,
  alert: AlertTriangle,
  watchlist: Eye,
  clear: ShieldCheck,
};

export function ExclusionTile({ playerId, className }: ExclusionTileProps) {
  const { staffRole } = useAuth();
  const { data: statusData, isLoading: isStatusLoading } =
    useExclusionStatus(playerId);
  const { data: activeExclusions, isLoading: isListLoading } =
    useActiveExclusions(playerId);

  const [createOpen, setCreateOpen] = useState(false);
  const [liftTarget, setLiftTarget] = useState<PlayerExclusionDTO | null>(null);

  const isLoading = isStatusLoading || isListLoading;
  const status = statusData?.status ?? 'clear';
  const exclusions = activeExclusions ?? [];

  // Allowlist role-gating matching RLS INSERT policy (pit_boss + admin)
  const canCreate = staffRole === 'pit_boss' || staffRole === 'admin';
  // Allowlist role-gating matching RLS UPDATE policy (admin only)
  const canLift = staffRole === 'admin';

  if (isLoading) {
    return (
      <div
        className={cn(
          'p-3 rounded-lg border border-border/40 bg-card/50',
          className,
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="h-3 w-20 bg-muted rounded motion-safe:animate-pulse" />
        </div>
        <div className="h-4 w-32 bg-muted rounded motion-safe:animate-pulse" />
      </div>
    );
  }

  const StatusIcon = STATUS_ICON[status] ?? ShieldCheck;

  return (
    <>
      <div
        className={cn(
          'p-3 rounded-lg border',
          STATUS_BORDER[status] ?? STATUS_BORDER.clear,
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={cn(
                'h-3.5 w-3.5',
                status === 'clear' ? 'text-muted-foreground' : '',
              )}
            />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Exclusions
            </span>
            {status !== 'clear' && (
              <Badge
                variant="outline"
                className={cn(
                  'h-5 text-[10px]',
                  status === 'blocked' &&
                    'bg-red-500/10 text-red-400 border-red-500/30',
                  status === 'alert' &&
                    'bg-amber-500/10 text-amber-400 border-amber-500/30',
                  status === 'watchlist' &&
                    'bg-blue-500/10 text-blue-400 border-blue-500/30',
                )}
              >
                {exclusions.length} active
              </Badge>
            )}
          </div>
          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        {/* Active exclusion list */}
        {exclusions.length > 0 ? (
          <div className="space-y-1.5">
            {exclusions.map((exclusion) => (
              <ExclusionRow
                key={exclusion.id}
                exclusion={exclusion}
                canLift={canLift}
                onLift={() => setLiftTarget(exclusion)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No active exclusions</p>
        )}
      </div>

      {/* Create dialog (rendered outside tile to avoid z-index issues) */}
      {createOpen && (
        <CreateExclusionDialog
          playerId={playerId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      {/* Lift dialog */}
      {liftTarget && (
        <LiftExclusionDialog
          exclusion={liftTarget}
          open={!!liftTarget}
          onOpenChange={(open) => {
            if (!open) setLiftTarget(null);
          }}
        />
      )}
    </>
  );
}

// === Exclusion Row ===

function ExclusionRow({
  exclusion,
  canLift,
  onLift,
}: {
  exclusion: PlayerExclusionDTO;
  canLift: boolean;
  onLift: () => void;
}) {
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg border border-border/30 bg-card/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium capitalize">
            {exclusion.exclusion_type.replace('_', ' ')}
          </span>
          <Badge
            variant="outline"
            className={cn(
              'h-4 text-[9px] px-1',
              ENFORCEMENT_COLORS[exclusion.enforcement] ?? '',
            )}
          >
            {exclusion.enforcement.replace('_', ' ')}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatDate(exclusion.effective_from)}
          {exclusion.effective_until && (
            <> &ndash; {formatDate(exclusion.effective_until)}</>
          )}
        </div>
        {exclusion.reason && (
          <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
            {exclusion.reason}
          </p>
        )}
      </div>
      {canLift && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
          onClick={onLift}
        >
          Lift
        </Button>
      )}
    </div>
  );
}
