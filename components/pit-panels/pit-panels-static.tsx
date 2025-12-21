/**
 * Pit Panels Static Wrapper
 *
 * Static UI wrapper for design review and component documentation.
 * Provides mock data to PanelContainer for visual inspection without backend.
 *
 * @see app/review/pit-panels/page.tsx - Review page usage
 */

"use client";

import * as React from "react";

import type {
  DashboardTableDTO,
  DashboardStats,
} from "@/hooks/dashboard/types";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";

import { PanelContainer } from "./panel-container";

interface PitPanelsStaticProps {
  tableName?: string;
  className?: string;
}

// Mock data for static UI preview
const MOCK_TABLES: DashboardTableDTO[] = [
  {
    id: "table-1",
    casino_id: "casino-1",
    label: "BJ-01",
    pit: "Main Floor",
    type: "blackjack",
    status: "active",
    created_at: new Date().toISOString(),
    current_dealer: {
      staff_id: "dealer-1",
      started_at: new Date().toISOString(),
    },
    activeSlipsCount: 3,
  },
];

const MOCK_SEATS = [
  { firstName: "John", lastName: "Smith", slipId: "slip-1" },
  null,
  { firstName: "Maria", lastName: "Garcia", slipId: "slip-2" },
  { firstName: "James", lastName: "Wilson", slipId: "slip-3" },
  null,
  null,
  { firstName: "Sarah", lastName: "Chen", slipId: "slip-4" },
];

const MOCK_ACTIVE_SLIPS: RatingSlipDTO[] = [
  {
    id: "slip-1",
    casino_id: "casino-1",
    visit_id: "visit-1",
    table_id: "table-1",
    seat_number: "1",
    status: "open",
    start_time: new Date(Date.now() - 3600000).toISOString(),
    end_time: null,
    average_bet: 25,
    game_settings: null,
    policy_snapshot: null,
  },
  {
    id: "slip-2",
    casino_id: "casino-1",
    visit_id: "visit-2",
    table_id: "table-1",
    seat_number: "3",
    status: "open",
    start_time: new Date(Date.now() - 7200000).toISOString(),
    end_time: null,
    average_bet: 50,
    game_settings: null,
    policy_snapshot: null,
  },
  {
    id: "slip-3",
    casino_id: "casino-1",
    visit_id: "visit-3",
    table_id: "table-1",
    seat_number: "4",
    status: "paused",
    start_time: new Date(Date.now() - 1800000).toISOString(),
    end_time: null,
    average_bet: 100,
    game_settings: null,
    policy_snapshot: null,
  },
];

const MOCK_STATS: DashboardStats = {
  activeTablesCount: 8,
  openSlipsCount: 24,
  checkedInPlayersCount: 42,
  gamingDay: new Date().toISOString().split("T")[0],
};

/**
 * Static wrapper for PanelContainer with mock data.
 * Used for design review and component documentation.
 *
 * PRD-013: Updated to remove selectedTableId and onTableSelect props
 */
export function PitPanelsStatic({
  tableName = "BJ-01",
  className,
}: PitPanelsStaticProps) {
  return (
    <PanelContainer
      casinoId="mock-casino"
      tableName={tableName}
      className={className}
      tables={MOCK_TABLES}
      selectedTable={MOCK_TABLES[0]}
      seats={MOCK_SEATS}
      activeSlips={MOCK_ACTIVE_SLIPS}
      stats={MOCK_STATS}
      isLoading={false}
      gamingDay={MOCK_STATS.gamingDay ? { date: MOCK_STATS.gamingDay } : null}
      realtimeConnected={true}
      realtimeError={null}
      onSeatClick={() => {}}
      onNewSlip={() => {}}
      onSlipClick={() => {}}
    />
  );
}
