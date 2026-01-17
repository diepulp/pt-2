"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Package, RefreshCw, Calculator, Loader2 } from "lucide-react";
import * as React from "react";

import { ChipCountCaptureDialog } from "@/components/table/chip-count-capture-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDropEvents,
  type TableDropEventDTO,
} from "@/hooks/table-context/use-drop-events";
import {
  calculateChipsetTotal,
  STANDARD_DENOMINATIONS,
  useInventorySnapshots,
  type TableInventorySnapshotDTO,
} from "@/hooks/table-context/use-inventory-snapshots";
import { tableContextKeys } from "@/services/table-context/keys";

import { BankSummary } from "./bank-summary";
import { ChipCountsDisplay } from "./chip-counts-display";
import { DropEventsDisplay } from "./drop-events-display";
import { FillSlipsDisplay } from "./fill-slips-display";

interface InventoryPanelProps {
  tableName: string;
  tableId: string;
  casinoId: string;
  gamingDay?: string;
}

// Transform snapshot chipset to chip counts format for display
function transformSnapshotToChipCounts(
  snapshot: TableInventorySnapshotDTO | undefined,
): {
  denomination: number;
  quantity: number;
  value: number;
  variance?: number;
}[] {
  if (!snapshot) {
    return STANDARD_DENOMINATIONS.map((denom) => ({
      denomination: denom,
      quantity: 0,
      value: 0,
    }));
  }

  return STANDARD_DENOMINATIONS.map((denom) => {
    const quantity = snapshot.chipset[String(denom)] ?? 0;
    return {
      denomination: denom,
      quantity,
      value: quantity * denom,
    };
  });
}

// Transform drop events to display format
function transformDropEvents(events: TableDropEventDTO[]): {
  id: string;
  amount: number;
  scheduledAt: string;
  actualPulledAt?: string;
  status: "scheduled" | "completed" | "overdue";
}[] {
  return events.map((event) => {
    const time = new Date(event.removed_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      id: event.id,
      amount: 0, // Drop events don't have amount in current schema
      scheduledAt: time,
      actualPulledAt: time,
      status: "completed" as const, // All logged drops are completed
    };
  });
}

// Empty fill slips for now (fill/credit workflows deferred)
const EMPTY_FILL_SLIPS: {
  id: string;
  denominations: { denom: number; qty: number }[];
  createdAt: string;
  status: "pending" | "approved" | "completed";
  createdBy: string;
  approvedBy?: string;
}[] = [];

/**
 * Inventory Panel - Main inventory management interface
 * Connected to live data via useInventorySnapshots and useDropEvents hooks.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS4
 */
export function InventoryPanel({
  tableName,
  tableId,
  casinoId,
  gamingDay,
}: InventoryPanelProps) {
  const queryClient = useQueryClient();

  // State for chip count dialog
  const [showChipCountDialog, setShowChipCountDialog] = React.useState(false);

  // Fetch real data
  const {
    data: inventorySnapshots = [],
    isLoading: isLoadingSnapshots,
    dataUpdatedAt: snapshotsUpdatedAt,
  } = useInventorySnapshots(tableId, casinoId);

  const { data: dropEvents = [], isLoading: isLoadingDrops } = useDropEvents(
    tableId,
    casinoId,
    gamingDay,
  );

  // Get the most recent snapshot for display
  const latestSnapshot = inventorySnapshots[0];
  const chipCounts = transformSnapshotToChipCounts(latestSnapshot);
  const dropEventsDisplay = transformDropEvents(dropEvents);

  // Compute totals from latest snapshot
  const totalBankValue = latestSnapshot
    ? calculateChipsetTotal(latestSnapshot.chipset)
    : 0;
  const totalChips = chipCounts.reduce((sum, chip) => sum + chip.quantity, 0);

  // Format last updated time
  const lastUpdated = snapshotsUpdatedAt
    ? new Date(snapshotsUpdatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Never";

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: tableContextKeys.inventoryHistory(tableId),
    });
    queryClient.invalidateQueries({
      queryKey: tableContextKeys.drops(tableId),
    });
  };

  const isLoading = isLoadingSnapshots || isLoadingDrops;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <Package className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Inventory Management
              </h2>
              <p className="text-sm text-muted-foreground">
                {tableName} • Last updated: {lastUpdated}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => setShowChipCountDialog(true)}
            >
              <Calculator className="h-4 w-4 mr-2" />
              Count Chips
            </Button>
          </div>
        </div>

        {/* Panel Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Bank Summary */}
            <BankSummary
              totalValue={totalBankValue}
              totalChips={totalChips}
              variance={0} // TODO: Compute variance from previous snapshot when available
            />

            {/* Empty State */}
            {!latestSnapshot && !isLoadingSnapshots && (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No inventory snapshots yet
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowChipCountDialog(true)}
                >
                  Take First Count
                </Button>
              </div>
            )}

            {/* Tabs for different inventory views */}
            {(latestSnapshot || isLoadingSnapshots) && (
              <Tabs defaultValue="chips" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 bg-muted/50">
                  <TabsTrigger
                    value="chips"
                    className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent"
                  >
                    Chip Counts
                  </TabsTrigger>
                  <TabsTrigger
                    value="drops"
                    className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent"
                  >
                    Drop Events
                  </TabsTrigger>
                  <TabsTrigger
                    value="fills"
                    className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent"
                  >
                    Fill Slips
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chips" className="space-y-4">
                  {isLoadingSnapshots ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ChipCountsDisplay chips={chipCounts} />
                  )}
                </TabsContent>

                <TabsContent value="drops" className="space-y-4">
                  {isLoadingDrops ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : dropEventsDisplay.length > 0 ? (
                    <DropEventsDisplay events={dropEventsDisplay} />
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No drop events for this gaming day
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="fills" className="space-y-4">
                  {EMPTY_FILL_SLIPS.length > 0 ? (
                    <FillSlipsDisplay slips={EMPTY_FILL_SLIPS} />
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Fill/credit workflows coming soon
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chip Count Dialog */}
      <ChipCountCaptureDialog
        open={showChipCountDialog}
        onOpenChange={setShowChipCountDialog}
        tableId={tableId}
        casinoId={casinoId}
        defaultSnapshotType="rundown"
      />
    </>
  );
}
