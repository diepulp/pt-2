/**
 * Papa Parse Hook with Structural Repair
 *
 * Wraps Papa Parse for browser-side CSV parsing. Runs a pre-parse structural
 * repair step to neutralize bare quotes that cause row swallowing.
 *
 * @see PRD-037 CSV Player Import — ADR-036 D1
 * @see docs/issues/gaps/csv-import/csv_row_loss_fix.md
 */

'use client';

import Papa from 'papaparse';
import { useRef, useState } from 'react';

import type { RepairReport } from '@/lib/csv/csv-structural-repair';
import {
  CsvMultilineQuotedFieldError,
  repairCsvStructure,
} from '@/lib/csv/csv-structural-repair';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  isComplete: boolean;
  errors: Papa.ParseError[];
  repairReport: RepairReport | null;
}

const INITIAL_RESULT: ParseResult = {
  headers: [],
  rows: [],
  totalRows: 0,
  isComplete: false,
  errors: [],
  repairReport: null,
};

/**
 * Hook for parsing CSV files using Papa Parse with structural repair.
 *
 * Reads the file as text, repairs bare-quote structural issues, then parses
 * the repaired string. Includes async race safety — rapid file switches
 * discard stale results.
 */
export function usePapaParse() {
  const [result, setResult] = useState<ParseResult>(INITIAL_RESULT);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(false);
  const parseTokenRef = useRef(0);

  async function parseFile(file: File) {
    const token = ++parseTokenRef.current;
    abortRef.current = false;
    setIsParsing(true);
    setResult(INITIAL_RESULT);

    let repairReport: RepairReport | null = null;

    try {
      const rawText = await file.text();

      if (token !== parseTokenRef.current) return;

      const { text: repairedText, report } = repairCsvStructure(rawText);
      repairReport = report;

      if (token !== parseTokenRef.current) return;

      const collectedRows: Record<string, string>[] = [];
      let headers: string[] = [];

      Papa.parse<Record<string, string>>(repairedText, {
        header: true,
        skipEmptyLines: true,
        worker: false,
        dynamicTyping: false,
        step(stepResult) {
          if (abortRef.current) return;

          if (headers.length === 0 && stepResult.meta.fields) {
            headers = stepResult.meta.fields;
          }

          collectedRows.push(stepResult.data);
        },
        complete(completeResult) {
          if (token !== parseTokenRef.current) return;
          setResult({
            headers,
            rows: collectedRows,
            totalRows: collectedRows.length,
            isComplete: true,
            errors: completeResult?.errors ?? [],
            repairReport,
          });
          setIsParsing(false);
        },
        error(error: Error) {
          if (token !== parseTokenRef.current) return;
          setResult((prev) => ({
            ...prev,
            isComplete: true,
            errors: [
              ...prev.errors,
              {
                type: 'FieldMismatch',
                code: 'TooFewFields',
                message: error.message,
                row: 0,
              },
            ],
            repairReport,
          }));
          setIsParsing(false);
        },
      });
    } catch (err) {
      if (token !== parseTokenRef.current) return;

      const message =
        err instanceof CsvMultilineQuotedFieldError
          ? err.message
          : 'Failed to read or repair CSV file.';

      setResult((prev) => ({
        ...prev,
        isComplete: true,
        errors: [
          ...prev.errors,
          {
            type: 'FieldMismatch',
            code: 'TooFewFields',
            message,
            row: 0,
          },
        ],
        repairReport: null,
      }));
      setIsParsing(false);
    }
  }

  function abort() {
    abortRef.current = true;
    setIsParsing(false);
    setResult((prev) => ({ ...prev, isComplete: true }));
  }

  function reset() {
    abortRef.current = false;
    setIsParsing(false);
    setResult(INITIAL_RESULT);
  }

  return {
    result,
    isParsing,
    parseFile,
    abort,
    reset,
  };
}
