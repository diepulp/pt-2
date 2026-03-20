// lib/print/templates/shared-styles.ts — Common print CSS (R22-R25)

/** Returns CSS string for inline injection into print templates.
 *  System fonts only, 80mm receipt-friendly max-width, @page margins. */
export function getSharedStyles(): string {
  return `
    *, *::before, *::after {
      box-sizing: border-box;
    }

    @page {
      margin: 12mm 15mm;
    }

    body {
      margin: 0;
      padding: 20px;
      max-width: 72mm;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }

    h1, h2, h3 {
      margin: 0 0 0.4em 0;
    }

    hr {
      border: none;
      border-top: 1px solid #333;
      margin: 8px 0;
    }

    .mono {
      font-family: 'Courier New', Courier, monospace;
    }

    .text-center {
      text-align: center;
    }

    .text-right {
      text-align: right;
    }

    .bold {
      font-weight: 700;
    }

    .small {
      font-size: 9px;
      color: #666;
    }

    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .row-label {
      color: #555;
    }

    .row-value {
      font-weight: 600;
      text-align: right;
    }
  `;
}
