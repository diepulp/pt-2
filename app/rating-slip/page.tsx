"use client";

import { useState } from "react";

import { RatingSlipModal } from "@/components/rating-slip/rating-slip-modal";
import type {
  RatingSlipSnapshot,
  RatingSlipTable,
  RatingSlipFormDraft,
} from "@/components/rating-slip/rating-slip-modal";

/**
 * Rating Slip Preview Page
 *
 * Purpose: Display rating slip modal with dummy data for UI development/preview.
 * This page should be replaced with proper data fetching once the backend is ready.
 */
export default function RatingSlipPreviewPage() {
  const [open, setOpen] = useState(true);

  // Dummy player data
  const dummySnapshot: RatingSlipSnapshot = {
    id: "rating-slip-123",
    status: "OPEN",
    player: {
      id: "player-456",
      name: "John Smith",
      membershipId: "M-789012",
      tier: "GOLD",
    },
    tableId: "table-1",
    seatNumber: "3",
    averageBet: 50,
    cashIn: 500,
    chipsTaken: 450,
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    currentPoints: 1250,
  };

  // Dummy tables data
  const dummyTables: RatingSlipTable[] = [
    {
      id: "table-1",
      name: "Table 1",
      limit: "$25-$500",
      openSeats: 3,
    },
    {
      id: "table-2",
      name: "Table 2",
      limit: "$50-$1000",
      openSeats: 1,
    },
    {
      id: "table-3",
      name: "Table 3 - High Roller",
      limit: "$100-$5000",
      openSeats: 5,
    },
    {
      id: "table-4",
      name: "Table 4",
      limit: "$10-$200",
      openSeats: 0,
    },
  ];

  const handleSave = (draft: RatingSlipFormDraft) => {
    console.log("Save draft:", draft);
    // TODO: Integrate with service layer when ready
  };

  const handleMovePlayer = (
    draft: Pick<RatingSlipFormDraft, "tableId" | "seatNumber">,
  ) => {
    console.log("Move player:", draft);
    // TODO: Integrate with service layer when ready
  };

  const handleCloseSession = (draft: RatingSlipFormDraft) => {
    console.log("Close session:", draft);
    // TODO: Integrate with service layer when ready
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold">Rating Slip Preview</h1>
        <p className="text-muted-foreground">
          This is a preview page with dummy data for UI development. The modal
          opens automatically.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reopen Modal
        </button>
      </div>

      <RatingSlipModal
        open={open}
        onOpenChange={setOpen}
        snapshot={dummySnapshot}
        tables={dummyTables}
        onSave={handleSave}
        onMovePlayer={handleMovePlayer}
        onCloseSession={handleCloseSession}
      />
    </div>
  );
}
