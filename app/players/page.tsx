/**
 * Players Page - Demonstrates Player vertical slice
 */

import { PlayerForm } from "@/components/player/player-form";

export default function PlayersPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Player Management
        </h1>
        <PlayerForm />
      </div>
    </div>
  );
}
