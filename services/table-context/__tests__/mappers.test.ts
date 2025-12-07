/**
 * TableContextService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs.
 * 100% coverage required per SLAD.
 *
 * @see mappers.ts
 * @see EXECUTION-SPEC-PRD-007.md section 5.1
 */

import {
  toGamingTableDTO,
  toGamingTableDTOList,
  toGamingTableDTOOrNull,
  toGamingTableWithDealerDTO,
  toDealerRotationDTO,
  toDealerRotationDTOList,
  toTableInventorySnapshotDTO,
  toTableFillDTO,
  toTableCreditDTO,
  toTableDropEventDTO,
  toTableInventorySnapshotDTOFromRow,
  toTableInventorySnapshotDTOListFromRows,
} from "../mappers";

describe("TableContext Mappers", () => {
  // === Test Data ===

  const mockGamingTableRow = {
    id: "table-123",
    casino_id: "casino-456",
    label: "BJ-01",
    pit: "main",
    type: "blackjack" as const,
    status: "active" as const,
    created_at: "2025-12-01T00:00:00Z",
  };

  const mockGamingTableRowNullPit = {
    id: "table-789",
    casino_id: "casino-456",
    label: "RLT-05",
    pit: null,
    type: "roulette" as const,
    status: "inactive" as const,
    created_at: "2025-11-15T10:30:00Z",
  };

  const mockGamingTableRowClosed = {
    id: "table-999",
    casino_id: "casino-456",
    label: "PKR-02",
    pit: "vip",
    type: "poker" as const,
    status: "closed" as const,
    created_at: "2025-10-01T00:00:00Z",
  };

  const mockGamingTableWithDealerRow = {
    ...mockGamingTableRow,
    dealer_rotation: [
      {
        staff_id: "staff-001",
        started_at: "2025-12-01T08:00:00Z",
      },
    ],
  };

  const mockGamingTableWithNoDealerRow = {
    ...mockGamingTableRow,
    dealer_rotation: null,
  };

  const mockGamingTableWithEmptyDealerRow = {
    ...mockGamingTableRow,
    dealer_rotation: [],
  };

  const mockDealerRotationRow = {
    id: "rotation-123",
    casino_id: "casino-456",
    table_id: "table-123",
    staff_id: "staff-001",
    started_at: "2025-12-01T08:00:00Z",
    ended_at: null,
  };

  const mockDealerRotationRowEnded = {
    id: "rotation-124",
    casino_id: "casino-456",
    table_id: "table-123",
    staff_id: "staff-002",
    started_at: "2025-12-01T04:00:00Z",
    ended_at: "2025-12-01T08:00:00Z",
  };

  const mockDealerRotationRowNullStaff = {
    id: "rotation-125",
    casino_id: "casino-456",
    table_id: "table-123",
    staff_id: null,
    started_at: "2025-12-01T10:00:00Z",
    ended_at: null,
  };

  const mockTableInventorySnapshotRpc = {
    id: "snapshot-123",
    casino_id: "casino-456",
    table_id: "table-123",
    snapshot_type: "open",
    chipset: { "100": 50, "500": 20, "1000": 10 },
    counted_by: "staff-001",
    verified_by: "staff-002",
    discrepancy_cents: 0,
    note: "Opening inventory",
    created_at: "2025-12-01T06:00:00Z",
  };

  const mockTableInventorySnapshotRpcNulls = {
    id: "snapshot-124",
    casino_id: "casino-456",
    table_id: "table-123",
    snapshot_type: "rundown",
    chipset: { "25": 100 },
    counted_by: null,
    verified_by: null,
    discrepancy_cents: null,
    note: null,
    created_at: "2025-12-01T14:00:00Z",
  };

  const mockTableFillRpc = {
    id: "fill-123",
    casino_id: "casino-456",
    table_id: "table-123",
    request_id: "req-fill-001",
    chipset: { "100": 100, "500": 50 },
    amount_cents: 3500000,
    requested_by: "staff-001",
    delivered_by: "staff-003",
    received_by: "staff-002",
    slip_no: "FILL-2025-0001",
    created_at: "2025-12-01T10:30:00Z",
  };

  const mockTableFillRpcNulls = {
    id: "fill-124",
    casino_id: "casino-456",
    table_id: "table-123",
    request_id: "req-fill-002",
    chipset: { "25": 200 },
    amount_cents: 500000,
    requested_by: null,
    delivered_by: null,
    received_by: null,
    slip_no: null,
    created_at: "2025-12-01T11:00:00Z",
  };

  const mockTableCreditRpc = {
    id: "credit-123",
    casino_id: "casino-456",
    table_id: "table-123",
    request_id: "req-credit-001",
    chipset: { "1000": 20 },
    amount_cents: 2000000,
    authorized_by: "staff-004",
    sent_by: "staff-002",
    received_by: "staff-005",
    slip_no: "CREDIT-2025-0001",
    created_at: "2025-12-01T18:00:00Z",
  };

  const mockTableCreditRpcNulls = {
    id: "credit-124",
    casino_id: "casino-456",
    table_id: "table-123",
    request_id: "req-credit-002",
    chipset: { "500": 10 },
    amount_cents: 500000,
    authorized_by: null,
    sent_by: null,
    received_by: null,
    slip_no: null,
    created_at: "2025-12-01T19:00:00Z",
  };

  const mockTableDropEventRpc = {
    id: "drop-123",
    casino_id: "casino-456",
    table_id: "table-123",
    drop_box_id: "box-001",
    seal_no: "SEAL-2025-0001",
    gaming_day: "2025-12-01",
    seq_no: 1,
    removed_by: "staff-006",
    witnessed_by: "staff-007",
    removed_at: "2025-12-01T06:00:00Z",
    delivered_at: "2025-12-01T06:30:00Z",
    delivered_scan_at: "2025-12-01T06:35:00Z",
    note: "Morning drop collection",
  };

  const mockTableDropEventRpcNulls = {
    id: "drop-124",
    casino_id: "casino-456",
    table_id: "table-123",
    drop_box_id: "box-002",
    seal_no: null,
    gaming_day: null,
    seq_no: null,
    removed_by: null,
    witnessed_by: null,
    removed_at: "2025-12-02T06:00:00Z",
    delivered_at: null,
    delivered_scan_at: null,
    note: null,
  };

  // === Gaming Table Mapper Tests ===

  describe("toGamingTableDTO", () => {
    it("maps all fields correctly", () => {
      const dto = toGamingTableDTO(mockGamingTableRow);

      expect(dto).toEqual({
        id: "table-123",
        casino_id: "casino-456",
        label: "BJ-01",
        pit: "main",
        type: "blackjack",
        status: "active",
        created_at: "2025-12-01T00:00:00Z",
      });
    });

    it("handles null pit", () => {
      const dto = toGamingTableDTO(mockGamingTableRowNullPit);

      expect(dto.pit).toBeNull();
      expect(dto.label).toBe("RLT-05");
    });

    it("maps inactive status correctly", () => {
      const dto = toGamingTableDTO(mockGamingTableRowNullPit);

      expect(dto.status).toBe("inactive");
    });

    it("maps closed status correctly", () => {
      const dto = toGamingTableDTO(mockGamingTableRowClosed);

      expect(dto.status).toBe("closed");
    });

    it("maps all game types correctly", () => {
      const types = ["blackjack", "poker", "roulette", "baccarat"] as const;
      types.forEach((type) => {
        const row = { ...mockGamingTableRow, type };
        const dto = toGamingTableDTO(row);
        expect(dto.type).toBe(type);
      });
    });

    it("returns a new object (immutability)", () => {
      const dto = toGamingTableDTO(mockGamingTableRow);

      expect(dto).not.toBe(mockGamingTableRow);
    });

    it("handles empty string label", () => {
      const row = { ...mockGamingTableRow, label: "" };
      const dto = toGamingTableDTO(row);

      expect(dto.label).toBe("");
    });
  });

  describe("toGamingTableDTOList", () => {
    it("maps empty array", () => {
      const result = toGamingTableDTOList([]);

      expect(result).toEqual([]);
    });

    it("maps single item array", () => {
      const result = toGamingTableDTOList([mockGamingTableRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("table-123");
    });

    it("maps multiple items", () => {
      const result = toGamingTableDTOList([
        mockGamingTableRow,
        mockGamingTableRowNullPit,
        mockGamingTableRowClosed,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("table-123");
      expect(result[1].id).toBe("table-789");
      expect(result[2].id).toBe("table-999");
    });

    it("preserves order", () => {
      const result = toGamingTableDTOList([
        mockGamingTableRowClosed,
        mockGamingTableRow,
      ]);

      expect(result[0].id).toBe("table-999");
      expect(result[1].id).toBe("table-123");
    });

    it("maps tables with different statuses", () => {
      const result = toGamingTableDTOList([
        mockGamingTableRow,
        mockGamingTableRowNullPit,
        mockGamingTableRowClosed,
      ]);

      expect(result[0].status).toBe("active");
      expect(result[1].status).toBe("inactive");
      expect(result[2].status).toBe("closed");
    });
  });

  describe("toGamingTableDTOOrNull", () => {
    it("returns DTO for valid row", () => {
      const result = toGamingTableDTOOrNull(mockGamingTableRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe("table-123");
    });

    it("returns null for null input", () => {
      const result = toGamingTableDTOOrNull(null);

      expect(result).toBeNull();
    });

    it("maps all fields correctly for valid row", () => {
      const result = toGamingTableDTOOrNull(mockGamingTableRow);

      expect(result).toEqual({
        id: "table-123",
        casino_id: "casino-456",
        label: "BJ-01",
        pit: "main",
        type: "blackjack",
        status: "active",
        created_at: "2025-12-01T00:00:00Z",
      });
    });
  });

  describe("toGamingTableWithDealerDTO", () => {
    it("maps table with active dealer", () => {
      const dto = toGamingTableWithDealerDTO(mockGamingTableWithDealerRow);

      expect(dto.id).toBe("table-123");
      expect(dto.current_dealer).not.toBeNull();
      expect(dto.current_dealer?.staff_id).toBe("staff-001");
      expect(dto.current_dealer?.started_at).toBe("2025-12-01T08:00:00Z");
    });

    it("handles null dealer_rotation", () => {
      const dto = toGamingTableWithDealerDTO(mockGamingTableWithNoDealerRow);

      expect(dto.current_dealer).toBeNull();
    });

    it("handles empty dealer_rotation array", () => {
      const dto = toGamingTableWithDealerDTO(mockGamingTableWithEmptyDealerRow);

      expect(dto.current_dealer).toBeNull();
    });

    it("maps all base table fields correctly", () => {
      const dto = toGamingTableWithDealerDTO(mockGamingTableWithDealerRow);

      expect(dto.casino_id).toBe("casino-456");
      expect(dto.label).toBe("BJ-01");
      expect(dto.pit).toBe("main");
      expect(dto.type).toBe("blackjack");
      expect(dto.status).toBe("active");
      expect(dto.created_at).toBe("2025-12-01T00:00:00Z");
    });

    it("returns a new object (immutability)", () => {
      const dto = toGamingTableWithDealerDTO(mockGamingTableWithDealerRow);

      expect(dto).not.toBe(mockGamingTableWithDealerRow);
    });
  });

  // === Dealer Rotation Mapper Tests ===

  describe("toDealerRotationDTO", () => {
    it("maps all fields correctly for active rotation", () => {
      const dto = toDealerRotationDTO(mockDealerRotationRow);

      expect(dto).toEqual({
        id: "rotation-123",
        casino_id: "casino-456",
        table_id: "table-123",
        staff_id: "staff-001",
        started_at: "2025-12-01T08:00:00Z",
        ended_at: null,
      });
    });

    it("maps ended rotation correctly", () => {
      const dto = toDealerRotationDTO(mockDealerRotationRowEnded);

      expect(dto.ended_at).toBe("2025-12-01T08:00:00Z");
      expect(dto.staff_id).toBe("staff-002");
    });

    it("handles null staff_id", () => {
      const dto = toDealerRotationDTO(mockDealerRotationRowNullStaff);

      expect(dto.staff_id).toBeNull();
    });

    it("returns a new object (immutability)", () => {
      const dto = toDealerRotationDTO(mockDealerRotationRow);

      expect(dto).not.toBe(mockDealerRotationRow);
    });
  });

  describe("toDealerRotationDTOList", () => {
    it("maps empty array", () => {
      const result = toDealerRotationDTOList([]);

      expect(result).toEqual([]);
    });

    it("maps single item array", () => {
      const result = toDealerRotationDTOList([mockDealerRotationRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("rotation-123");
    });

    it("maps multiple items", () => {
      const result = toDealerRotationDTOList([
        mockDealerRotationRow,
        mockDealerRotationRowEnded,
        mockDealerRotationRowNullStaff,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0].ended_at).toBeNull();
      expect(result[1].ended_at).not.toBeNull();
      expect(result[2].staff_id).toBeNull();
    });

    it("preserves order", () => {
      const result = toDealerRotationDTOList([
        mockDealerRotationRowEnded,
        mockDealerRotationRow,
      ]);

      expect(result[0].id).toBe("rotation-124");
      expect(result[1].id).toBe("rotation-123");
    });
  });

  // === Table Inventory Snapshot Mapper Tests ===

  describe("toTableInventorySnapshotDTO", () => {
    it("maps all fields correctly", () => {
      const dto = toTableInventorySnapshotDTO(mockTableInventorySnapshotRpc);

      expect(dto).toEqual({
        id: "snapshot-123",
        casino_id: "casino-456",
        table_id: "table-123",
        snapshot_type: "open",
        chipset: { "100": 50, "500": 20, "1000": 10 },
        counted_by: "staff-001",
        verified_by: "staff-002",
        discrepancy_cents: 0,
        note: "Opening inventory",
        created_at: "2025-12-01T06:00:00Z",
      });
    });

    it("handles null optional fields", () => {
      const dto = toTableInventorySnapshotDTO(mockTableInventorySnapshotRpcNulls);

      expect(dto.counted_by).toBeNull();
      expect(dto.verified_by).toBeNull();
      expect(dto.discrepancy_cents).toBeNull();
      expect(dto.note).toBeNull();
    });

    it("maps different snapshot types correctly", () => {
      const types = ["open", "close", "rundown"] as const;
      types.forEach((snapshot_type) => {
        const rpc = { ...mockTableInventorySnapshotRpc, snapshot_type };
        const dto = toTableInventorySnapshotDTO(rpc);
        expect(dto.snapshot_type).toBe(snapshot_type);
      });
    });

    it("handles zero discrepancy_cents", () => {
      const dto = toTableInventorySnapshotDTO(mockTableInventorySnapshotRpc);

      expect(dto.discrepancy_cents).toBe(0);
    });

    it("handles empty chipset", () => {
      const rpc = { ...mockTableInventorySnapshotRpc, chipset: {} };
      const dto = toTableInventorySnapshotDTO(rpc);

      expect(dto.chipset).toEqual({});
    });

    it("returns a new object (immutability)", () => {
      const dto = toTableInventorySnapshotDTO(mockTableInventorySnapshotRpc);

      expect(dto).not.toBe(mockTableInventorySnapshotRpc);
    });
  });

  describe("toTableInventorySnapshotDTOFromRow", () => {
    const mockSnapshotRow = {
      id: "snapshot-row-123",
      casino_id: "casino-456",
      table_id: "table-123",
      snapshot_type: "close",
      chipset: { "100": 40, "500": 15 },
      counted_by: "staff-010",
      verified_by: "staff-011",
      discrepancy_cents: 500,
      note: "Closing count",
      created_at: "2025-12-01T22:00:00Z",
    };

    it("maps row to DTO correctly", () => {
      const dto = toTableInventorySnapshotDTOFromRow(mockSnapshotRow);

      expect(dto).toEqual({
        id: "snapshot-row-123",
        casino_id: "casino-456",
        table_id: "table-123",
        snapshot_type: "close",
        chipset: { "100": 40, "500": 15 },
        counted_by: "staff-010",
        verified_by: "staff-011",
        discrepancy_cents: 500,
        note: "Closing count",
        created_at: "2025-12-01T22:00:00Z",
      });
    });

    it("handles null optional fields from row", () => {
      const rowWithNulls = {
        ...mockSnapshotRow,
        counted_by: null,
        verified_by: null,
        discrepancy_cents: null,
        note: null,
      };
      const dto = toTableInventorySnapshotDTOFromRow(rowWithNulls);

      expect(dto.counted_by).toBeNull();
      expect(dto.verified_by).toBeNull();
      expect(dto.discrepancy_cents).toBeNull();
      expect(dto.note).toBeNull();
    });
  });

  describe("toTableInventorySnapshotDTOListFromRows", () => {
    const mockRows = [
      {
        id: "snapshot-1",
        casino_id: "casino-456",
        table_id: "table-123",
        snapshot_type: "open",
        chipset: { "100": 50 },
        counted_by: "staff-001",
        verified_by: null,
        discrepancy_cents: null,
        note: null,
        created_at: "2025-12-01T06:00:00Z",
      },
      {
        id: "snapshot-2",
        casino_id: "casino-456",
        table_id: "table-123",
        snapshot_type: "close",
        chipset: { "100": 45 },
        counted_by: "staff-001",
        verified_by: "staff-002",
        discrepancy_cents: 500,
        note: "Short 5 chips",
        created_at: "2025-12-01T22:00:00Z",
      },
    ];

    it("maps empty array", () => {
      const result = toTableInventorySnapshotDTOListFromRows([]);

      expect(result).toEqual([]);
    });

    it("maps multiple rows correctly", () => {
      const result = toTableInventorySnapshotDTOListFromRows(mockRows);

      expect(result).toHaveLength(2);
      expect(result[0].snapshot_type).toBe("open");
      expect(result[1].snapshot_type).toBe("close");
    });

    it("preserves order", () => {
      const result = toTableInventorySnapshotDTOListFromRows(mockRows);

      expect(result[0].id).toBe("snapshot-1");
      expect(result[1].id).toBe("snapshot-2");
    });
  });

  // === Table Fill Mapper Tests ===

  describe("toTableFillDTO", () => {
    it("maps all fields correctly", () => {
      const dto = toTableFillDTO(mockTableFillRpc);

      expect(dto).toEqual({
        id: "fill-123",
        casino_id: "casino-456",
        table_id: "table-123",
        request_id: "req-fill-001",
        chipset: { "100": 100, "500": 50 },
        amount_cents: 3500000,
        requested_by: "staff-001",
        delivered_by: "staff-003",
        received_by: "staff-002",
        slip_no: "FILL-2025-0001",
        created_at: "2025-12-01T10:30:00Z",
      });
    });

    it("handles null optional fields", () => {
      const dto = toTableFillDTO(mockTableFillRpcNulls);

      expect(dto.requested_by).toBeNull();
      expect(dto.delivered_by).toBeNull();
      expect(dto.received_by).toBeNull();
      expect(dto.slip_no).toBeNull();
    });

    it("preserves chipset structure", () => {
      const dto = toTableFillDTO(mockTableFillRpc);

      expect(dto.chipset["100"]).toBe(100);
      expect(dto.chipset["500"]).toBe(50);
    });

    it("preserves amount_cents as integer", () => {
      const dto = toTableFillDTO(mockTableFillRpc);

      expect(dto.amount_cents).toBe(3500000);
      expect(Number.isInteger(dto.amount_cents)).toBe(true);
    });

    it("returns a new object (immutability)", () => {
      const dto = toTableFillDTO(mockTableFillRpc);

      expect(dto).not.toBe(mockTableFillRpc);
    });
  });

  // === Table Credit Mapper Tests ===

  describe("toTableCreditDTO", () => {
    it("maps all fields correctly", () => {
      const dto = toTableCreditDTO(mockTableCreditRpc);

      expect(dto).toEqual({
        id: "credit-123",
        casino_id: "casino-456",
        table_id: "table-123",
        request_id: "req-credit-001",
        chipset: { "1000": 20 },
        amount_cents: 2000000,
        authorized_by: "staff-004",
        sent_by: "staff-002",
        received_by: "staff-005",
        slip_no: "CREDIT-2025-0001",
        created_at: "2025-12-01T18:00:00Z",
      });
    });

    it("handles null optional fields", () => {
      const dto = toTableCreditDTO(mockTableCreditRpcNulls);

      expect(dto.authorized_by).toBeNull();
      expect(dto.sent_by).toBeNull();
      expect(dto.received_by).toBeNull();
      expect(dto.slip_no).toBeNull();
    });

    it("preserves chipset structure", () => {
      const dto = toTableCreditDTO(mockTableCreditRpc);

      expect(dto.chipset["1000"]).toBe(20);
    });

    it("preserves amount_cents as integer", () => {
      const dto = toTableCreditDTO(mockTableCreditRpc);

      expect(dto.amount_cents).toBe(2000000);
      expect(Number.isInteger(dto.amount_cents)).toBe(true);
    });

    it("returns a new object (immutability)", () => {
      const dto = toTableCreditDTO(mockTableCreditRpc);

      expect(dto).not.toBe(mockTableCreditRpc);
    });
  });

  // === Table Drop Event Mapper Tests ===

  describe("toTableDropEventDTO", () => {
    it("maps all fields correctly", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpc);

      expect(dto).toEqual({
        id: "drop-123",
        casino_id: "casino-456",
        table_id: "table-123",
        drop_box_id: "box-001",
        seal_no: "SEAL-2025-0001",
        gaming_day: "2025-12-01",
        seq_no: 1,
        removed_by: "staff-006",
        witnessed_by: "staff-007",
        removed_at: "2025-12-01T06:00:00Z",
        delivered_at: "2025-12-01T06:30:00Z",
        delivered_scan_at: "2025-12-01T06:35:00Z",
        note: "Morning drop collection",
      });
    });

    it("handles null optional fields", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpcNulls);

      expect(dto.seal_no).toBeNull();
      expect(dto.gaming_day).toBeNull();
      expect(dto.seq_no).toBeNull();
      expect(dto.removed_by).toBeNull();
      expect(dto.witnessed_by).toBeNull();
      expect(dto.delivered_at).toBeNull();
      expect(dto.delivered_scan_at).toBeNull();
      expect(dto.note).toBeNull();
    });

    it("preserves drop_box_id", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpc);

      expect(dto.drop_box_id).toBe("box-001");
    });

    it("preserves seq_no as integer", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpc);

      expect(dto.seq_no).toBe(1);
      expect(Number.isInteger(dto.seq_no)).toBe(true);
    });

    it("preserves gaming_day format", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpc);

      expect(dto.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns a new object (immutability)", () => {
      const dto = toTableDropEventDTO(mockTableDropEventRpc);

      expect(dto).not.toBe(mockTableDropEventRpc);
    });
  });

  // === Edge Cases ===

  describe("Edge Cases", () => {
    it("handles table with very long label", () => {
      const row = { ...mockGamingTableRow, label: "A".repeat(100) };
      const dto = toGamingTableDTO(row);

      expect(dto.label).toBe("A".repeat(100));
    });

    it("handles chipset with many denominations", () => {
      const chipset = {
        "1": 1000,
        "5": 500,
        "25": 200,
        "100": 100,
        "500": 50,
        "1000": 25,
        "5000": 10,
        "25000": 5,
      };
      const rpc = { ...mockTableFillRpc, chipset };
      const dto = toTableFillDTO(rpc);

      expect(Object.keys(dto.chipset)).toHaveLength(8);
    });

    it("handles large amount_cents values", () => {
      const rpc = { ...mockTableFillRpc, amount_cents: 999999999 };
      const dto = toTableFillDTO(rpc);

      expect(dto.amount_cents).toBe(999999999);
    });

    it("handles zero amount_cents", () => {
      const rpc = { ...mockTableFillRpc, amount_cents: 0 };
      const dto = toTableFillDTO(rpc);

      expect(dto.amount_cents).toBe(0);
    });

    it("handles pit with special characters", () => {
      const row = { ...mockGamingTableRow, pit: "VIP-Area #1" };
      const dto = toGamingTableDTO(row);

      expect(dto.pit).toBe("VIP-Area #1");
    });

    it("handles ISO timestamp with timezone", () => {
      const row = {
        ...mockGamingTableRow,
        created_at: "2025-12-01T00:00:00.000+00:00",
      };
      const dto = toGamingTableDTO(row);

      expect(dto.created_at).toBe("2025-12-01T00:00:00.000+00:00");
    });

    it("handles timestamp with milliseconds", () => {
      const row = {
        ...mockGamingTableRow,
        created_at: "2025-12-01T10:30:45.123Z",
      };
      const dto = toGamingTableDTO(row);

      expect(dto.created_at).toBe("2025-12-01T10:30:45.123Z");
    });
  });
});
