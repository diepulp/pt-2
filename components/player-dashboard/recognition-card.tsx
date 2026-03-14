'use client';

/**
 * Recognition Card — three-state player recognition result.
 *
 * State A: Active locally → loyalty info + redemption
 * State B1: Sister property, no exclusions → "Activate" CTA + loyalty visible
 * State B2: Sister property, has exclusions → warning (Slice 2)
 * State C: Not found → handled by parent (no card rendered)
 *
 * @see PRD-051 §6 / ADR-044 D4
 */

import {
  AlertTriangle,
  Building2,
  Clock,
  Gift,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';

import { ActivateLocallyDialog } from '@/components/player-dashboard/activate-locally-dialog';
import { LoyaltyEntitlementDisplay } from '@/components/player-dashboard/loyalty-entitlement-display';
import { RedeemLoyaltyDialog } from '@/components/player-dashboard/redeem-loyalty-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecognitionResultDTO } from '@/services/recognition';

interface RecognitionCardProps {
  player: RecognitionResultDTO;
  onSelect?: (playerId: string) => void;
}

type RecognitionState = 'A' | 'B1' | 'B2';

function getRecognitionState(player: RecognitionResultDTO): RecognitionState {
  if (player.activeLocally) return 'A';
  if (player.hasSisterExclusions) return 'B2';
  return 'B1';
}

export function RecognitionCard({ player, onSelect }: RecognitionCardProps) {
  const [activateOpen, setActivateOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const state = getRecognitionState(player);

  const lastVisitLabel = player.lastCompanyVisit
    ? new Date(player.lastCompanyVisit).toLocaleDateString()
    : null;

  return (
    <>
      <div
        className={cn(
          'group rounded-lg border p-4 transition-all duration-200',
          'bg-card/50 backdrop-blur-sm',
          state === 'A' && 'border-emerald-500/20 hover:border-emerald-500/40',
          state === 'B1' && 'border-blue-500/20 hover:border-blue-500/40',
          state === 'B2' && 'border-amber-500/30 hover:border-amber-500/50',
        )}
      >
        {/* Header: Name + State Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={() => onSelect?.(player.playerId)}
              className="text-left hover:underline decoration-accent/50 underline-offset-2"
            >
              <h3 className="font-semibold text-foreground truncate">
                {player.fullName}
              </h3>
            </button>
            <div className="flex items-center gap-2 mt-0.5">
              {player.birthDate && (
                <span className="text-xs text-muted-foreground">
                  DOB: {player.birthDate}
                </span>
              )}
              {lastVisitLabel && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  Last visit: {lastVisitLabel}
                </span>
              )}
            </div>
          </div>

          {/* State badge */}
          {state === 'A' && (
            <Badge className="shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Active here
            </Badge>
          )}
          {state === 'B1' && (
            <Badge className="shrink-0 bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
              <Building2 className="h-3 w-3 mr-1" />
              Sister property
            </Badge>
          )}
          {state === 'B2' && (
            <Badge className="shrink-0 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Restrictions
            </Badge>
          )}
        </div>

        {/* Enrollment badges */}
        <div className="flex flex-wrap gap-1 mt-2">
          {player.enrolledCasinos.map((casino) => (
            <Badge
              key={casino.casinoId}
              variant="outline"
              className="text-[9px] h-4 px-1.5 bg-muted/30 border-border/40"
            >
              {casino.casinoName}
            </Badge>
          ))}
        </div>

        {/* Loyalty entitlement (visible in all states) */}
        <div className="mt-3 pt-3 border-t border-border/20">
          <LoyaltyEntitlementDisplay
            entitlement={player.loyaltyEntitlement}
            activeLocally={player.activeLocally}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {state === 'A' && player.loyaltyEntitlement.redeemableHere > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setRedeemOpen(true)}
            >
              <Gift className="h-3 w-3 mr-1" />
              Redeem
            </Button>
          )}

          {state === 'B1' && (
            <Button
              size="sm"
              className="text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => setActivateOpen(true)}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Activate at This Property
            </Button>
          )}

          {state === 'B2' && (
            <div className="flex-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              This player has restrictions at another property. Contact a
              manager.
            </div>
          )}
        </div>
      </div>

      {/* Dialogs (portaled, outside card) */}
      <ActivateLocallyDialog
        player={player}
        open={activateOpen}
        onOpenChange={setActivateOpen}
      />
      <RedeemLoyaltyDialog
        player={player}
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
      />
    </>
  );
}
