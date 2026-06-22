/**
 * CUPS production renderer (PRD-092 WS4)
 *
 * Renders the canonical `ReceiptDocument` to a transport-neutral plain-text
 * payload suitable for a one-way text spooler. This is the PRODUCTION renderer
 * (`canonical: true`).
 *
 * GATE-PLATFORM-1: despite the name, this renderer imports NO device / CUPS /
 * ESC-POS / spooler library and emits NO device-specific control codes. The
 * "cups" name marks it as the payload the cups *adapter* (WS5) will submit; the
 * adapter — not this renderer — owns any transport specifics. Keeping it pure
 * plain text is what lets the future Windows port reuse the same document.
 *
 * Pure: no I/O, no mutation, no device calls.
 *
 * @see PRD-092 / EXEC-092 WS4
 * @see ADR-062 D6 (canonical document) / GATE-PLATFORM-1 (OS-neutrality)
 */

import type {
  ReceiptBlock,
  ReceiptDocument,
  ReceiptRenderer,
  ReceiptTextAlign,
  RenderedReceipt,
} from '../templates/receipt-document';

/**
 * Default character width for an 80mm text column (provisional, FIB DEP-3).
 * Overridable via `createCupsRenderer({ columnWidth })` so a deployment can tune
 * the printable column count for its head/font without a code change — a narrower
 * device clips the right edge otherwise (the "cutoff" symptom).
 */
const DEFAULT_COLUMN_WIDTH = 42;

/**
 * Word-wrap a single logical line to `width` columns. Words longer than the
 * column (e.g. a long token) are hard-split so NOTHING overflows the printable
 * area — an overflowing line is silently clipped by the head, which is exactly
 * the cutoff this renderer must prevent. An empty input yields one empty line so
 * intentional blank lines survive.
 */
function wrapLine(text: string, width: number): string[] {
  if (text.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    let token = word;
    // Hard-split a single word that is itself wider than the column.
    while (token.length > width) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      lines.push(token.slice(0, width));
      token = token.slice(width);
    }
    if (token.length === 0) {
      continue;
    }
    if (current.length === 0) {
      current = token;
    } else if (current.length + 1 + token.length <= width) {
      current = `${current} ${token}`;
    } else {
      lines.push(current);
      current = token;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function alignLine(
  text: string,
  alignment: ReceiptTextAlign | undefined,
  width: number,
): string {
  if (text.length >= width) {
    return text;
  }
  const pad = width - text.length;
  switch (alignment) {
    case 'center': {
      const left = Math.floor(pad / 2);
      return ' '.repeat(left) + text;
    }
    case 'right':
      return ' '.repeat(pad) + text;
    case 'left':
    default:
      return text;
  }
}

/** Wrap THEN align: every emitted line is ≤ `width`, so nothing is clipped. */
function layout(
  text: string,
  alignment: ReceiptTextAlign | undefined,
  width: number,
): string[] {
  return wrapLine(text, width).map((line) => alignLine(line, alignment, width));
}

function renderBlock(block: ReceiptBlock, width: number): string[] {
  switch (block.type) {
    case 'text':
      return layout(block.text, block.align, width);
    case 'divider':
      return [(block.char ?? '-').repeat(width)];
    case 'image':
      return layout(`[${block.alt ?? 'image'}:${block.ref}]`, 'center', width);
    case 'barcode': {
      const lines = layout(
        `[${block.symbology}] ${block.data}`,
        'center',
        width,
      );
      if (block.humanReadable) {
        lines.push(...layout(block.data, 'center', width));
      }
      return lines;
    }
    case 'feed':
      return Array.from({ length: Math.max(0, block.lines) }, () => '');
    case 'cut':
      return [`-- cut (${block.mode ?? 'full'}) --`];
    default: {
      const _exhaustive: never = block;
      throw new Error(
        `Unsupported receipt block: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function renderDocumentBody(document: ReceiptDocument, width: number): string {
  return document.blocks
    .flatMap((block) => renderBlock(block, width))
    .join('\n');
}

/** Options for the production (CUPS) renderer. */
export interface CupsRendererConfig {
  /** Printable column count for the target head (default 42). */
  columnWidth?: number;
}

/**
 * Factory for the production (CUPS) renderer. Functional factory, not a class.
 */
export function createCupsRenderer(
  config?: CupsRendererConfig,
): ReceiptRenderer {
  const width =
    config?.columnWidth && config.columnWidth > 0
      ? Math.floor(config.columnWidth)
      : DEFAULT_COLUMN_WIDTH;
  return {
    kind: 'cups',
    canonical: true,
    render(document: ReceiptDocument): RenderedReceipt {
      return {
        rendererKind: 'cups',
        canonical: true,
        contentType: 'text/plain',
        body: renderDocumentBody(document, width),
      };
    },
  };
}
