"use client";

import {
  AlertTriangle,
  CheckCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ComplianceStatus = "verified" | "warning" | "alert" | "pending";
type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Mock compliance data - will be replaced with service layer
const MOCK_COMPLIANCE: {
  riskScore: number;
  riskLevel: RiskLevel;
  items: Array<{
    name: string;
    status: ComplianceStatus;
    icon: typeof ShieldCheck;
  }>;
  alerts: Array<{
    id: string;
    message: string;
    severity: AlertSeverity;
    time: string;
  }>;
} = {
  riskScore: 28,
  riskLevel: "LOW",
  items: [
    { name: "Age Verification", status: "verified", icon: ShieldCheck },
    { name: "Identity Check", status: "verified", icon: ShieldCheck },
    { name: "Play Limits", status: "warning", icon: ShieldAlert },
    { name: "Payment Methods", status: "verified", icon: ShieldCheck },
    { name: "Account Security", status: "verified", icon: ShieldCheck },
    { name: "Responsible Gaming", status: "pending", icon: Shield },
  ],
  alerts: [
    {
      id: "a1",
      message: "Session approaching time limit",
      severity: "MEDIUM",
      time: "10m ago",
    },
  ],
};

interface CompliancePanelProps {
  playerId: string | null;
  className?: string;
}

export function CompliancePanel({ playerId, className }: CompliancePanelProps) {
  if (!playerId) {
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
            <Shield className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No compliance data
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Select a player to view compliance status
          </p>
        </div>
      </div>
    );
  }

  const { riskScore, riskLevel, items, alerts } = MOCK_COMPLIANCE;

  const getRiskConfig = (level: string) => {
    switch (level) {
      case "LOW":
        return {
          color: "text-emerald-400",
          bg: "bg-emerald-500",
          glow: "shadow-[0_0_12px_rgba(16,185,129,0.4)]",
        };
      case "MEDIUM":
        return {
          color: "text-amber-400",
          bg: "bg-amber-500",
          glow: "shadow-[0_0_12px_rgba(245,158,11,0.4)]",
        };
      case "HIGH":
      case "CRITICAL":
        return {
          color: "text-red-400",
          bg: "bg-red-500",
          glow: "shadow-[0_0_12px_rgba(239,68,68,0.4)]",
        };
      default:
        return {
          color: "text-muted-foreground",
          bg: "bg-muted",
          glow: "",
        };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "verified":
        return {
          color: "text-emerald-400",
          bg: "bg-emerald-500/20",
          border: "border-emerald-500/30",
          label: "Verified",
        };
      case "warning":
        return {
          color: "text-amber-400",
          bg: "bg-amber-500/20",
          border: "border-amber-500/30",
          label: "Warning",
        };
      case "alert":
        return {
          color: "text-red-400",
          bg: "bg-red-500/20",
          border: "border-red-500/30",
          label: "Alert",
        };
      default:
        return {
          color: "text-muted-foreground",
          bg: "bg-muted/20",
          border: "border-border/30",
          label: "Pending",
        };
    }
  };

  const riskConfig = getRiskConfig(riskLevel);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip - color based on risk */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent to-transparent",
          riskLevel === "LOW"
            ? "via-emerald-500/50"
            : riskLevel === "MEDIUM"
              ? "via-amber-500/50"
              : "via-red-500/50",
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <Shield className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Compliance & Risk
          </h3>
        </div>

        {alerts.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] h-5 bg-amber-500/10 border-amber-500/30 text-amber-400"
          >
            {alerts.length} Alert{alerts.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Risk Score */}
        <div className="relative p-4 rounded-lg bg-muted/20 border border-border/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Risk Score
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5 capitalize",
                riskConfig.color,
                `${riskConfig.bg}/20`,
                "border-current/30",
              )}
            >
              {riskLevel.toLowerCase()}
            </Badge>
          </div>

          {/* Risk Gauge */}
          <div className="relative h-3 rounded-full bg-muted/50 overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                riskConfig.bg,
                riskConfig.glow,
              )}
              style={{ width: `${riskScore}%` }}
            />
          </div>

          {/* Scale markers */}
          <div className="flex justify-between mt-2">
            <span
              className={cn(
                "text-[10px] font-medium",
                riskLevel === "LOW"
                  ? "text-emerald-400"
                  : "text-muted-foreground/50",
              )}
            >
              Low
            </span>
            <span
              className={cn(
                "text-[10px] font-medium",
                riskLevel === "MEDIUM"
                  ? "text-amber-400"
                  : "text-muted-foreground/50",
              )}
            >
              Medium
            </span>
            <span
              className={cn(
                "text-[10px] font-medium",
                riskLevel === "HIGH" || riskLevel === "CRITICAL"
                  ? "text-red-400"
                  : "text-muted-foreground/50",
              )}
            >
              High
            </span>
          </div>

          {/* Score display */}
          <div
            className={cn(
              "text-right mt-2 font-mono text-lg font-bold",
              riskConfig.color,
            )}
          >
            {riskScore}/100
          </div>
        </div>

        {/* Compliance Items */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Compliance Status
          </span>
          <div className="space-y-1.5">
            {items.map((item) => {
              const statusConfig = getStatusConfig(item.status);
              const Icon = item.icon;

              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/10 border border-border/20 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", statusConfig.color)} />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase",
                      statusConfig.color,
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Recent Alerts
            </span>
            <div className="space-y-1.5">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-md border",
                    alert.severity === "HIGH" || alert.severity === "CRITICAL"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-amber-500/10 border-amber-500/30",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      alert.severity === "HIGH" || alert.severity === "CRITICAL"
                        ? "text-red-400"
                        : "text-amber-400",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{alert.message}</p>
                    <span className="text-[10px] text-muted-foreground/60">
                      {alert.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
