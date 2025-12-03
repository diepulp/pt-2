/**
 * PlayerService HTTP Fetchers Unit Tests
 *
 * Tests the HTTP fetcher functions by mocking the fetch API.
 * These tests verify the correct URL construction, headers, and response handling.
 *
 * @see services/player/http.ts - HTTP fetchers
 * @see PRD-003 Player & Visit Management
 */

import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerSearchResultDTO,
} from "../dtos";
import {
  createPlayer,
  enrollPlayer,
  getPlayer,
  getPlayerEnrollment,
  getPlayers,
  searchPlayers,
  updatePlayer,
} from "../http";

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

describe("Player HTTP Fetchers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // Search Players
  // ===========================================================================

  describe("searchPlayers", () => {
    const mockSearchResults: PlayerSearchResultDTO[] = [
      {
        id: "p1",
        first_name: "John",
        last_name: "Doe",
        full_name: "John Doe",
        enrollment_status: "enrolled",
      },
      {
        id: "p2",
        first_name: "Johnny",
        last_name: "Smith",
        full_name: "Johnny Smith",
        enrollment_status: "not_enrolled",
      },
    ];

    it("searches players with query parameter", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockSearchResults }),
      );

      const result = await searchPlayers("John");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/players?q=John&limit=20",
        {
          headers: { Accept: "application/json" },
        },
      );
      expect(result).toEqual(mockSearchResults);
    });

    it("includes custom limit in URL", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockSearchResults }),
      );

      await searchPlayers("John", 10);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/players?q=John&limit=10",
        {
          headers: { Accept: "application/json" },
        },
      );
    });

    it("throws error on failure", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, "INTERNAL_ERROR", "Database error"),
      );

      await expect(searchPlayers("John")).rejects.toThrow("Database error");
    });
  });

  // ===========================================================================
  // Get Players (List)
  // ===========================================================================

  describe("getPlayers", () => {
    const mockPlayers: PlayerDTO[] = [
      {
        id: "p1",
        first_name: "John",
        last_name: "Doe",
        birth_date: "1990-01-01",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "p2",
        first_name: "Jane",
        last_name: "Smith",
        birth_date: "1985-05-15",
        created_at: "2025-01-02T00:00:00Z",
      },
    ];

    it("fetches players with no filters", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockPlayers, cursor: null }),
      );

      const result = await getPlayers();

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players", {
        headers: { Accept: "application/json" },
      });
      expect(result.items).toEqual(mockPlayers);
      expect(result.cursor).toBeNull();
    });

    it("includes search filter in URL", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockPlayers, cursor: null }),
      );

      await getPlayers({ q: "John" });

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players?q=John", {
        headers: { Accept: "application/json" },
      });
    });

    it("includes pagination params in URL", async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({
          items: mockPlayers,
          cursor: "2025-01-01T00:00:00Z",
        }),
      );

      await getPlayers({ limit: 10, cursor: "abc123" });

      // URL param order depends on object iteration order
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/v1\/players\?(limit=10&cursor=abc123|cursor=abc123&limit=10)/,
        ),
        expect.any(Object),
      );
    });

    it("throws error on failure", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, "INTERNAL_ERROR", "Failed to fetch"),
      );

      await expect(getPlayers()).rejects.toThrow("Failed to fetch");
    });
  });

  // ===========================================================================
  // Get Player (Detail)
  // ===========================================================================

  describe("getPlayer", () => {
    const mockPlayer: PlayerDTO = {
      id: "p1",
      first_name: "John",
      last_name: "Doe",
      birth_date: "1990-01-01",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("fetches single player by ID", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockPlayer));

      const result = await getPlayer("p1");

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players/p1", {
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockPlayer);
    });

    it("throws error when player not found", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(404, "NOT_FOUND", "Player not found"),
      );

      await expect(getPlayer("nonexistent")).rejects.toThrow(
        "Player not found",
      );
    });
  });

  // ===========================================================================
  // Create Player
  // ===========================================================================

  describe("createPlayer", () => {
    const mockPlayer: PlayerDTO = {
      id: "new-p1",
      first_name: "New",
      last_name: "Player",
      birth_date: "1995-03-20",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("creates player with POST request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockPlayer));

      const input: CreatePlayerDTO = {
        first_name: "New",
        last_name: "Player",
        birth_date: "1995-03-20",
      };
      const result = await createPlayer(input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockPlayer);
    });

    it("includes idempotency key header", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockPlayer));

      await createPlayer({ first_name: "Test", last_name: "User" });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["idempotency-key"]).toBe("test-uuid-12345");
    });
  });

  // ===========================================================================
  // Update Player
  // ===========================================================================

  describe("updatePlayer", () => {
    const mockPlayer: PlayerDTO = {
      id: "p1",
      first_name: "Updated",
      last_name: "Doe",
      birth_date: "1990-01-01",
      created_at: "2025-01-01T00:00:00Z",
    };

    it("updates player with PATCH request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockPlayer));

      const input = { first_name: "Updated" };
      const result = await updatePlayer("p1", input);

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players/p1", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify(input),
      });
      expect(result).toEqual(mockPlayer);
    });

    it("includes idempotency key for retries", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockPlayer));

      await updatePlayer("p1", { last_name: "Smith" });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["idempotency-key"]).toBe("test-uuid-12345");
    });
  });

  // ===========================================================================
  // Enroll Player
  // ===========================================================================

  describe("enrollPlayer", () => {
    const mockEnrollment: PlayerEnrollmentDTO = {
      player_id: "p1",
      casino_id: "casino-1",
      status: "active",
      enrolled_at: "2025-01-01T00:00:00Z",
    };

    it("enrolls player with POST request", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockEnrollment));

      const result = await enrollPlayer("p1");

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players/p1/enroll", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "test-uuid-12345",
        },
        body: JSON.stringify({}),
      });
      expect(result).toEqual(mockEnrollment);
    });

    it("returns existing enrollment for idempotent call", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockEnrollment));

      const result = await enrollPlayer("p1");

      expect(result).toEqual(mockEnrollment);
    });
  });

  // ===========================================================================
  // Get Player Enrollment
  // ===========================================================================

  describe("getPlayerEnrollment", () => {
    const mockEnrollment: PlayerEnrollmentDTO = {
      player_id: "p1",
      casino_id: "casino-1",
      status: "active",
      enrolled_at: "2025-01-01T00:00:00Z",
    };

    it("fetches enrollment status", async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockEnrollment));

      const result = await getPlayerEnrollment("p1");

      expect(mockFetch).toHaveBeenCalledWith("/api/v1/players/p1/enrollment", {
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockEnrollment);
    });

    it("returns null when player not enrolled (404)", async () => {
      // Mock a 404 response - the function checks for '404' in error message
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            ok: false,
            status: 404,
            code: "NOT_FOUND",
            error: "404 Player not enrolled",
          }),
      });

      const result = await getPlayerEnrollment("p1");

      expect(result).toBeNull();
    });

    it("throws error for other failures", async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, "INTERNAL_ERROR", "Database error"),
      );

      await expect(getPlayerEnrollment("p1")).rejects.toThrow("Database error");
    });
  });
});
