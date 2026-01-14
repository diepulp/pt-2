/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/shift-dashboards/metrics/tables
 *
 * Tests for shift table metrics endpoint.
 * @see PRD-Shift-Dashboards-v0.2
 */

import { GET } from "../route";

// Mock Supabase client
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS
jest.mock("@/lib/server-actions/middleware", () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: "test-correlation-id",
      rlsContext: { casinoId: "casino-1", actorId: "actor-1" },
      startedAt: Date.now(),
    })
  ),
}));

// Mock service function
jest.mock("@/services/table-context/shift-metrics", () => ({
  getShiftTableMetrics: jest.fn().mockResolvedValue([]),
}));

describe("GET /api/v1/shift-dashboards/metrics/tables", () => {
  it("exports GET handler", () => {
    expect(typeof GET).toBe("function");
  });
});
