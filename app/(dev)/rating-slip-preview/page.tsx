"use client";

import { useState } from "react";

import {
  RatingSlipModal,
  type FormState,
} from "@/components/modals/rating-slip";
import { Button } from "@/components/ui/button";

// Mock data for presentation
const mockRatingSlip = {
  id: "rs-001",
  playerName: "John Smith",
  averageBet: 150,
  cashIn: 500,
  startTime: new Date().toISOString().slice(0, 16),
  gameTableId: "table-1",
  seatNumber: 3,
  points: 1250,
};

const mockTables = [
  { gaming_table_id: "table-1", name: "Blackjack 1", seats_available: 7 },
  { gaming_table_id: "table-2", name: "Blackjack 2", seats_available: 5 },
  { gaming_table_id: "table-3", name: "Roulette 1", seats_available: 12 },
  { gaming_table_id: "table-4", name: "Poker 1", seats_available: 9 },
  { gaming_table_id: "table-5", name: "Baccarat 1", seats_available: 8 },
];

export default function RatingSlipPreviewPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>("");

  const handleSave = (formState: FormState) => {
    setLastAction(`Save: ${JSON.stringify(formState, null, 2)}`);
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setIsOpen(false);
    }, 1500);
  };

  const handleCloseSession = (formState: FormState) => {
    setLastAction(`Close Session: ${JSON.stringify(formState, null, 2)}`);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setIsOpen(false);
    }, 1500);
  };

  const handleMovePlayer = (formState: FormState) => {
    setLastAction(`Move Player: ${JSON.stringify(formState, null, 2)}`);
    setIsMoving(true);
    setTimeout(() => {
      setIsMoving(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Rating Slip Modal Preview</h1>
          <p className="text-muted-foreground mt-2">
            Development preview for the rating slip modal component
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
          <Button
            variant="outline"
            onClick={() => {
              setIsLoading(true);
              setIsOpen(true);
              setTimeout(() => setIsLoading(false), 2000);
            }}
          >
            Open with Loading
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setError("Sample error: Failed to load rating slip data");
              setIsOpen(true);
            }}
          >
            Open with Error
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
            }}
          >
            Clear Error
          </Button>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <h2 className="font-semibold mb-2">Mock Data</h2>
          <pre className="text-sm text-muted-foreground overflow-auto">
            {JSON.stringify(
              { ratingSlip: mockRatingSlip, tables: mockTables },
              null,
              2,
            )}
          </pre>
        </div>

        {lastAction && (
          <div className="p-4 bg-muted border border-border rounded-lg">
            <h2 className="font-semibold mb-2">Last Action</h2>
            <pre className="text-sm text-muted-foreground overflow-auto whitespace-pre-wrap">
              {lastAction}
            </pre>
          </div>
        )}

        <RatingSlipModal
          slipId={null} // Set to actual ID to test service integration
          ratingSlip={mockRatingSlip}
          tables={mockTables}
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
            setError(null);
          }}
          onSave={handleSave}
          onCloseSession={handleCloseSession}
          onMovePlayer={handleMovePlayer}
          isLoading={isLoading}
          isSaving={isSaving}
          isClosing={isClosing}
          isMoving={isMoving}
          error={error}
        />
      </div>
    </div>
  );
}
