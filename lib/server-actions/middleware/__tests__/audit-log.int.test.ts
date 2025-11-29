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
  setupTestData,
  cleanupTestData,
} from './helpers';

describe('Audit Log Integration', () => {
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
});
