/**
 * CSV Structural Repair
 *
 * Pre-parse repair step that neutralizes bare quotes in unquoted CSV fields
 * to prevent Papa Parse from entering quoted-field mode and swallowing rows.
 *
 * @see docs/issues/gaps/csv-import/csv_row_loss_fix.md
 */

export type CsvDialect = {
  delimiter: string;
  quoteChar: string;
  allowPostQuoteWhitespace: boolean;
};

export type RepairedLine = {
  lineIndex0: number;
  lineNumber1: number;
  original: string;
  repaired: string;
  reason: 'BARE_QUOTE_IN_UNQUOTED_FIELD';
};

export type RepairReport = {
  dialect: CsvDialect;
  newlineStyle: 'LF' | 'CRLF';
  linesInspected: number;
  linesRepaired: number;
  repairs: RepairedLine[];
};

export type RepairResult = {
  text: string;
  report: RepairReport;
};

const DEFAULT_DIALECT: CsvDialect = {
  delimiter: ',',
  quoteChar: '"',
  allowPostQuoteWhitespace: true,
};

type QuoteState = 'StartOfField' | 'InUnquoted' | 'InQuoted' | 'MaybeEndQuoted';

export class CsvMultilineQuotedFieldError extends Error {
  constructor(lineNumber1: number) {
    super(
      `CSV contains multiline quoted fields (line ${lineNumber1}); not supported by importer.`,
    );
    this.name = 'CsvMultilineQuotedFieldError';
  }
}

/**
 * Validate a single CSV line for correct quoting structure.
 *
 * Returns true if all quotes are properly balanced per CSV dialect rules.
 * Returns false if bare quotes appear in unquoted fields, quotes are unclosed,
 * or invalid characters follow a closing quote.
 */
export function hasValidCsvQuoting(
  line: string,
  dialect?: Partial<CsvDialect>,
): boolean {
  const d = { ...DEFAULT_DIALECT, ...dialect };
  let state: QuoteState = 'StartOfField';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    switch (state) {
      case 'StartOfField':
        if (ch === d.quoteChar) {
          state = 'InQuoted';
        } else if (ch === d.delimiter) {
          // empty field, stay in StartOfField
        } else {
          state = 'InUnquoted';
        }
        break;

      case 'InUnquoted':
        if (ch === d.quoteChar) {
          return false; // bare quote in unquoted field
        } else if (ch === d.delimiter) {
          state = 'StartOfField';
        }
        // else stay in InUnquoted
        break;

      case 'InQuoted':
        if (ch === d.quoteChar) {
          state = 'MaybeEndQuoted';
        }
        // else stay in InQuoted
        break;

      case 'MaybeEndQuoted':
        if (ch === d.quoteChar) {
          state = 'InQuoted'; // escaped quote ""
        } else if (ch === d.delimiter) {
          state = 'StartOfField'; // field closed
        } else if (d.allowPostQuoteWhitespace && (ch === ' ' || ch === '\t')) {
          // stay in MaybeEndQuoted
        } else {
          return false; // invalid character after closing quote
        }
        break;
    }
  }

  // End-of-line terminal check
  return state !== 'InQuoted';
}

/**
 * Repair a single line by dropping bare quotes in unquoted fields and
 * retroactively stripping quotes from malformed quoted fields (where an
 * invalid character follows the closing quote, e.g., "//secret")x).
 *
 * Uses an array buffer so we can retroactively remove characters.
 * Throws CsvMultilineQuotedFieldError if the line ends in InQuoted state.
 */
function repairLine(
  line: string,
  lineNumber1: number,
  dialect: CsvDialect,
): { repaired: string; changed: boolean } {
  const d = dialect;
  let state: QuoteState = 'StartOfField';
  const out: string[] = [];
  let changed = false;
  // Track positions of quotes for malformed quoted fields so we can
  // retroactively strip them if the field turns out to be invalid.
  let quotedFieldOpenPos = -1;
  let closingQuotePos = -1;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    switch (state) {
      case 'StartOfField':
        if (ch === d.quoteChar) {
          state = 'InQuoted';
          quotedFieldOpenPos = out.length;
          out.push(ch);
        } else if (ch === d.delimiter) {
          out.push(ch);
        } else {
          state = 'InUnquoted';
          out.push(ch);
        }
        break;

      case 'InUnquoted':
        if (ch === d.quoteChar) {
          changed = true; // drop bare quote
        } else if (ch === d.delimiter) {
          state = 'StartOfField';
          out.push(ch);
        } else {
          out.push(ch);
        }
        break;

      case 'InQuoted':
        out.push(ch);
        if (ch === d.quoteChar) {
          closingQuotePos = out.length - 1;
          state = 'MaybeEndQuoted';
        }
        break;

      case 'MaybeEndQuoted':
        if (ch === d.quoteChar) {
          state = 'InQuoted'; // escaped quote ""
          closingQuotePos = -1;
          out.push(ch);
        } else if (ch === d.delimiter) {
          state = 'StartOfField';
          quotedFieldOpenPos = -1;
          closingQuotePos = -1;
          out.push(ch);
        } else if (d.allowPostQuoteWhitespace && (ch === ' ' || ch === '\t')) {
          out.push(ch);
        } else {
          // Invalid post-quote char: the "quoted field" was malformed.
          // Retroactively strip opening and closing quotes to prevent
          // Papa Parse from entering quoted-field mode on this field.
          if (quotedFieldOpenPos >= 0) {
            out[quotedFieldOpenPos] = '';
            changed = true;
          }
          if (closingQuotePos >= 0) {
            out[closingQuotePos] = '';
            changed = true;
          }
          state = 'InUnquoted';
          quotedFieldOpenPos = -1;
          closingQuotePos = -1;
          out.push(ch);
        }
        break;
    }
  }

  if (state === 'InQuoted') {
    throw new CsvMultilineQuotedFieldError(lineNumber1);
  }

  return { repaired: out.join(''), changed };
}

/**
 * Scan raw CSV text and neutralize bare quotes in unquoted fields.
 *
 * Prevents Papa Parse from entering runaway quoted-field mode while preserving
 * legitimate quoted fields (e.g., "Smith, Jr."). Header row is never modified.
 *
 * Throws CsvMultilineQuotedFieldError if any line contains an unclosed quoted
 * field (multiline quoted fields are not supported).
 */
export function repairCsvStructure(
  rawText: string,
  dialect?: Partial<CsvDialect>,
): RepairResult {
  const d = { ...DEFAULT_DIALECT, ...dialect };
  const newlineStyle: 'LF' | 'CRLF' = rawText.includes('\r\n') ? 'CRLF' : 'LF';

  const normalized = rawText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // Strip trailing empty element from final newline
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const repairs: RepairedLine[] = [];
  let linesInspected = 0;

  for (let i = 1; i < lines.length; i++) {
    linesInspected++;
    const line = lines[i];

    // Fast path: no quotes at all, skip
    if (!line.includes(d.quoteChar)) continue;

    // If already valid, keep as-is
    if (hasValidCsvQuoting(line, dialect)) continue;

    // Repair bare quotes
    const { repaired, changed } = repairLine(line, i + 1, d);

    if (changed) {
      repairs.push({
        lineIndex0: i,
        lineNumber1: i + 1,
        original: line,
        repaired,
        reason: 'BARE_QUOTE_IN_UNQUOTED_FIELD',
      });
      lines[i] = repaired;
    }
  }

  const joiner = newlineStyle === 'CRLF' ? '\r\n' : '\n';
  const text = lines.join(joiner);

  return {
    text,
    report: {
      dialect: d,
      newlineStyle,
      linesInspected,
      linesRepaired: repairs.length,
      repairs,
    },
  };
}
