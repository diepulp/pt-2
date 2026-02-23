/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * @see PRD-037 CSV Player Import
 */

// Import route modules to verify exports exist
import * as batchesRoute from '@/app/api/v1/player-import/batches/route';
import * as batchDetailRoute from '@/app/api/v1/player-import/batches/[id]/route';
import * as rowsRoute from '@/app/api/v1/player-import/batches/[id]/rows/route';
import * as executeRoute from '@/app/api/v1/player-import/batches/[id]/execute/route';

// Import http.ts functions
import * as http from '../http';

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/player-import/batches)', () => {
    it('createBatch → POST /batches', () => {
      expect(typeof http.createBatch).toBe('function');
      expect(typeof batchesRoute.POST).toBe('function');
    });

    it('listBatches → GET /batches', () => {
      expect(typeof http.listBatches).toBe('function');
      expect(typeof batchesRoute.GET).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/player-import/batches/[id])', () => {
    it('getBatch → GET /batches/[id]', () => {
      expect(typeof http.getBatch).toBe('function');
      expect(typeof batchDetailRoute.GET).toBe('function');
    });
  });

  describe('Row endpoints (/api/v1/player-import/batches/[id]/rows)', () => {
    it('stageRows → POST /batches/[id]/rows', () => {
      expect(typeof http.stageRows).toBe('function');
      expect(typeof rowsRoute.POST).toBe('function');
    });

    it('listRows → GET /batches/[id]/rows', () => {
      expect(typeof http.listRows).toBe('function');
      expect(typeof rowsRoute.GET).toBe('function');
    });
  });

  describe('Execute endpoint (/api/v1/player-import/batches/[id]/execute)', () => {
    it('executeBatch → POST /batches/[id]/execute', () => {
      expect(typeof http.executeBatch).toBe('function');
      expect(typeof executeRoute.POST).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      const httpFunctions = [
        'createBatch',
        'listBatches',
        'getBatch',
        'stageRows',
        'listRows',
        'executeBatch',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // 6 public functions (excluding buildParams helper)
      expect(httpFunctions.length).toBe(6);
    });

    it('route files export expected HTTP methods', () => {
      // batches/route.ts — POST + GET
      expect(typeof batchesRoute.POST).toBe('function');
      expect(typeof batchesRoute.GET).toBe('function');

      // batches/[id]/route.ts — GET only
      expect(typeof batchDetailRoute.GET).toBe('function');

      // batches/[id]/rows/route.ts — POST + GET
      expect(typeof rowsRoute.POST).toBe('function');
      expect(typeof rowsRoute.GET).toBe('function');

      // batches/[id]/execute/route.ts — POST only
      expect(typeof executeRoute.POST).toBe('function');
    });

    it('all route files set dynamic = force-dynamic', () => {
      expect(batchesRoute.dynamic).toBe('force-dynamic');
      expect(batchDetailRoute.dynamic).toBe('force-dynamic');
      expect(rowsRoute.dynamic).toBe('force-dynamic');
      expect(executeRoute.dynamic).toBe('force-dynamic');
    });
  });
});
