"use client";

import { useState } from "react";

import { PlayerForm } from "@/components/player/player-form";
import {
  RatingSlipModal,
  type RatingSlipFormDraft,
  type RatingSlipSnapshot,
  type RatingSlipTable,
} from "@/components/rating-slip/rating-slip-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const demoSnapshot: RatingSlipSnapshot = {
  id: "rs-1001",
  status: "OPEN",
  player: {
    name: "Jordan Avery",
    membershipId: "LV-2048",
    tier: "Black Diamond",
  },
  tableId: "tb-1",
  seatNumber: "5",
  averageBet: 150,
  cashIn: 1200,
  chipsTaken: 0,
  startTime: "2024-05-10T14:30",
  currentPoints: 4200,
};

const demoTables: RatingSlipTable[] = [
  { id: "tb-1", name: "Blackjack Elite", limit: "$25 - $500" },
  { id: "tb-2", name: "Roulette Royale", limit: "$5 - $100" },
  { id: "tb-3", name: "Baccarat Salon", limit: "$50 - $1,000" },
];

export default function PlayersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSave = (draft: RatingSlipFormDraft) => {
    // TODO: Implement rating slip save logic
    setIsModalOpen(false);
  };

  const handleMove = (
    draft: Pick<RatingSlipFormDraft, "tableId" | "seatNumber">,
  ) => {
    // TODO: Implement player move logic
  };

  const handleClose = (draft: RatingSlipFormDraft) => {
    // TODO: Implement session close logic
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-muted/30 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Player Operations
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Player Management
            </h1>
          </div>
          <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
            Preview Rating Slip
          </Button>
        </header>

        <main className="grid gap-6">
          <Card className="p-6 shadow-sm">
            <PlayerForm />
          </Card>
        </main>
      </div>

      <RatingSlipModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        snapshot={demoSnapshot}
        tables={demoTables}
        onSave={handleSave}
        onMovePlayer={handleMove}
        onCloseSession={handleClose}
      />
    </div>
  );
}
