/**
 * Import Wizard State Machine Hook
 *
 * Manages the 7-step wizard state: step navigation, file reference,
 * batch ID, parse results, and column mappings.
 *
 * Server-authoritative flow (PRD-039):
 *   file-selection -> column-mapping -> preview -> file-upload -> worker-processing -> execute -> report
 *
 * @see PRD-037 CSV Player Import
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

'use client';

import { useState } from 'react';

import type { ParseResult } from './use-papa-parse';

export type WizardStep =
  | 'file-selection'
  | 'column-mapping'
  | 'preview'
  | 'file-upload'
  | 'worker-processing'
  | 'execute'
  | 'report';

const STEPS: readonly WizardStep[] = [
  'file-selection',
  'column-mapping',
  'preview',
  'file-upload',
  'worker-processing',
  'execute',
  'report',
] as const;

const STEP_LABELS: Record<WizardStep, string> = {
  'file-selection': 'Select File',
  'column-mapping': 'Map Columns',
  preview: 'Preview',
  'file-upload': 'Upload',
  'worker-processing': 'Processing',
  execute: 'Execute',
  report: 'Report',
};

export interface WizardState {
  step: WizardStep;
  stepIndex: number;
  totalSteps: number;
  file: File | null;
  fileName: string;
  vendorLabel: string;
  batchId: string | null;
  parseResult: ParseResult | null;
  columnMappings: Record<string, string>;
}

/**
 * Hook for managing the import wizard state machine.
 *
 * Provides step navigation, state setters for each step's data,
 * and a reset function to start over.
 */
export function useImportWizard() {
  const [step, setStep] = useState<WizardStep>('file-selection');
  const [file, setFile] = useState<File | null>(null);
  const [vendorLabel, setVendorLabel] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>(
    {},
  );

  const stepIndex = STEPS.indexOf(step);

  function goToStep(target: WizardStep) {
    setStep(target);
  }

  function goNext() {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  }

  function goBack() {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  }

  function resetWizard() {
    setStep('file-selection');
    setFile(null);
    setVendorLabel('');
    setBatchId(null);
    setParseResult(null);
    setColumnMappings({});
  }

  const state: WizardState = {
    step,
    stepIndex,
    totalSteps: STEPS.length,
    file,
    fileName: file?.name ?? '',
    vendorLabel,
    batchId,
    parseResult,
    columnMappings,
  };

  return {
    ...state,
    steps: STEPS,
    stepLabels: STEP_LABELS,
    setFile,
    setVendorLabel,
    setBatchId,
    setParseResult,
    setColumnMappings,
    goToStep,
    goNext,
    goBack,
    resetWizard,
  };
}
