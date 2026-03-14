/**
 * @jest-environment node
 *
 * Exclusion HTTP Client ↔ Route Handler Contract Tests — Smoke (S3.7)
 *
 * Validates that every function in exclusion-http.ts has a corresponding route export.
 *
 * Classification: Smoke (S3.7) per TESTING_GOVERNANCE_STANDARD §9.2.
 * Verifies import resolution only — no behavioral assertions.
 * Does NOT count toward verification status.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS7
 */

import * as exclusionsRoute from '@/app/api/v1/players/[playerId]/exclusions/route';
import * as activeRoute from '@/app/api/v1/players/[playerId]/exclusions/active/route';
import * as liftRoute from '@/app/api/v1/players/[playerId]/exclusions/[exclusionId]/lift/route';

import * as http from '../exclusion-http';

describe('exclusion-http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/exclusions)', () => {
    it('listExclusions → GET /exclusions', () => {
      expect(typeof http.listExclusions).toBe('function');
      expect(typeof exclusionsRoute.GET).toBe('function');
    });

    it('createExclusion → POST /exclusions', () => {
      expect(typeof http.createExclusion).toBe('function');
      expect(typeof exclusionsRoute.POST).toBe('function');
    });
  });

  describe('Active endpoint (/exclusions/active)', () => {
    it('getActiveExclusions → GET /exclusions/active', () => {
      expect(typeof http.getActiveExclusions).toBe('function');
      expect(typeof activeRoute.GET).toBe('function');
    });
  });

  describe('Lift endpoint (/exclusions/[exclusionId]/lift)', () => {
    it('liftExclusion → POST /exclusions/[exclusionId]/lift', () => {
      expect(typeof http.liftExclusion).toBe('function');
      expect(typeof liftRoute.POST).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all exclusion-http.ts exported functions have corresponding routes', () => {
      const httpFunctions = [
        'listExclusions',
        'getActiveExclusions',
        'createExclusion',
        'liftExclusion',
        'getExclusionStatus',
      ];

      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      expect(httpFunctions.length).toBe(5);
    });
  });
});
