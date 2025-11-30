/**
 * Middleware Chain Integration Tests
 *
 * Tests the complete middleware chain with a real database connection.
 * Requires local Supabase: `npx supabase start`
 */

import type { ServiceResult } from '@/lib/http/service-response';

import { withServerAction } from '../compositor';

import {
  getTestSupabaseServiceClient,
  setupTestData,
  cleanupTestData,
} from './helpers';

describe('Middleware Chain Integration', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Full Chain Execution', () => {
    it('should execute complete middleware chain with authenticated user', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async (ctx) => {
          // Verify context was populated
          expect(ctx.correlationId).toBeDefined();
          expect(ctx.startedAt).toBeDefined();

          return {
            ok: true,
            code: 'OK',
            data: { message: 'success' },
          } as ServiceResult<{ message: string }>;
        },
        {
          skipAuth: true, // Skip auth for service role client
          domain: 'test',
          action: 'integration.test',
        },
      );

      expect(result.ok).toBe(true);
      expect(result.code).toBe('OK');
      expect(result.data).toEqual({ message: 'success' });
      expect(result.requestId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should reject when idempotency required but missing', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => ({
          ok: true,
          code: 'OK',
          data: null,
        }),
        {
          skipAuth: true,
          requireIdempotency: true,
          // No idempotencyKey provided
        },
      );

      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('idempotency');
    });

    it('should pass when idempotency key provided', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async (ctx) => {
          expect(ctx.idempotencyKey).toBe('test-idem-key');
          return { ok: true, code: 'OK', data: { created: true } };
        },
        {
          skipAuth: true,
          requireIdempotency: true,
          idempotencyKey: 'test-idem-key',
        },
      );

      expect(result.ok).toBe(true);
    });

    it('should propagate correlation ID through context', async () => {
      const supabase = getTestSupabaseServiceClient();
      const testCorrelationId = `test-corr-${Date.now()}`;

      const result = await withServerAction(
        supabase,
        async (ctx) => {
          expect(ctx.correlationId).toBe(testCorrelationId);
          return {
            ok: true,
            code: 'OK',
            data: { correlationId: ctx.correlationId },
          };
        },
        {
          skipAuth: true,
          correlationId: testCorrelationId,
        },
      );

      expect(result.ok).toBe(true);
      expect(result.requestId).toBe(testCorrelationId);
    });
  });

  describe('Error Handling', () => {
    it('should map thrown errors to ServiceResult', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => {
          throw new Error('Something went wrong');
        },
        { skipAuth: true },
      );

      expect(result.ok).toBe(false);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.error).toBe('Something went wrong');
      expect(result.requestId).toBeDefined();
    });

    it('should include duration even on errors', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => {
          // Simulate some work before failing
          await new Promise((resolve) => setTimeout(resolve, 15));
          throw new Error('Delayed failure');
        },
        { skipAuth: true },
      );

      expect(result.ok).toBe(false);
      // Allow some timing variance (setTimeout is not exact)
      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should handle handler returning error result', async () => {
      const supabase = getTestSupabaseServiceClient();

      const result = await withServerAction(
        supabase,
        async () => ({
          ok: false,
          code: 'VALIDATION_ERROR',
          error: 'Invalid input',
        }),
        { skipAuth: true },
      );

      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toBe('Invalid input');
    });
  });
});
