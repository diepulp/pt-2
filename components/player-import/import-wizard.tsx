/**
 * Import Wizard
 *
 * 7-step state machine for CSV player import (server-authoritative flow):
 * File Selection -> Column Mapping -> Preview -> File Upload -> Worker Processing -> Execute -> Report
 *
 * INV-UI-1: Server wizard MUST pass initial_status: 'created' to createBatch().
 *
 * @see PRD-037 CSV Player Import
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

'use client';

import { useMutation } from '@tanstack/react-query';
import { useTransition } from 'react';

import { useBatchPolling } from '@/hooks/player-import/use-batch-polling';
import { useColumnMapping } from '@/hooks/player-import/use-column-mapping';
import { useFileUpload } from '@/hooks/player-import/use-file-upload';
import {
  useImportWizard,
  type WizardStep,
} from '@/hooks/player-import/use-import-wizard';
import { usePapaParse } from '@/hooks/player-import/use-papa-parse';
import { createBatch } from '@/services/player-import/http';

import { StepColumnMapping } from './step-column-mapping';
import { StepExecute } from './step-execute';
import { StepFileSelection } from './step-file-selection';
import { StepFileUpload } from './step-file-upload';
import { StepPreview } from './step-preview';
import { StepReport } from './step-report';
import { StepWorkerProcessing } from './step-worker-processing';

export function ImportWizard() {
  const wizard = useImportWizard();
  const parser = usePapaParse();
  const columnMapping = useColumnMapping();
  const fileUpload = useFileUpload();
  const [, startTransition] = useTransition();

  // Poll batch status while on worker-processing step
  const polling = useBatchPolling(
    wizard.batchId,
    wizard.step === 'worker-processing',
  );

  const createBatchMutation = useMutation({
    mutationFn: (params: {
      idempotencyKey: string;
      fileName: string;
      vendorLabel?: string;
      columnMapping: Record<string, string>;
    }) =>
      createBatch(
        {
          idempotency_key: params.idempotencyKey,
          file_name: params.fileName,
          vendor_label: params.vendorLabel,
          column_mapping: params.columnMapping,
          // INV-UI-1: Server wizard MUST always pass 'created' as initial_status.
          // Omitting this causes the P0-1 failure mode (batch defaults to 'staging',
          // upload endpoint rejects with 409 on every request).
          initial_status: 'created',
        },
        params.idempotencyKey,
      ),
  });

  // --- Step transition handlers ---

  function handleFileAccepted(file: File) {
    wizard.setFile(file);
    parser.parseFile(file);
  }

  function handleFileStepNext() {
    if (!parser.result.isComplete || parser.result.totalRows === 0) return;

    // Auto-detect column mappings
    columnMapping.detectFromHeaders(parser.result.headers);
    wizard.setParseResult(parser.result);
    wizard.goToStep('column-mapping');
  }

  function handleColumnMappingNext() {
    wizard.setColumnMappings(columnMapping.mappings);
    wizard.goToStep('preview');
  }

  function handlePreviewNext() {
    // Create batch with initial_status: 'created' (INV-UI-1) and go to file upload
    startTransition(async () => {
      const idempotencyKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const batch = await createBatchMutation.mutateAsync({
        idempotencyKey,
        fileName: wizard.fileName,
        vendorLabel: wizard.vendorLabel || undefined,
        columnMapping: columnMapping.mappings,
      });

      wizard.setBatchId(batch.id);
      wizard.goToStep('file-upload');
    });
  }

  function handleFileUpload() {
    if (!wizard.batchId || !wizard.file) return;
    fileUpload.upload(wizard.batchId, wizard.file);
  }

  function handleStartNew() {
    wizard.resetWizard();
    parser.reset();
    columnMapping.resetMappings();
    fileUpload.reset();
  }

  // --- Step indicator ---

  const currentStepIndex = wizard.stepIndex;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step indicator */}
      <nav aria-label="Import progress" className="flex items-center gap-1">
        {wizard.steps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isCompleted = idx < currentStepIndex;

          return (
            <div key={step} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isCompleted
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? '\u2713' : idx + 1}
                </div>
                <span
                  className={`text-xs ${
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {wizard.stepLabels[step]}
                </span>
              </div>
              {idx < wizard.steps.length - 1 && (
                <div
                  className={`h-px flex-1 mx-1 mt-[-18px] ${
                    isCompleted ? 'bg-primary/40' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Step content */}
      {renderStep(wizard.step)}
    </div>
  );

  function renderStep(step: WizardStep) {
    switch (step) {
      case 'file-selection':
        return (
          <StepFileSelection
            onFileAccepted={handleFileAccepted}
            onNext={handleFileStepNext}
            vendorLabel={wizard.vendorLabel}
            onVendorLabelChange={wizard.setVendorLabel}
            parsedRowCount={
              parser.result.isComplete ? parser.result.totalRows : null
            }
            isParsing={parser.isParsing}
            linesRepaired={parser.result.repairReport?.linesRepaired ?? 0}
          />
        );

      case 'column-mapping':
        return (
          <StepColumnMapping
            headers={parser.result.headers}
            mappings={columnMapping.mappings}
            autoDetectedCount={columnMapping.autoDetectedCount}
            isValid={columnMapping.isValid}
            onSetMapping={columnMapping.setMapping}
            onNext={handleColumnMappingNext}
            onBack={() => wizard.goToStep('file-selection')}
          />
        );

      case 'preview':
        return (
          <StepPreview
            rows={parser.result.rows}
            headers={parser.result.headers}
            mappings={columnMapping.mappings}
            totalRows={parser.result.totalRows}
            fileName={wizard.fileName}
            onNext={handlePreviewNext}
            onBack={() => wizard.goToStep('column-mapping')}
          />
        );

      case 'file-upload':
        return (
          <StepFileUpload
            fileName={wizard.fileName}
            uploadState={fileUpload}
            isPending={fileUpload.isPending}
            onUpload={handleFileUpload}
            onNext={() => wizard.goToStep('worker-processing')}
            onBack={() => wizard.goToStep('preview')}
          />
        );

      case 'worker-processing':
        return (
          <StepWorkerProcessing
            batch={polling.batch}
            isProcessing={polling.isProcessing}
            isComplete={polling.isComplete}
            isFailed={polling.isFailed}
            onNext={() => wizard.goToStep('execute')}
            onStartNew={handleStartNew}
          />
        );

      case 'execute':
        return wizard.batchId ? (
          <StepExecute
            batchId={wizard.batchId}
            totalRows={polling.batch?.total_rows ?? parser.result.totalRows}
            fileName={wizard.fileName}
            onComplete={() => wizard.goToStep('report')}
            onBack={() => wizard.goToStep('worker-processing')}
          />
        ) : null;

      case 'report':
        return wizard.batchId ? (
          <StepReport batchId={wizard.batchId} onStartNew={handleStartNew} />
        ) : null;
    }
  }
}
