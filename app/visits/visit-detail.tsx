"use client";

/**
 * VisitDetail Component
 * Display all visit information in a formatted view
 *
 * Features:
 * - Display all visit information
 * - Player info section (with link to player detail)
 * - Casino info section
 * - Visit timeline (check-in, check-out, duration)
 * - Status and mode badges
 * - Related records section (rating slips, rewards)
 * - Loading/error/not-found states
 * - Action buttons (edit, delete, end visit)
 * - Back to List navigation
 *
 * Wave 3B: Visit Management UI Components
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import type { Database } from "@/types/database.types";

type VisitStatus = Database["public"]["Enums"]["VisitStatus"];
type VisitMode = Database["public"]["Enums"]["VisitMode"];

// Mock data until hooks are available
const MOCK_VISIT = {
  id: "1",
  player_id: "p1",
  casino_id: "c1",
  check_in_date: "2025-10-12T10:00:00Z",
  check_out_date: null,
  status: "ONGOING" as VisitStatus,
  mode: "RATED" as VisitMode,
  player: {
    id: "p1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
  },
  casino: {
    id: "c1",
    name: "Casino Royale",
    location: "Las Vegas",
  },
  ratingSlips: [
    { id: "rs1", average_bet: 50, points: 100 },
    { id: "rs2", average_bet: 75, points: 150 },
  ],
  rewards: [{ id: "rw1", name: "Free Meal", status: "ISSUED" }],
};

export interface VisitDetailProps {
  visitId: string;
  onEdit?: (visitId: string) => void;
  onDelete?: (visitId: string) => void;
  onEndVisit?: (visitId: string) => void;
  onViewPlayer?: (playerId: string) => void;
  onBack?: () => void;
}

export function VisitDetail({
  visitId,
  onEdit,
  onDelete,
  onEndVisit,
  onViewPlayer,
  onBack,
}: VisitDetailProps) {
  // TODO: Replace with real hook when available
  // const { data: visit, isLoading, error } = useVisit(visitId);

  // Mock data for now
  const visit = MOCK_VISIT;
  const isLoading = false;
  const error = null;

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
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  };

  // Calculate visit duration
  const calculateDuration = (
    checkIn: string,
    checkOut: string | null,
  ): string => {
    const start = new Date(checkIn);
    const end = checkOut ? new Date(checkOut) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Loading State
  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">
              Loading visit details...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error State
  if (error) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">Failed to load visit details</p>
            <p className="text-sm mt-1">{(error as Error).message}</p>
          </div>
        </CardContent>
        <CardFooter>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              Back to List
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  // Not Found State
  if (!visit) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Visit Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The visit you are looking for does not exist or has been deleted.
          </p>
        </CardContent>
        <CardFooter>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              Back to List
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  // Success State - Display Visit Details
  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Visit Details</CardTitle>
          <div className="flex gap-2">
            {getStatusBadge(visit.status)}
            {getModeBadge(visit.mode)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Player Information Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              Player Information
            </h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Name
                </dt>
                <dd className="mt-1 text-sm flex items-center gap-2">
                  {visit.player.firstName} {visit.player.lastName}
                  {onViewPlayer && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onViewPlayer(visit.player.id)}
                    >
                      View Profile
                    </Button>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Email
                </dt>
                <dd className="mt-1 text-sm">{visit.player.email}</dd>
              </div>
            </dl>
          </div>

          {/* Casino Information Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              Casino Information
            </h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Casino Name
                </dt>
                <dd className="mt-1 text-sm">{visit.casino.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Location
                </dt>
                <dd className="mt-1 text-sm">{visit.casino.location}</dd>
              </div>
            </dl>
          </div>

          {/* Visit Timeline Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              Visit Timeline
            </h3>
            <dl className="grid grid-cols-1 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Check In
                </dt>
                <dd className="mt-1 text-sm">
                  {formatDate(visit.check_in_date)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Check Out
                </dt>
                <dd className="mt-1 text-sm">
                  {visit.check_out_date ? (
                    formatDate(visit.check_out_date)
                  ) : (
                    <span className="text-muted-foreground italic">
                      Still ongoing
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Duration
                </dt>
                <dd className="mt-1 text-sm">
                  {calculateDuration(visit.check_in_date, visit.check_out_date)}
                  {!visit.check_out_date && (
                    <span className="text-muted-foreground"> (ongoing)</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Related Records Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              Related Records
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Rating Slips */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground mb-2">
                  Rating Slips
                </dt>
                <dd className="mt-1 text-sm">
                  {visit.ratingSlips.length > 0 ? (
                    <ul className="space-y-1">
                      {visit.ratingSlips.map((slip) => (
                        <li
                          key={slip.id}
                          className="text-sm bg-muted/50 rounded px-2 py-1"
                        >
                          Avg Bet: ${slip.average_bet} - Points: {slip.points}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">
                      No rating slips
                    </span>
                  )}
                </dd>
              </div>

              {/* Rewards */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground mb-2">
                  Rewards
                </dt>
                <dd className="mt-1 text-sm">
                  {visit.rewards.length > 0 ? (
                    <ul className="space-y-1">
                      {visit.rewards.map((reward) => (
                        <li
                          key={reward.id}
                          className="text-sm bg-muted/50 rounded px-2 py-1"
                        >
                          {reward.name} - {reward.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No rewards</span>
                  )}
                </dd>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              System Information
            </h3>
            <dl className="grid grid-cols-1 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Visit ID
                </dt>
                <dd className="mt-1 text-sm font-mono text-xs break-all">
                  {visit.id}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              Back to List
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {onEndVisit && visit.status === "ONGOING" && (
            <Button
              variant="secondary"
              onClick={() => onEndVisit(visit.id)}
              aria-label="End visit"
            >
              End Visit
            </Button>
          )}
          {onEdit && (
            <Button
              variant="default"
              onClick={() => onEdit(visit.id)}
              aria-label="Edit visit"
            >
              Edit Visit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              onClick={() => onDelete(visit.id)}
              aria-label="Delete visit"
            >
              Delete Visit
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
