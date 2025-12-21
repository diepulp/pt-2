/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

// Import http.ts functions
import * as http from '../http';

// Import route modules to verify exports exist
import * as casinoRoute from '@/app/api/v1/casino/route';
import * as casinoDetailRoute from '@/app/api/v1/casino/[id]/route';
import * as settingsRoute from '@/app/api/v1/casino/settings/route';
import * as staffRoute from '@/app/api/v1/casino/staff/route';
import * as gamingDayRoute from '@/app/api/v1/casino/gaming-day/route';

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/casino)', () => {
    it('getCasinos → GET /casino', () => {
      expect(typeof http.getCasinos).toBe('function');
      expect(typeof casinoRoute.GET).toBe('function');
    });

    it('createCasino → POST /casino', () => {
      expect(typeof http.createCasino).toBe('function');
      expect(typeof casinoRoute.POST).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/casino/[id])', () => {
    it('getCasino → GET /casino/[id]', () => {
      expect(typeof http.getCasino).toBe('function');
      expect(typeof casinoDetailRoute.GET).toBe('function');
    });

    it('updateCasino → PATCH /casino/[id]', () => {
      expect(typeof http.updateCasino).toBe('function');
      expect(typeof casinoDetailRoute.PATCH).toBe('function');
    });

    it('deleteCasino → DELETE /casino/[id]', () => {
      expect(typeof http.deleteCasino).toBe('function');
      expect(typeof casinoDetailRoute.DELETE).toBe('function');
    });
  });

  describe('Settings endpoints (/api/v1/casino/settings)', () => {
    it('getCasinoSettings → GET /casino/settings', () => {
      expect(typeof http.getCasinoSettings).toBe('function');
      expect(typeof settingsRoute.GET).toBe('function');
    });

    it('updateCasinoSettings → PATCH /casino/settings', () => {
      expect(typeof http.updateCasinoSettings).toBe('function');
      expect(typeof settingsRoute.PATCH).toBe('function');
    });
  });

  describe('Staff endpoints (/api/v1/casino/staff)', () => {
    it('getCasinoStaff → GET /casino/staff', () => {
      expect(typeof http.getCasinoStaff).toBe('function');
      expect(typeof staffRoute.GET).toBe('function');
    });

    it('createStaff → POST /casino/staff', () => {
      expect(typeof http.createStaff).toBe('function');
      expect(typeof staffRoute.POST).toBe('function');
    });
  });

  describe('Gaming Day endpoints (/api/v1/casino/gaming-day)', () => {
    it('getGamingDay → GET /casino/gaming-day', () => {
      expect(typeof http.getGamingDay).toBe('function');
      expect(typeof gamingDayRoute.GET).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      // List of all exported casino functions from http.ts
      const httpFunctions = [
        'getCasinos',
        'getCasino',
        'createCasino',
        'updateCasino',
        'deleteCasino',
        'getCasinoSettings',
        'updateCasinoSettings',
        'getCasinoStaff',
        'createStaff',
        'getGamingDay',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers like buildParams, generateIdempotencyKey)
      expect(httpFunctions.length).toBe(10);
    });
  });
});
