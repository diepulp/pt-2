/**
 * Issue Reward Drawer
 *
 * Unified drawer for issuing rewards (comps and entitlements) from Player 360.
 * Uses shadcn Sheet component with a 3-step state machine:
 *   'select' -> 'confirm' -> 'result'
 *
 * Key-based reset on reopen ensures clean state without useEffect sync.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see components/ui/sheet.tsx — shadcn Sheet
 */

'use client';

import { useState } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIssueReward } from '@/hooks/loyalty/use-issue-reward';
import type { PrintInvocationMode, PrintState } from '@/lib/print/types';
import type {
  FulfillmentPayload,
  IssuanceResultDTO,
} from '@/services/loyalty/dtos';
import type { RewardCatalogDTO } from '@/services/loyalty/reward/dtos';

import { CompConfirmPanel } from './comp-confirm-panel';
import { EntitlementConfirmPanel } from './entitlement-confirm-panel';
import { IssuanceResultPanel } from './issuance-result-panel';
import { RewardSelector } from './reward-selector';

// === Types ===

type DrawerStep = 'select' | 'confirm' | 'result';

export interface IssueRewardDrawerProps {
  /** Player ID to issue reward to */
  playerId: string;

  /** Player display name */
  playerName: string;

  /** Casino name for fulfillment context */
  casinoName: string;

  /** Player's current loyalty points balance */
  currentBalance: number;

  /** Player's current loyalty tier */
  currentTier: string;

  /** Staff name for fulfillment context */
  staffName: string;

  /** Whether the drawer is open */
  open: boolean;

  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;

  /** Callback fired on successful issuance with fulfillment payload */
  onFulfillmentReady?: (payload: FulfillmentPayload) => void;

  /** Print state from usePrintReward hook (Vector C) */
  printState?: PrintState;

  /** Manual print callback (Vector C) */
  onPrint?: (payload: FulfillmentPayload, mode: PrintInvocationMode) => void;
}

// === Inner Content (reset via key) ===

function DrawerContent({
  playerId,
  playerName,
  casinoName,
  currentBalance,
  currentTier,
  staffName,
  onOpenChange,
  onFulfillmentReady,
  printState,
  onPrint,
}: Omit<IssueRewardDrawerProps, 'open'>) {
  const [step, setStep] = useState<DrawerStep>('select');
  const [selectedReward, setSelectedReward] = useState<RewardCatalogDTO | null>(
    null,
  );
  const { issueReward, isPending, data, error, reset } = useIssueReward();

  const handleSelectReward = (reward: RewardCatalogDTO) => {
    setSelectedReward(reward);
    setStep('confirm');
    reset();
  };

  const handleBack = () => {
    setStep('select');
    setSelectedReward(null);
    reset();
  };

  const handleConfirm = () => {
    if (!selectedReward) return;

    issueReward({
      playerId,
      rewardId: selectedReward.id,
    });

    setStep('result');
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Derive points cost from reward metadata for comps
  const metadata = selectedReward?.metadata as
    | Record<string, unknown>
    | undefined;
  const pointsCost =
    typeof metadata?.points_cost === 'number' ? metadata.points_cost : 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Issue Reward</SheetTitle>
        <SheetDescription>
          Select a reward to issue to {playerName}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 'select' && <RewardSelector onSelect={handleSelectReward} />}

        {step === 'confirm' &&
          selectedReward &&
          selectedReward.family === 'points_comp' && (
            <CompConfirmPanel
              reward={selectedReward}
              currentBalance={currentBalance}
              pointsCost={pointsCost}
              isPending={isPending}
              onConfirm={handleConfirm}
              onBack={handleBack}
            />
          )}

        {step === 'confirm' &&
          selectedReward &&
          selectedReward.family === 'entitlement' && (
            <EntitlementConfirmPanel
              reward={selectedReward}
              isPending={isPending}
              onConfirm={handleConfirm}
              onBack={handleBack}
            />
          )}

        {step === 'result' && (
          <IssuanceResultPanel
            result={data as IssuanceResultDTO | null}
            error={error}
            playerName={playerName}
            playerId={playerId}
            playerTier={currentTier}
            casinoName={casinoName}
            staffName={staffName}
            onFulfillmentReady={onFulfillmentReady}
            printState={printState}
            onPrint={onPrint}
            onClose={handleClose}
          />
        )}
      </div>
    </>
  );
}

// === Main Component ===

/**
 * Issue Reward Drawer — main drawer for unified reward issuance.
 *
 * Uses key-based reset: when the drawer reopens, the inner content remounts
 * with fresh state, eliminating the need for useEffect-based state sync.
 *
 * @example
 * ```tsx
 * <IssueRewardDrawer
 *   playerId={player.id}
 *   playerName={player.name}
 *   casinoName="Grand Casino"
 *   currentBalance={5000}
 *   currentTier="gold"
 *   staffName="Jane Doe"
 *   open={drawerOpen}
 *   onOpenChange={setDrawerOpen}
 * />
 * ```
 */
export function IssueRewardDrawer({
  open,
  onOpenChange,
  ...contentProps
}: IssueRewardDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {/* Key-based reset: remount DrawerContent on each open */}
        <DrawerContent
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
          {...contentProps}
        />
      </SheetContent>
    </Sheet>
  );
}
