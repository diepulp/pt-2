"use client";

import { Calendar } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function GamingDayIndicator() {
  // TODO: Replace with actual gaming day from CasinoService (TEMP-001)
  const today = new Date();
  const gamingDay = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-xs">
      <Calendar className="h-3 w-3" />
      <span>{gamingDay}</span>
    </Badge>
  );
}
