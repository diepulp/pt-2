/**
 * Player Session Activity Hook
 *
 * Provides real-time session activity data for the activity visualization panel.
 * Aggregates data from active visit and rating slips.
 *
 * Data sources:
 * - Visit service: Session start/end times, visit kind
 * - Rating slip service: Table activity, pause events, session timeline
 *
 * @see components/player-dashboard/activity-visualization-panel.tsx
 */

"use client";

import { useMemo } from "react";

import type { RatingSlipDTO } from "@/services/rating-slip/dtos";
import type { ActiveVisitDTO } from "@/services/visit/dtos";

export interface SessionTimelineEvent {
  /** ISO timestamp of event */
  time: string;
  /** Event type */
  action:
    | "session_started"
    | "table_joined"
    | "slip_paused"
    | "slip_resumed"
    | "slip_closed"
    | "session_ended";
  /** Table ID if applicable */
  tableId?: string;
  /** Additional event metadata */
  metadata?: Record<string, unknown>;
}

export interface SessionActivityData {
  /** Whether session is currently active */
  isActive: boolean;
  /** Current table ID (if player is at a table) */
  currentTableId: string | null;
  /** Session start time (ISO string) */
  sessionStartTime: string | null;
  /** Session end time (ISO string, null if active) */
  sessionEndTime: string | null;
  /** Duration in minutes */
  durationMinutes: number;
  /** Timeline of session events */
  timeline: SessionTimelineEvent[];
  /** Number of rating slips in this session */
  slipCount: number;
  /** Current slip status (if any active slip) */
  currentSlipStatus: "open" | "paused" | "closed" | "archived" | null;
}

interface UsePlayerSessionActivityOptions {
  /** Active visit data */
  activeVisit: ActiveVisitDTO | undefined;
  /** Rating slips for the active visit */
  ratingSlips: { items: RatingSlipDTO[] } | undefined;
}

/**
 * Processes visit and rating slip data into session activity timeline.
 *
 * @example
 * ```tsx
 * function ActivityPanel({ playerId }) {
 *   const { activeVisit, ratingSlips } = usePlayerDashboard({ playerId, casinoId });
 *   const activity = usePlayerSessionActivity({
 *     activeVisit: activeVisit.data,
 *     ratingSlips: ratingSlips.data,
 *   });
 *
 *   if (activity.isActive) {
 *     return <LiveActivityChart data={activity} />;
 *   }
 *
 *   return <p>No active session</p>;
 * }
 * ```
 */
export function usePlayerSessionActivity(
  options: UsePlayerSessionActivityOptions,
): SessionActivityData {
  const { activeVisit, ratingSlips } = options;

  return useMemo(() => {
    const visit = activeVisit?.visit;
    const slips = ratingSlips?.items ?? [];

    if (!visit || !activeVisit.has_active_visit) {
      return {
        isActive: false,
        currentTableId: null,
        sessionStartTime: null,
        sessionEndTime: null,
        durationMinutes: 0,
        timeline: [],
        slipCount: 0,
        currentSlipStatus: null,
      };
    }

    // Calculate session duration
    const startTime = new Date(visit.started_at);
    const endTime = visit.ended_at ? new Date(visit.ended_at) : new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    // Find current active slip (if any)
    const activeSlip = slips.find(
      (slip) => slip.status === "open" || slip.status === "paused",
    );

    // Build timeline from visit and rating slips
    const timeline: SessionTimelineEvent[] = [
      {
        time: visit.started_at,
        action: "session_started",
      },
    ];

    // Add rating slip events
    slips.forEach((slip) => {
      if (slip.start_time) {
        timeline.push({
          time: slip.start_time,
          action: "table_joined",
          tableId: slip.table_id,
        });
      }

      // For paused slips, we'd need pause history from RatingSlipWithPausesDTO
      // This is a simplified version - full implementation would fetch pause details

      if (slip.status === "closed" && slip.end_time) {
        timeline.push({
          time: slip.end_time,
          action: "slip_closed",
          tableId: slip.table_id,
        });
      }
    });

    if (visit.ended_at) {
      timeline.push({
        time: visit.ended_at,
        action: "session_ended",
      });
    }

    // Sort timeline by time (most recent first for display)
    timeline.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );

    return {
      isActive: !visit.ended_at,
      currentTableId: activeSlip?.table_id ?? null,
      sessionStartTime: visit.started_at,
      sessionEndTime: visit.ended_at,
      durationMinutes,
      timeline,
      slipCount: slips.length,
      currentSlipStatus: activeSlip?.status ?? null,
    };
  }, [activeVisit, ratingSlips]);
}
