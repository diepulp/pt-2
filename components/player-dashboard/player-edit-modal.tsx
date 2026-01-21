"use client";

import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePlayer,
  useUpdatePlayer,
  usePlayerIdentity,
  useUpdatePlayerIdentity,
} from "@/hooks/player";
import type {
  UpdatePlayerDTO,
  PlayerIdentityInput,
  IdentityAddress,
} from "@/services/player/dtos";

import { PlayerEditForm, type PlayerEditFormValues } from "./player-edit-form";

interface PlayerEditModalProps {
  playerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerEditModal({
  playerId,
  open,
  onOpenChange,
}: PlayerEditModalProps) {
  const { data: player, isLoading: playerLoading } = usePlayer(playerId);
  const { data: identity, isLoading: identityLoading } =
    usePlayerIdentity(playerId);

  const updatePlayer = useUpdatePlayer();
  const updateIdentity = useUpdatePlayerIdentity();

  const isLoading = playerLoading || identityLoading;
  const isSubmitting = updatePlayer.isPending || updateIdentity.isPending;

  const handleSubmit = async (
    values: PlayerEditFormValues,
    dirtyFields: Partial<Record<keyof PlayerEditFormValues, boolean>>,
  ) => {
    const playerFields: (keyof UpdatePlayerDTO)[] = [
      "first_name",
      "last_name",
      "birth_date",
      "middle_name",
      "email",
      "phone_number",
    ];
    const addressFields: (keyof PlayerEditFormValues)[] = [
      "address_street",
      "address_city",
      "address_state",
      "address_postal_code",
    ];

    const hasPlayerChanges = playerFields.some((f) => dirtyFields[f]);
    const hasAddressChanges = addressFields.some((f) => dirtyFields[f]);

    try {
      const promises: Promise<unknown>[] = [];

      if (hasPlayerChanges) {
        const playerUpdate: UpdatePlayerDTO = {};
        for (const field of playerFields) {
          if (dirtyFields[field]) {
            const value = values[field];
            (playerUpdate as Record<string, unknown>)[field] =
              value === "" ? null : value;
          }
        }
        promises.push(
          updatePlayer.mutateAsync({ playerId, input: playerUpdate }),
        );
      }

      if (hasAddressChanges) {
        const address: IdentityAddress = {
          street: values.address_street || undefined,
          city: values.address_city || undefined,
          state: values.address_state || undefined,
          postalCode: values.address_postal_code || undefined,
        };
        const identityUpdate: PlayerIdentityInput = { address };
        promises.push(
          updateIdentity.mutateAsync({ playerId, input: identityUpdate }),
        );
      }

      await Promise.all(promises);
      toast.success("Player profile updated successfully");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";
      toast.error(message);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!player || isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Player Profile</DialogTitle>
            <DialogDescription>Loading player data...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Player Profile</DialogTitle>
          <DialogDescription>
            Update personal information, contact details, and address for{" "}
            {player.first_name} {player.last_name}.
          </DialogDescription>
        </DialogHeader>
        <PlayerEditForm
          player={player}
          identity={identity}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
