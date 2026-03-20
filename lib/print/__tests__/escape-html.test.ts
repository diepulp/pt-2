/** @jest-environment node */

import { escapeHtml } from '../escape-html';

describe('escapeHtml', () => {
  it('encodes < to &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('encodes > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('encodes & to &amp;', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('encodes " to &quot;', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it("encodes ' to &#x27;", () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through string with no special chars', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('encodes string with multiple special chars', () => {
    expect(escapeHtml('<b>"A & B"</b>')).toBe(
      '&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;',
    );
  });

  it('preserves unicode characters', () => {
    expect(escapeHtml('Casino Río')).toBe('Casino Río');
  });

  it('passes through backticks unchanged', () => {
    expect(escapeHtml('test `value`')).toBe('test `value`');
  });
});
