/** @jest-environment jsdom */

import { iframePrint } from '../iframe-print';

describe('iframePrint', () => {
  let appendChildSpy: jest.SpyInstance;
  let removeChildSpy: jest.SpyInstance;

  beforeEach(() => {
    appendChildSpy = jest.spyOn(document.body, 'appendChild');
    removeChildSpy = jest.spyOn(document.body, 'removeChild');
    jest.useFakeTimers();
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    jest.useRealTimers();
    // Clean up any leftover iframes
    document.querySelectorAll('iframe').forEach((el) => el.remove());
  });

  it('creates hidden iframe and appends to document.body', () => {
    iframePrint('<html><body>test</body></html>');
    expect(appendChildSpy).toHaveBeenCalled();
    const iframe = appendChildSpy.mock.calls[0][0] as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.style.visibility).toBe('hidden');
  });

  it('returns a PrintJob with promise and cleanup', () => {
    const job = iframePrint('<html><body>test</body></html>');
    expect(job).toHaveProperty('promise');
    expect(job).toHaveProperty('cleanup');
    expect(typeof job.cleanup).toBe('function');
    expect(job.promise).toBeInstanceOf(Promise);
  });

  it('cleanup removes iframe from DOM (idempotent)', () => {
    const job = iframePrint('<html><body>test</body></html>');
    const iframe = appendChildSpy.mock.calls[0][0] as HTMLIFrameElement;

    // Iframe should be in the DOM
    expect(iframe.parentNode).toBe(document.body);

    // First cleanup
    job.cleanup();
    expect(iframe.parentNode).toBeNull();

    // Second cleanup should not throw (idempotent)
    expect(() => job.cleanup()).not.toThrow();
  });

  it('removes iframe after 5s timeout fallback', async () => {
    iframePrint('<html><body>test</body></html>');
    const iframe = appendChildSpy.mock.calls[0][0] as HTMLIFrameElement;

    expect(iframe.parentNode).toBe(document.body);

    jest.advanceTimersByTime(5000);

    expect(iframe.parentNode).toBeNull();
  });

  it('returns failure result when contentDocument is null', async () => {
    // Mock createElement to return iframe with null contentDocument
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentDocument', { value: null });
        Object.defineProperty(el, 'contentWindow', { value: null });
      }
      return el;
    });

    const job = iframePrint('<html><body>test</body></html>');
    const result = await job.promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('iframe');

    (document.createElement as jest.Mock).mockRestore();
  });

  it('never throws — catches all errors', async () => {
    // Even if something goes wrong, it should return an error result, not throw
    jest.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('Simulated failure');
    });

    const job = iframePrint('<html><body>test</body></html>');
    const result = await job.promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Simulated failure');

    (document.createElement as jest.Mock).mockRestore();
  });
});

// SSR guard test is in iframe-print-ssr.test.ts (@jest-environment node)
