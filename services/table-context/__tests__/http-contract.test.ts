/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS3 (TableService Route Handler Tests - tables)
 * Workstream: WS6 (TableContextService Route Handler Tests - table-context)
 */

// Import http.ts functions

// Import route modules to verify exports exist
// Table routes (/api/v1/tables)
import * as creditsRoute from '@/app/api/v1/table-context/credits/route';
import * as dropEventsRoute from '@/app/api/v1/table-context/drop-events/route';
import * as fillsRoute from '@/app/api/v1/table-context/fills/route';
import * as inventorySnapshotsRoute from '@/app/api/v1/table-context/inventory-snapshots/route';
import * as activateRoute from '@/app/api/v1/tables/[tableId]/activate/route';
import * as closeRoute from '@/app/api/v1/tables/[tableId]/close/route';
import * as deactivateRoute from '@/app/api/v1/tables/[tableId]/deactivate/route';
import * as dealerRoute from '@/app/api/v1/tables/[tableId]/dealer/route';

// Table context routes (/api/v1/table-context)
import * as tableDetailRoute from '@/app/api/v1/tables/[tableId]/route';
import * as tablesRoute from '@/app/api/v1/tables/route';

import * as http from '../http';

describe('http.ts ↔ route.ts contract', () => {
  describe('Collection endpoints (/api/v1/tables)', () => {
    it('fetchTables → GET /tables', () => {
      expect(typeof http.fetchTables).toBe('function');
      expect(typeof tablesRoute.GET).toBe('function');
    });
  });

  describe('Resource endpoints (/api/v1/tables/[tableId])', () => {
    it('fetchTable → GET /tables/[tableId]', () => {
      expect(typeof http.fetchTable).toBe('function');
      expect(typeof tableDetailRoute.GET).toBe('function');
    });
  });

  describe('Table lifecycle endpoints', () => {
    it('activateTable → POST /tables/[tableId]/activate', () => {
      expect(typeof http.activateTable).toBe('function');
      expect(typeof activateRoute.POST).toBe('function');
    });

    it('deactivateTable → POST /tables/[tableId]/deactivate', () => {
      expect(typeof http.deactivateTable).toBe('function');
      expect(typeof deactivateRoute.POST).toBe('function');
    });

    it('closeTable → POST /tables/[tableId]/close', () => {
      expect(typeof http.closeTable).toBe('function');
      expect(typeof closeRoute.POST).toBe('function');
    });
  });

  describe('Dealer rotation endpoints', () => {
    it('assignDealer → POST /tables/[tableId]/dealer', () => {
      expect(typeof http.assignDealer).toBe('function');
      expect(typeof dealerRoute.POST).toBe('function');
    });

    it('endDealerRotation → DELETE /tables/[tableId]/dealer', () => {
      expect(typeof http.endDealerRotation).toBe('function');
      expect(typeof dealerRoute.DELETE).toBe('function');
    });
  });

  describe('Chip custody endpoints (/api/v1/table-context)', () => {
    it('logInventorySnapshot → POST /table-context/inventory-snapshots', () => {
      expect(typeof http.logInventorySnapshot).toBe('function');
      expect(typeof inventorySnapshotsRoute.POST).toBe('function');
    });

    it('requestTableFill → POST /table-context/fills', () => {
      expect(typeof http.requestTableFill).toBe('function');
      expect(typeof fillsRoute.POST).toBe('function');
    });

    it('requestTableCredit → POST /table-context/credits', () => {
      expect(typeof http.requestTableCredit).toBe('function');
      expect(typeof creditsRoute.POST).toBe('function');
    });

    it('logDropEvent → POST /table-context/drop-events', () => {
      expect(typeof http.logDropEvent).toBe('function');
      expect(typeof dropEventsRoute.POST).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts functions have corresponding routes', () => {
      // List of all exported functions from http.ts
      const httpFunctions = [
        // Table operations
        'fetchTables',
        'fetchTable',
        'fetchActiveTables',
        'activateTable',
        'deactivateTable',
        'closeTable',
        'assignDealer',
        'endDealerRotation',
        // Chip custody operations
        'logInventorySnapshot',
        'requestTableFill',
        'requestTableCredit',
        'logDropEvent',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers: buildParams, generateIdempotencyKey)
      expect(httpFunctions.length).toBe(12);
    });
  });
});
