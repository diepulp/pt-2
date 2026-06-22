/**
 * HTML preview renderer (PRD-092 WS4) — NON-CANONICAL, PREVIEW ONLY
 *
 * Renders the canonical `ReceiptDocument` to operator-facing HTML for an
 * on-screen preview. This output is `canonical: false` and MUST NEVER reach a
 * printer (FR-7 / GATE-UX-1). The WS6 controlled action enforces this at
 * runtime by rejecting any non-canonical renderer on the production path — this
 * flag is the signal it checks.
 *
 * It is deliberately NOT a `LoyaltyInstrumentPrinter` transport payload: a
 * preview is a screen artifact, not the production document.
 *
 * Pure: no I/O, no mutation, no device calls.
 *
 * @see PRD-092 / EXEC-092 WS4 (FR-7 runtime guard / GATE-UX-1)
 */

import type {
  ReceiptBlock,
  ReceiptDocument,
  ReceiptRenderer,
  RenderedReceipt,
} from '../templates/receipt-document';

/** Minimal HTML escaping for text interpolated into the preview. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlock(block: ReceiptBlock): string {
  switch (block.type) {
    case 'text': {
      const styles = [
        `text-align:${block.align ?? 'left'}`,
        block.bold ? 'font-weight:bold' : '',
        block.size === 'large' ? 'font-size:1.25em' : '',
      ]
        .filter(Boolean)
        .join(';');
      return `<p style="${styles}">${escapeHtml(block.text)}</p>`;
    }
    case 'divider':
      return '<hr />';
    case 'image':
      return `<div class="receipt-image" data-ref="${escapeHtml(block.ref)}">[${escapeHtml(block.alt ?? 'image')}]</div>`;
    case 'barcode':
      return `<div class="receipt-barcode" data-symbology="${escapeHtml(block.symbology)}">${escapeHtml(block.data)}</div>`;
    case 'feed':
      return `<div class="receipt-feed" style="height:${Math.max(0, block.lines)}em"></div>`;
    case 'cut':
      return `<div class="receipt-cut" data-mode="${block.mode ?? 'full'}"></div>`;
    default: {
      const _exhaustive: never = block;
      throw new Error(
        `Unsupported receipt block: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function renderDocumentBody(document: ReceiptDocument): string {
  const inner = document.blocks.map(renderBlock).join('\n');
  return [
    `<section class="receipt-preview" data-template="${escapeHtml(document.templateId)}" data-version="${document.templateVersion}" data-preview="true">`,
    inner,
    '</section>',
  ].join('\n');
}

/**
 * Factory for the preview-only renderer. Functional factory, not a class.
 * `canonical: false` — never submit this output to a device.
 */
export function createHtmlPreviewRenderer(): ReceiptRenderer {
  return {
    kind: 'html-preview',
    canonical: false,
    render(document: ReceiptDocument): RenderedReceipt {
      return {
        rendererKind: 'html-preview',
        canonical: false,
        contentType: 'text/html',
        body: renderDocumentBody(document),
      };
    },
  };
}
