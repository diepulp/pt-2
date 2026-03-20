/** @jest-environment node */

import { iframePrint } from '../iframe-print';

describe('iframePrint SSR guard (node environment)', () => {
  it('returns failure when window is undefined', async () => {
    const job = iframePrint('<html><body>test</body></html>');
    const result = await job.promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('browser');
    expect(typeof job.cleanup).toBe('function');
    // Cleanup is a no-op in SSR
    expect(() => job.cleanup()).not.toThrow();
  });
});
