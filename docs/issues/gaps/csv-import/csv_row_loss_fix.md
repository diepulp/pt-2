# Fix: CSV Row Loss from Bare Double-Quotes (ISSUE-14957158) — PATCHED

## Context

Papa Parse with `header: true` can enter quoted-field mode when it encounters a bare `"` mid-field inside an unquoted CSV field (for example `+HYPERLINK("http://evil.com")`). This causes the parser to treat subsequent newlines as part of a single malformed field, effectively swallowing subsequent rows.

**Observed impact:** In a 100-row vendor file with two such rows, only 71 rows were parsed (29 rows “lost” via row-swallowing). Investigation is documented in `docs/issues/gaps/csv-import/CSV_ROW_LOSS.md`.

## Approach: Pre-Parse Structural Repair (Conservative + Auditable)

Add a pure, pre-parse repair step that scans the raw CSV text and neutralizes only the structural trigger: bare quotes in unquoted context.

### Key Principles

- Do **not** disable quoting globally (example: quoteChar hacks). Legitimate CSV quoting must remain supported (e.g., `"Smith, Jr."`).
- Do **not** strip all quotes on a line. That is too destructive and corrupts legitimate content.
- Instead, remove or neutralize only bare quotes (quotes encountered while inside an unquoted field). This prevents runaway “quoted-field mode” while preserving legitimate quoted fields.

### Invariants

After repair:

- Papa Parse must not swallow subsequent rows due to bare quotes.
- Legitimate quoted fields remain valid (commas inside quotes, escaped quotes `""`, empty quoted fields).
- Repairs are recorded in a structured report for UI visibility and debugging.

### Known Limitation (Explicit Policy)

This repair operates line-by-line and does **not** support multiline quoted fields (fields containing embedded `\n` inside quotes). This is acceptable for player import (email, phone, name, DOB, external_id, notes — vendor exports should not contain embedded newlines).

**Enforcement:** If the file appears to contain multiline quoted fields, reject import with a clear error message rather than corrupting data.

## Files to Change

### 1. CREATE `lib/csv/csv-structural-repair.ts`

Define types:

```ts
export type CsvDialect = {
  delimiter: string;      // default ','
  quoteChar: string;      // default '"'
  allowPostQuoteWhitespace: boolean; // default true
};

export type RepairedLine = {
  lineIndex0: number;     // 0-based index in the split lines array
  lineNumber1: number;    // 1-based line number for human display
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
  text: string;           // repaired CSV text (same newline style as input)
  report: RepairReport;
};
```

#### `hasValidCsvQuoting(line: string, dialect?: Partial<CsvDialect>): boolean`

State machine to validate a single line according to the dialect.

States: `StartOfField`, `InUnquoted`, `InQuoted`, `MaybeEndQuoted`.

Transitions (delimiter assumed `,` unless overridden):

- **StartOfField:**
  - `quoteChar` → `InQuoted`
  - `delimiter` → `StartOfField` (empty field)
  - else → `InUnquoted`
- **InUnquoted:**
  - `quoteChar` → INVALID (bare-quote trigger)
  - `delimiter` → `StartOfField`
  - else → stay
- **InQuoted:**
  - `quoteChar` → `MaybeEndQuoted`
  - else → stay
- **MaybeEndQuoted:**
  - `quoteChar` → escaped quote (`InQuoted`)
  - `delimiter` → field closed (`StartOfField`)
  - whitespace (if `allowPostQuoteWhitespace`) → stay in `MaybeEndQuoted`
  - end-of-line → VALID
  - else → INVALID
- **End-of-line:**
  - In `InQuoted` → INVALID (unclosed quote)
  - In `MaybeEndQuoted`, `InUnquoted`, `StartOfField` → VALID

> NOTE: Validation only. The repair function below performs targeted neutralization.

#### `repairCsvStructure(rawText: string, dialect?: Partial<CsvDialect>): RepairResult`

Algorithm outline:

1. **Detect newline style:** if `rawText` contains `\r\n`, treat input as CRLF; otherwise LF.
2. **Normalize:** convert `\r\n → \n` internally and split by `\n`.
3. **Skip header:** do not attempt repairs on `lineIndex0 === 0`.
4. For each non-header line:
   - If it does not contain `quoteChar`, skip.
   - If `hasValidCsvQuoting(line)` is `true`, keep as-is.
   - Else repair by neutralizing bare quotes only:
     - Scan characters with the same state machine.
     - When in `InUnquoted` and encountering `quoteChar`, drop it (or replace with innocuous literal; default: drop).
     - Do **not** modify quotes inside `InQuoted` / `MaybeEndQuoted`.
     - Record a `RepairedLine` entry if changes occurred.
5. **Multiline quoted field detection:**
   - If any line ends in `InQuoted` during validation (unclosed quote), do not attempt repair. Return result indicating failure and surface error “CSV contains multiline quoted fields; not supported by importer.”
6. **Rejoin** lines using original newline style and return `{ text, report }`.

Repair semantics: prevents row swallowing by ensuring an unquoted field cannot “open” a quoted field mid-line. Repaired lines may still fail downstream validation (e.g., column count mismatch); importer should reject those rows explicitly.

### 2. MODIFY `hooks/player-import/use-papa-parse.ts`

- Add `repairReport: RepairReport | null` to `ParseResult` interface and `INITIAL_RESULT`.
- Import `repairCsvStructure` from `@/lib/csv/csv-structural-repair`.
- Make `parseFile` async and read via `await file.text()`.
- Run repair: `const { text: repairedText, report } = repairCsvStructure(rawText);`
- Parse the repaired string with Papa Parse.

**Worker note:** do not assume `worker: true` works for string parsing in all environments. For string input set `worker: false` (or omit). Files are small; performance is acceptable and predictable.

#### Async race safety (required)

Because `parseFile` is async, prevent stale results overwriting newer parses:

- Maintain a `parseToken`/nonce in hook state.
- Increment token on each `parseFile` call.
- In `complete`/`error` callbacks, only call `setState` if token matches the latest.
- This avoids “user selected another file while first parse was still running”.

#### Include `repairReport`

Attach `repairReport` to results in both success and error paths:

- If repair succeeded: `repairReport = report`.
- If repair fails due to multiline quoting: `repairReport = null` and surface a hard error message.

### 3. MODIFY `components/player-import/step-file-selection.tsx`

- Add prop: `linesRepaired: number`.
- After the “rows detected” message, conditionally display `N line(s) had invalid quoting and were automatically repaired.`
- Style message with `text-amber-600`.
- Render only when `linesRepaired > 0`.

_Clarification:_ “Repaired” means bare quotes in unquoted fields were neutralized to prevent row swallowing. It does **not** guarantee the repaired row is valid for import; row-level validation still applies.

### 4. MODIFY `components/player-import/import-wizard.tsx`

Wire the new prop: `linesRepaired={parser.result.repairReport?.linesRepaired ?? 0}`.

### 5. CREATE `lib/csv/__tests__/csv-structural-repair.test.ts`

Unit tests must cover:

- **`hasValidCsvQuoting`**
  - Valid cases: no quotes, proper quoting (`"Smith, Jr."`), escaped quotes (`"He said ""hi"""`), empty quoted field (`""`), multiple quoted fields, `"foo" ,bar` (with `allowPostQuoteWhitespace: true`).
  - Invalid cases: bare mid-field quote (`+HYPERLINK("http://evil.com"),555-...`), `IMPORTXML` (`=IMPORTXML("http://evil.com","//secret"),...`), unclosed quote (`"foo,bar`), quote-then-nondelimiter (`"foo"x,bar`), end-of-line in `InQuoted` state.
- **`repairCsvStructure`**
  - Clean file unchanged; report shows 0 repairs.
  - Header never repaired (`lineIndex0 === 0`).
  - Bare-quote rows: only bare quotes removed; quotes that begin a proper quoted field remain.
  - Valid quoted rows preserved.
  - Newline handling: LF input returns LF output; CRLF preserves CRLF.
  - Report accuracy: `lineIndex0`, `lineNumber1`, `original`, `repaired`, `linesInspected`, `linesRepaired`.

#### Integration Test (most important)

- Add end-to-end regression reproducing failure:
  - Parse raw fixture with Papa Parse → demonstrates row swallowing (e.g., 71 rows).
  - Repair + parse → ensures row swallowing is eliminated (returns expected row count minus explicitly rejected bad rows).
- Confirms fix addresses ISSUE-14957158, not just quote validation in isolation.

### 6. CREATE `e2e/fixtures/sample-csvs/bare-quotes.csv`

Fixture requirements:

- Six rows total.
- One header row.
- Four clean rows.
- Two rows with formula-injection bare quotes (`HYPERLINK` and `IMPORTXML`).
- Include both LF and CRLF variants if practical (or generate CRLF in test).

## Importer Behavior for “Still Invalid” Rows

Structural repair prevents unrelated rows from being swallowed. However, a repaired line may still be invalid (e.g., wrong field count).

**Requirements:**

- Track row-level validation failures.
- Reject invalid rows with clear reasons.
- Report summary counts in the UI (parsed rows, valid rows, rejected rows).

This turns “silent row loss” into “explicit row rejection” where appropriate.

## Out of Scope

- Stage B formula injection neutralization on import (export-side already handled by `csv-sanitize.ts`).
- Adding repair report into a `StepReport` component beyond file selection UI.
- Supporting multiline quoted fields (explicitly rejected per policy).

## Acceptance Criteria

- Given a vendor CSV with bare mid-field quotes, parsing after repair does not swallow subsequent rows.
- Legitimate quoted CSV (e.g., `"Smith, Jr."`) remains parseable and unchanged.
- Repair report accurately reflects:
  - number of lines inspected
  - number repaired
  - line references (0-based + 1-based)
- Async parsing does not race; latest file selection always wins.
- Files with multiline quoted fields are rejected with a clear message (no silent corruption).
