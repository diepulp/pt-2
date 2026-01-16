/**
 * MTL Compliance Dashboard Component
 *
 * Main dashboard for AML/CTR compliance tracking.
 * Shows Gaming Day Summary with drilldown to entry details.
 *
 * Layout:
 * - Header with date selector and stats
 * - Main: Gaming Day Summary table (COMPLIANCE AUTHORITY)
 * - Side Panel: Entry list for selected patron (drilldown)
 * - Detail: Entry detail with audit notes
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

"use client";

import { format, subDays, addDays } from "date-fns";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useGamingDaySummary } from "@/hooks/mtl/use-gaming-day-summary";
import { cn } from "@/lib/utils";
import type { MtlGamingDaySummaryDTO, MtlEntryDTO } from "@/services/mtl/dtos";

import { EntryDetail } from "./entry-detail";
import { EntryList } from "./entry-list";
import { GamingDaySummary } from "./gaming-day-summary";
import { MtlEntryForm } from "./mtl-entry-form";

export interface ComplianceDashboardProps {
  /** Casino ID */
  casinoId: string;
  /** Staff ID for audit note attribution */
  staffId?: string;
  /** Can add audit notes (pit_boss/admin) */
  canAddNotes?: boolean;
  className?: string;
}

/**
 * Compliance Dashboard
 *
 * @example
 * <ComplianceDashboard
 *   casinoId={casinoId}
 *   staffId={staffId}
 *   canAddNotes
 * />
 */
export function ComplianceDashboard({
  casinoId,
  staffId,
  canAddNotes = false,
  className,
}: ComplianceDashboardProps) {
  // Date state - default to today
  const [gamingDay, setGamingDay] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  // Drilldown state
  const [selectedPatron, setSelectedPatron] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // New Entry dialog state
  const [newEntryDialogOpen, setNewEntryDialogOpen] = useState(false);

  // Fetch summary data for stats
  const { data: summaryData } = useGamingDaySummary({
    casinoId,
    gamingDay,
  });

  // Calculate stats from summary data
  const stats = useMemo(() => {
    const items = summaryData?.items ?? [];
    const ctrInCount = items.filter(
      (s) => s.agg_badge_in === "agg_ctr_met",
    ).length;
    const ctrOutCount = items.filter(
      (s) => s.agg_badge_out === "agg_ctr_met",
    ).length;
    const totalPatrons = items.length;
    const totalVolume = items.reduce((sum, s) => sum + s.total_volume, 0);

    return {
      ctrInCount,
      ctrOutCount,
      totalCtr: ctrInCount + ctrOutCount,
      totalPatrons,
      totalVolume,
    };
  }, [summaryData]);

  // Navigation handlers
  const goToPreviousDay = () => {
    setGamingDay((d) => format(subDays(new Date(d), 1), "yyyy-MM-dd"));
    setSelectedPatron(null);
    setSelectedEntryId(null);
  };

  const goToNextDay = () => {
    setGamingDay((d) => format(addDays(new Date(d), 1), "yyyy-MM-dd"));
    setSelectedPatron(null);
    setSelectedEntryId(null);
  };

  const goToToday = () => {
    setGamingDay(format(new Date(), "yyyy-MM-dd"));
    setSelectedPatron(null);
    setSelectedEntryId(null);
  };

  // Drilldown handlers
  const handlePatronClick = (summary: MtlGamingDaySummaryDTO) => {
    setSelectedPatron(summary.patron_uuid);
    setSelectedEntryId(null);
  };

  const handleEntryClick = (entry: MtlEntryDTO) => {
    setSelectedEntryId(entry.id);
  };

  const handleClosePatron = () => {
    setSelectedPatron(null);
    setSelectedEntryId(null);
  };

  const handleCloseEntry = () => {
    setSelectedEntryId(null);
  };

  const isToday = gamingDay === format(new Date(), "yyyy-MM-dd");

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Compliance Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AML/CTR Transaction Monitoring (31 CFR § 1021.311)
          </p>
        </div>

        {/* Date Navigation + New Entry */}
        <div className="flex items-center gap-4">
          {/* New Entry Button (only for authorized users) */}
          {staffId && canAddNotes && (
            <Dialog
              open={newEntryDialogOpen}
              onOpenChange={setNewEntryDialogOpen}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create MTL Entry</DialogTitle>
                  <DialogDescription>
                    Manually record a Multiple Transaction Log entry for
                    compliance tracking.
                  </DialogDescription>
                </DialogHeader>
                <MtlEntryForm
                  casinoId={casinoId}
                  staffId={staffId}
                  gamingDay={gamingDay}
                  onSuccess={() => {
                    setNewEntryDialogOpen(false);
                  }}
                  onCancel={() => setNewEntryDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm">{gamingDay}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={goToNextDay}
              disabled={isToday}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="CTR Thresholds Met"
          value={stats.totalCtr}
          description={`${stats.ctrInCount} cash-in, ${stats.ctrOutCount} cash-out`}
          variant={stats.totalCtr > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Patrons Tracked"
          value={stats.totalPatrons}
          description="With transactions today"
        />
        <StatCard
          title="Total Volume"
          value={`$${(stats.totalVolume / 1000).toFixed(0)}K`}
          description="Combined in/out"
        />
        <StatCard
          title="Gaming Day"
          value={format(new Date(gamingDay), "EEE")}
          description={format(new Date(gamingDay), "MMM d, yyyy")}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-4">
        {/* Gaming Day Summary (Primary View) */}
        <div
          className={cn(
            "transition-all duration-200",
            selectedPatron ? "col-span-6" : "col-span-12",
          )}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Gaming Day Summary</CardTitle>
              <CardDescription>
                COMPLIANCE AUTHORITY - Per-patron daily aggregates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GamingDaySummary
                casinoId={casinoId}
                gamingDay={gamingDay}
                onPatronClick={handlePatronClick}
              />
            </CardContent>
          </Card>
        </div>

        {/* Patron Drilldown Panel */}
        {selectedPatron && (
          <div
            className={cn(
              "col-span-6 transition-all duration-200",
              selectedEntryId ? "col-span-3" : "col-span-6",
            )}
          >
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Patron Entries</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {selectedPatron.slice(0, 8)}...
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClosePatron}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <EntryList
                  casinoId={casinoId}
                  patronId={selectedPatron}
                  gamingDay={gamingDay}
                  onEntryClick={handleEntryClick}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Entry Detail Panel */}
        {selectedEntryId && (
          <div className="col-span-3">
            <div className="sticky top-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  Entry Detail
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseEntry}
                  className="h-6 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <EntryDetail
                entryId={selectedEntryId}
                canAddNotes={canAddNotes}
                staffId={staffId}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stats card component
 */
function StatCard({
  title,
  value,
  description,
  variant = "default",
}: {
  title: string;
  value: string | number;
  description: string;
  variant?: "default" | "danger";
}) {
  return (
    <Card
      className={cn(
        variant === "danger" &&
          Number(value) > 0 &&
          "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-mono",
            variant === "danger" &&
              Number(value) > 0 &&
              "text-red-600 dark:text-red-400",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
