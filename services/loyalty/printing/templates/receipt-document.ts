/**
 * Canonical ReceiptDocument (PRD-092 WS4)
 *
 * The transport-neutral intermediate between the FROZEN `FulfillmentPayload`
 * (services/loyalty/dtos.ts) and the WS5 transport adapters (ADR-062 D6).
 *
 * Design rules:
 *   - OS-neutral: ZERO CUPS / Epson / ESC-POS / spooler types or strings
 *     (GATE-PLATFORM-1). A block list describes *what* to print, never *how* a
 *     specific device encodes it.
 *   - The document is the hash provenance root: `receipt_document_hash` is a
 *     digest of the canonical serialized `ReceiptDocument` (see `hash.ts`),
 *     NOT of the transport payload a renderer produces.
 *   - Templates are version-controlled CODE. `templateVersion` is immutable for
 *     a given `templateId`; a content change creates `templateVersion + 1`.
 *     There is NO runtime / admin / DB template engine.
 *
 * @see PRD-092 / EXEC-092 WS4
 * @see ADR-062 D6 (canonical transport-neutral document)
 */

/** Horizontal alignment for a text block. */
export type ReceiptTextAlign = 'left' | 'center' | 'right';

/** Relative emphasis size for a text block (device maps to its own scale). */
export type ReceiptTextSize = 'normal' | 'large';

/** A line (or wrapped run) of human-readable text. */
export interface ReceiptTextBlock {
  type: 'text';
  text: string;
  align?: ReceiptTextAlign;
  bold?: boolean;
  size?: ReceiptTextSize;
}

/** A horizontal rule. `char` is the fill glyph a text device may repeat. */
export interface ReceiptDividerBlock {
  type: 'divider';
  char?: string;
}

/**
 * A logo / graphic referenced by an opaque, deployment-resolved id. The
 * document carries the *reference* only — never raw image bytes — so it stays
 * transport-neutral and deterministically hashable.
 */
export interface ReceiptImageBlock {
  type: 'image';
  ref: string;
  alt?: string;
}

/** Barcode symbologies a loyalty instrument may carry (OS-neutral names). */
export type ReceiptBarcodeSymbology = 'code128' | 'qr';

/** A machine-readable token (validation / coupon id). */
export interface ReceiptBarcodeBlock {
  type: 'barcode';
  symbology: ReceiptBarcodeSymbology;
  data: string;
  /** Print the human-readable value beneath the symbol. */
  humanReadable?: boolean;
}

/** Vertical whitespace — `lines` blank lines of feed. */
export interface ReceiptFeedBlock {
  type: 'feed';
  lines: number;
}

/** Paper cut. `partial` leaves a tab; `full` severs. */
export interface ReceiptCutBlock {
  type: 'cut';
  mode?: 'full' | 'partial';
}

/**
 * The closed block vocabulary (ADR-062 D6). A renderer MUST handle every
 * member exhaustively; new block kinds are a template-layer change, never a
 * runtime extension.
 */
export type ReceiptBlock =
  | ReceiptTextBlock
  | ReceiptDividerBlock
  | ReceiptImageBlock
  | ReceiptBarcodeBlock
  | ReceiptFeedBlock
  | ReceiptCutBlock;

/**
 * The canonical, transport-neutral print document.
 *
 * `templateId` + `templateVersion` identify the version-controlled template
 * that produced `blocks`; they are persisted on the `print_attempt` audit row
 * (WS1) so a stored attempt is reproducible against its exact template code.
 */
export interface ReceiptDocument {
  templateId: string;
  templateVersion: number;
  blocks: ReceiptBlock[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer contract (shared by the WS4 renderers; consumed by WS5/WS6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renderer discriminator.
 *   - `cups`        — production transport payload (canonical).
 *   - `fake`        — deterministic snapshot payload (canonical-equivalent; for tests).
 *   - `html-preview`— operator preview ONLY; NON-canonical, never reaches a device.
 */
export type RendererKind = 'cups' | 'fake' | 'html-preview';

/**
 * A rendered transport payload. `canonical === false` marks a payload that MUST
 * NOT be submitted to a printer — the WS6 controlled action enforces this at
 * runtime (FR-7: html-preview never reaches the device).
 */
export interface RenderedReceipt {
  rendererKind: RendererKind;
  /** False ONLY for `html-preview`; the production path rejects non-canonical payloads. */
  canonical: boolean;
  /** MIME-ish content type of `body` (e.g. `text/plain`, `text/html`). */
  contentType: string;
  /** The serialized transport payload. */
  body: string;
}

/**
 * A pure transform from the canonical document to a transport payload. A
 * renderer performs NO I/O, NO instrument mutation, and NO device calls.
 */
export interface ReceiptRenderer {
  readonly kind: RendererKind;
  /** `false` ONLY for the preview renderer. */
  readonly canonical: boolean;
  render(document: ReceiptDocument): RenderedReceipt;
}
