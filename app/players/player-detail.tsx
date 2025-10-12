"use client";

/**
 * PlayerDetail Component
 * Display all player information in a formatted view
 *
 * Features:
 * - Display all player information
 * - Loading and error states
 * - Action buttons (edit, delete)
 * - Formatted display
 *
 * Wave 3: Player Management UI Components
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { usePlayer } from "@/hooks/player/use-player";

export interface PlayerDetailProps {
  playerId: string;
  onEdit?: (playerId: string) => void;
  onDelete?: (playerId: string) => void;
  onBack?: () => void;
}

export function PlayerDetail({
  playerId,
  onEdit,
  onDelete,
  onBack,
}: PlayerDetailProps) {
  const { data: player, isLoading, error } = usePlayer(playerId);

  // Loading State
  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">
              Loading player details...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error State
  if (error) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">Failed to load player details</p>
            <p className="text-sm mt-1">{error.message}</p>
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
  if (!player) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Player Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The player you are looking for does not exist or has been deleted.
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

  // Success State - Display Player Details
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Player Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Basic Information Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              Basic Information
            </h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  First Name
                </dt>
                <dd className="mt-1 text-sm">{player.firstName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Last Name
                </dt>
                <dd className="mt-1 text-sm">{player.lastName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-muted-foreground">
                  Email
                </dt>
                <dd className="mt-1 text-sm">{player.email}</dd>
              </div>
            </dl>
          </div>

          {/* System Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 border-b pb-2">
              System Information
            </h3>
            <dl className="grid grid-cols-1 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Player ID
                </dt>
                <dd className="mt-1 text-sm font-mono text-xs break-all">
                  {player.id}
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
          {onEdit && (
            <Button
              variant="default"
              onClick={() => onEdit(player.id)}
              aria-label={`Edit ${player.firstName} ${player.lastName}`}
            >
              Edit Player
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              onClick={() => onDelete(player.id)}
              aria-label={`Delete ${player.firstName} ${player.lastName}`}
            >
              Delete Player
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
