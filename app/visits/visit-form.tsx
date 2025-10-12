"use client";

/**
 * VisitForm Component
 * Create and edit form with validation using react-hook-form
 *
 * Features:
 * - Create and edit modes (based on visitId prop)
 * - Form validation with react-hook-form
 * - Required fields: playerId, casinoId, checkInDate
 * - Optional fields: checkOutDate, status, mode
 * - Player selector (dropdown)
 * - Casino selector (dropdown)
 * - Date/time pickers
 * - isDirty tracking - disable submit if no changes in edit mode
 * - Success/error handling
 * - Cancel button
 *
 * Wave 3B: Visit Management UI Components
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/types/database.types";

// Mock data until hooks are available
const MOCK_PLAYERS = [
  { id: "p1", firstName: "John", lastName: "Doe", email: "john@example.com" },
  { id: "p2", firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
];

const MOCK_CASINOS = [
  { id: "c1", name: "Casino Royale", location: "Las Vegas" },
  { id: "c2", name: "Grand Casino", location: "Monaco" },
];

type VisitStatus = Database["public"]["Enums"]["VisitStatus"];
type VisitMode = Database["public"]["Enums"]["VisitMode"];

export interface VisitFormProps {
  visitId?: string; // If provided, edit mode; otherwise create mode
  onSuccess?: (visitId: string) => void;
  onCancel?: () => void;
}

interface VisitFormData {
  playerId: string;
  casinoId: string;
  checkInDate: string;
  checkOutDate?: string;
  status: VisitStatus;
  mode: VisitMode;
}

export function VisitForm({ visitId, onSuccess, onCancel }: VisitFormProps) {
  const isEditMode = !!visitId;

  // TODO: Replace with real hooks when available
  // const createVisitMutation = useCreateVisit();
  // const updateVisitMutation = useUpdateVisit(visitId || "");
  // const { data: existingVisit, isLoading: isLoadingVisit } = useVisit(visitId);
  // const { data: players } = usePlayers();
  // const { data: casinos } = useCasinos();

  // Mock hooks for now
  const createVisitMutation = {
    mutate: (
      data: VisitFormData,
      options: { onSuccess: (result: { id: string }) => void },
    ) => {
      // Mock implementation - will be replaced with real hook
      setTimeout(() => options.onSuccess({ id: "new-visit-id" }), 500);
    },
    isPending: false,
    error: null,
    isSuccess: false,
  };

  const updateVisitMutation = {
    mutate: (
      data: VisitFormData,
      options: { onSuccess: (result: { id: string }) => void },
    ) => {
      // Mock implementation - will be replaced with real hook
      setTimeout(() => options.onSuccess({ id: visitId || "" }), 500);
    },
    isPending: false,
    error: null,
    isSuccess: false,
  };

  const isLoadingVisit = false;
  const players = MOCK_PLAYERS;
  const casinos = MOCK_CASINOS;

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
    watch,
  } = useForm<VisitFormData>({
    defaultValues: {
      playerId: "",
      casinoId: "",
      checkInDate: "",
      checkOutDate: "",
      status: "ONGOING",
      mode: "RATED",
    },
  });

  // Watch form values for controlled selects
  const watchedStatus = watch("status");
  const watchedMode = watch("mode");

  // Load existing visit data in edit mode
  useEffect(() => {
    if (isEditMode && visitId) {
      // In real implementation, this would use the hook data
      // For now, using mock data
      const mockVisit = {
        player_id: "p1",
        casino_id: "c1",
        check_in_date: "2025-10-12T10:00",
        check_out_date: null as string | null,
        status: "ONGOING" as VisitStatus,
        mode: "RATED" as VisitMode,
      };

      setValue("playerId", mockVisit.player_id);
      setValue("casinoId", mockVisit.casino_id);
      setValue("checkInDate", mockVisit.check_in_date.slice(0, 16));
      if (mockVisit.check_out_date) {
        setValue("checkOutDate", mockVisit.check_out_date.slice(0, 16));
      }
      setValue("status", mockVisit.status);
      setValue("mode", mockVisit.mode);
    }
  }, [isEditMode, visitId, setValue]);

  // Handle form submission
  const onSubmit = async (data: VisitFormData) => {
    const payload = {
      playerId: data.playerId,
      casinoId: data.casinoId,
      checkInDate: new Date(data.checkInDate).toISOString(),
      ...(data.checkOutDate && {
        checkOutDate: new Date(data.checkOutDate).toISOString(),
      }),
      status: data.status,
      mode: data.mode,
    };

    if (isEditMode) {
      updateVisitMutation.mutate(payload, {
        onSuccess: (updatedVisit: { id: string }) => {
          reset(data); // Reset form dirty state
          if (onSuccess) {
            onSuccess(updatedVisit.id);
          }
        },
      });
    } else {
      createVisitMutation.mutate(payload, {
        onSuccess: (newVisit: { id: string }) => {
          reset(); // Clear form
          if (onSuccess) {
            onSuccess(newVisit.id);
          }
        },
      });
    }
  };

  const mutation = isEditMode ? updateVisitMutation : createVisitMutation;
  const isSubmitting = mutation.isPending;
  const mutationError = mutation.error;
  const mutationSuccess = mutation.isSuccess;

  // Show loading state while fetching visit data in edit mode
  if (isEditMode && isLoadingVisit) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Loading visit data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Visit" : "Create Visit"}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Success Message */}
        {mutationSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
            <p className="font-semibold">
              {isEditMode
                ? "Visit updated successfully!"
                : "Visit created successfully!"}
            </p>
          </div>
        )}

        {/* Error Message */}
        {mutationError && (
          <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">
              Error {isEditMode ? "updating" : "creating"} visit
            </p>
            <p className="text-sm mt-1">{(mutationError as Error).message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Player Selector */}
          <div className="space-y-2">
            <Label htmlFor="playerId">
              Player <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("playerId")}
              onValueChange={(value) =>
                setValue("playerId", value, { shouldDirty: true })
              }
            >
              <SelectTrigger id="playerId">
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {players.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.firstName} {player.lastName} ({player.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.playerId && (
              <p className="text-sm text-destructive">
                {errors.playerId.message}
              </p>
            )}
          </div>

          {/* Casino Selector */}
          <div className="space-y-2">
            <Label htmlFor="casinoId">
              Casino <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("casinoId")}
              onValueChange={(value) =>
                setValue("casinoId", value, { shouldDirty: true })
              }
            >
              <SelectTrigger id="casinoId">
                <SelectValue placeholder="Select a casino" />
              </SelectTrigger>
              <SelectContent>
                {casinos.map((casino) => (
                  <SelectItem key={casino.id} value={casino.id}>
                    {casino.name} - {casino.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.casinoId && (
              <p className="text-sm text-destructive">
                {errors.casinoId.message}
              </p>
            )}
          </div>

          {/* Check In Date */}
          <div className="space-y-2">
            <Label htmlFor="checkInDate">
              Check In Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="checkInDate"
              type="datetime-local"
              {...register("checkInDate", {
                required: "Check in date is required",
              })}
              aria-invalid={errors.checkInDate ? "true" : "false"}
              aria-describedby={
                errors.checkInDate ? "checkInDate-error" : undefined
              }
            />
            {errors.checkInDate && (
              <p id="checkInDate-error" className="text-sm text-destructive">
                {errors.checkInDate.message}
              </p>
            )}
          </div>

          {/* Check Out Date (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="checkOutDate">Check Out Date (Optional)</Label>
            <Input
              id="checkOutDate"
              type="datetime-local"
              {...register("checkOutDate")}
              aria-describedby="checkOutDate-hint"
            />
            <p id="checkOutDate-hint" className="text-sm text-muted-foreground">
              Leave blank if visit is ongoing
            </p>
          </div>

          {/* Status Selector */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watchedStatus}
              onValueChange={(value) =>
                setValue("status", value as VisitStatus, { shouldDirty: true })
              }
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONGOING">Ongoing</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <Label htmlFor="mode">Mode</Label>
            <Select
              value={watchedMode}
              onValueChange={(value) =>
                setValue("mode", value as VisitMode, { shouldDirty: true })
              }
            >
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RATED">Rated</SelectItem>
                <SelectItem value="UNRATED">Unrated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting || (isEditMode && !isDirty)}
        >
          {isSubmitting
            ? isEditMode
              ? "Updating..."
              : "Creating..."
            : isEditMode
              ? "Update Visit"
              : "Create Visit"}
        </Button>
      </CardFooter>
    </Card>
  );
}
