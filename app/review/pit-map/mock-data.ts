/**
 * Mock data for Pit Map Navigation demo
 */

import type { PitData, TableData, TableAlert } from "./types";

const createAlert = (
  type: TableAlert["type"],
  label: string,
  severity: TableAlert["severity"] = "info"
): TableAlert => ({
  id: crypto.randomUUID(),
  type,
  label,
  severity,
  timestamp: new Date(),
});

const createTable = (
  id: string,
  label: string,
  pitId: string,
  overrides: Partial<TableData> = {}
): TableData => ({
  id,
  label,
  pitId,
  status: "active",
  gameType: "blackjack",
  minBet: 25,
  maxBet: 500,
  occupancy: Math.floor(Math.random() * 7),
  maxOccupancy: 7,
  ...overrides,
});

export const mockPits: PitData[] = [
  {
    id: "pit-1",
    label: "High Limit",
    capacity: 8,
    sequence: 1,
    isPinned: true,
    tables: [
      createTable("t-hl-1", "HL-BJ-01", "pit-1", {
        gameType: "blackjack",
        minBet: 100,
        maxBet: 10000,
        dealerName: "Maria S.",
        occupancy: 5,
        alerts: [createAlert("high_action", "$45K action", "warning")],
      }),
      createTable("t-hl-2", "HL-BJ-02", "pit-1", {
        gameType: "blackjack",
        minBet: 100,
        maxBet: 10000,
        dealerName: "James K.",
        occupancy: 3,
      }),
      createTable("t-hl-3", "HL-BAC-01", "pit-1", {
        gameType: "baccarat",
        minBet: 500,
        maxBet: 25000,
        dealerName: "Chen L.",
        occupancy: 6,
        alerts: [
          createAlert("mtl", "MTL $12K", "critical"),
          createAlert("fill", "Fill pending", "info"),
        ],
      }),
      createTable("t-hl-4", "HL-RLT-01", "pit-1", {
        gameType: "roulette",
        minBet: 50,
        maxBet: 5000,
        status: "inactive",
        dealerName: "—",
        occupancy: 0,
      }),
    ],
  },
  {
    id: "pit-2",
    label: "Main Floor",
    capacity: 16,
    sequence: 2,
    isRecent: true,
    tables: [
      createTable("t-mf-1", "BJ-01", "pit-2", {
        dealerName: "Tony M.",
        occupancy: 6,
      }),
      createTable("t-mf-2", "BJ-02", "pit-2", {
        dealerName: "Sarah P.",
        occupancy: 4,
        alerts: [createAlert("drop", "Drop scheduled", "info")],
      }),
      createTable("t-mf-3", "BJ-03", "pit-2", {
        dealerName: "Mike R.",
        occupancy: 7,
      }),
      createTable("t-mf-4", "BJ-04", "pit-2", {
        status: "closed",
        dealerName: "—",
        occupancy: 0,
      }),
      createTable("t-mf-5", "BJ-05", "pit-2", {
        dealerName: "Lisa K.",
        occupancy: 2,
      }),
      createTable("t-mf-6", "BJ-06", "pit-2", {
        dealerName: "David L.",
        occupancy: 5,
        alerts: [createAlert("limit", "Max reached", "warning")],
      }),
      createTable("t-mf-7", "RLT-01", "pit-2", {
        gameType: "roulette",
        minBet: 10,
        maxBet: 1000,
        dealerName: "Anna B.",
        occupancy: 8,
        maxOccupancy: 12,
      }),
      createTable("t-mf-8", "RLT-02", "pit-2", {
        gameType: "roulette",
        minBet: 10,
        maxBet: 1000,
        status: "inactive",
        dealerName: "—",
        occupancy: 0,
        maxOccupancy: 12,
      }),
      createTable("t-mf-9", "PKR-01", "pit-2", {
        gameType: "poker",
        minBet: 5,
        maxBet: 200,
        dealerName: "Carlos G.",
        occupancy: 9,
        maxOccupancy: 10,
      }),
      createTable("t-mf-10", "PKR-02", "pit-2", {
        gameType: "poker",
        minBet: 5,
        maxBet: 200,
        dealerName: "Jennifer H.",
        occupancy: 7,
        maxOccupancy: 10,
      }),
    ],
  },
  {
    id: "pit-3",
    label: "North Wing",
    capacity: 12,
    sequence: 3,
    tables: [
      createTable("t-nw-1", "NW-BJ-01", "pit-3", {
        dealerName: "Robert T.",
        occupancy: 4,
      }),
      createTable("t-nw-2", "NW-BJ-02", "pit-3", {
        dealerName: "Emily W.",
        occupancy: 6,
      }),
      createTable("t-nw-3", "NW-BJ-03", "pit-3", {
        dealerName: "Mark D.",
        occupancy: 3,
      }),
      createTable("t-nw-4", "NW-BAC-01", "pit-3", {
        gameType: "baccarat",
        minBet: 50,
        maxBet: 5000,
        dealerName: "Susan Y.",
        occupancy: 5,
        maxOccupancy: 8,
      }),
      createTable("t-nw-5", "NW-RLT-01", "pit-3", {
        gameType: "roulette",
        dealerName: "Paul N.",
        occupancy: 10,
        maxOccupancy: 12,
        alerts: [createAlert("fill", "Fill complete", "info")],
      }),
    ],
  },
  {
    id: "pit-4",
    label: "Poker Room",
    capacity: 20,
    sequence: 4,
    tables: Array.from({ length: 12 }, (_, i) =>
      createTable(`t-pr-${i + 1}`, `PKR-${String(i + 1).padStart(2, "0")}`, "pit-4", {
        gameType: "poker",
        minBet: i < 4 ? 2 : i < 8 ? 5 : 10,
        maxBet: i < 4 ? 100 : i < 8 ? 500 : 1000,
        occupancy: Math.floor(Math.random() * 10),
        maxOccupancy: 10,
        dealerName: ["John S.", "Amy L.", "Chris B.", "Diana M.", "Eric F.", "Grace H.", "Henry J.", "Ivy K.", "Jack L.", "Kate M.", "Leo N.", "Mary O."][i],
        status: i === 5 || i === 9 ? "closed" : "active",
      })
    ),
  },
  {
    id: "pit-5",
    label: "VIP Salon",
    capacity: 6,
    sequence: 5,
    isPinned: true,
    tables: [
      createTable("t-vip-1", "VIP-BAC-01", "pit-5", {
        gameType: "baccarat",
        minBet: 1000,
        maxBet: 100000,
        dealerName: "Victoria A.",
        occupancy: 4,
        maxOccupancy: 6,
        alerts: [
          createAlert("mtl", "MTL $85K", "critical"),
          createAlert("high_action", "$250K action", "warning"),
        ],
      }),
      createTable("t-vip-2", "VIP-BAC-02", "pit-5", {
        gameType: "baccarat",
        minBet: 1000,
        maxBet: 100000,
        dealerName: "William B.",
        occupancy: 3,
        maxOccupancy: 6,
      }),
      createTable("t-vip-3", "VIP-BJ-01", "pit-5", {
        gameType: "blackjack",
        minBet: 500,
        maxBet: 50000,
        dealerName: "Alexandra C.",
        occupancy: 2,
      }),
    ],
  },
  {
    id: "pit-6",
    label: "East Pavilion",
    capacity: 10,
    sequence: 6,
    tables: [
      createTable("t-ep-1", "EP-BJ-01", "pit-6", {
        dealerName: "Frank R.",
        occupancy: 5,
      }),
      createTable("t-ep-2", "EP-BJ-02", "pit-6", {
        dealerName: "Gloria S.",
        occupancy: 3,
        status: "inactive",
      }),
      createTable("t-ep-3", "EP-RLT-01", "pit-6", {
        gameType: "roulette",
        dealerName: "Harry T.",
        occupancy: 9,
        maxOccupancy: 12,
      }),
    ],
  },
];

export const getPitStats = (pit: PitData) => {
  const active = pit.tables.filter((t) => t.status === "active").length;
  const closed = pit.tables.filter((t) => t.status === "closed").length;
  const inactive = pit.tables.filter((t) => t.status === "inactive").length;
  return { active, closed, inactive, total: pit.tables.length };
};
