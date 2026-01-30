'use client';

import {
  Award,
  Calendar,
  Loader2,
  Pencil,
  User,
  UserCircle,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePlayer } from '@/hooks/player/use-player';
import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';
import { cn } from '@/lib/utils';

import { PlayerEditModal } from './player-edit-modal';

interface PlayerProfilePanelProps {
  className?: string;
}

export function PlayerProfilePanel({ className }: PlayerProfilePanelProps) {
  const { selectedPlayerId } = usePlayerDashboard();
  const { data: player, isLoading, error } = usePlayer(selectedPlayerId || '');
  const [editModalOpen, setEditModalOpen] = React.useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full',
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-8">
          <Loader2 className="h-8 w-8 text-accent/70 animate-spin" />
          <p className="text-sm text-muted-foreground mt-4">
            Loading player profile...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full',
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <UserCircle className="h-8 w-8 text-red-400/70" />
          </div>
          <p className="text-sm font-medium text-red-400">
            Error loading profile
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {error.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (!selectedPlayerId || !player) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full',
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="w-16 h-16 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-4">
            <UserCircle className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No player selected
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Search and select a player to view profile
          </p>
        </div>
      </div>
    );
  }

  // Calculate age from birth_date
  const age = player.birth_date
    ? Math.floor(
        (Date.now() - new Date(player.birth_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  // Format member since date
  const memberSince = player.created_at
    ? new Date(player.created_at).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : 'N/A';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm',
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <User className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Player Profile
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditModalOpen(true)}
            className="h-7 w-7"
            title="Edit profile"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Badge
            variant="outline"
            className="capitalize text-[10px] h-5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          >
            <div className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500 animate-pulse" />
            Active
          </Badge>
        </div>
      </div>

      {/* Profile Content */}
      <div className="p-4">
        {/* Avatar & Basic Info */}
        <div className="flex items-start gap-4 mb-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center text-white font-bold text-2xl bg-gradient-to-br from-accent/40 to-accent/60">
              {player.first_name[0]}
              {player.last_name[0]}
            </div>
          </div>

          {/* Name & ID */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xl font-bold tracking-tight">
              {player.first_name} {player.last_name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-muted-foreground">
                {player.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Award className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Member since {memberSince}
              </span>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          {age && player.birth_date && (
            <DetailItem
              icon={Calendar}
              label="Age"
              value={`${age} years`}
              subtext={`Born ${new Date(player.birth_date).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                },
              )}`}
            />
          )}
          <DetailItem
            icon={User}
            label="Player ID"
            value={player.id}
            truncate
          />
        </div>
      </div>

      {/* Edit Modal */}
      <PlayerEditModal
        playerId={selectedPlayerId}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  subtext,
  truncate,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  subtext?: string;
  truncate?: boolean;
}) {
  return (
    <div className="space-y-1 p-2.5 rounded-lg bg-muted/20 border border-border/30">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={cn(
          'text-sm font-medium text-foreground',
          truncate && 'truncate',
        )}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-muted-foreground/60">{subtext}</p>
      )}
    </div>
  );
}
