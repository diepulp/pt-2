"use client";

/**
 * PlayerForm Component
 * Create and edit form with validation using react-hook-form
 *
 * Features:
 * - Create and edit modes (based on playerId prop)
 * - Form validation with react-hook-form
 * - Required fields: email, firstName, lastName
 * - Loading states during submission
 * - Success/error handling
 * - Cancel button
 *
 * Wave 3: Player Management UI Components
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
import { useCreatePlayer } from "@/hooks/player/use-create-player";
import { usePlayer } from "@/hooks/player/use-player";
import { useUpdatePlayer } from "@/hooks/player/use-update-player";
import type { PlayerCreateDTO } from "@/services/player";

export interface PlayerFormProps {
  playerId?: string; // If provided, edit mode; otherwise create mode
  onSuccess?: (playerId: string) => void;
  onCancel?: () => void;
}

interface PlayerFormData {
  email: string;
  firstName: string;
  lastName: string;
}

export function PlayerForm({ playerId, onSuccess, onCancel }: PlayerFormProps) {
  const isEditMode = !!playerId;

  // Hooks
  const createPlayerMutation = useCreatePlayer();
  const updatePlayerMutation = useUpdatePlayer(playerId || "");
  const { data: existingPlayer, isLoading: isLoadingPlayer } =
    usePlayer(playerId);

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
  } = useForm<PlayerFormData>({
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  // Load existing player data in edit mode
  useEffect(() => {
    if (existingPlayer) {
      setValue("email", existingPlayer.email);
      setValue("firstName", existingPlayer.firstName);
      setValue("lastName", existingPlayer.lastName);
    }
  }, [existingPlayer, setValue]);

  // Handle form submission
  const onSubmit = async (data: PlayerFormData) => {
    const payload: PlayerCreateDTO = {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    };

    if (isEditMode) {
      updatePlayerMutation.mutate(payload, {
        onSuccess: (updatedPlayer) => {
          reset(data); // Reset form dirty state
          if (onSuccess) {
            onSuccess(updatedPlayer.id);
          }
        },
      });
    } else {
      createPlayerMutation.mutate(payload, {
        onSuccess: (newPlayer) => {
          reset(); // Clear form
          if (onSuccess) {
            onSuccess(newPlayer.id);
          }
        },
      });
    }
  };

  const mutation = isEditMode ? updatePlayerMutation : createPlayerMutation;
  const isSubmitting = mutation.isPending;
  const mutationError = mutation.error;
  const mutationSuccess = mutation.isSuccess;

  // Show loading state while fetching player data in edit mode
  if (isEditMode && isLoadingPlayer) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Loading player data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Player" : "Create Player"}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Success Message */}
        {mutationSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
            <p className="font-semibold">
              {isEditMode
                ? "Player updated successfully!"
                : "Player created successfully!"}
            </p>
          </div>
        )}

        {/* Error Message */}
        {mutationError && (
          <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">
              Error {isEditMode ? "updating" : "creating"} player
            </p>
            <p className="text-sm mt-1">{mutationError.message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Invalid email address",
                },
              })}
              placeholder="player@example.com"
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* First Name Field */}
          <div className="space-y-2">
            <Label htmlFor="firstName">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              type="text"
              {...register("firstName", {
                required: "First name is required",
                minLength: {
                  value: 1,
                  message: "First name must be at least 1 character",
                },
              })}
              placeholder="John"
              aria-invalid={errors.firstName ? "true" : "false"}
              aria-describedby={
                errors.firstName ? "firstName-error" : undefined
              }
            />
            {errors.firstName && (
              <p id="firstName-error" className="text-sm text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>

          {/* Last Name Field */}
          <div className="space-y-2">
            <Label htmlFor="lastName">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              type="text"
              {...register("lastName", {
                required: "Last name is required",
                minLength: {
                  value: 1,
                  message: "Last name must be at least 1 character",
                },
              })}
              placeholder="Doe"
              aria-invalid={errors.lastName ? "true" : "false"}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
            />
            {errors.lastName && (
              <p id="lastName-error" className="text-sm text-destructive">
                {errors.lastName.message}
              </p>
            )}
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
              ? "Update Player"
              : "Create Player"}
        </Button>
      </CardFooter>
    </Card>
  );
}
