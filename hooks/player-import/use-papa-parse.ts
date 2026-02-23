/**
 * Papa Parse Web Worker Hook
 *
 * Wraps Papa Parse for browser-side CSV parsing with Web Worker support.
 * Decouples parsing from upload — rows are queued locally for independent upload.
 *
 * @see PRD-037 CSV Player Import — ADR-036 D1
 */

'use client';

import Papa from 'papaparse';
import { useRef, useState } from 'react';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  isComplete: boolean;
  errors: Papa.ParseError[];
}

const INITIAL_RESULT: ParseResult = {
  headers: [],
  rows: [],
  totalRows: 0,
  isComplete: false,
  errors: [],
};

/**
 * Hook for parsing CSV files using Papa Parse with Web Worker.
 *
 * Returns parsed headers and rows, completion status, and abort capability.
 * Parsing runs in a Web Worker to prevent UI blocking.
 */
export function usePapaParse() {
  const [result, setResult] = useState<ParseResult>(INITIAL_RESULT);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(false);

  function parseFile(file: File) {
    abortRef.current = false;
    setIsParsing(true);
    setResult(INITIAL_RESULT);

    const collectedRows: Record<string, string>[] = [];
    let headers: string[] = [];

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      dynamicTyping: false,
      step(stepResult) {
        if (abortRef.current) return;

        if (headers.length === 0 && stepResult.meta.fields) {
          headers = stepResult.meta.fields;
        }

        collectedRows.push(stepResult.data);
      },
      complete(completeResult) {
        setResult({
          headers,
          rows: collectedRows,
          totalRows: collectedRows.length,
          isComplete: true,
          errors: completeResult.errors,
        });
        setIsParsing(false);
      },
      error(error: Error) {
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
        }));
        setIsParsing(false);
      },
    });
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
