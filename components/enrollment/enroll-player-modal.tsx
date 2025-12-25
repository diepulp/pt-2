"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  IdCard,
  Loader2,
  Search,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  getErrorMessage,
  isFetchError,
  isValidationError,
  logError,
} from "@/lib/errors/error-utils";
import { cn } from "@/lib/utils";
import type {
  PlayerIdentityInput,
  PlayerSearchResultDTO,
} from "@/services/player/dtos";
import { searchPlayers } from "@/services/player/http";

import { IdentityForm } from "./identity-form";

interface EnrollPlayerModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback to close the modal */
  onOpenChange: (open: boolean) => void;
  /** Casino ID for enrollment */
  casinoId: string;
  /** Table ID context (optional, for future use) */
  tableId?: string;
}

type EnrollmentStep = "search" | "identity";

/**
 * Player Enrollment Modal
 *
 * Two-step enrollment flow:
 * 1. Search for existing player or create new
 * 2. Capture identity information from government-issued ID
 *
 * Design: Casino-grade brutalist aesthetic with industrial accents.
 *
 * @see ADR-022 Player Identity & Enrollment Architecture
 * @see EXEC-SPEC-022 Section 9 (UI Changes)
 */
export function EnrollPlayerModal({
  open,
  onOpenChange,
  casinoId,
  tableId,
}: EnrollPlayerModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [step, setStep] = React.useState<EnrollmentStep>("search");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedPlayer, setSelectedPlayer] =
    React.useState<PlayerSearchResultDTO | null>(null);
  const [identityData, setIdentityData] = React.useState<PlayerIdentityInput>(
    {},
  );
  const [error, setError] = React.useState<string | null>(null);

  // New player form state
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [newPlayerFirstName, setNewPlayerFirstName] = React.useState("");
  const [newPlayerLastName, setNewPlayerLastName] = React.useState("");

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("search");
      setSearchQuery("");
      setSelectedPlayer(null);
      setIdentityData({});
      setError(null);
      setIsCreatingNew(false);
      setNewPlayerFirstName("");
      setNewPlayerLastName("");
    }
  }, [open]);

  // Player search query
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ["players", "search", debouncedQuery],
    queryFn: () => searchPlayers(debouncedQuery, 10),
    enabled: debouncedQuery.length >= 2,
  });

  // Enrollment mutation
  const enrollMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      identity: PlayerIdentityInput;
    }) => {
      // TODO: Wire up to actual enrollment API
      // POST /api/v1/players/{playerId}/enroll
      const response = await fetch(`/api/v1/players/${data.playerId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          casinoId,
          identity: data.identity,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to enroll player");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      logError(err, { component: "EnrollPlayerModal", action: "enroll" });

      if (isFetchError(err) && err.code === "ALREADY_ENROLLED") {
        setError("This player is already enrolled at this casino.");
      } else if (isFetchError(err) && err.code === "DUPLICATE_DOCUMENT") {
        setError(
          "A player with this document number is already enrolled. Please verify the document.",
        );
      } else {
        setError(getErrorMessage(err));
      }
    },
  });

  // Create new player mutation
  const createPlayerMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      const response = await fetch("/api/v1/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: data.firstName,
          last_name: data.lastName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create player");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Convert to search result format and proceed to identity step
      setSelectedPlayer({
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        enrollment_status: "not_enrolled",
      });
      setIsCreatingNew(false);
      setStep("identity");
    },
    onError: (err: Error) => {
      logError(err, { component: "EnrollPlayerModal", action: "createPlayer" });
      setError(getErrorMessage(err));
    },
  });

  // Handle player selection
  const handleSelectPlayer = (player: PlayerSearchResultDTO) => {
    setSelectedPlayer(player);
    setSearchQuery("");
    setStep("identity");
  };

  // Handle create new player
  const handleCreateNewPlayer = () => {
    if (!newPlayerFirstName.trim() || !newPlayerLastName.trim()) {
      setError("Please enter first and last name");
      return;
    }
    setError(null);
    createPlayerMutation.mutate({
      firstName: newPlayerFirstName.trim(),
      lastName: newPlayerLastName.trim(),
    });
  };

  // Handle enrollment submission
  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlayer) {
      setError("No player selected");
      return;
    }

    // Validate required identity fields
    if (!identityData.documentNumber) {
      setError("Document number is required for enrollment");
      return;
    }

    if (!identityData.birthDate) {
      setError("Date of birth is required for enrollment");
      return;
    }

    enrollMutation.mutate({
      playerId: selectedPlayer.id,
      identity: identityData,
    });
  };

  // Handle back navigation
  const handleBack = () => {
    setStep("search");
    setSelectedPlayer(null);
    setIdentityData({});
    setError(null);
  };

  const isPending = enrollMutation.isPending || createPlayerMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header with step indicator */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                  step === "search"
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-accent/30 bg-accent/10 text-accent",
                )}
              >
                1
              </div>
              <div className="h-px w-6 bg-border" />
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                  step === "identity"
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                2
              </div>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <DialogTitle className="text-lg font-bold uppercase tracking-widest font-mono">
              {step === "search" ? "Find Player" : "Capture Identity"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {step === "search"
              ? "Search for an existing player or create a new one to enroll."
              : "Enter identity information from the player's government-issued ID."}
          </DialogDescription>
        </DialogHeader>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3 flex-shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Step content */}
        {step === "search" ? (
          <div className="space-y-4 flex-1">
            {/* Player search */}
            <div className="space-y-2">
              <Label
                htmlFor="player-search"
                className="text-xs font-bold uppercase tracking-widest font-mono"
              >
                Search Existing Players
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="player-search"
                  type="text"
                  placeholder="Search by name (min 2 characters)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoComplete="off"
                />

                {/* Search results */}
                {searchQuery.length >= 2 && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border-2 border-border bg-card shadow-lg">
                    {isSearching ? (
                      <div className="flex items-center justify-center gap-2 p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Searching...
                        </span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          No players found
                        </p>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setIsCreatingNew(true);
                            setNewPlayerFirstName(
                              searchQuery.split(" ")[0] || "",
                            );
                            setNewPlayerLastName(
                              searchQuery.split(" ").slice(1).join(" ") || "",
                            );
                          }}
                          className="mt-1 text-accent"
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Create new player
                        </Button>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto py-1">
                        {searchResults.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => handleSelectPlayer(player)}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                              "hover:bg-accent/10",
                              player.enrollment_status === "enrolled" &&
                                "opacity-60",
                            )}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {player.full_name}
                              </p>
                            </div>
                            {player.enrollment_status === "enrolled" ? (
                              <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                                Already Enrolled
                              </span>
                            ) : (
                              <span className="shrink-0 rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                                Available
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            {/* Create new player section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <Label className="text-xs font-bold uppercase tracking-widest font-mono">
                  Or Create New Player
                </Label>
              </div>

              {isCreatingNew ? (
                <div className="space-y-3 rounded-lg border-2 border-dashed border-accent/30 bg-accent/5 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-first-name" className="text-xs">
                        First Name
                      </Label>
                      <Input
                        id="new-first-name"
                        value={newPlayerFirstName}
                        onChange={(e) => setNewPlayerFirstName(e.target.value)}
                        placeholder="John"
                        disabled={createPlayerMutation.isPending}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-last-name" className="text-xs">
                        Last Name
                      </Label>
                      <Input
                        id="new-last-name"
                        value={newPlayerLastName}
                        onChange={(e) => setNewPlayerLastName(e.target.value)}
                        placeholder="Doe"
                        disabled={createPlayerMutation.isPending}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreatingNew(false)}
                      disabled={createPlayerMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateNewPlayer}
                      disabled={
                        createPlayerMutation.isPending ||
                        !newPlayerFirstName.trim() ||
                        !newPlayerLastName.trim()
                      }
                    >
                      {createPlayerMutation.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3 w-3" />
                          Create & Continue
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => setIsCreatingNew(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Create New Player
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleEnroll}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Selected player indicator */}
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 mb-4 flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
                <User className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{selectedPlayer?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  Enrolling at casino
                </p>
              </div>
              <IdCard className="h-5 w-5 text-accent" />
            </div>

            {/* Scrollable identity form */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <IdentityForm
                value={identityData}
                onChange={setIdentityData}
                disabled={isPending}
              />
            </ScrollArea>

            {/* Footer */}
            <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isPending}
              >
                Back
              </Button>
              <Button type="submit" disabled={isPending}>
                {enrollMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enrolling...
                  </>
                ) : (
                  <>
                    <IdCard className="h-4 w-4" />
                    Complete Enrollment
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Footer for search step */}
        {step === "search" && (
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
