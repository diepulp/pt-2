/** @jest-environment node */

import * as route from '@/app/api/internal/outbox-cleanup/route';
import { createServiceClient as createServiceClientReal } from '@/lib/supabase/service';

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}));

const createServiceClient = createServiceClientReal as unknown as jest.Mock;
const FAKE_SECRET = 'test-cleanup-cron-secret-xyz';

function makeRequest(opts?: {
  auth?: string;
  noAuth?: boolean;
  method?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (!opts?.noAuth) {
    headers['Authorization'] = opts?.auth ?? `Bearer ${FAKE_SECRET}`;
  }
  return new Request('http://localhost/api/internal/outbox-cleanup', {
    method: opts?.method ?? 'GET',
    headers,
  });
}

function makeSupabase(rpcResult: { data: number | null; error: unknown }): {
  supabase: unknown;
  mocks: { rpcFn: jest.Mock };
} {
  const rpcFn = jest.fn().mockResolvedValue(rpcResult);
  return {
    supabase: { rpc: rpcFn },
    mocks: { rpcFn },
  };
}

describe('outbox cleanup route', () => {
  let originalSecret: string | undefined;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = FAKE_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // Helper: parse all JSON log lines emitted via console.log
  function getLogLines(): Array<Record<string, unknown>> {
    return consoleLogSpy.mock.calls
      .map((call) => call[0])
      .filter((arg): arg is string => typeof arg === 'string')
      .map((s) => {
        try {
          return JSON.parse(s) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (parsed): parsed is Record<string, unknown> =>
          parsed !== null && parsed.cycle === 'outbox_cleanup_cycle',
      );
  }

  // ── Auth (no DB access on failure) ──────────────────────────────────────

  it('returns 401 when Authorization header is missing (no DB call)', async () => {
    const { supabase, mocks } = makeSupabase({ data: 0, error: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest({ noAuth: true }));

    expect(res.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(mocks.rpcFn).not.toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET value is wrong (no DB call)', async () => {
    const { supabase, mocks } = makeSupabase({ data: 0, error: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest({ auth: 'Bearer wrong-value' }));

    expect(res.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(mocks.rpcFn).not.toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET env var is missing (no DB call)', async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const { supabase, mocks } = makeSupabase({ data: 0, error: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest({ auth: 'Bearer anything' }));

    expect(res.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(mocks.rpcFn).not.toHaveBeenCalled();

    process.env.CRON_SECRET = saved;
  });

  it('emits auth_fail log line on 401', async () => {
    const { supabase } = makeSupabase({ data: 0, error: null });
    createServiceClient.mockReturnValue(supabase);

    await route.GET(makeRequest({ noAuth: true }));

    const logs = getLogLines();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'auth_fail',
    });
    expect(typeof logs[0].cleanup_duration_ms).toBe('number');
  });

  // ── Success path ────────────────────────────────────────────────────────

  it('returns 200 with { deleted: N } on success', async () => {
    const { supabase, mocks } = makeSupabase({ data: 42, error: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 42 });
    expect(mocks.rpcFn).toHaveBeenCalledWith('rpc_cleanup_outbox_processed', {
      p_max_rows: 1000,
    });
  });

  it('treats null RPC data as deleted: 0 (empty table case)', async () => {
    const { supabase } = makeSupabase({ data: null, error: null });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 0 });
  });

  it('emits success log with max_rows: 1000 and capped: true when deleted === 1000', async () => {
    const { supabase } = makeSupabase({ data: 1000, error: null });
    createServiceClient.mockReturnValue(supabase);

    await route.GET(makeRequest());

    const logs = getLogLines();
    const successLog = logs.find((l) => l.outcome === 'ok');
    expect(successLog).toBeDefined();
    expect(successLog).toMatchObject({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'ok',
      max_rows: 1000,
      deleted: 1000,
      capped: true,
    });
    expect(typeof successLog!.cleanup_duration_ms).toBe('number');
  });

  it('emits success log with capped: false when deleted < 1000', async () => {
    const { supabase } = makeSupabase({ data: 17, error: null });
    createServiceClient.mockReturnValue(supabase);

    await route.GET(makeRequest());

    const logs = getLogLines();
    const successLog = logs.find((l) => l.outcome === 'ok');
    expect(successLog).toMatchObject({
      max_rows: 1000,
      deleted: 17,
      capped: false,
    });
  });

  // ── Error path ──────────────────────────────────────────────────────────

  it('returns 500 with { error: "cleanup_failed" } on RPC failure', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'rpc-blew-up', code: 'XX000' },
    });
    createServiceClient.mockReturnValue(supabase);

    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'cleanup_failed' });
  });

  it('emits error log line with safeErrorDetails on RPC failure', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'rpc-blew-up', code: 'XX000' },
    });
    createServiceClient.mockReturnValue(supabase);

    await route.GET(makeRequest());

    const logs = getLogLines();
    const errorLog = logs.find((l) => l.outcome === 'error');
    expect(errorLog).toBeDefined();
    expect(errorLog).toMatchObject({
      cycle: 'outbox_cleanup_cycle',
      outcome: 'error',
      max_rows: 1000,
    });
    expect(errorLog!.error).toMatchObject({
      message: 'rpc-blew-up',
      code: 'XX000',
    });
  });

  // ── POST not exported (GET-only contract) ───────────────────────────────

  it('does NOT export POST (GET-only contract)', () => {
    // The route deliberately exposes only GET to keep Vercel-cron-driven
    // retention a one-way infrastructure surface; no operator-facing POST.
    expect((route as unknown as Record<string, unknown>).POST).toBeUndefined();
  });
});
