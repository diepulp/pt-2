/**
 * PlayerTimeline Mappers Unit Tests
 *
 * Tests for RPC row to DTO mapping with metadata validation.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS3-B
 */

import { describe, it, expect } from "@jest/globals";

import type { RpcTimelineRow } from "../dtos";
import {
  mapRpcRowToEvent,
  mapRpcResultToTimelineResponse,
  getSourceCategory,
  getEventTypeLabel,
} from "../mappers";

// === Test Data Factories ===

function createRpcRow(overrides: Partial<RpcTimelineRow> = {}): RpcTimelineRow {
  return {
    event_id: "evt-123",
    event_type: "visit_start",
    occurred_at: "2026-01-21T14:00:00Z",
    actor_id: "staff-456",
    actor_name: "John Dealer",
    source_table: "visit",
    source_id: "visit-789",
    summary: "Player checked in at Main Floor",
    amount: null,
    metadata: { visitKind: "gaming_identified_rated", gamingDay: "2026-01-21" },
    has_more: false,
    next_cursor_at: null,
    next_cursor_id: null,
    ...overrides,
  };
}

// === mapRpcRowToEvent Tests ===

describe("mapRpcRowToEvent", () => {
  describe("visit events", () => {
    it("maps visit_start row to DTO with validated metadata", () => {
      const row = createRpcRow({
        event_type: "visit_start",
        metadata: {
          visitKind: "reward_identified",
          gamingDay: "2026-01-21",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventId).toBe("evt-123");
      expect(dto.eventType).toBe("visit_start");
      expect(dto.metadata).toEqual({
        visitKind: "reward_identified",
        gamingDay: "2026-01-21",
      });
    });

    it("maps visit_end row with default metadata on missing fields", () => {
      const row = createRpcRow({
        event_type: "visit_end",
        metadata: {},
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("visit_end");
      expect(dto.metadata).toEqual({
        visitKind: "gaming_identified_rated",
        gamingDay: "",
      });
    });
  });

  describe("rating events", () => {
    it("maps rating_start row to DTO", () => {
      const row = createRpcRow({
        event_type: "rating_start",
        source_table: "rating_slip",
        metadata: {
          tableId: "table-001",
          tableName: "BJ-01",
          seatNumber: "3",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("rating_start");
      expect(dto.metadata).toEqual({
        tableId: "table-001",
        tableName: "BJ-01",
        seatNumber: "3",
        previousSlipId: undefined,
        durationSeconds: undefined,
        averageBet: undefined,
      });
    });

    it("maps rating_close row with duration and average bet", () => {
      const row = createRpcRow({
        event_type: "rating_close",
        metadata: {
          tableId: "table-001",
          tableName: "BJ-01",
          seatNumber: "3",
          durationSeconds: 3600,
          averageBet: 50,
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("rating_close");
      expect(dto.metadata).toMatchObject({
        durationSeconds: 3600,
        averageBet: 50,
      });
    });
  });

  describe("financial events", () => {
    it("maps cash_in row to DTO", () => {
      const row = createRpcRow({
        event_type: "cash_in",
        amount: 500,
        source_table: "player_financial_transaction",
        metadata: {
          direction: "in",
          source: "pit",
          tenderType: "cash",
          visitId: "visit-789",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("cash_in");
      expect(dto.amount).toBe(500);
      expect(dto.metadata).toEqual({
        direction: "in",
        source: "pit",
        tenderType: "cash",
        visitId: "visit-789",
        note: undefined,
      });
    });

    it("maps cash_out row with note", () => {
      const row = createRpcRow({
        event_type: "cash_out",
        amount: 1200,
        metadata: {
          direction: "out",
          source: "cage",
          tenderType: "check",
          visitId: "visit-789",
          note: "Winner payout",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("cash_out");
      expect(dto.metadata).toMatchObject({
        direction: "out",
        note: "Winner payout",
      });
    });
  });

  describe("loyalty events", () => {
    it("maps points_earned row to DTO", () => {
      const row = createRpcRow({
        event_type: "points_earned",
        amount: 150,
        source_table: "loyalty_ledger",
        metadata: {
          reason: "base_accrual",
          ratingSlipId: "slip-001",
          visitId: "visit-789",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("points_earned");
      expect(dto.amount).toBe(150);
      expect(dto.metadata).toEqual({
        reason: "base_accrual",
        ratingSlipId: "slip-001",
        visitId: "visit-789",
        note: undefined,
      });
    });

    it("maps points_redeemed row with note", () => {
      const row = createRpcRow({
        event_type: "points_redeemed",
        amount: -100,
        metadata: {
          reason: "redeem",
          note: "Comp dinner",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("points_redeemed");
      expect(dto.metadata).toMatchObject({
        reason: "redeem",
        note: "Comp dinner",
      });
    });
  });

  describe("compliance events", () => {
    it("maps mtl_recorded row to DTO", () => {
      const row = createRpcRow({
        event_type: "mtl_recorded",
        amount: 10000,
        source_table: "mtl_entry",
        metadata: {
          direction: "in",
          txnType: "buy_in",
          source: "table",
          gamingDay: "2026-01-21",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("mtl_recorded");
      expect(dto.amount).toBe(10000);
      expect(dto.metadata).toEqual({
        direction: "in",
        txnType: "buy_in",
        source: "table",
        gamingDay: "2026-01-21",
      });
    });
  });

  describe("staff interaction events", () => {
    it("maps note_added row to DTO", () => {
      const row = createRpcRow({
        event_type: "note_added",
        source_table: "player_note",
        metadata: {
          content: "VIP guest, prefers corner seat",
          visibility: "team",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("note_added");
      expect(dto.metadata).toEqual({
        content: "VIP guest, prefers corner seat",
        visibility: "team",
      });
    });

    it("maps tag_applied row to DTO", () => {
      const row = createRpcRow({
        event_type: "tag_applied",
        source_table: "player_tag",
        metadata: {
          tagName: "High Roller",
          tagCategory: "vip",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("tag_applied");
      expect(dto.metadata).toEqual({
        tagName: "High Roller",
        tagCategory: "vip",
      });
    });

    it("maps tag_removed row to DTO", () => {
      const row = createRpcRow({
        event_type: "tag_removed",
        metadata: {
          tagName: "Watch List",
          tagCategory: "attention",
        },
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.eventType).toBe("tag_removed");
      expect(dto.metadata).toEqual({
        tagName: "Watch List",
        tagCategory: "attention",
      });
    });
  });

  describe("unknown/missing metadata", () => {
    it("provides defaults for missing metadata fields", () => {
      const row = createRpcRow({
        event_type: "cash_in",
        metadata: {},
      });

      const dto = mapRpcRowToEvent(row);

      expect(dto.metadata).toEqual({
        direction: "in",
        source: "pit",
        tenderType: "",
        visitId: "",
        note: undefined,
      });
    });
  });
});

// === mapRpcResultToTimelineResponse Tests ===

describe("mapRpcResultToTimelineResponse", () => {
  it("maps empty array to empty response", () => {
    const response = mapRpcResultToTimelineResponse([]);

    expect(response.events).toEqual([]);
    expect(response.nextCursorAt).toBeNull();
    expect(response.nextCursorId).toBeNull();
    expect(response.hasMore).toBe(false);
  });

  it("maps single row to response with pagination from row", () => {
    const row = createRpcRow({
      has_more: true,
      next_cursor_at: "2026-01-21T13:00:00Z",
      next_cursor_id: "evt-prev",
    });

    const response = mapRpcResultToTimelineResponse([row]);

    expect(response.events).toHaveLength(1);
    expect(response.nextCursorAt).toBe("2026-01-21T13:00:00Z");
    expect(response.nextCursorId).toBe("evt-prev");
    expect(response.hasMore).toBe(true);
  });

  it("extracts pagination from last row when multiple rows", () => {
    const rows = [
      createRpcRow({ event_id: "evt-1", has_more: false }),
      createRpcRow({ event_id: "evt-2", has_more: false }),
      createRpcRow({
        event_id: "evt-3",
        has_more: true,
        next_cursor_at: "2026-01-20T12:00:00Z",
        next_cursor_id: "evt-4",
      }),
    ];

    const response = mapRpcResultToTimelineResponse(rows);

    expect(response.events).toHaveLength(3);
    expect(response.events[0].eventId).toBe("evt-1");
    expect(response.events[2].eventId).toBe("evt-3");
    expect(response.nextCursorAt).toBe("2026-01-20T12:00:00Z");
    expect(response.nextCursorId).toBe("evt-4");
    expect(response.hasMore).toBe(true);
  });

  it("maps all event types correctly in mixed results", () => {
    const rows = [
      createRpcRow({ event_type: "visit_start" }),
      createRpcRow({ event_type: "cash_in", amount: 500 }),
      createRpcRow({ event_type: "rating_start" }),
      createRpcRow({ event_type: "points_earned", amount: 100 }),
    ];

    const response = mapRpcResultToTimelineResponse(rows);

    expect(response.events).toHaveLength(4);
    expect(response.events.map((e) => e.eventType)).toEqual([
      "visit_start",
      "cash_in",
      "rating_start",
      "points_earned",
    ]);
  });
});

// === getSourceCategory Tests ===

describe("getSourceCategory", () => {
  it("returns session for visit events", () => {
    expect(getSourceCategory("visit_start")).toBe("session");
    expect(getSourceCategory("visit_end")).toBe("session");
    expect(getSourceCategory("visit_resume")).toBe("session");
  });

  it("returns gaming for rating events", () => {
    expect(getSourceCategory("rating_start")).toBe("gaming");
    expect(getSourceCategory("rating_pause")).toBe("gaming");
    expect(getSourceCategory("rating_resume")).toBe("gaming");
    expect(getSourceCategory("rating_close")).toBe("gaming");
  });

  it("returns financial for financial events", () => {
    expect(getSourceCategory("cash_in")).toBe("financial");
    expect(getSourceCategory("cash_out")).toBe("financial");
    expect(getSourceCategory("cash_observation")).toBe("financial");
    expect(getSourceCategory("financial_adjustment")).toBe("financial");
  });

  it("returns loyalty for loyalty and promo events", () => {
    expect(getSourceCategory("points_earned")).toBe("loyalty");
    expect(getSourceCategory("points_redeemed")).toBe("loyalty");
    expect(getSourceCategory("points_adjusted")).toBe("loyalty");
    expect(getSourceCategory("promo_issued")).toBe("loyalty");
    expect(getSourceCategory("promo_redeemed")).toBe("loyalty");
  });

  it("returns staff for note and tag events", () => {
    expect(getSourceCategory("note_added")).toBe("staff");
    expect(getSourceCategory("tag_applied")).toBe("staff");
    expect(getSourceCategory("tag_removed")).toBe("staff");
  });

  it("returns compliance for MTL events", () => {
    expect(getSourceCategory("mtl_recorded")).toBe("compliance");
  });

  it("returns identity for enrollment events", () => {
    expect(getSourceCategory("player_enrolled")).toBe("identity");
    expect(getSourceCategory("identity_verified")).toBe("identity");
  });
});

// === getEventTypeLabel Tests ===

describe("getEventTypeLabel", () => {
  it("returns human-readable labels for all event types", () => {
    expect(getEventTypeLabel("visit_start")).toBe("Check-in");
    expect(getEventTypeLabel("visit_end")).toBe("Check-out");
    expect(getEventTypeLabel("rating_start")).toBe("Started Play");
    expect(getEventTypeLabel("rating_close")).toBe("Ended Play");
    expect(getEventTypeLabel("cash_in")).toBe("Buy-in");
    expect(getEventTypeLabel("cash_out")).toBe("Cash-out");
    expect(getEventTypeLabel("points_earned")).toBe("Points Earned");
    expect(getEventTypeLabel("mtl_recorded")).toBe("MTL Entry");
    expect(getEventTypeLabel("note_added")).toBe("Note Added");
    expect(getEventTypeLabel("tag_applied")).toBe("Tag Applied");
    expect(getEventTypeLabel("player_enrolled")).toBe("Enrolled");
  });
});
