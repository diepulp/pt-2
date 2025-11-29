import { fetchJSON, mutateJSON, FetchError } from '../fetch-json';

describe('fetchJSON', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return data on successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          code: 'OK',
          status: 200,
          data: { id: 'test', name: 'Test' },
        }),
    });

    const result = await fetchJSON<{ id: string; name: string }>('/api/test');

    expect(result).toEqual({ id: 'test', name: 'Test' });
  });

  it('should throw FetchError on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          code: 'NOT_FOUND',
          status: 404,
          error: 'Resource not found',
          details: { id: '123' },
        }),
    });

    await expect(fetchJSON('/api/test')).rejects.toThrow(FetchError);
    await expect(fetchJSON('/api/test')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('should include Accept header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, code: 'OK', data: null }),
    });

    await fetchJSON('/api/test');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
  });
});

describe('mutateJSON', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send POST with correct headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ ok: true, code: 'OK', data: { id: 'new' } }),
    });

    await mutateJSON('/api/test', { name: 'Test' }, 'idem-key-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-idempotency-key': 'idem-key-123',
        }),
        body: JSON.stringify({ name: 'Test' }),
      }),
    );
  });
});

describe('FetchError', () => {
  it('should have correct properties', () => {
    const error = new FetchError('Not found', 404, 'NOT_FOUND', { id: '123' });

    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toEqual({ id: '123' });
    expect(error.name).toBe('FetchError');
  });
});
