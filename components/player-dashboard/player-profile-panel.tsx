"use client";

import {
  Award,
  Calendar,
  Mail,
  MapPin,
  Phone,
  User,
  UserCircle,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Mock player profile - will be replaced with service layer
const MOCK_PROFILE = {
  id: "p1",
  firstName: "Marcus",
  lastName: "Chen",
  email: "m.chen@example.com",
  phone: "+1 (555) 234-5678",
  dob: "1985-03-15",
  gender: "M",
  address: "Los Angeles, CA",
  memberSince: "2019-06-22",
  tier: "platinum",
  playerId: "PLY-10847",
  status: "active" as const,
  currentTable: "BJ-04",
  avatarUrl: null,
};

interface PlayerProfilePanelProps {
  playerId: string | null;
  className?: string;
}

export function PlayerProfilePanel({
  playerId,
  className,
}: PlayerProfilePanelProps) {
  // In production, this would fetch from the player service
  const profile = playerId ? MOCK_PROFILE : null;

  const getTierConfig = (tier: string) => {
    switch (tier) {
      case "diamond":
        return {
          color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
          glow: "shadow-[0_0_12px_rgba(6,182,212,0.3)]",
          icon: "bg-gradient-to-br from-cyan-400 to-blue-500",
        };
      case "platinum":
        return {
          color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
          glow: "shadow-[0_0_12px_rgba(168,85,247,0.3)]",
          icon: "bg-gradient-to-br from-purple-400 to-pink-500",
        };
      case "gold":
        return {
          color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          glow: "shadow-[0_0_12px_rgba(245,158,11,0.3)]",
          icon: "bg-gradient-to-br from-amber-400 to-orange-500",
        };
      case "silver":
        return {
          color: "bg-slate-400/20 text-slate-400 border-slate-400/30",
          glow: "",
          icon: "bg-gradient-to-br from-slate-400 to-slate-500",
        };
      default:
        return {
          color: "bg-muted text-muted-foreground border-border",
          glow: "",
          icon: "bg-muted",
        };
    }
  };

  if (!profile) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
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

  const tierConfig = getTierConfig(profile.tier);
  const age = Math.floor(
    (Date.now() - new Date(profile.dob).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm",
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
        <Badge
          variant="outline"
          className={cn(
            "capitalize text-[10px] h-5",
            profile.status === "active"
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-slate-500/20 text-slate-400 border-slate-500/30",
          )}
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full mr-1.5",
              profile.status === "active"
                ? "bg-emerald-500 animate-pulse"
                : "bg-slate-500",
            )}
          />
          {profile.status}
        </Badge>
      </div>

      {/* Profile Content */}
      <div className="p-4">
        {/* Avatar & Basic Info */}
        <div className="flex items-start gap-4 mb-6">
          {/* Avatar */}
          <div className={cn("relative", tierConfig.glow)}>
            <div
              className={cn(
                "w-20 h-20 rounded-xl flex items-center justify-center text-white font-bold text-2xl",
                tierConfig.icon,
              )}
            >
              {profile.firstName[0]}
              {profile.lastName[0]}
            </div>
            {/* Tier badge */}
            <div
              className={cn(
                "absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
                tierConfig.color,
              )}
            >
              {profile.tier}
            </div>
          </div>

          {/* Name & ID */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xl font-bold tracking-tight">
              {profile.firstName} {profile.lastName}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-muted-foreground">
                {profile.playerId}
              </span>
              {profile.currentTable && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-accent/30 text-accent bg-accent/5"
                >
                  {profile.currentTable}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Award className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Member since{" "}
                {new Date(profile.memberSince).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <DetailItem
            icon={Mail}
            label="Email"
            value={profile.email}
            truncate
          />
          <DetailItem icon={Phone} label="Phone" value={profile.phone} />
          <DetailItem
            icon={Calendar}
            label="Age"
            value={`${age} years`}
            subtext={`Born ${new Date(profile.dob).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`}
          />
          <DetailItem icon={MapPin} label="Location" value={profile.address} />
        </div>
      </div>
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
  icon: typeof Mail;
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
          "text-sm font-medium text-foreground",
          truncate && "truncate",
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
