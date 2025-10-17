"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Gift,
  Loader2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { completeRatingSlip } from "@/app/actions/ratingslip-actions";
import { Progress } from "@/components/landing-page/ui/progress";
import { ManualRewardDialog } from "@/components/loyalty/manual-reward-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import { toast } from "@/hooks/ui";
import type { ServiceError } from "@/services/shared/types";
type RatingSlipStatus = "OPEN" | "CLOSED";

type RatingSlipPlayer = {
  id: string;
  name: string;
  membershipId?: string | null;
  tier?: string | null;
};

type RatingSlipTable = {
  id: string;
  name: string;
  limit?: string | null;
  openSeats?: number | null;
};

type RatingSlipSnapshot = {
  id: string;
  status: RatingSlipStatus;
  player: RatingSlipPlayer;
  tableId: string | null;
  seatNumber: string | null;
  averageBet: number | null;
  cashIn: number | null;
  chipsTaken: number | null;
  startTime: string | null;
  currentPoints: number | null;
};

type RatingSlipFormDraft = {
  tableId: string;
  seatNumber: string;
  averageBet: string;
  cashIn: string;
  chipsTaken: string;
  startTime: string;
};

type RatingSlipModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RatingSlipSnapshot;
  tables: RatingSlipTable[];
  onSave?: (draft: RatingSlipFormDraft) => void;
  onMovePlayer?: (
    draft: Pick<RatingSlipFormDraft, "tableId" | "seatNumber">,
  ) => void;
  onCloseSession?: (draft: RatingSlipFormDraft) => void;
};

const ADJUST_INTERVALS = [5, 25, 100, 500, 1000];

const defaultDraft = (snapshot: RatingSlipSnapshot): RatingSlipFormDraft => ({
  tableId: snapshot.tableId ?? "",
  seatNumber: snapshot.seatNumber ?? "",
  averageBet: snapshot.averageBet?.toString() ?? "",
  cashIn: snapshot.cashIn?.toString() ?? "",
  chipsTaken: snapshot.chipsTaken?.toString() ?? "",
  startTime: snapshot.startTime ?? new Date().toISOString().slice(0, 16),
});

export function RatingSlipModal({
  open,
  onOpenChange,
  snapshot,
  tables,
  onSave,
  onMovePlayer,
  onCloseSession,
}: RatingSlipModalProps) {
  const queryClient = useQueryClient();
  const [showManualReward, setShowManualReward] = useState(false);

  const baselineDraft = useMemo(() => defaultDraft(snapshot), [snapshot]);
  const [draft, setDraft] = useState<RatingSlipFormDraft>(baselineDraft);

  useEffect(() => {
    if (open) {
      setDraft(baselineDraft);
    }
  }, [open, baselineDraft]);

  const {
    mutate: closeSlip,
    isPending: isClosing,
    data: completionResult,
    error: loyaltyError,
  } = useServiceMutation(completeRatingSlip, {
    onSuccess: (result) => {
      onCloseSession?.(draft);

      queryClient.invalidateQueries({ queryKey: ["rating-slip"] });
      queryClient.invalidateQueries({
        queryKey: ["loyalty", "player", snapshot.player.id],
      });

      toast({ title: "Session closed successfully" });
      toast({
        title: `Earned ${result.loyalty.pointsEarned} loyalty points!`,
      });

      if (
        result.loyalty.ledgerEntry.tier_after !==
        result.loyalty.ledgerEntry.tier_before
      ) {
        toast({
          title: `🎉 Tier upgraded to ${result.loyalty.tier}!`,
        });
      }

      setTimeout(() => onOpenChange(false), 2000);
    },
    onError: (error) => {
      const serviceError = (error as Error & { details?: ServiceError })
        .details;
      if (serviceError?.code === "PARTIAL_COMPLETION") {
        toast({
          title: "Error",
          description: `Session closed but loyalty processing failed. Contact support with ID: ${(serviceError as ServiceError & { metadata?: { correlationId?: string } }).metadata?.correlationId}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to close session",
          variant: "destructive",
        });
      }
    },
  });

  const updateDraft = <K extends keyof RatingSlipFormDraft>(
    key: K,
    value: RatingSlipFormDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const applyAdjustment = (
    key: "averageBet" | "cashIn" | "chipsTaken",
    delta: number,
  ) => {
    setDraft((prev) => {
      const nextValue = Math.max(0, Number(prev[key] || 0) + delta);
      return { ...prev, [key]: String(nextValue) };
    });
  };

  const handleStartTimeAdjust = (minutes: number) => {
    setDraft((prev) => {
      const current = prev.startTime ? new Date(prev.startTime) : new Date();
      const adjusted = new Date(current.getTime() + minutes * 60 * 1000);
      const iso = adjusted.toISOString().slice(0, 16);
      return { ...prev, startTime: iso };
    });
  };

  const handleCloseSession = () => {
    closeSlip(snapshot.id);
  };

  const statusVariant = snapshot.status === "OPEN" ? "secondary" : "outline";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-3 text-2xl font-semibold">
                <span>Rating Slip</span>
                <Badge
                  variant={statusVariant}
                  className="uppercase tracking-wide"
                >
                  {snapshot.status}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Review the session details and prepare for the upcoming
                service-layer integration.
              </DialogDescription>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <UserRound className="size-4" />
                {snapshot.player.name}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {snapshot.player.membershipId && (
                  <span>#{snapshot.player.membershipId}</span>
                )}
                {snapshot.player.tier && <span>{snapshot.player.tier}</span>}
              </div>
            </div>
          </div>
        </DialogHeader>

        <section className="grid gap-6 lg:grid-cols-2">
          <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
            <legend className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Coins className="size-4" />
              Chips & Timing
            </legend>
            <div className="space-y-2">
              <Label htmlFor="chipsTaken">Chips Taken</Label>
              <Input
                id="chipsTaken"
                type="number"
                inputMode="numeric"
                value={draft.chipsTaken}
                onChange={(event) =>
                  updateDraft("chipsTaken", event.target.value)
                }
                placeholder="0"
              />
              <QuickAdjustRow
                onAdjust={(delta) => applyAdjustment("chipsTaken", delta)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={draft.startTime}
                  onChange={(event) =>
                    updateDraft("startTime", event.target.value)
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => handleStartTimeAdjust(-15)}
                >
                  <Clock3 className="size-4" />
                  -15m
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => handleStartTimeAdjust(15)}
                >
                  <Clock3 className="size-4" />
                  +15m
                </Button>
              </div>
            </div>
          </fieldset>

          <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
            <legend className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <CircleDollarSign className="size-4" />
              Wagers
            </legend>
            <div className="space-y-2">
              <Label htmlFor="averageBet">Average Bet</Label>
              <Input
                id="averageBet"
                type="number"
                inputMode="decimal"
                value={draft.averageBet}
                onChange={(event) =>
                  updateDraft("averageBet", event.target.value)
                }
                placeholder="0"
              />
              <QuickAdjustRow
                onAdjust={(delta) => applyAdjustment("averageBet", delta)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashIn">Cash In</Label>
              <Input
                id="cashIn"
                type="number"
                inputMode="numeric"
                value={draft.cashIn}
                onChange={(event) => updateDraft("cashIn", event.target.value)}
                placeholder="0"
              />
              <QuickAdjustRow
                onAdjust={(delta) => applyAdjustment("cashIn", delta)}
              />
            </div>
          </fieldset>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_minmax(0,280px)]">
          <fieldset className="space-y-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
            <legend className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ArrowLeftRight className="size-4" />
              Table Assignment
            </legend>
            <div className="space-y-2">
              <Label htmlFor="tableId">Table</Label>
              <Select
                value={draft.tableId}
                onValueChange={(value) => updateDraft("tableId", value)}
              >
                <SelectTrigger id="tableId">
                  <SelectValue placeholder="Select a table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      <span className="flex items-center gap-2">
                        <span>{table.name}</span>
                        {table.limit && (
                          <span className="text-muted-foreground">
                            {table.limit}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seatNumber">Seat Number</Label>
              <Input
                id="seatNumber"
                value={draft.seatNumber}
                onChange={(event) =>
                  updateDraft("seatNumber", event.target.value)
                }
                placeholder="e.g. 3"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!draft.tableId || !draft.seatNumber}
                onClick={() =>
                  onMovePlayer?.({
                    tableId: draft.tableId,
                    seatNumber: draft.seatNumber,
                  })
                }
              >
                Move Player
              </Button>
              <span className="text-xs text-muted-foreground">
                Movement actions are stubbed until the service layer is ready.
              </span>
            </div>
          </fieldset>

          <aside className="space-y-4 rounded-xl border border-border bg-muted/40 p-4 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Current Points
              </p>
              <p className="text-3xl font-semibold tracking-tight">
                {snapshot.currentPoints?.toLocaleString() ?? "0"}
              </p>
            </div>

            {snapshot.status === "OPEN" && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowManualReward(true)}
              >
                <Gift className="size-4" />
                Issue Bonus Points
              </Button>
            )}

            {completionResult && (
              <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-50/50 p-3">
                <p className="text-sm font-semibold text-green-900">
                  Session Complete
                </p>
                <div className="space-y-1 text-sm text-green-800">
                  <p>
                    Points Earned:{" "}
                    <strong>+{completionResult.loyalty.pointsEarned}</strong>
                  </p>
                  <p>
                    New Balance:{" "}
                    <strong>{completionResult.loyalty.newBalance}</strong>
                  </p>
                  <p>
                    Tier: <strong>{completionResult.loyalty.tier}</strong>
                  </p>
                  {completionResult.loyalty.ledgerEntry.tier_after && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        Tier Progress
                      </p>
                      <Progress value={50} className="h-2" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {loyaltyError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Loyalty Error</AlertTitle>
                <AlertDescription>
                  {loyaltyError.message}
                  {(
                    (loyaltyError as Error & { details?: ServiceError })
                      .details as ServiceError & {
                      metadata?: { correlationId?: string };
                    }
                  )?.metadata?.correlationId && (
                    <div className="mt-1 text-xs opacity-80">
                      Correlation ID:{" "}
                      {
                        (
                          (loyaltyError as Error & { details?: ServiceError })
                            .details as ServiceError & {
                            metadata?: { correlationId?: string };
                          }
                        ).metadata?.correlationId
                      }
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Session tracking and loyalty integration active.</p>
            </div>
          </aside>
        </section>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSave?.(draft)}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCloseSession}
            disabled={isClosing || snapshot.status === "CLOSED"}
          >
            {isClosing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Closing...
              </>
            ) : (
              "Close Session"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ManualRewardDialog
        open={showManualReward}
        onOpenChange={setShowManualReward}
        playerId={snapshot.player.id}
        playerName={snapshot.player.name}
        currentBalance={snapshot.currentPoints ?? 0}
        currentTier={snapshot.player.tier ?? "BRONZE"}
        onSuccess={(result) => {
          queryClient.invalidateQueries({
            queryKey: ["loyalty", "player", snapshot.player.id],
          });
        }}
      />
    </Dialog>
  );
}

type QuickAdjustRowProps = {
  onAdjust: (delta: number) => void;
};

function QuickAdjustRow({ onAdjust }: QuickAdjustRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ADJUST_INTERVALS.map((interval) => (
        <Button
          key={interval}
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onAdjust(interval)}
          className="font-semibold"
        >
          +{interval}
        </Button>
      ))}
    </div>
  );
}

export type { RatingSlipFormDraft, RatingSlipSnapshot, RatingSlipTable };
