/**
 * Casino Service HTTP Fetchers Unit Tests
 *
 * Tests the HTTP fetcher functions by mocking the fetch API.
 * These tests verify the correct URL construction, headers, and response handling.
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see SPEC-PRD-000-casino-foundation.md section 8.1
 */

import type {
  CasinoDTO,
  CasinoSettingsDTO,
  GamingDayDTO,
  StaffDTO,
} from "./dtos";
import {
  getCasinos,
  getCasino,
  createCasino,
  updateCasino,
  deleteCasino,
  getCasinoSettings,
  updateCasinoSettings,
  getCasinoStaff,
  createStaff,
  getGamingDay,
} from "./http";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID for idempotency key generation
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid-12345",
  },
});

// Helper to create a successful response
function createSuccessResponse<T>(data: T) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok: true, status: 200, data }),
  };
}

// Helper to create an error response
function createErrorResponse(
  status: number,
  code: string,
  error: string,
  details?: unknown,
) {
  return {
    ok: false,
    json: () =>
      Promise.resolve({
        ok: false,
        status,
        code,
        error,
        details,
      }),
  };
}

describe("Casino HTTP Fetchers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCasinos", () => {
    const mockCasinos: CasinoDTO[] = [
      {
        id: "1",
        name: "Casino A",
        location: "Vegas",
        status: "active",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "2",
        name: "Casino B",
        location: "Reno",
        status: "active",
        created_at: "2025-01-02T00:00:00Z",
      },
    ];

    it("fetches casinos with no filters", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockCasinos }),
      );

      const result = await getCasinos();

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino", {
        headers: { Accept: "application/json" },
      });
      expect(result.items).toEqual(mockCasinos);
    });

    it("includes status filter in URL", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockCasinos }),
      );

      await getCasinos({ status: "active" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/casino?status=active",
        expect.any(Object),
      );
    });

    it("includes pagination params in URL", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({
          items: mockCasinos,
          cursor: "2025-01-01T00:00:00Z",
        }),
      );

      await getCasinos({ limit: 10, cursor: "abc123" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/casino?limit=10&cursor=abc123",
        expect.any(Object),
      );
    });

    it("throws FetchError on error response", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, "INTERNAL_ERROR", "Database error"),
      );

      await expect(getCasinos()).rejects.toThrow("Database error");
    });
  });

  describe("getCasino", () => {
    const mockCasino: CasinoDTO = {
      id: "1",
      name: "Test Casino",
      location: "Vegas",
      status: "active",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("fetches single casino by ID", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockCasino));

      const result = await getCasino("1");

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/1", {
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockCasino);
    });

    it("throws FetchError when casino not found", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(404, "NOT_FOUND", "Casino not found"),
      );

      await expect(getCasino("nonexistent")).rejects.toThrow(
        "Casino not found",
      );
    });
  });

  describe("createCasino", () => {
    const mockCasino: CasinoDTO = {
      id: "new-1",
      name: "New Casino",
      location: "Atlantic City",
      status: "active",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("creates casino with POST request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockCasino));

      const input = { name: "New Casino", location: "Atlantic City" };
      const result = await createCasino(input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockCasino);
    });

    it("includes idempotency key header", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockCasino));

      await createCasino({ name: "Test" });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["idempotency-key"]).toBe("test-uuid-12345");
    });
  });

  describe("updateCasino", () => {
    const mockCasino: CasinoDTO = {
      id: "1",
      name: "Updated Casino",
      location: "Vegas",
      status: "active",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("updates casino with PATCH request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockCasino));

      const input = { name: "Updated Casino" };
      const result = await updateCasino("1", input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/1", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockCasino);
    });
  });

  describe("deleteCasino", () => {
    it("deletes casino with DELETE request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(undefined));

      await deleteCasino("1");

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/1", {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "idempotency-key": "test-uuid-12345",
        },
      });
    });
  });

  describe("getCasinoSettings", () => {
    const mockSettings: CasinoSettingsDTO = {
      id: "settings-1",
      casino_id: "casino-1",
      gaming_day_start_time: "06:00:00",
      timezone: "America/Los_Angeles",
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    };

    it("fetches casino settings", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockSettings));

      const result = await getCasinoSettings();

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/settings", {
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe("updateCasinoSettings", () => {
    const mockSettings: CasinoSettingsDTO = {
      id: "settings-1",
      casino_id: "casino-1",
      gaming_day_start_time: "05:00:00",
      timezone: "America/Los_Angeles",
      watchlist_floor: 5000,
      ctr_threshold: 10000,
    };

    it("updates casino settings with PATCH request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockSettings));

      const input = {
        gaming_day_start_time: "05:00:00",
        watchlist_floor: 5000,
      };
      const result = await updateCasinoSettings(input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/settings", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe("getCasinoStaff", () => {
    const mockStaff: StaffDTO[] = [
      {
        id: "s1",
        first_name: "John",
        last_name: "Doe",
        role: "dealer",
        status: "active",
        employee_id: "EMP001",
        casino_id: "casino-1",
      },
      {
        id: "s2",
        first_name: "Jane",
        last_name: "Smith",
        role: "pit_boss",
        status: "active",
        employee_id: "EMP002",
        casino_id: "casino-1",
      },
    ];

    it("fetches staff with no filters", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse({ items: mockStaff }));

      const result = await getCasinoStaff();

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/staff", {
        headers: { Accept: "application/json" },
      });
      expect(result.items).toEqual(mockStaff);
    });

    it("includes role filter in URL", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse({ items: mockStaff }));

      await getCasinoStaff({ role: "dealer" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/casino/staff?role=dealer",
        expect.any(Object),
      );
    });

    it("includes status filter in URL", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse({ items: mockStaff }));

      await getCasinoStaff({ status: "active" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/casino/staff?status=active",
        expect.any(Object),
      );
    });
  });

  describe("createStaff", () => {
    const mockStaff: StaffDTO = {
      id: "s-new",
      first_name: "New",
      last_name: "Dealer",
      role: "dealer",
      status: "active",
      employee_id: "EMP003",
      casino_id: "casino-1",
    };

    it("creates staff with POST request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockStaff));

      const input = {
        first_name: "New",
        last_name: "Dealer",
        role: "dealer" as const,
        employee_id: "EMP003",
        casino_id: "casino-1",
        email: "new.dealer@example.com",
      };
      const result = await createStaff(input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/staff", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockStaff);
    });
  });

  describe("getGamingDay", () => {
    const mockGamingDay: GamingDayDTO = {
      gaming_day: "2025-11-29",
      casino_id: "casino-1",
      computed_at: "2025-11-29T10:00:00Z",
      timezone: "America/Los_Angeles",
    };

    it("fetches gaming day without timestamp", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockGamingDay));

      const result = await getGamingDay();

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/casino/gaming-day", {
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockGamingDay);
    });

    it("fetches gaming day with timestamp parameter", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockGamingDay));

      const timestamp = "2025-01-15T14:00:00Z";
      await getGamingDay(timestamp);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/casino/gaming-day?timestamp=${encodeURIComponent(timestamp)}`,
        expect.any(Object),
      );
    });
  });
});
