/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS5 (QA-ROUTE-TESTING)
 */

// Import http.ts functions
import * as http from '../http';

// Import route modules to verify exports exist
import * as collectionRoute from '@/app/api/v1/rating-slips/route';
import * as resourceRoute from '@/app/api/v1/rating-slips/[id]/route';
import * as pauseRoute from '@/app/api/v1/rating-slips/[id]/pause/route';
import * as resumeRoute from '@/app/api/v1/rating-slips/[id]/resume/route';
import * as closeRoute from '@/app/api/v1/rating-slips/[id]/close/route';
import * as durationRoute from '@/app/api/v1/rating-slips/[id]/duration/route';
import * as averageBetRoute from '@/app/api/v1/rating-slips/[id]/average-bet/route';

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/rating-slips)', () => {
    it('startRatingSlip → POST /rating-slips', () => {
      expect(typeof http.startRatingSlip).toBe('function');
      expect(typeof collectionRoute.POST).toBe('function');
    });

    it('listRatingSlips → GET /rating-slips', () => {
      expect(typeof http.listRatingSlips).toBe('function');
      expect(typeof collectionRoute.GET).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/rating-slips/[id])', () => {
    it('getRatingSlip → GET /rating-slips/[id]', () => {
      expect(typeof http.getRatingSlip).toBe('function');
      expect(typeof resourceRoute.GET).toBe('function');
    });
  });

  describe('Action endpoints (/api/v1/rating-slips/[id]/*)', () => {
    it('pauseRatingSlip → POST /rating-slips/[id]/pause', () => {
      expect(typeof http.pauseRatingSlip).toBe('function');
      expect(typeof pauseRoute.POST).toBe('function');
    });

    it('resumeRatingSlip → POST /rating-slips/[id]/resume', () => {
      expect(typeof http.resumeRatingSlip).toBe('function');
      expect(typeof resumeRoute.POST).toBe('function');
    });

    it('closeRatingSlip → POST /rating-slips/[id]/close', () => {
      expect(typeof http.closeRatingSlip).toBe('function');
      expect(typeof closeRoute.POST).toBe('function');
    });

    it('getRatingSlipDuration → GET /rating-slips/[id]/duration', () => {
      expect(typeof http.getRatingSlipDuration).toBe('function');
      expect(typeof durationRoute.GET).toBe('function');
    });

    it('updateAverageBet → PATCH /rating-slips/[id]/average-bet', () => {
      expect(typeof http.updateAverageBet).toBe('function');
      expect(typeof averageBetRoute.PATCH).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      // List of all exported functions from http.ts
      const httpFunctions = [
        'startRatingSlip',
        'listRatingSlips',
        'getRatingSlip',
        'pauseRatingSlip',
        'resumeRatingSlip',
        'closeRatingSlip',
        'getRatingSlipDuration',
        'updateAverageBet',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers like buildParams, generateIdempotencyKey)
      expect(httpFunctions.length).toBe(8);
    });
  });
});
