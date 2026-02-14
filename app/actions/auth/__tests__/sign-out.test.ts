/**
 * Sign-Out Server Action Tests
 *
 * Validates:
 * - signOutAction returns ServiceResult with ok: true on success
 * - signOutAction emits auth.sign_out.started and auth.sign_out.completed telemetry
 * - signOutAction emits auth.sign_out.failed on error
 * - signOutAction does NOT call clearUserRLSClaims (stable identity)
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS3
 */

import type { TelemetryEvent } from '@/lib/telemetry/emit-telemetry';

// Mock emitTelemetry before importing the action
const mockEmitTelemetry = jest.fn();
jest.mock('@/lib/telemetry/emit-telemetry', () => ({
  emitTelemetry: (...args: unknown[]) => mockEmitTelemetry(...args),
}));

// Mock withServerAction to bypass the full middleware chain
const mockWithServerAction = jest.fn();
jest.mock('@/lib/server-actions/middleware/compositor', () => ({
  withServerAction: (...args: unknown[]) => mockWithServerAction(...args),
}));

// Mock createClient
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { signOutAction } = require('../sign-out');

describe('signOutAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: withServerAction calls the handler with a mocked middleware context
    mockWithServerAction.mockImplementation(
      async (
        _supabase: unknown,
        handler: (...args: unknown[]) => unknown,
        _options: unknown,
      ) => {
        const mwCtx = {
          supabase: {},
          correlationId: 'test-corr-id',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'staff-001',
            casinoId: 'casino-001',
            staffRole: 'pit_boss',
          },
        };
        return handler(mwCtx);
      },
    );
  });

  it('returns ServiceResult with ok: true on success', async () => {
    const result = await signOutAction();

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.requestId).toBe('test-corr-id');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
  });

  it('emits auth.sign_out.started and auth.sign_out.completed telemetry', async () => {
    await signOutAction();

    // Should have emitted started and completed events
    const calls = mockEmitTelemetry.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);

    const startedEvent = calls.find(
      (c: TelemetryEvent[]) => c[0].eventType === 'auth.sign_out.started',
    );
    const completedEvent = calls.find(
      (c: TelemetryEvent[]) => c[0].eventType === 'auth.sign_out.completed',
    );

    expect(startedEvent).toBeTruthy();
    expect(completedEvent).toBeTruthy();

    // Verify started event has required fields
    const started = startedEvent![0];
    expect(started.staffId).toBe('staff-001');
    expect(started.severity).toBe('info');
    expect((started.metadata as Record<string, unknown>).casinoId).toBe(
      'casino-001',
    );
    expect((started.metadata as Record<string, unknown>).staffRole).toBe(
      'pit_boss',
    );

    // Verify completed event has durationMs
    const completed = completedEvent![0];
    expect(completed.staffId).toBe('staff-001');
    expect(completed.severity).toBe('info');
    expect(
      (completed.metadata as Record<string, unknown>).durationMs,
    ).toBeGreaterThanOrEqual(0);
  });

  it('calls withServerAction with domain: auth, action: sign-out', async () => {
    await signOutAction();

    expect(mockWithServerAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      { domain: 'auth', action: 'sign-out' },
    );
  });

  it('does NOT import or call clearUserRLSClaims', () => {
    // Read source of the sign-out action to verify no clearUserRLSClaims usage
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../sign-out.ts'),
      'utf-8',
    );
    expect(source).not.toContain('clearUserRLSClaims');
  });

  it('emits auth.sign_out.failed on handler error', async () => {
    // Override withServerAction to simulate a handler whose inner try throws
    mockWithServerAction.mockImplementation(
      async (
        _supabase: unknown,
        handler: (...args: unknown[]) => unknown,
        _options: unknown,
      ) => {
        const mwCtx = {
          supabase: {},
          correlationId: 'test-corr-id',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'staff-001',
            casinoId: 'casino-001',
            staffRole: 'pit_boss',
          },
        };
        // Make the second emitTelemetry call throw to trigger error path
        let callCount = 0;
        mockEmitTelemetry.mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Telemetry sink failure');
          }
        });
        return handler(mwCtx);
      },
    );

    const result = await signOutAction();

    // Should return error result
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.error).toContain('Telemetry sink failure');

    // Should have emitted the failed event
    const failedEvent = mockEmitTelemetry.mock.calls.find(
      (c: TelemetryEvent[]) => c[0].eventType === 'auth.sign_out.failed',
    );
    expect(failedEvent).toBeTruthy();
  });
});
