"use client";

import { FileText, Plus, Clock, CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FillSlip {
  id: string;
  denominations: { denom: number; qty: number }[];
  createdAt: string;
  status: "pending" | "approved" | "completed";
  createdBy: string;
  approvedBy?: string;
}

interface FillSlipsDisplayProps {
  slips: FillSlip[];
}

/**
 * Fill slips document display
 * Shows pending, approved, and completed fill slips with denomination breakdown
 */
export function FillSlipsDisplay({ slips }: FillSlipsDisplayProps) {
  const getStatusConfig = (status: FillSlip["status"]) => {
    switch (status) {
      case "completed":
        return {
          icon: CheckCircle2,
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
        };
      case "approved":
        return {
          icon: CheckCircle2,
          bg: "bg-cyan-500/10",
          border: "border-cyan-500/30",
          text: "text-cyan-400",
        };
      default:
        return {
          icon: Clock,
          bg: "bg-amber-500/10",
          border: "border-amber-500/30",
          text: "text-amber-400",
        };
    }
  };

  // Color mapping for chip denominations
  const chipColors: Record<number, string> = {
    5: "bg-red-900/60 border-red-500/50 text-red-200",
    25: "bg-emerald-900/60 border-emerald-500/50 text-emerald-200",
    100: "bg-slate-700/60 border-slate-400/50 text-slate-200",
    500: "bg-violet-900/60 border-violet-500/50 text-violet-200",
    1000: "bg-amber-900/60 border-amber-500/50 text-amber-200",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Fill Slips
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-dashed border-accent/30 text-accent hover:bg-accent/10 hover:border-accent"
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Create Fill Slip
        </Button>
      </div>

      {/* Slips list */}
      <div className="space-y-3">
        {slips.map((slip) => {
          const statusConfig = getStatusConfig(slip.status);
          const StatusIcon = statusConfig.icon;

          return (
            <div
              key={slip.id}
              className={cn(
                "overflow-hidden rounded-lg",
                "border border-border/40",
                "bg-card/50 backdrop-blur-sm",
              )}
            >
              {/* Header row */}
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-mono font-medium text-foreground">
                      Fill Slip #{slip.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {slip.createdAt}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-xs capitalize",
                    statusConfig.bg,
                    statusConfig.border,
                    statusConfig.text,
                  )}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {slip.status}
                </Badge>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Author info */}
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">
                    <span className="text-muted-foreground/60">
                      Created by:
                    </span>{" "}
                    <span className="text-foreground">{slip.createdBy}</span>
                  </div>
                  {slip.approvedBy && (
                    <div className="text-muted-foreground">
                      <span className="text-muted-foreground/60">
                        Approved by:
                      </span>{" "}
                      <span className="text-foreground">{slip.approvedBy}</span>
                    </div>
                  )}
                </div>

                {/* Denominations */}
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Denominations
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slip.denominations.map((denom, index) => (
                      <div
                        key={index}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1",
                          "rounded-full border font-mono text-xs",
                          chipColors[denom.denom] || chipColors[100],
                        )}
                      >
                        <span>${denom.denom}</span>
                        <span className="opacity-60">×</span>
                        <span className="font-semibold">{denom.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions for pending */}
                {slip.status === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
