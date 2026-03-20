// lib/print/escape-html.ts — HTML entity encoding for XSS defense-in-depth (SEC Note C1)

const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const ESCAPE_RE = /[&<>"']/g;

/** Encode `<`, `>`, `&`, `"`, `'` to HTML entities.
 *  All other characters (including unicode and backticks) pass through unchanged. */
export function escapeHtml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ENTITY_MAP[ch]);
}
