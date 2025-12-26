"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FormSectionStartTimeProps {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  handleStartTimeChange: (action: "add" | "subtract", minutes: number) => void;
  totalChange: number;
}

export function FormSectionStartTime({
  value,
  onChange,
  onReset,
  handleStartTimeChange,
  totalChange,
}: FormSectionStartTimeProps) {
  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="startTime" className="text-sm font-medium">
          Start Time
        </label>
        <Button onClick={onReset} variant="outline" size="sm">
          Reset
        </Button>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button
          onClick={() => handleStartTimeChange("subtract", 15)}
          variant="outline"
        >
          -15m
        </Button>
        <Input
          id="startTime"
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-lg text-center"
        />
        <Button
          onClick={() => handleStartTimeChange("add", 15)}
          variant="outline"
        >
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
