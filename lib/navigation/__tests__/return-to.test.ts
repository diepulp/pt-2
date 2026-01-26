/**
 * Return-To Navigation Utilities Tests
 *
 * Security-focused tests for returnTo param handling.
 *
 * @see PRD-022 WS10 Unit + Integration Tests
 */

import {
  buildPlayerDetailUrl,
  buildPlayerDetailUrlWithAnchor,
  decodeReturnTo,
  encodeReturnTo,
  validateReturnTo,
} from '../return-to';

describe('validateReturnTo', () => {
  describe('valid paths', () => {
    it('accepts /players path', () => {
      expect(validateReturnTo('/players')).toBe(true);
    });

    it('accepts /players with query params', () => {
      expect(validateReturnTo('/players?query=smith')).toBe(true);
      expect(validateReturnTo('/players?query=smith&filter=active')).toBe(true);
    });

    it('accepts /players/[playerId] paths', () => {
      expect(validateReturnTo('/players/abc-123')).toBe(true);
      expect(validateReturnTo('/players/abc-123?tab=timeline')).toBe(true);
    });

    it('accepts /players subpaths', () => {
      expect(validateReturnTo('/players/abc/timeline')).toBe(true);
      expect(validateReturnTo('/players/abc/notes')).toBe(true);
    });
  });

  describe('security - open redirect prevention', () => {
    it('rejects protocol-relative URLs', () => {
      expect(validateReturnTo('//evil.com')).toBe(false);
      expect(validateReturnTo('//evil.com/players')).toBe(false);
    });

    it('rejects absolute URLs with protocols', () => {
      expect(validateReturnTo('https://evil.com/players')).toBe(false);
      expect(validateReturnTo('http://evil.com/players')).toBe(false);
      expect(validateReturnTo('ftp://evil.com/players')).toBe(false);
    });

    it('rejects javascript: URLs', () => {
      expect(validateReturnTo('javascript:alert(1)')).toBe(false);
      expect(validateReturnTo('javascript:void(0)')).toBe(false);
    });

    it('rejects data: URLs', () => {
      expect(validateReturnTo('data:text/html,<script>alert(1)</script>')).toBe(
        false,
      );
    });
  });

  describe('security - path traversal prevention', () => {
    it('rejects path traversal attempts', () => {
      expect(validateReturnTo('/players/../etc/passwd')).toBe(false);
      expect(validateReturnTo('/players/../../etc/passwd')).toBe(false);
    });

    it('rejects encoded path traversal', () => {
      expect(validateReturnTo('/players/..%2F..%2Fetc')).toBe(false);
    });
  });

  describe('invalid paths', () => {
    it('rejects non-players paths', () => {
      expect(validateReturnTo('/admin')).toBe(false);
      expect(validateReturnTo('/settings')).toBe(false);
      expect(validateReturnTo('/dashboard')).toBe(false);
      expect(validateReturnTo('/')).toBe(false);
    });

    it('rejects empty paths', () => {
      expect(validateReturnTo('')).toBe(false);
    });
  });
});

describe('encodeReturnTo', () => {
  it('encodes valid paths', () => {
    const encoded = encodeReturnTo('/players?query=smith');
    expect(encoded).toBe(encodeURIComponent('/players?query=smith'));
  });

  it('returns default for invalid paths', () => {
    const encoded = encodeReturnTo('//evil.com');
    expect(encoded).toBe(encodeURIComponent('/players'));
  });

  it('handles special characters', () => {
    const encoded = encodeReturnTo('/players?query=john doe');
    expect(decodeURIComponent(encoded)).toBe('/players?query=john doe');
  });
});

describe('decodeReturnTo', () => {
  it('decodes valid encoded paths', () => {
    const encoded = encodeURIComponent('/players?query=smith');
    expect(decodeReturnTo(encoded)).toBe('/players?query=smith');
  });

  it('returns default for null/undefined', () => {
    expect(decodeReturnTo(null)).toBe('/players');
    expect(decodeReturnTo(undefined)).toBe('/players');
  });

  it('returns default for empty string', () => {
    expect(decodeReturnTo('')).toBe('/players');
  });

  it('returns default for invalid decoded paths', () => {
    const encoded = encodeURIComponent('//evil.com');
    expect(decodeReturnTo(encoded)).toBe('/players');
  });

  it('returns default for malformed encoding', () => {
    expect(decodeReturnTo('%invalid%')).toBe('/players');
  });
});

describe('buildPlayerDetailUrl', () => {
  it('builds basic URL without returnTo', () => {
    expect(buildPlayerDetailUrl('abc-123')).toBe('/players/abc-123');
  });

  it('builds URL with valid returnTo', () => {
    const url = buildPlayerDetailUrl('abc-123', '/players?query=smith');
    expect(url).toBe(
      `/players/abc-123?returnTo=${encodeURIComponent('/players?query=smith')}`,
    );
  });

  it('builds URL with fallback for invalid returnTo', () => {
    const url = buildPlayerDetailUrl('abc-123', '//evil.com');
    expect(url).toBe(
      `/players/abc-123?returnTo=${encodeURIComponent('/players')}`,
    );
  });
});

describe('buildPlayerDetailUrlWithAnchor', () => {
  it('builds URL with anchor', () => {
    const url = buildPlayerDetailUrlWithAnchor('abc-123', 'timeline');
    expect(url).toBe('/players/abc-123#timeline');
  });

  it('builds URL with anchor and returnTo', () => {
    const url = buildPlayerDetailUrlWithAnchor(
      'abc-123',
      'timeline',
      '/players?query=smith',
    );
    expect(url).toContain('#timeline');
    expect(url).toContain('returnTo=');
  });
});
