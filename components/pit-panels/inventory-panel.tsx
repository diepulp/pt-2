"use client";

import { Package, RefreshCw, Calculator } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BankSummary } from "./bank-summary";
import { ChipCountsDisplay } from "./chip-counts-display";
import { DropEventsDisplay } from "./drop-events-display";
import { FillSlipsDisplay } from "./fill-slips-display";

interface InventoryPanelProps {
  tableName: string;
}

// Static mock data for UI review
const MOCK_CHIP_COUNTS = [
  { denomination: 5, quantity: 2400, value: 12000, variance: 2.1 },
  { denomination: 25, quantity: 800, value: 20000, variance: -1.5 },
  { denomination: 100, quantity: 150, value: 15000, variance: 0.8 },
  { denomination: 500, quantity: 20, value: 10000, variance: 0 },
];

const MOCK_DROP_EVENTS = [
  {
    id: "1",
    amount: 15750,
    scheduledAt: "2:30 PM",
    status: "scheduled" as const,
  },
  {
    id: "2",
    amount: 12300,
    scheduledAt: "12:00 PM",
    actualPulledAt: "12:05 PM",
    variance: 150,
    status: "completed" as const,
  },
  {
    id: "3",
    amount: 8500,
    scheduledAt: "10:00 AM",
    status: "overdue" as const,
  },
];

const MOCK_FILL_SLIPS = [
  {
    id: "001",
    denominations: [
      { denom: 25, qty: 40 },
      { denom: 100, qty: 10 },
    ],
    createdAt: "1:45 PM",
    status: "pending" as const,
    createdBy: "Sarah M.",
  },
  {
    id: "002",
    denominations: [
      { denom: 5, qty: 100 },
      { denom: 25, qty: 20 },
    ],
    createdAt: "11:30 AM",
    status: "approved" as const,
    createdBy: "Mike T.",
    approvedBy: "John D.",
  },
  {
    id: "003",
    denominations: [
      { denom: 100, qty: 15 },
      { denom: 500, qty: 5 },
    ],
    createdAt: "9:15 AM",
    status: "completed" as const,
    createdBy: "Lisa R.",
    approvedBy: "John D.",
  },
];

/**
 * Inventory Panel - Main inventory management interface
 * Static UI for review, no logic implemented
 */
export function InventoryPanel({ tableName }: InventoryPanelProps) {
  const totalBankValue = MOCK_CHIP_COUNTS.reduce(
    (sum, chip) => sum + chip.value,
    0,
  );
  const totalChips = MOCK_CHIP_COUNTS.reduce(
    (sum, chip) => sum + chip.quantity,
    0,
  );
  const totalVariance =
    MOCK_CHIP_COUNTS.reduce((sum, chip) => sum + (chip.variance || 0), 0) /
    MOCK_CHIP_COUNTS.length;

  return (
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
              {tableName} • Last updated: 2:15:32 PM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-muted-foreground">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
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
            variance={totalVariance}
          />

          {/* Tabs for different inventory views */}
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
              <ChipCountsDisplay chips={MOCK_CHIP_COUNTS} />
            </TabsContent>

            <TabsContent value="drops" className="space-y-4">
              <DropEventsDisplay events={MOCK_DROP_EVENTS} />
            </TabsContent>

            <TabsContent value="fills" className="space-y-4">
              <FillSlipsDisplay slips={MOCK_FILL_SLIPS} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
