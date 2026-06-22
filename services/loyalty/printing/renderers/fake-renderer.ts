/**
 * Fake deterministic renderer (PRD-092 WS4)
 *
 * Renders the canonical `ReceiptDocument` to a stable, line-oriented payload
 * for snapshot tests and the `fake` transport adapter (WS5). It is
 * `canonical: true` — it represents the same document faithfully and is safe on
 * the production contract-parity path (GATE-PLATFORM-2); it simply targets no
 * real device.
 *
 * Determinism: the output is a function of the document alone (no timestamps,
 * no randomness, no environment), so a snapshot is reproducible across runs and
 * machines.
 *
 * Pure: no I/O, no mutation, no device calls.
 *
 * @see PRD-092 / EXEC-092 WS4 / GATE-PLATFORM-2
 */

import type {
  ReceiptBlock,
  ReceiptDocument,
  ReceiptRenderer,
  RenderedReceipt,
} from '../templates/receipt-document';

/** One stable, fully-attributed line per block — easy to assert in snapshots. */
function describeBlock(block: ReceiptBlock): string {
  switch (block.type) {
    case 'text':
      return `text|align=${block.align ?? 'left'}|bold=${block.bold ?? false}|size=${block.size ?? 'normal'}|${block.text}`;
    case 'divider':
      return `divider|char=${block.char ?? '-'}`;
    case 'image':
      return `image|ref=${block.ref}|alt=${block.alt ?? ''}`;
    case 'barcode':
      return `barcode|sym=${block.symbology}|hr=${block.humanReadable ?? false}|${block.data}`;
    case 'feed':
      return `feed|lines=${block.lines}`;
    case 'cut':
      return `cut|mode=${block.mode ?? 'full'}`;
    default: {
      const _exhaustive: never = block;
      throw new Error(
        `Unsupported receipt block: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function renderDocumentBody(document: ReceiptDocument): string {
  const header = `doc|template=${document.templateId}|v${document.templateVersion}|blocks=${document.blocks.length}`;
  const body = document.blocks.map(describeBlock);
  return [header, ...body].join('\n');
}

/**
 * Factory for the deterministic fake renderer. Functional factory, not a class.
 */
export function createFakeRenderer(): ReceiptRenderer {
  return {
    kind: 'fake',
    canonical: true,
    render(document: ReceiptDocument): RenderedReceipt {
      return {
        rendererKind: 'fake',
        canonical: true,
        contentType: 'text/plain',
        body: renderDocumentBody(document),
      };
    },
  };
}
