/**
 * Time Window Selector
 *
 * Shift time window selector with presets for shift dashboard.
 * Controls the time range for all dashboard queries.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.5
 */

"use client";

import { CalendarIcon, ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShiftTimeWindow } from "@/hooks/shift-dashboard";

export type TimeWindowPreset = "8h" | "12h" | "24h" | "current" | "custom";

export interface TimeWindowSelectorProps {
  value: ShiftTimeWindow;
  onChange: (window: ShiftTimeWindow) => void;
  className?: string;
}

/**
 * Calculate time window from preset.
 */
function getWindowFromPreset(preset: TimeWindowPreset): ShiftTimeWindow {
  const now = new Date();
  const end = now.toISOString();

  switch (preset) {
    case "8h": {
      const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
      return { start: start.toISOString(), end };
    }
    case "12h": {
      const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      return { start: start.toISOString(), end };
    }
    case "24h": {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end };
    }
    case "current": {
      // Default to 8 hours for current shift
      const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
      return { start: start.toISOString(), end };
    }
    default:
      return { start: end, end };
  }
}

/**
 * Format time window for display.
 */
function formatTimeWindow(window: ShiftTimeWindow): string {
  const start = new Date(window.start);
  const end = new Date(window.end);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Same day
  if (start.toDateString() === end.toDateString()) {
    return `${formatDate(start)} ${formatTime(start)} - ${formatTime(end)}`;
  }

  return `${formatDate(start)} ${formatTime(start)} - ${formatDate(end)} ${formatTime(end)}`;
}

export function TimeWindowSelector({
  value,
  onChange,
  className,
}: TimeWindowSelectorProps) {
  const [preset, setPreset] = useState<TimeWindowPreset>("8h");

  // Defer locale-dependent formatting to client to avoid hydration mismatch
  const [formattedWindow, setFormattedWindow] = useState<string>("");

  useEffect(() => {
    setFormattedWindow(formatTimeWindow(value));
  }, [value]);

  const handlePresetChange = (newPreset: TimeWindowPreset) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      onChange(getWindowFromPreset(newPreset));
    }
  };

  const handleRefresh = () => {
    onChange(getWindowFromPreset(preset));
  };

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[160px]">
          <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select window" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current">Current Shift</SelectItem>
          <SelectItem value="8h">Last 8 hours</SelectItem>
          <SelectItem value="12h">Last 12 hours</SelectItem>
          <SelectItem value="24h">Last 24 hours</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <CalendarIcon className="h-4 w-4" />
        <span className="font-mono text-xs min-w-[180px]">
          {formattedWindow || "Loading..."}
        </span>
      </div>

      <Button variant="outline" size="sm" onClick={handleRefresh}>
        Refresh
      </Button>
    </div>
  );
}
