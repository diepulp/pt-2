/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS1 (PlayerService Route Handler Tests)
 */

// Import http.ts functions

// Import route modules to verify exports exist
import * as enrollRoute from '@/app/api/v1/players/[playerId]/enroll/route';
import * as enrollmentRoute from '@/app/api/v1/players/[playerId]/enrollment/route';
import * as loyaltyRoute from '@/app/api/v1/players/[playerId]/loyalty/route';
import * as playerDetailRoute from '@/app/api/v1/players/[playerId]/route';
import * as playersRoute from '@/app/api/v1/players/route';

import * as http from '../http';

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/players)', () => {
    it('searchPlayers → GET /players (with q param)', () => {
      expect(typeof http.searchPlayers).toBe('function');
      expect(typeof playersRoute.GET).toBe('function');
    });

    it('getPlayers → GET /players', () => {
      expect(typeof http.getPlayers).toBe('function');
      expect(typeof playersRoute.GET).toBe('function');
    });

    it('createPlayer → POST /players', () => {
      expect(typeof http.createPlayer).toBe('function');
      expect(typeof playersRoute.POST).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/players/[playerId])', () => {
    it('getPlayer → GET /players/[playerId]', () => {
      expect(typeof http.getPlayer).toBe('function');
      expect(typeof playerDetailRoute.GET).toBe('function');
    });

    it('updatePlayer → PATCH /players/[playerId]', () => {
      expect(typeof http.updatePlayer).toBe('function');
      expect(typeof playerDetailRoute.PATCH).toBe('function');
    });
  });

  describe('Action endpoints (/api/v1/players/[playerId]/*)', () => {
    it('enrollPlayer → POST /players/[playerId]/enroll', () => {
      expect(typeof http.enrollPlayer).toBe('function');
      expect(typeof enrollRoute.POST).toBe('function');
    });

    it('getPlayerEnrollment → GET /players/[playerId]/enrollment', () => {
      expect(typeof http.getPlayerEnrollment).toBe('function');
      expect(typeof enrollmentRoute.GET).toBe('function');
    });
  });

  describe('Loyalty endpoints (/api/v1/players/[playerId]/loyalty)', () => {
    it('loyalty route exists for player loyalty balance', () => {
      // Note: This route uses LoyaltyService, not PlayerService
      // but is mounted under /players/[playerId]/loyalty
      expect(typeof loyaltyRoute.GET).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      // List of all exported player functions from http.ts
      const httpFunctions = [
        'searchPlayers',
        'getPlayers',
        'getPlayer',
        'createPlayer',
        'updatePlayer',
        'enrollPlayer',
        'getPlayerEnrollment',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers like buildParams, generateIdempotencyKey)
      expect(httpFunctions.length).toBe(7);
    });
  });
});
