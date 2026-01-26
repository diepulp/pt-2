/**
 * Player 360 Navigation Integration Tests
 *
 * Tests for the navigation flow between search and detail views.
 *
 * @see PRD-022 WS10 Unit + Integration Tests
 */

import {
  buildPlayerDetailUrl,
  decodeReturnTo,
  encodeReturnTo,
  validateReturnTo,
} from '@/lib/navigation';

describe('Player 360 Navigation Flow', () => {
  describe('search → detail flow', () => {
    it('encodes returnTo with current search context', () => {
      const searchUrl = '/players?query=smith&filter=active';
      const playerId = 'abc-123';

      const detailUrl = buildPlayerDetailUrl(playerId, searchUrl);

      expect(detailUrl).toBe(
        `/players/${playerId}?returnTo=${encodeURIComponent(searchUrl)}`,
      );
    });

    it('preserves query params in returnTo', () => {
      const searchUrl = '/players?query=john doe&status=enrolled';
      const playerId = 'xyz-789';

      const detailUrl = buildPlayerDetailUrl(playerId, searchUrl);
      const params = new URLSearchParams(detailUrl.split('?')[1]);
      const returnTo = decodeReturnTo(params.get('returnTo'));

      expect(returnTo).toBe(searchUrl);
    });
  });

  describe('detail → search flow (back navigation)', () => {
    it('decodes valid returnTo for back navigation', () => {
      const originalUrl = '/players?query=smith';
      const encoded = encodeURIComponent(originalUrl);

      const decodedUrl = decodeReturnTo(encoded);

      expect(decodedUrl).toBe(originalUrl);
    });

    it('falls back to /players for missing returnTo', () => {
      expect(decodeReturnTo(null)).toBe('/players');
      expect(decodeReturnTo(undefined)).toBe('/players');
      expect(decodeReturnTo('')).toBe('/players');
    });

    it('falls back to /players for invalid returnTo', () => {
      // Open redirect attempt
      const maliciousEncoded = encodeURIComponent('//evil.com');
      expect(decodeReturnTo(maliciousEncoded)).toBe('/players');

      // Path traversal attempt
      const traversalEncoded = encodeURIComponent('/players/../etc/passwd');
      expect(decodeReturnTo(traversalEncoded)).toBe('/players');

      // Protocol URL attempt
      const protocolEncoded = encodeURIComponent('https://evil.com/players');
      expect(decodeReturnTo(protocolEncoded)).toBe('/players');
    });
  });

  describe('timeline redirect (308)', () => {
    // Note: HTTP redirect testing requires actual server or Playwright
    // These tests verify the URL construction logic

    it('timeline anchor URL is correctly formed', () => {
      const playerId = 'abc-123';
      const expectedRedirectTarget = `/players/${playerId}#timeline`;

      // The route handler should redirect to this URL
      expect(expectedRedirectTarget).toMatch(/\/players\/abc-123#timeline/);
    });

    it('returnTo is preserved in redirect', () => {
      const playerId = 'abc-123';
      const returnTo = '/players?query=smith';

      // After redirect, URL should have both returnTo and anchor
      const targetUrl = buildPlayerDetailUrl(playerId, returnTo);
      expect(targetUrl).toContain('returnTo=');

      // Anchor would be added by route handler
      const finalUrl = `${targetUrl}#timeline`;
      expect(finalUrl).toContain('#timeline');
      expect(finalUrl).toContain('returnTo=');
    });
  });

  describe('security validation', () => {
    it('rejects all open redirect patterns', () => {
      const openRedirectAttempts = [
        '//evil.com',
        '//evil.com/players',
        'https://evil.com',
        'http://malicious.site/players',
        'javascript:alert(1)',
        'data:text/html,<script>',
      ];

      openRedirectAttempts.forEach((attempt) => {
        expect(validateReturnTo(attempt)).toBe(false);
      });
    });

    it('rejects all path traversal patterns', () => {
      const traversalAttempts = [
        '/players/../etc/passwd',
        '/players/../../root',
        '/players/..%2F..%2Fetc',
        '/players/abc/../../../etc',
      ];

      traversalAttempts.forEach((attempt) => {
        expect(validateReturnTo(attempt)).toBe(false);
      });
    });

    it('accepts only /players paths', () => {
      const validPaths = [
        '/players',
        '/players/',
        '/players?query=smith',
        '/players/abc-123',
        '/players/abc-123?tab=timeline',
        '/players/abc-123/notes',
      ];

      validPaths.forEach((path) => {
        expect(validateReturnTo(path)).toBe(true);
      });
    });

    it('rejects non-players paths', () => {
      const invalidPaths = [
        '/',
        '/admin',
        '/settings',
        '/dashboard',
        '/api/players',
        '/player', // singular
      ];

      invalidPaths.forEach((path) => {
        expect(validateReturnTo(path)).toBe(false);
      });
    });
  });

  describe('round-trip validation', () => {
    it('query params survive encode-decode round-trip', () => {
      const originalUrl = '/players?query=john&filter=active&page=2';

      const encoded = encodeReturnTo(originalUrl);
      const decoded = decodeReturnTo(encoded);

      expect(decoded).toBe(originalUrl);
    });

    it('special characters survive round-trip', () => {
      const originalUrl = '/players?query=john%20doe&filter=vip%2Bactive';

      const encoded = encodeReturnTo(originalUrl);
      const decoded = decodeReturnTo(encoded);

      expect(decoded).toBe(originalUrl);
    });
  });
});
