'use client';

import {
  Award,
  Crown,
  Gift,
  Loader2,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePlayerLoyalty } from '@/hooks/loyalty/use-loyalty-queries';
import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

const TIER_CONFIG = {
  bronze: {
    icon: Award,
    color: 'text-amber-600',
    bg: 'bg-gradient-to-br from-amber-600/20 to-amber-800/20',
    border: 'border-amber-600/30',
    glow: '',
  },
  silver: {
    icon: Star,
    color: 'text-slate-400',
    bg: 'bg-gradient-to-br from-slate-400/20 to-slate-600/20',
    border: 'border-slate-400/30',
    glow: '',
  },
  gold: {
    icon: Trophy,
    color: 'text-amber-400',
    bg: 'bg-gradient-to-br from-amber-400/20 to-amber-600/20',
    border: 'border-amber-400/30',
    glow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]',
  },
  platinum: {
    icon: Crown,
    color: 'text-purple-400',
    bg: 'bg-gradient-to-br from-purple-400/20 to-purple-600/20',
    border: 'border-purple-400/30',
    glow: 'shadow-[0_0_12px_rgba(168,85,247,0.2)]',
  },
  diamond: {
    icon: Sparkles,
    color: 'text-cyan-400',
    bg: 'bg-gradient-to-br from-cyan-400/20 to-blue-500/20',
    border: 'border-cyan-400/30',
    glow: 'shadow-[0_0_16px_rgba(6,182,212,0.3)]',
  },
};

interface LoyaltyPanelProps {
  className?: string;
}

export function LoyaltyPanel({ className }: LoyaltyPanelProps) {
  const { selectedPlayerId } = usePlayerDashboard();
  const { casinoId } = useAuth();
  const {
    data: loyalty,
    isLoading,
    error,
  } = usePlayerLoyalty(selectedPlayerId || undefined, casinoId || undefined);

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
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Loader2 className="h-6 w-6 text-accent/70 animate-spin" />
          <p className="text-xs text-muted-foreground mt-3">
            Loading loyalty data...
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
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Award className="h-6 w-6 text-red-400/70 mb-2" />
          <p className="text-xs font-medium text-red-400">
            Error loading loyalty
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {error.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (!selectedPlayerId || !loyalty) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full',
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="w-12 h-12 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-3">
            <Award className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Loyalty data unavailable
          </p>
        </div>
      </div>
    );
  }

  // Parse tier from loyalty data
  const tier = (loyalty.tier?.toLowerCase() || 'bronze') as LoyaltyTier;
  const tierConfig = TIER_CONFIG[tier];
  const TierIcon = tierConfig.icon;

  // Current balance
  const pointsBalance = loyalty.currentBalance;

  // Note: We don't have total lifetime points, progression, or benefits in the DTO yet
  // These features require additional services (player-analytics)
  const hasProgression = false;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col',
        className,
      )}
    >
      {/* LED accent strip - tier colored */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent to-transparent',
          tier === 'diamond'
            ? 'via-cyan-500/70'
            : tier === 'platinum'
              ? 'via-purple-500/70'
              : tier === 'gold'
                ? 'via-amber-500/70'
                : 'via-accent/50',
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <Award className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Loyalty & Rewards
          </h3>
        </div>

        <Badge
          variant="outline"
          className={cn(
            'text-[10px] h-5 capitalize font-bold',
            tierConfig.color,
            tierConfig.border,
          )}
        >
          <TierIcon className="h-3 w-3 mr-1" />
          {tier}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Tier Progress */}
        <div
          className={cn(
            'p-3 rounded-lg border',
            tierConfig.bg,
            tierConfig.border,
            tierConfig.glow,
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TierIcon className={cn('h-5 w-5', tierConfig.color)} />
              <span
                className={cn('text-sm font-bold capitalize', tierConfig.color)}
              >
                {tier} Member
              </span>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold text-foreground">
                {pointsBalance.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">
                points available
              </div>
            </div>
          </div>

          {/* Tier progression info */}
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground">
              Current {tier} tier member
            </p>
          </div>
        </div>

        {/* Additional loyalty info */}
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <p className="text-xs text-muted-foreground text-center">
            Additional loyalty features coming soon
          </p>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
            Benefits, achievements, and offers will be available in a future
            release
          </p>
        </div>
      </div>
    </div>
  );
}
