/**
 * receipt_document_hash provenance (PRD-092 WS4)
 *
 * The hash stored on the `print_attempt` audit row (WS1 `receipt_document_hash`)
 * is a digest of the CANONICAL serialized `ReceiptDocument` — NOT of the
 * transport payload a renderer emits, and NOT re-derived from the instrument.
 * Two builds of the same template over the same payload therefore produce the
 * same hash, which is what makes a stored attempt reproducible.
 *
 * Canonicalization is a recursive, stable-key-ordered JSON serialization so the
 * digest is independent of object key insertion order. Mirrors the SHA-256
 * approach already used in `lib/idempotency.ts`.
 *
 * @see PRD-092 / EXEC-092 WS4 (VALUE AUTHORITY / DA §5)
 * @see lib/idempotency.ts (existing SHA-256 idempotency pattern)
 */

import { createHash } from 'crypto';

import type { ReceiptDocument } from './receipt-document';

/** JSON-representable value (the canonical document is plain data). */
type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

/**
 * Deterministically serialize a value with recursively sorted object keys.
 * Arrays preserve order (block order is semantically significant); object keys
 * are sorted so serialization is insertion-order independent.
 */
function canonicalize(value: CanonicalValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',');
  return `{${entries}}`;
}

/**
 * The canonical serialized form of a `ReceiptDocument`. Exposed for snapshot
 * tests (WS8) and so a renderer/auditor can confirm the exact bytes hashed.
 */
export function serializeReceiptDocumentCanonical(
  document: ReceiptDocument,
): string {
  // ReceiptDocument is plain JSON data; the cast narrows it to the canonical
  // value shape without widening to `any`.
  // eslint-disable-next-line custom-rules/no-dto-type-assertions -- JSONB boundary: plain-JSON ReceiptDocument narrowed to CanonicalValue
  return canonicalize(document as unknown as CanonicalValue);
}

/**
 * Hex-encoded SHA-256 digest of the canonical serialized `ReceiptDocument`.
 * This is the value written to `print_attempt.receipt_document_hash`.
 */
export function hashReceiptDocument(document: ReceiptDocument): string {
  const canonical = serializeReceiptDocumentCanonical(document);
  return createHash('sha256').update(canonical).digest('hex');
}
