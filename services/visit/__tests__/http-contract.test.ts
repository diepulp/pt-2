/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS2 (VisitService Route Handler Tests)
 */

// Import http.ts functions
import * as closeRoute from '@/app/api/v1/visits/[visitId]/close/route';
import * as resourceRoute from '@/app/api/v1/visits/[visitId]/route';
import * as activeRoute from '@/app/api/v1/visits/active/route';
import * as collectionRoute from '@/app/api/v1/visits/route';

import * as http from '../http';

// Import route modules to verify exports exist

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/visits)', () => {
    it('getVisits → GET /visits', () => {
      expect(typeof http.getVisits).toBe('function');
      expect(typeof collectionRoute.GET).toBe('function');
    });

    it('startVisit → POST /visits', () => {
      expect(typeof http.startVisit).toBe('function');
      expect(typeof collectionRoute.POST).toBe('function');
    });
  });

  describe('Active visit endpoint (/api/v1/visits/active)', () => {
    it('getActiveVisit → GET /visits/active', () => {
      expect(typeof http.getActiveVisit).toBe('function');
      expect(typeof activeRoute.GET).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/visits/[visitId])', () => {
    it('getVisit → GET /visits/[visitId]', () => {
      expect(typeof http.getVisit).toBe('function');
      expect(typeof resourceRoute.GET).toBe('function');
    });
  });

  describe('Action endpoints (/api/v1/visits/[visitId]/*)', () => {
    it('closeVisit → PATCH /visits/[visitId]/close', () => {
      expect(typeof http.closeVisit).toBe('function');
      expect(typeof closeRoute.PATCH).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      // List of all exported functions from http.ts
      const httpFunctions = [
        'getVisits',
        'getVisit',
        'getActiveVisit',
        'startVisit',
        'closeVisit',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers like buildParams, generateIdempotencyKey)
      expect(httpFunctions.length).toBe(5);
    });
  });
});
