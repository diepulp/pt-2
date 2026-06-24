/** @jest-environment node */

/**
 * Localhost auth + protocol version + /diagnostics disclosure boundary
 * (PRD-093 WS_W3, DEC-WIN-03)
 *
 * Proves the MINIMAL single-use job-token model: short-lived, single-use, bound to
 * (jobKey, printerTargetId), rejected PRE-SPOOL; fail-closed protocol version; and
 * the narrowly-scoped /diagnostics allow-list. No PKI / watermark / rotation is
 * present to test — by design.
 *
 * @see PRD-093 / EXEC-093 WS_W3
 */

import { describe, it, expect } from '@jest/globals';

import { createDiagnosticsEndpoint } from '@/services/loyalty/printing/agent/diagnostics-endpoint';
import {
  createLoopbackAgent,
  type CupsSpooler,
  type CupsSubmitInput,
  type CupsSubmitResult,
} from '@/services/loyalty/printing/agent/loopback-agent';
import {
  AGENT_PROTOCOL_VERSION,
  isCompatibleProtocolVersion,
} from '@/services/loyalty/printing/agent/protocol-version';
import { createJobTokenAuthorizer } from '@/services/loyalty/printing/agent/request-auth';

function countingSpooler(): { spooler: CupsSpooler; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    spooler: {
      async submit(_input: CupsSubmitInput): Promise<CupsSubmitResult> {
        calls += 1;
        return { outcome: 'accepted', jobId: 'job-1' };
      },
    },
  };
}

describe('createJobTokenAuthorizer — single-use token (DEC-WIN-03)', () => {
  const binding = { jobKey: 'jk-1', printerTargetId: 'target-A' };

  it('issues a token that verifies once, then is replayed-rejected (single-use)', () => {
    const auth = createJobTokenAuthorizer();
    const { token } = auth.issue(binding);
    expect(auth.verifyAndConsume({ token, ...binding })).toEqual({ ok: true });
    expect(auth.verifyAndConsume({ token, ...binding })).toEqual({
      ok: false,
      reason: 'replayed_token',
    });
  });

  it('rejects a missing token', () => {
    const auth = createJobTokenAuthorizer();
    expect(auth.verifyAndConsume({ token: undefined, ...binding })).toEqual({
      ok: false,
      reason: 'missing_token',
    });
  });

  it('rejects an unknown token', () => {
    const auth = createJobTokenAuthorizer();
    expect(auth.verifyAndConsume({ token: 'deadbeef', ...binding })).toEqual({
      ok: false,
      reason: 'unknown_token',
    });
  });

  it('rejects an expired token (short-lived)', () => {
    let clock = 1_000;
    const auth = createJobTokenAuthorizer({ ttlMs: 500 }, () => clock);
    const { token } = auth.issue(binding);
    clock += 600; // past the 500ms TTL
    expect(auth.verifyAndConsume({ token, ...binding })).toEqual({
      ok: false,
      reason: 'expired_token',
    });
  });

  it('rejects a token presented for a different jobKey (binding mismatch)', () => {
    const auth = createJobTokenAuthorizer();
    const { token } = auth.issue(binding);
    expect(
      auth.verifyAndConsume({ token, jobKey: 'jk-OTHER', printerTargetId: 'target-A' }),
    ).toEqual({ ok: false, reason: 'binding_mismatch' });
  });

  it('rejects a token presented for a different printerTargetId (binding mismatch)', () => {
    const auth = createJobTokenAuthorizer();
    const { token } = auth.issue(binding);
    expect(
      auth.verifyAndConsume({ token, jobKey: 'jk-1', printerTargetId: 'target-OTHER' }),
    ).toEqual({ ok: false, reason: 'binding_mismatch' });
  });
});

describe('protocol version — fail-closed (ADR-063 D4)', () => {
  it('accepts the exact current version', () => {
    expect(isCompatibleProtocolVersion(AGENT_PROTOCOL_VERSION)).toBe(true);
  });

  it('rejects an incompatible / absent / malformed version', () => {
    expect(isCompatibleProtocolVersion(AGENT_PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatibleProtocolVersion(undefined)).toBe(false);
    expect(isCompatibleProtocolVersion('1')).toBe(false);
    expect(isCompatibleProtocolVersion(null)).toBe(false);
  });
});

describe('agent enforcement — auth gates a FRESH spool, dedup gates duplication', () => {
  const job = {
    jobKey: 'jk-1',
    printerTargetId: 'target-A',
    contentType: 'application/escpos',
    body: 'X',
  };

  it('rejects a missing token BEFORE the spooler is touched', async () => {
    const auth = createJobTokenAuthorizer();
    const { spooler, calls } = countingSpooler();
    const agent = createLoopbackAgent({ spooler, authorizer: auth });
    const res = await agent.submitJob({
      ...job,
      protocolVersion: AGENT_PROTOCOL_VERSION,
    });
    expect(res.spoolerOutcome).toBe('rejected');
    expect(res.rejectionReason).toMatch(/auth_rejected: missing_token/);
    expect(calls()).toBe(0); // pre-spool rejection
  });

  it('rejects an incompatible protocol version pre-spool', async () => {
    const auth = createJobTokenAuthorizer();
    const { spooler, calls } = countingSpooler();
    const agent = createLoopbackAgent({ spooler, authorizer: auth });
    const { token } = auth.issue({ jobKey: job.jobKey, printerTargetId: job.printerTargetId });
    const res = await agent.submitJob({ ...job, authToken: token, protocolVersion: 999 });
    expect(res.spoolerOutcome).toBe('rejected');
    expect(res.rejectionReason).toMatch(/incompatible_protocol_version/);
    expect(calls()).toBe(0);
  });

  it('accepts a valid token and spools exactly once', async () => {
    const auth = createJobTokenAuthorizer();
    const { spooler, calls } = countingSpooler();
    const agent = createLoopbackAgent({ spooler, authorizer: auth });
    const { token } = auth.issue({ jobKey: job.jobKey, printerTargetId: job.printerTargetId });
    const res = await agent.submitJob({
      ...job,
      authToken: token,
      protocolVersion: AGENT_PROTOCOL_VERSION,
    });
    expect(res.spoolerOutcome).toBe('accepted');
    expect(calls()).toBe(1);
  });

  it('idempotent replay returns the prior outcome WITHOUT a fresh token (dedup barrier)', async () => {
    const auth = createJobTokenAuthorizer();
    const { spooler, calls } = countingSpooler();
    const agent = createLoopbackAgent({ spooler, authorizer: auth });
    const { token } = auth.issue({ jobKey: job.jobKey, printerTargetId: job.printerTargetId });
    const first = await agent.submitJob({
      ...job,
      authToken: token,
      protocolVersion: AGENT_PROTOCOL_VERSION,
    });
    // Replay with NO token: dedup returns the prior outcome and does NOT re-spool.
    const replay = await agent.submitJob({ ...job, protocolVersion: AGENT_PROTOCOL_VERSION });
    expect(replay).toEqual(first);
    expect(calls()).toBe(1); // exactly one physical spool
  });
});

describe('/diagnostics — authenticated, narrowly-scoped disclosure boundary (audit P2-2)', () => {
  const ALLOWED_FIELDS = [
    'agent_version',
    'protocol_version',
    'service_health',
    'configured_target_exists',
    'native_module_loaded',
    'spooler_connectivity',
  ].sort();

  function endpoint(authorize: (c: string | undefined) => boolean) {
    return createDiagnosticsEndpoint({
      agentVersion: '0.93.0',
      authorize,
      probes: {
        configuredTargetExists: () => true,
        nativeModuleLoaded: () => true,
        spoolerConnectivity: () => true,
      },
    });
  }

  it('401s without a credential and with a wrong credential', () => {
    const ep = endpoint((c) => c === 'secret');
    expect(ep.handle(undefined)).toEqual({ status: 401 });
    expect(ep.handle('wrong')).toEqual({ status: 401 });
  });

  it('returns EXACTLY the six allow-listed fields and nothing else', () => {
    const ep = endpoint((c) => c === 'secret');
    const result = ep.handle('secret');
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(Object.keys(result.body).sort()).toEqual(ALLOWED_FIELDS);
    }
  });

  it('never leaks secret-ish fields in the response', () => {
    const ep = endpoint(() => true);
    const result = ep.handle('anything');
    if (result.status === 200) {
      const serialized = JSON.stringify(result.body).toLowerCase();
      for (const banned of ['credential', 'secret', 'token', 'password', 'env', 'path']) {
        expect(serialized).not.toContain(banned);
      }
    }
  });
});
