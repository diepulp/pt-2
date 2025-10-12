"use client";

/**
 * VisitList Component
 * Displays all visits in a table with search/filter functionality
 *
 * Features:
 * - Real-time search with debouncing (300ms)
 * - Status and mode filters
 * - Auto-switching between list and search hooks
 * - Loading and error states
 * - Action buttons (view, edit, delete)
 * - Responsive design
 * - Status/mode badges with color coding
 *
 * Wave 3B: Visit Management UI Components
 */

import { useState, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/types/database.types";

// Mock data for development until hooks are available
const MOCK_VISITS = [
  {
    id: "1",
    player_id: "p1",
    casino_id: "c1",
    check_in_date: "2025-10-12T10:00:00Z",
    check_out_date: null,
    status: "ONGOING" as Database["public"]["Enums"]["VisitStatus"],
    mode: "RATED" as Database["public"]["Enums"]["VisitMode"],
    player: { firstName: "John", lastName: "Doe", email: "john@example.com" },
    casino: { name: "Casino Royale" },
  },
  {
    id: "2",
    player_id: "p2",
    casino_id: "c1",
    check_in_date: "2025-10-11T14:30:00Z",
    check_out_date: "2025-10-11T20:00:00Z",
    status: "COMPLETED" as Database["public"]["Enums"]["VisitStatus"],
    mode: "UNRATED" as Database["public"]["Enums"]["VisitMode"],
    player: { firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
    casino: { name: "Casino Royale" },
  },
];

type VisitStatus = Database["public"]["Enums"]["VisitStatus"];
type VisitMode = Database["public"]["Enums"]["VisitMode"];

export interface VisitListProps {
  onView?: (visitId: string) => void;
  onEdit?: (visitId: string) => void;
  onDelete?: (visitId: string) => void;
}

export function VisitList({ onView, onEdit, onDelete }: VisitListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "ALL">("ALL");
  const [modeFilter, setModeFilter] = useState<VisitMode | "ALL">("ALL");

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // TODO: Replace with real hooks when available
  // const shouldSearch = debouncedQuery.length >= 2;
  // const {
  //   data: searchResults,
  //   isLoading: isSearching,
  //   error: searchError,
  // } = useVisitSearch(debouncedQuery);
  // const {
  //   data: allVisits,
  //   isLoading: isLoadingAll,
  //   error: listError,
  // } = useVisits({ status: statusFilter !== 'ALL' ? statusFilter : undefined, mode: modeFilter !== 'ALL' ? modeFilter : undefined });

  // Mock data for now
  const shouldSearch = debouncedQuery.length >= 2;
  const visits = MOCK_VISITS;
  const isLoading = false;
  const error = null;

  // Apply client-side filtering for mock data
  const filteredVisits = visits.filter((visit) => {
    const matchesSearch =
      !shouldSearch ||
      visit.player.firstName
        .toLowerCase()
        .includes(debouncedQuery.toLowerCase()) ||
      visit.player.lastName
        .toLowerCase()
        .includes(debouncedQuery.toLowerCase()) ||
      visit.player.email.toLowerCase().includes(debouncedQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" || visit.status === statusFilter;
    const matchesMode = modeFilter === "ALL" || visit.mode === modeFilter;

    return matchesSearch && matchesStatus && matchesMode;
  });

  // Status badge styling
  const getStatusBadge = (status: VisitStatus) => {
    const variants: Record<
      VisitStatus,
      { variant: "default" | "secondary" | "destructive"; label: string }
    > = {
      ONGOING: { variant: "default", label: "Ongoing" },
      COMPLETED: { variant: "secondary", label: "Completed" },
      CANCELED: { variant: "destructive", label: "Canceled" },
    };
    const config = variants[status];
    return (
      <Badge variant={config.variant} className="font-medium">
        {config.label}
      </Badge>
    );
  };

  // Mode badge styling
  const getModeBadge = (mode: VisitMode) => {
    const variants: Record<VisitMode, { className: string; label: string }> = {
      RATED: {
        className: "bg-amber-100 text-amber-800 hover:bg-amber-200",
        label: "Rated",
      },
      UNRATED: {
        className: "bg-gray-100 text-gray-800 hover:bg-gray-200",
        label: "Unrated",
      },
    };
    const config = variants[mode];
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Visits</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters and Search */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by player name or email..."
                className="w-full"
              />
              {searchQuery.length > 0 && searchQuery.length < 2 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Type at least 2 characters to search
                </p>
              )}
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as VisitStatus | "ALL")
              }
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ONGOING">Ongoing</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>

            {/* Mode Filter */}
            <Select
              value={modeFilter}
              onValueChange={(value) =>
                setModeFilter(value as VisitMode | "ALL")
              }
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Modes</SelectItem>
                <SelectItem value="RATED">Rated</SelectItem>
                <SelectItem value="UNRATED">Unrated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading visits...</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">Error loading visits</p>
            <p className="text-sm mt-1">{(error as Error).message}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredVisits.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {shouldSearch ? (
              <p>No visits found matching &quot;{debouncedQuery}&quot;</p>
            ) : statusFilter !== "ALL" || modeFilter !== "ALL" ? (
              <p>No visits found matching the selected filters</p>
            ) : (
              <p>No visits found. Create your first visit to get started.</p>
            )}
          </div>
        )}

        {/* Visits Table */}
        {!isLoading && !error && filteredVisits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Player
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Casino
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Check In
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Check Out
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Mode
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-sm">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredVisits.map((visit) => (
                  <tr
                    key={visit.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm">
                      <div>
                        <div className="font-medium">
                          {visit.player.firstName} {visit.player.lastName}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {visit.player.email}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm">{visit.casino.name}</td>
                    <td className="py-3 px-4 text-sm">
                      {formatDate(visit.check_in_date)}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {visit.check_out_date ? (
                        formatDate(visit.check_out_date)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(visit.status)}
                    </td>
                    <td className="py-3 px-4">{getModeBadge(visit.mode)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onView && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(visit.id)}
                            aria-label={`View visit for ${visit.player.firstName} ${visit.player.lastName}`}
                          >
                            View
                          </Button>
                        )}
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(visit.id)}
                            aria-label={`Edit visit for ${visit.player.firstName} ${visit.player.lastName}`}
                          >
                            Edit
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(visit.id)}
                            aria-label={`Delete visit for ${visit.player.firstName} ${visit.player.lastName}`}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Results Count */}
        {!isLoading && !error && filteredVisits.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredVisits.length} visit
            {filteredVisits.length !== 1 ? "s" : ""}
            {shouldSearch && ` matching "${debouncedQuery}"`}
            {(statusFilter !== "ALL" || modeFilter !== "ALL") &&
              " with selected filters"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
