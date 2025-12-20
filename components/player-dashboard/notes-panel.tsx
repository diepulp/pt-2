"use client";

import { FileText } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { UnderDevelopmentIndicator } from "./under-development-indicator";

interface NotesPanelProps {
  playerId: string | null;
  className?: string;
}

export function NotesPanel({ playerId, className }: NotesPanelProps) {
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
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Notes unavailable
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">Player Notes</h3>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        <UnderDevelopmentIndicator
          feature="Player Notes"
          description="Staff notes, preferences, and important player information"
          variant="inline"
        />
      </div>
    </div>
  );
}
