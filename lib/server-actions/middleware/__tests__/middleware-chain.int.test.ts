/** @jest-environment node */
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
  getTestAuthenticatedClient,
  setupTestData,
  cleanupTestData,
} from './helpers';
import type { TestAuthenticatedClientResult } from './helpers';

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'Middleware Chain Integration',
  () => {
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

    /**
     * Authenticated Chain Execution (ADR-024 Mode C)
     *
     * These tests exercise the full middleware chain WITHOUT skipAuth.
     * The authenticated anon client carries a real JWT so:
     *   withAuth  → getAuthContext() succeeds (auth.uid() is non-null)
     *   withRLS   → set_rls_context_from_staff() is called and populates ctx.rlsContext
     *
     * NOTE: withServerAction relies on auth.getUser() from the Supabase client, not
     * on Next.js cookies() / headers(), so these tests run cleanly in a Node
     * integration environment without any Next.js server-side context mocking.
     */
    describe('Authenticated Chain Execution', () => {
      let auth: TestAuthenticatedClientResult;

      beforeAll(async () => {
        auth = await getTestAuthenticatedClient({
          role: 'pit_boss',
          emailPrefix: 'test-mw-chain',
        });
      });

      afterAll(async () => {
        await auth.cleanup();
      });

      it('should populate ctx.rlsContext via set_rls_context_from_staff (ADR-024)', async () => {
        const result = await withServerAction(
          auth.client,
          async (ctx) => {
            // rlsContext must be populated by withAuth + withRLS before handler runs
            expect(ctx.rlsContext).toBeDefined();
            expect(ctx.rlsContext!.actorId).toBe(auth.staffId);
            expect(ctx.rlsContext!.casinoId).toBe(auth.casinoId);
            expect(ctx.rlsContext!.companyId).toBe(auth.companyId);
            expect(typeof ctx.rlsContext!.staffRole).toBe('string');

            return {
              ok: true,
              code: 'OK',
              data: {
                actorId: ctx.rlsContext!.actorId,
                casinoId: ctx.rlsContext!.casinoId,
              },
            } as ServiceResult<{ actorId: string; casinoId: string }>;
          },
          {
            domain: 'test',
            action: 'integration.auth-chain',
            // no skipAuth — full auth + RLS chain runs
          },
        );

        expect(result.ok).toBe(true);
        expect(result.code).toBe('OK');
        expect(result.data).toEqual({
          actorId: auth.staffId,
          casinoId: auth.casinoId,
        });
        expect(result.requestId).toBeDefined();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should reject unauthenticated client without skipAuth', async () => {
        // eslint-disable-next-line no-restricted-imports -- Integration test: anon client intentionally has no session
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl =
          process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
        const anonKey =
          process.env.SUPABASE_ANON_KEY ??
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

        const unauthClient = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const result = await withServerAction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unauthClient as any,
          async () => ({
            ok: true,
            code: 'OK',
            data: null,
          }),
          {
            domain: 'test',
            action: 'integration.unauth-rejection',
            // no skipAuth — auth chain should reject unauthenticated client
          },
        );

        expect(result.ok).toBe(false);
        expect(['UNAUTHORIZED', 'INTERNAL_ERROR']).toContain(result.code);
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
  },
);
