// lib/print/iframe-print.ts — Hidden iframe print utility (ADR-045 D1)

import type { PrintResult, PrintJob } from './types';

/**
 * Print an HTML document via a hidden iframe + browser print dialog.
 *
 * Returns a PrintJob with:
 * - `promise` — resolves to PrintResult after the print dialog is invoked
 * - `cleanup` — idempotent function to remove the iframe (for React unmount)
 *
 * Never throws. All errors are captured in the PrintResult.
 */
export function iframePrint(htmlContent: string): PrintJob {
  // SSR guard
  if (typeof window === 'undefined') {
    return {
      promise: Promise.resolve({
        success: false,
        error: 'Not in browser environment',
      }),
      cleanup: () => {},
    };
  }

  let iframe: HTMLIFrameElement | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let cleaned = false;

  const removeIframe = () => {
    if (cleaned) return;
    cleaned = true;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    iframe = null;
  };

  const promise = new Promise<PrintResult>((resolve) => {
    try {
      iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument;
      const iframeWin = iframe.contentWindow;

      if (!iframeDoc || !iframeWin) {
        removeIframe();
        resolve({ success: false, error: 'Could not access iframe document' });
        return;
      }

      iframeDoc.open();
      // document.write is deprecated for page-level use but is the standard
      // pattern for injecting content into same-origin iframes (no alternative)
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // afterprint listener — fires when print dialog closes
      const onAfterPrint = () => {
        iframeWin.removeEventListener('afterprint', onAfterPrint);
        removeIframe();
      };
      iframeWin.addEventListener('afterprint', onAfterPrint);

      // Timeout fallback — 5 seconds in case afterprint never fires
      timeoutId = setTimeout(() => {
        timeoutId = null;
        iframeWin.removeEventListener('afterprint', onAfterPrint);
        removeIframe();
      }, 5_000);

      // Wait for iframe rendering via 2x requestAnimationFrame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            iframeWin.print();
            resolve({ success: true });
          } catch (printErr) {
            removeIframe();
            resolve({
              success: false,
              error:
                printErr instanceof Error ? printErr.message : 'Print failed',
            });
          }
        });
      });
    } catch (err) {
      removeIframe();
      resolve({
        success: false,
        error:
          err instanceof Error ? err.message : 'Failed to create print iframe',
      });
    }
  });

  return { promise, cleanup: removeIframe };
}
