"use client";

/**
 * MTL Compliance Dashboard Component
 * Phase 6 Wave 3 Track 2: MTL UI Implementation
 *
 * Features:
 * - Display recent MTL transactions (Table component)
 * - CTR alert indicators (Badge component)
 * - Transaction history with filters (date range, player, type)
 * - Player lookup integration
 * - Export functionality (CSV download)
 * - WCAG 2.1 AA compliant
 *
 * CRITICAL: Read-only display of MTL data
 * Does NOT mutate loyalty tables
 */

import { Download, Filter, AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/types/database.types";

// Type aliases
type MtlDirection = Database["public"]["Enums"]["MtlDirection"];
type MtlArea = Database["public"]["Enums"]["MtlArea"];

// CTR Threshold
const CTR_THRESHOLD = 10000;

// Mock data type
interface MtlTransaction {
  id: number;
  eventTime: string;
  direction: MtlDirection;
  area: MtlArea;
  amount: number;
  patronId: string | null;
  personName: string | null;
  gamingDay: string;
  tableNumber: string | null;
  notes: string | null;
}

export interface MtlComplianceDashboardProps {
  casinoId: string;
}

/**
 * Loading skeleton for dashboard
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Export transactions to CSV
 */
function exportToCSV(transactions: MtlTransaction[]) {
  const headers = [
    "ID",
    "Event Time",
    "Direction",
    "Area",
    "Amount",
    "Patron ID",
    "Person Name",
    "Gaming Day",
    "Table Number",
    "Notes",
  ];

  const rows = transactions.map((tx) => [
    tx.id,
    tx.eventTime,
    tx.direction,
    tx.area,
    tx.amount,
    tx.patronId ?? "",
    tx.personName ?? "",
    tx.gamingDay,
    tx.tableNumber ?? "",
    tx.notes ?? "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `mtl-transactions-${new Date().toISOString()}.csv`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * MTL Compliance Dashboard
 */
export function MtlComplianceDashboard({
  casinoId,
}: MtlComplianceDashboardProps) {
  const [isLoading] = useState(false);
  const [filterDirection, setFilterDirection] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterPlayerSearch, setFilterPlayerSearch] = useState<string>("");

  // TODO: Replace with real data fetching using React Query
  // const { data: transactions, isLoading, error } = useMtlTransactions({
  //   casinoId,
  //   direction: filterDirection !== 'all' ? filterDirection : undefined,
  //   dateFrom: filterDateFrom,
  //   dateTo: filterDateTo,
  //   playerSearch: filterPlayerSearch,
  // });

  // Mock data for demonstration
  const mockTransactions: MtlTransaction[] = [
    {
      id: 1,
      eventTime: "2025-10-14T10:30:00Z",
      direction: "cash_in",
      area: "pit",
      amount: 12500,
      patronId: "player-123",
      personName: "John Doe",
      gamingDay: "2025-10-14",
      tableNumber: "BJ-12",
      notes: "High roller transaction",
    },
    {
      id: 2,
      eventTime: "2025-10-14T11:15:00Z",
      direction: "cash_out",
      area: "cage",
      amount: 8500,
      patronId: "player-456",
      personName: "Jane Smith",
      gamingDay: "2025-10-14",
      tableNumber: null,
      notes: null,
    },
  ];

  const transactions = mockTransactions;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Header with Export */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>MTL Compliance Dashboard</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(transactions)}
              aria-label="Export transactions to CSV"
            >
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Direction Filter */}
            <div className="space-y-2">
              <Label htmlFor="filter-direction">Direction</Label>
              <Select
                value={filterDirection}
                onValueChange={setFilterDirection}
              >
                <SelectTrigger id="filter-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="cash_in">Cash In</SelectItem>
                  <SelectItem value="cash_out">Cash Out</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <Label htmlFor="filter-date-from">Date From</Label>
              <Input
                id="filter-date-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label htmlFor="filter-date-to">Date To</Label>
              <Input
                id="filter-date-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>

            {/* Player Search */}
            <div className="space-y-2">
              <Label htmlFor="filter-player">Player Search</Label>
              <Input
                id="filter-player"
                type="text"
                placeholder="Name or ID"
                value={filterPlayerSearch}
                onChange={(e) => setFilterPlayerSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent Transactions ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <Alert>
              <AlertDescription>
                No transactions found matching the filters
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Event Time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Gaming Day</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">{tx.id}</TableCell>
                      <TableCell>
                        {new Date(tx.eventTime).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tx.direction === "cash_in" ? "default" : "secondary"
                          }
                        >
                          {tx.direction === "cash_in" ? "Cash In" : "Cash Out"}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{tx.area}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${tx.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {tx.personName ?? tx.patronId ?? "Unknown"}
                      </TableCell>
                      <TableCell>{tx.gamingDay}</TableCell>
                      <TableCell>{tx.tableNumber ?? "—"}</TableCell>
                      <TableCell>
                        {tx.amount >= CTR_THRESHOLD ? (
                          <Badge
                            variant="destructive"
                            className="flex items-center gap-1 w-fit"
                          >
                            <AlertTriangle
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            CTR
                          </Badge>
                        ) : (
                          <Badge variant="outline">Normal</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
