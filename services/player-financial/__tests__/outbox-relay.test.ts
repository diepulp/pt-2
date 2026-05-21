/** @jest-environment node */

import { POST } from '@/app/api/internal/outbox-relay/route';

import type { FinancialOutboxEventDTO } from '../dtos';

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}));
jest.mock('@/services/player-financial/outbox-consumer', () => ({
  runConsumer: jest.fn(),
}));
jest.mock('@/services/player-financial/outbox-operational-consumer', () => ({
  runOperationalConsumer: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServiceClient } = require('@/lib/supabase/service') as {
  createServiceClient: jest.Mock;
};

const { runConsumer } =
  require('@/services/player-financial/outbox-consumer') as {
    runConsumer: jest.Mock;
  };

const { runOperationalConsumer } =
  require('@/services/player-financial/outbox-operational-consumer') as {
    runOperationalConsumer: jest.Mock;
  };

const FAKE_SECRET = 'test-cron-secret-xyz';

function makeRequest(opts?: { auth?: string; noAuth?: boolean }): Request {
  const headers: Record<string, string> = {};
  if (!opts?.noAuth) {
    headers['Authorization'] = opts?.auth ?? `Bearer ${FAKE_SECRET}`;
  }
  return new Request('http://localhost/api/internal/outbox-relay', {
    method: 'POST',
    headers,
  });
}

function makeRow(
  overrides: Partial<FinancialOutboxEventDTO> = {},
): FinancialOutboxEventDTO {
  return {
    event_id: 'ev-relay-0001',
    event_type: 'buyin.recorded',
    casino_id: 'cas-relay-1',
    table_id: 'tbl-relay-1',
    player_id: 'player-relay-1',
    aggregate_id: 'agg-relay-1',
    gaming_day: '2026-05-21',
    created_at: '2026-05-11T00:00:00Z',
    processed_at: null,
    fact_class: 'ledger',
    origin_label: 'actual',
    payload: {},
    ...overrides,
  };
}

function makeSupabase(claimRows: FinancialOutboxEventDTO[] = []) {
  // First rpc call: rpc_claim_class_a_outbox_batch
  // Subsequent calls: rpc_acknowledge_outbox_delivery (one per processed row)
  const rpcFn = jest
    .fn()
    .mockResolvedValueOnce({ data: claimRows, error: null })
    .mockResolvedValue({ data: null, error: null });

  return {
    supabase: { rpc: rpcFn },
    mocks: { rpcFn },
  };
}

describe('outbox relay', () => {
  let originalSecret: string | undefined;

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
    // Default: operational branch returns empty result
    runOperationalConsumer.mockResolvedValue({
      processed: 0,
      duplicate: 0,
      errors: [],
    });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeRequest({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET value is wrong', async () => {
    const res = await POST(makeRequest({ auth: 'Bearer wrong-value' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET env var is missing', async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest({ auth: 'Bearer anything' }));
    expect(res.status).toBe(401);
    process.env.CRON_SECRET = saved;
  });

  it('returns 200 with classA.processed:0 when queue is empty', async () => {
    const { supabase } = makeSupabase([]);
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.classA.processed).toBe(0);
    expect(body.classA.failed).toBe(0);
  });

  it('response shape includes both classA and operational keys', async () => {
    const { supabase } = makeSupabase([]);
    createServiceClient.mockReturnValue(supabase);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body).toHaveProperty('classA');
    expect(body).toHaveProperty('operational');
    expect(body.classA).toHaveProperty('processed');
    expect(body.classA).toHaveProperty('failed');
    expect(body.operational).toHaveProperty('processed');
    expect(body.operational).toHaveProperty('duplicate');
    expect(body.operational).toHaveProperty('errors');
  });

  it('processes Class A rows and calls rpc_acknowledge_outbox_delivery with p_success=true', async () => {
    const { supabase, mocks } = makeSupabase([makeRow()]);
    createServiceClient.mockReturnValue(supabase);
    runConsumer.mockResolvedValue('processed');

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.classA.processed).toBe(1);
    expect(body.classA.failed).toBe(0);
    expect(runConsumer).toHaveBeenCalledTimes(1);
    expect(mocks.rpcFn).toHaveBeenCalledWith(
      'rpc_acknowledge_outbox_delivery',
      {
        p_event_id: 'ev-relay-0001',
        p_success: true,
      },
    );
  });

  it('marks duplicate Class A rows as success (duplicate = safe durable prior commit)', async () => {
    const { supabase, mocks } = makeSupabase([makeRow({ event_id: 'ev-dup' })]);
    createServiceClient.mockReturnValue(supabase);
    runConsumer.mockResolvedValue('duplicate');

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.classA.processed).toBe(1);
    expect(mocks.rpcFn).toHaveBeenCalledWith(
      'rpc_acknowledge_outbox_delivery',
      {
        p_event_id: 'ev-dup',
        p_success: true,
      },
    );
  });

  it('calls rpc_acknowledge_outbox_delivery with p_success=false on consumer failure', async () => {
    const { supabase, mocks } = makeSupabase([
      makeRow({ event_id: 'ev-fail' }),
    ]);
    createServiceClient.mockReturnValue(supabase);
    runConsumer.mockResolvedValue(new Error('downstream timeout'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.classA.processed).toBe(0);
    expect(body.classA.failed).toBe(1);
    expect(mocks.rpcFn).toHaveBeenCalledWith(
      'rpc_acknowledge_outbox_delivery',
      {
        p_event_id: 'ev-fail',
        p_success: false,
        p_error_detail: expect.stringContaining('downstream timeout'),
      },
    );
  });

  it('passes full error string to RPC (SQL does LEFT to 2000 chars)', async () => {
    const longMessage = 'x'.repeat(5000);
    const { supabase, mocks } = makeSupabase([
      makeRow({ event_id: 'ev-long-err' }),
    ]);
    createServiceClient.mockReturnValue(supabase);
    runConsumer.mockResolvedValue(new Error(longMessage));

    await POST(makeRequest());

    const acknowledgeCall = mocks.rpcFn.mock.calls.find(
      ([name]: [string]) => name === 'rpc_acknowledge_outbox_delivery',
    );
    expect(acknowledgeCall).toBeDefined();
    const [, params] = acknowledgeCall as [
      string,
      { p_success: boolean; p_error_detail: string },
    ];
    expect(params.p_success).toBe(false);
    expect(params.p_error_detail).toBe(`Error: ${longMessage}`);
  });

  it('two concurrent requests do not double-process Class A rows (SKIP LOCKED)', async () => {
    const row = makeRow({ event_id: 'ev-lock-1' });
    const { supabase: supabase1 } = makeSupabase([row]);
    const { supabase: supabase2 } = makeSupabase([]);

    createServiceClient
      .mockReturnValueOnce(supabase1)
      .mockReturnValueOnce(supabase2);
    runConsumer.mockResolvedValue('processed');

    const [res1, res2] = await Promise.all([
      POST(makeRequest()),
      POST(makeRequest()),
    ]);
    const [body1, body2] = await Promise.all([res1.json(), res2.json()]);

    expect(body1.classA.processed + body2.classA.processed).toBe(1);
  });

  it('operational branch is called with the shared service client', async () => {
    const { supabase } = makeSupabase([]);
    createServiceClient.mockReturnValue(supabase);

    await POST(makeRequest());

    expect(runOperationalConsumer).toHaveBeenCalledWith(supabase);
  });

  it('operational branch result is serialized: errors are string[] (not Error[])', async () => {
    const { supabase } = makeSupabase([]);
    createServiceClient.mockReturnValue(supabase);
    runOperationalConsumer.mockResolvedValue({
      processed: 2,
      duplicate: 1,
      errors: [new Error('rpc failure')],
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.operational.processed).toBe(2);
    expect(body.operational.duplicate).toBe(1);
    expect(body.operational.errors).toEqual(['rpc failure']);
  });

  it('classA result is preserved when operational branch throws (graceful degradation)', async () => {
    const { supabase } = makeSupabase([makeRow()]);
    createServiceClient.mockReturnValue(supabase);
    runConsumer.mockResolvedValue('processed');
    runOperationalConsumer.mockRejectedValue(new Error('operational crash'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    // Class A result still present
    expect(body.classA.processed).toBe(1);
    expect(body.classA.failed).toBe(0);
    // Operational result shows the error
    expect(body.operational.errors).toEqual(['operational crash']);
    expect(body.operational.processed).toBe(0);
  });
});
