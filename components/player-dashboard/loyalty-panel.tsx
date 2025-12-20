"use client";

import { Award, Crown, Gift, Sparkles, Star, Trophy, Zap } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

// Mock loyalty data - will be replaced with service layer
const MOCK_LOYALTY: {
  tier: LoyaltyTier;
  pointsBalance: number;
  pointsTotal: number;
  nextTier: LoyaltyTier | null;
  nextTierPoints: number;
  progress: number;
  benefits: Array<{ id: string; name: string; isActive: boolean }>;
  achievements: Array<{
    id: string;
    name: string;
    icon: string;
    points: number;
  }>;
  offers: Array<{
    id: string;
    title: string;
    description: string;
    expires: string;
    value: number;
  }>;
} = {
  tier: "platinum",
  pointsBalance: 24750,
  pointsTotal: 156200,
  nextTier: "diamond",
  nextTierPoints: 200000,
  progress: 78,
  benefits: [
    { id: "b1", name: "Priority Seating", isActive: true },
    { id: "b2", name: "Complimentary Drinks", isActive: true },
    { id: "b3", name: "Exclusive Events", isActive: true },
    { id: "b4", name: "Personal Host", isActive: false },
  ],
  achievements: [
    { id: "a1", name: "High Roller", icon: "🎰", points: 500 },
    { id: "a2", name: "Lucky Streak", icon: "🍀", points: 250 },
    { id: "a3", name: "VIP Regular", icon: "⭐", points: 1000 },
  ],
  offers: [
    {
      id: "o1",
      title: "Double Points Weekend",
      description: "Earn 2x points on all table games",
      expires: "2024-01-28",
      value: 500,
    },
  ],
};

const TIER_CONFIG = {
  bronze: {
    icon: Award,
    color: "text-amber-600",
    bg: "bg-gradient-to-br from-amber-600/20 to-amber-800/20",
    border: "border-amber-600/30",
    glow: "",
  },
  silver: {
    icon: Star,
    color: "text-slate-400",
    bg: "bg-gradient-to-br from-slate-400/20 to-slate-600/20",
    border: "border-slate-400/30",
    glow: "",
  },
  gold: {
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-gradient-to-br from-amber-400/20 to-amber-600/20",
    border: "border-amber-400/30",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.2)]",
  },
  platinum: {
    icon: Crown,
    color: "text-purple-400",
    bg: "bg-gradient-to-br from-purple-400/20 to-purple-600/20",
    border: "border-purple-400/30",
    glow: "shadow-[0_0_12px_rgba(168,85,247,0.2)]",
  },
  diamond: {
    icon: Sparkles,
    color: "text-cyan-400",
    bg: "bg-gradient-to-br from-cyan-400/20 to-blue-500/20",
    border: "border-cyan-400/30",
    glow: "shadow-[0_0_16px_rgba(6,182,212,0.3)]",
  },
};

interface LoyaltyPanelProps {
  playerId: string | null;
  className?: string;
}

export function LoyaltyPanel({ playerId, className }: LoyaltyPanelProps) {
  if (!playerId) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
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

  const {
    tier,
    pointsBalance,
    pointsTotal,
    nextTier,
    nextTierPoints,
    progress,
    benefits,
    achievements,
    offers,
  } = MOCK_LOYALTY;

  const tierConfig = TIER_CONFIG[tier];
  const TierIcon = tierConfig.icon;

  const pointsToNext = nextTierPoints - pointsTotal;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip - tier colored */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent to-transparent",
          tier === "diamond"
            ? "via-cyan-500/70"
            : tier === "platinum"
              ? "via-purple-500/70"
              : tier === "gold"
                ? "via-amber-500/70"
                : "via-accent/50",
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
            "text-[10px] h-5 capitalize font-bold",
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
            "p-3 rounded-lg border",
            tierConfig.bg,
            tierConfig.border,
            tierConfig.glow,
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TierIcon className={cn("h-5 w-5", tierConfig.color)} />
              <span
                className={cn("text-sm font-bold capitalize", tierConfig.color)}
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

          {/* Progress to next tier */}
          {nextTier && (
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    tier === "platinum" ? "bg-purple-500" : "bg-accent",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">
                  {pointsTotal.toLocaleString()} earned
                </span>
                <span
                  className={cn(
                    "font-medium",
                    TIER_CONFIG[nextTier as keyof typeof TIER_CONFIG]?.color,
                  )}
                >
                  {pointsToNext.toLocaleString()} to {nextTier}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Active Benefits */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
            Active Benefits
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {benefits.slice(0, 4).map((benefit) => (
              <div
                key={benefit.id}
                className={cn(
                  "flex items-center gap-1.5 p-1.5 rounded text-xs",
                  benefit.isActive
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-muted/20 border border-border/30 text-muted-foreground",
                )}
              >
                <Gift className="h-3 w-3 shrink-0" />
                <span className="truncate">{benefit.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
              Achievements
            </span>
            <div className="flex gap-2">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className="flex-1 text-center p-2 rounded-lg bg-muted/20 border border-border/30 hover:border-accent/30 transition-colors"
                >
                  <div className="text-xl mb-0.5">{achievement.icon}</div>
                  <div className="text-[10px] font-medium truncate">
                    {achievement.name}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    +{achievement.points}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Offers */}
        {offers.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide px-1">
              Special Offers
            </span>
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="p-2.5 rounded-lg bg-gradient-to-r from-accent/10 to-purple-500/10 border border-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Zap className="h-3.5 w-3.5 text-accent" />
                      <span className="text-sm font-medium">{offer.title}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {offer.description}
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1">
                      Expires {new Date(offer.expires).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-accent text-accent-foreground text-[10px] h-5">
                    +{offer.value}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
