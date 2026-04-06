/** @jest-environment node */
/**
 * Audit Log Integration Tests
 *
 * Tests audit log writes with a real database connection.
 * Requires local Supabase: `npx supabase start`
 */

import type { Json } from '@/types/database.types';

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

(RUN_INTEGRATION ? describe : describe.skip)('Audit Log Integration', () => {
  const testCorrelationIds: string[] = [];
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    await setupTestData();
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await cleanupTestData();
  });

  afterEach(async () => {
    // Restore NODE_ENV after each test
    process.env.NODE_ENV = originalNodeEnv;

    // Clean up audit logs created during tests
    if (testCorrelationIds.length > 0) {
      const supabase = getTestSupabaseServiceClient();
      for (const correlationId of testCorrelationIds) {
        await supabase
          .from('audit_log')
          .delete()
          .filter('details', 'cs', JSON.stringify({ correlationId }));
      }
      testCorrelationIds.length = 0;
    }
  });

  it('should write audit log entry with correct fields in production mode', async () => {
    // Force production mode for audit logging
    process.env.NODE_ENV = 'production';

    const supabase = getTestSupabaseServiceClient();
    const correlationId = `test-audit-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    await withServerAction(
      supabase,
      async () => ({
        ok: true,
        code: 'OK',
        data: { id: 'test' },
      }),
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.action',
        idempotencyKey: 'test-idem-key',
      },
    );

    // Query the audit log
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .filter('details', 'cs', JSON.stringify({ correlationId }));

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs![0]).toMatchObject({
      domain: 'test-domain',
      action: 'test.action',
    });

    const details = auditLogs![0].details as Record<string, unknown>;
    expect(details.correlationId).toBe(correlationId);
    expect(details.idempotencyKey).toBe('test-idem-key');
    expect(details.ok).toBe(true);
    expect(details.code).toBe('OK');
  });

  it('should include error details in failed operations', async () => {
    process.env.NODE_ENV = 'production';

    const supabase = getTestSupabaseServiceClient();
    const correlationId = `test-audit-error-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    // Return an error result (not throw) so audit middleware can capture it
    // Note: Thrown errors are caught by tracing middleware before audit sees them
    await withServerAction(
      supabase,
      async () => ({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: 'Test error message',
      }),
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.error',
      },
    );

    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .filter('details', 'cs', JSON.stringify({ correlationId }));

    expect(auditLogs).toHaveLength(1);

    const details = auditLogs![0].details as Record<string, unknown>;
    expect(details.ok).toBe(false);
    expect(details.error).toBe('Test error message');
  });

  it('should skip audit writes in non-production mode', async () => {
    process.env.NODE_ENV = 'test';

    const supabase = getTestSupabaseServiceClient();
    const correlationId = `test-audit-skip-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    await withServerAction(
      supabase,
      async () => ({
        ok: true,
        code: 'OK',
        data: null,
      }),
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.skip',
      },
    );

    // Should not write to audit log in test mode
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .filter('details', 'cs', JSON.stringify({ correlationId }));

    expect(auditLogs).toHaveLength(0);
  });

  it('should capture duration in audit entry', async () => {
    process.env.NODE_ENV = 'production';

    const supabase = getTestSupabaseServiceClient();
    const correlationId = `test-audit-duration-${Date.now()}`;
    testCorrelationIds.push(correlationId);

    await withServerAction(
      supabase,
      async () => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true, code: 'OK', data: null };
      },
      {
        skipAuth: true,
        correlationId,
        domain: 'test-domain',
        action: 'test.duration',
      },
    );

    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .filter('details', 'cs', JSON.stringify({ correlationId }));

    expect(auditLogs).toHaveLength(1);

    const details = auditLogs![0].details as Record<string, unknown>;
    expect(details.durationMs).toBeGreaterThanOrEqual(20);
  });

  /**
   * Authenticated Audit Log Tests (ADR-024 Mode C)
   *
   * These tests exercise the audit path WITHOUT skipAuth.
   * The authenticated anon client carries a real JWT so the full chain runs:
   *   withAuth → getAuthContext() + set_rls_context_from_staff()
   *   withRLS  → session vars (app.actor_id, app.casino_id) are set
   *   withAudit → append_audit_log RPC derives actor_id from session vars
   *
   * Verification uses the service client since authenticated role does not
   * have SELECT access on audit_log (SEC-007 hardening).
   */
  describe('Authenticated Audit Log (ADR-024 Mode C)', () => {
    let auth: TestAuthenticatedClientResult;
    const authCorrelationIds: string[] = [];

    beforeAll(async () => {
      auth = await getTestAuthenticatedClient({
        role: 'pit_boss',
        emailPrefix: 'test-audit-auth',
      });
    });

    afterAll(async () => {
      // Clean up audit entries created in authenticated tests
      if (authCorrelationIds.length > 0) {
        const supabase = getTestSupabaseServiceClient();
        for (const correlationId of authCorrelationIds) {
          await supabase
            .from('audit_log')
            .delete()
            .filter('details', 'cs', JSON.stringify({ correlationId }));
        }
      }
      await auth.cleanup();
    });

    it('should write audit log entry with actor_id from JWT context (ADR-024)', async () => {
      // Force production mode for audit logging
      process.env.NODE_ENV = 'production';

      const correlationId = `test-audit-auth-${Date.now()}`;
      authCorrelationIds.push(correlationId);

      await withServerAction(
        auth.client,
        async () => ({
          ok: true,
          code: 'OK',
          data: { id: 'test-authenticated' },
        }),
        {
          // no skipAuth — full auth + RLS chain runs, actor_id derived from JWT
          correlationId,
          domain: 'test-domain',
          action: 'test.authenticated-audit',
        },
      );

      // Use service client for verification — authenticated role cannot SELECT audit_log
      const serviceClient = getTestSupabaseServiceClient();
      const { data: auditLogs } = await serviceClient
        .from('audit_log')
        .select('*')
        .filter('details', 'cs', JSON.stringify({ correlationId }));

      expect(auditLogs).toHaveLength(1);

      const entry = auditLogs![0];
      // actor_id must match the staff fixture created by getTestAuthenticatedClient
      expect(entry.actor_id).toBe(auth.staffId);
      expect(entry.casino_id).toBe(auth.casinoId);
      expect(entry.domain).toBe('test-domain');
      expect(entry.action).toBe('test.authenticated-audit');

      const details = entry.details as Record<string, unknown>;
      expect(details.correlationId).toBe(correlationId);
      expect(details.ok).toBe(true);
      expect(details.code).toBe('OK');
    });
  });
});
