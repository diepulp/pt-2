"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStartTimeField } from "@/hooks/ui";

/**
 * Calculates the time difference in minutes between two datetime strings.
 *
 * @param current - Current datetime-local string (YYYY-MM-DDTHH:mm)
 * @param original - Original datetime-local string (YYYY-MM-DDTHH:mm)
 * @returns Time difference in minutes (positive if current is later, negative if earlier)
 */
function calculateTimeDifference(current: string, original: string): number {
  if (!current || !original) return 0;

  const currentDate = new Date(current);
  const originalDate = new Date(original);

  // Return difference in minutes
  return Math.round(
    (currentDate.getTime() - originalDate.getTime()) / (1000 * 60),
  );
}

export function FormSectionStartTime() {
  const { value, originalValue, updateField, resetField, adjustStartTime } =
    useStartTimeField();

  // Calculate time difference for display
  const totalChange = calculateTimeDifference(value, originalValue);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("startTime", e.target.value);
  };

  const handleReset = () => {
    resetField("startTime");
  };

  const handleAdjust = (action: "add" | "subtract", minutes: number) => {
    adjustStartTime(action, minutes);
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="startTime" className="text-sm font-medium">
          Start Time
        </label>
        <Button onClick={handleReset} variant="outline" size="sm">
          Reset
        </Button>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button onClick={() => handleAdjust("subtract", 15)} variant="outline">
          -15m
        </Button>
        <Input
          id="startTime"
          type="datetime-local"
          value={value}
          onChange={handleChange}
          className="h-12 text-lg text-center"
        />
        <Button onClick={() => handleAdjust("add", 15)} variant="outline">
          +15m
        </Button>
      </div>
      <div className="text-sm mt-1 text-muted-foreground">
        Total Change: {totalChange > 0 ? "+" : ""}
        {totalChange} minutes
      </div>
    </div>
  );
}
