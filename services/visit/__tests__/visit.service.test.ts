/**
 * VisitService HTTP Fetchers Unit Tests
 *
 * Tests the HTTP fetcher functions by mocking the fetch API.
 * These tests verify the correct URL construction, headers, and response handling.
 *
 * @see services/visit/http.ts - HTTP fetchers
 * @see PRD-003 Player & Visit Management
 */

import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitDTO,
  VisitWithPlayerDTO,
} from '../dtos';
import {
  closeVisit,
  getActiveVisit,
  getVisit,
  getVisits,
  startVisit,
} from '../http';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID for idempotency key generation
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-12345',
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

describe('Visit HTTP Fetchers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // Get Visits (List)
  // ===========================================================================

  describe('getVisits', () => {
    const mockVisits: VisitWithPlayerDTO[] = [
      {
        id: 'v1',
        player_id: 'p1',
        casino_id: 'casino-1',
        visit_kind: 'gaming_identified_rated',
        started_at: '2025-01-15T10:00:00Z',
        ended_at: null,
        player: { id: 'p1', first_name: 'John', last_name: 'Doe' },
      },
      {
        id: 'v2',
        player_id: 'p2',
        casino_id: 'casino-1',
        visit_kind: 'gaming_identified_rated',
        started_at: '2025-01-15T09:00:00Z',
        ended_at: '2025-01-15T12:00:00Z',
        player: { id: 'p2', first_name: 'Jane', last_name: 'Smith' },
      },
    ];

    it('fetches visits with no filters', async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockVisits, cursor: null }),
      );

      const result = await getVisits();

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits', {
        headers: { Accept: 'application/json' },
      });
      expect(result.items).toEqual(mockVisits);
      expect(result.cursor).toBeNull();
    });

    it('includes player_id filter in URL', async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: [mockVisits[0]], cursor: null }),
      );

      await getVisits({ player_id: 'p1' });

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits?player_id=p1', {
        headers: { Accept: 'application/json' },
      });
    });

    it('includes status filter in URL', async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockVisits, cursor: null }),
      );

      await getVisits({ status: 'active' });

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits?status=active', {
        headers: { Accept: 'application/json' },
      });
    });

    it('includes date range filters in URL', async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({ items: mockVisits, cursor: null }),
      );

      await getVisits({ from_date: '2025-01-01', to_date: '2025-01-31' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/visits?from_date=2025-01-01&to_date=2025-01-31',
        expect.any(Object),
      );
    });

    it('includes pagination params in URL', async () => {
      mockFetch.mockResolvedValue(
        createSuccessResponse({
          items: mockVisits,
          cursor: '2025-01-15T09:00:00Z',
        }),
      );

      await getVisits({ limit: 10, cursor: 'abc123' });

      // URL param order depends on object iteration order
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/v1\/visits\?(limit=10&cursor=abc123|cursor=abc123&limit=10)/,
        ),
        expect.any(Object),
      );
    });

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to fetch visits'),
      );

      await expect(getVisits()).rejects.toThrow('Failed to fetch visits');
    });
  });

  // ===========================================================================
  // Get Visit (Detail)
  // ===========================================================================

  describe('getVisit', () => {
    const mockVisit: VisitDTO = {
      id: 'v1',
      player_id: 'p1',
      casino_id: 'casino-1',
      visit_kind: 'gaming_identified_rated',
      started_at: '2025-01-15T10:00:00Z',
      ended_at: null,
    };

    it('fetches single visit by ID', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockVisit));

      const result = await getVisit('v1');

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits/v1', {
        headers: { Accept: 'application/json' },
      });
      expect(result).toEqual(mockVisit);
    });

    it('throws error when visit not found', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(404, 'NOT_FOUND', 'Visit not found'),
      );

      await expect(getVisit('nonexistent')).rejects.toThrow('Visit not found');
    });
  });

  // ===========================================================================
  // Get Active Visit
  // ===========================================================================

  describe('getActiveVisit', () => {
    const mockActiveVisit: ActiveVisitDTO = {
      has_active_visit: true,
      visit: {
        id: 'v1',
        player_id: 'p1',
        casino_id: 'casino-1',
        visit_kind: 'gaming_identified_rated',
        started_at: '2025-01-15T10:00:00Z',
        ended_at: null,
      },
    };

    it('fetches active visit for player', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockActiveVisit));

      const result = await getActiveVisit('p1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/visits/active?player_id=p1',
        {
          headers: { Accept: 'application/json' },
        },
      );
      expect(result).toEqual(mockActiveVisit);
    });

    it('returns no active visit when player has none', async () => {
      const noActiveVisit: ActiveVisitDTO = {
        has_active_visit: false,
        visit: null,
      };
      mockFetch.mockResolvedValue(createSuccessResponse(noActiveVisit));

      const result = await getActiveVisit('p2');

      expect(result.has_active_visit).toBe(false);
      expect(result.visit).toBeNull();
    });
  });

  // ===========================================================================
  // Start Visit
  // ===========================================================================

  describe('startVisit', () => {
    const mockVisit: VisitDTO = {
      id: 'new-v1',
      player_id: 'p1',
      casino_id: 'casino-1',
      visit_kind: 'gaming_identified_rated',
      started_at: '2025-01-15T10:00:00Z',
      ended_at: null,
    };

    it('starts visit with POST request', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockVisit));

      const result = await startVisit('p1');

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': 'test-uuid-12345',
        },
        body: JSON.stringify({ player_id: 'p1' }),
      });
      expect(result).toEqual(mockVisit);
    });

    it('includes idempotency key header', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockVisit));

      await startVisit('p1');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['idempotency-key']).toBe('test-uuid-12345');
    });

    it('returns existing active visit for idempotent call', async () => {
      // When player already has active visit, startVisit returns it
      mockFetch.mockResolvedValue(createSuccessResponse(mockVisit));

      const result = await startVisit('p1');

      expect(result).toEqual(mockVisit);
    });
  });

  // ===========================================================================
  // Close Visit
  // ===========================================================================

  describe('closeVisit', () => {
    const mockClosedVisit: VisitDTO = {
      id: 'v1',
      player_id: 'p1',
      casino_id: 'casino-1',
      visit_kind: 'gaming_identified_rated',
      started_at: '2025-01-15T10:00:00Z',
      ended_at: '2025-01-15T14:00:00Z',
    };

    it('closes visit with PATCH request', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockClosedVisit));

      const result = await closeVisit('v1');

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits/v1/close', {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': 'test-uuid-12345',
        },
        body: JSON.stringify({}),
      });
      expect(result).toEqual(mockClosedVisit);
    });

    it('includes custom ended_at when provided', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockClosedVisit));

      const input: CloseVisitDTO = {
        ended_at: '2025-01-15T13:30:00Z',
      };
      await closeVisit('v1', input);

      expect(mockFetch).toHaveBeenCalledWith('/api/v1/visits/v1/close', {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': 'test-uuid-12345',
        },
        body: JSON.stringify(input),
      });
    });

    it('includes idempotency key for safe retries', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse(mockClosedVisit));

      await closeVisit('v1');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['idempotency-key']).toBe('test-uuid-12345');
    });

    it('returns already closed visit for idempotent call', async () => {
      // When visit is already closed, closeVisit returns it without error
      mockFetch.mockResolvedValue(createSuccessResponse(mockClosedVisit));

      const result = await closeVisit('v1');

      expect(result.ended_at).not.toBeNull();
    });

    it('throws error when visit not found', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(404, 'NOT_FOUND', 'Visit not found'),
      );

      await expect(closeVisit('nonexistent')).rejects.toThrow(
        'Visit not found',
      );
    });
  });
});
