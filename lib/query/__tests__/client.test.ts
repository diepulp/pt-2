/**
 * Query Client Unit Tests
 *
 * Tests the QueryClient configuration and domain stale time mappings.
 */

import {
  STALE_TIMES,
  DOMAIN_STALE_TIMES,
  getStaleTimeForDomain,
  makeQueryClient,
  getQueryClient,
  resetQueryClient,
} from '../client';

describe('STALE_TIMES', () => {
  it('should have correct values', () => {
    expect(STALE_TIMES.REFERENCE).toBe(5 * 60 * 1000); // 5 min
    expect(STALE_TIMES.TRANSACTIONAL).toBe(30 * 1000); // 30 sec
    expect(STALE_TIMES.REALTIME).toBe(10 * 1000); // 10 sec
  });
});

describe('DOMAIN_STALE_TIMES', () => {
  it('should map reference data domains to REFERENCE stale time', () => {
    expect(DOMAIN_STALE_TIMES['casino']).toBe(STALE_TIMES.REFERENCE);
    expect(DOMAIN_STALE_TIMES['floor-layout']).toBe(STALE_TIMES.REFERENCE);
  });

  it('should map transactional domains to TRANSACTIONAL stale time', () => {
    expect(DOMAIN_STALE_TIMES['player']).toBe(STALE_TIMES.TRANSACTIONAL);
    expect(DOMAIN_STALE_TIMES['rating-slip']).toBe(STALE_TIMES.TRANSACTIONAL);
  });

  it('should map real-time domains to REALTIME stale time', () => {
    expect(DOMAIN_STALE_TIMES['table']).toBe(STALE_TIMES.REALTIME);
    expect(DOMAIN_STALE_TIMES['table-context']).toBe(STALE_TIMES.REALTIME);
  });
});

describe('getStaleTimeForDomain', () => {
  it('should return correct stale time for known domains', () => {
    expect(getStaleTimeForDomain('casino')).toBe(STALE_TIMES.REFERENCE);
    expect(getStaleTimeForDomain('player')).toBe(STALE_TIMES.TRANSACTIONAL);
    expect(getStaleTimeForDomain('table')).toBe(STALE_TIMES.REALTIME);
  });

  it('should return TRANSACTIONAL as default for unknown domains', () => {
    expect(getStaleTimeForDomain('unknown-domain')).toBe(
      STALE_TIMES.TRANSACTIONAL,
    );
  });
});

describe('makeQueryClient', () => {
  it('should create QueryClient with correct defaults', () => {
    const client = makeQueryClient();

    expect(client).toBeDefined();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(
      STALE_TIMES.TRANSACTIONAL,
    );
    expect(client.getDefaultOptions().queries?.gcTime).toBe(30 * 60 * 1000);
    expect(client.getDefaultOptions().queries?.retry).toBe(2);
    expect(client.getDefaultOptions().mutations?.retry).toBe(0);
  });

  it('should create new instance each call', () => {
    const client1 = makeQueryClient();
    const client2 = makeQueryClient();

    expect(client1).not.toBe(client2);
  });
});

describe('getQueryClient', () => {
  beforeEach(() => {
    resetQueryClient();
  });

  afterEach(() => {
    resetQueryClient();
  });

  it('should return singleton in browser environment (jsdom)', () => {
    // In jsdom test environment, window is always defined (browser-like)
    // This tests the singleton behavior
    const client1 = getQueryClient();
    const client2 = getQueryClient();

    expect(client1).toBe(client2);
  });

  it('should return different instances after reset', () => {
    // Get initial singleton
    const client1 = getQueryClient();

    // Reset the singleton
    resetQueryClient();

    // Get new singleton - should be different instance
    const client2 = getQueryClient();

    expect(client1).not.toBe(client2);
  });
});

describe('resetQueryClient', () => {
  it('should clear the browser singleton', () => {
    // Get initial singleton
    const client1 = getQueryClient();

    // Reset
    resetQueryClient();

    // Get new singleton
    const client2 = getQueryClient();

    // Should be different instances
    expect(client1).not.toBe(client2);
  });
});
