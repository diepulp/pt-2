"use client";

/**
 * Player Loyalty Widget Component (READ-ONLY)
 * Phase 6 Wave 3 Track 2: MTL UI Implementation
 *
 * Features:
 * - Display player loyalty tier and balance
 * - READ-ONLY integration (MTL does NOT write to loyalty)
 * - Real-time updates via React Query
 * - Tier progress visualization
 * - WCAG 2.1 AA compliant
 *
 * CRITICAL BOUNDARY ENFORCEMENT:
 * This widget is READ-ONLY for MTL domain
 * It displays loyalty data but CANNOT mutate it
 * All loyalty mutations happen through RatingSlip domain only
 */

import { TrendingUp, Award } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlayerLoyalty } from "@/hooks/loyalty/use-player-loyalty";

export interface PlayerLoyaltyWidgetProps {
  playerId: string;
}

/**
 * Skeleton loading state for loyalty widget
 */
function LoyaltyWidgetSkeleton() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Loyalty Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-6 w-24 bg-muted animate-pulse rounded" />
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-2 w-full bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Get tier badge variant based on tier level
 */
function getTierVariant(
  tier: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (tier.toLowerCase()) {
    case "platinum":
      return "default";
    case "gold":
      return "secondary";
    case "silver":
      return "outline";
    default:
      return "outline";
  }
}

/**
 * Player Loyalty Widget
 *
 * Displays read-only loyalty information for a player within MTL context.
 * This component fetches data via React Query but does NOT provide
 * any mutation capabilities - loyalty is managed by RatingSlip domain.
 *
 * @param playerId - Player UUID
 */
export function PlayerLoyaltyWidget({ playerId }: PlayerLoyaltyWidgetProps) {
  const { data: loyalty, isLoading, error } = usePlayerLoyalty(playerId);

  // Loading state
  if (isLoading) {
    return <LoyaltyWidgetSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Loyalty Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription role="alert">
              Unable to load loyalty data: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!loyalty) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Loyalty Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No loyalty data available for this player
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Award className="h-4 w-4" aria-hidden="true" />
          Loyalty Status (Read-Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier Badge */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Current Tier</p>
          <Badge variant={getTierVariant(loyalty.tier)} className="text-base">
            {loyalty.tier}
          </Badge>
        </div>

        {/* Current Balance */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Points Balance</p>
          <p
            className="text-2xl font-bold"
            aria-label={`${loyalty.currentBalance} points`}
          >
            {loyalty.currentBalance.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              points
            </span>
          </p>
        </div>

        {/* Lifetime Points */}
        <div>
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            Lifetime Points
          </p>
          <p className="text-lg font-semibold">
            {loyalty.lifetimePoints.toLocaleString()}
          </p>
        </div>

        {/* Tier Progress Bar */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-muted-foreground">Tier Progress</p>
            <p className="text-xs font-medium">
              {Math.round(loyalty.tierProgress)}%
            </p>
          </div>
          <div
            className="w-full bg-muted rounded-full h-2"
            role="progressbar"
            aria-valuenow={loyalty.tierProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tier progress percentage"
          >
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(loyalty.tierProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* Read-Only Notice */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground italic">
            Loyalty points are awarded automatically through gaming activity.
            MTL cannot modify loyalty balances directly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
