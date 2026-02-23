/**
 * Import Wizard
 *
 * 6-step state machine for CSV player import:
 * File Selection → Column Mapping → Preview → Staging Upload → Execute → Report
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { useMutation } from '@tanstack/react-query';
import { useTransition } from 'react';

import { useColumnMapping } from '@/hooks/player-import/use-column-mapping';
import {
  useImportWizard,
  type WizardStep,
} from '@/hooks/player-import/use-import-wizard';
import { usePapaParse } from '@/hooks/player-import/use-papa-parse';
import { useStagingUpload } from '@/hooks/player-import/use-staging-upload';
import { createBatch } from '@/services/player-import/http';

import { StepColumnMapping } from './step-column-mapping';
import { StepExecute } from './step-execute';
import { StepFileSelection } from './step-file-selection';
import { StepPreview } from './step-preview';
import { StepReport } from './step-report';
import { StepStagingUpload } from './step-staging-upload';

export function ImportWizard() {
  const wizard = useImportWizard();
  const parser = usePapaParse();
  const columnMapping = useColumnMapping();
  const staging = useStagingUpload(wizard.batchId);
  const [, startTransition] = useTransition();

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
    // Create batch and start staging upload
    startTransition(async () => {
      const idempotencyKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const batch = await createBatchMutation.mutateAsync({
        idempotencyKey,
        fileName: wizard.fileName,
        vendorLabel: wizard.vendorLabel || undefined,
        columnMapping: columnMapping.mappings,
      });

      wizard.setBatchId(batch.id);

      // Build normalized rows and start upload
      const stageRowInputs = staging.buildStageRows(
        parser.result.rows,
        columnMapping.mappings,
        wizard.fileName,
        wizard.vendorLabel || undefined,
      );

      wizard.goToStep('staging-upload');
      staging.startUpload(batch.id, stageRowInputs);
    });
  }

  function handleStartNew() {
    wizard.resetWizard();
    parser.reset();
    columnMapping.resetMappings();
    staging.reset();
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
                  {isCompleted ? '✓' : idx + 1}
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

      case 'staging-upload':
        return (
          <StepStagingUpload
            progress={staging.progress}
            onAbort={staging.abort}
            onNext={() => wizard.goToStep('execute')}
          />
        );

      case 'execute':
        return wizard.batchId ? (
          <StepExecute
            batchId={wizard.batchId}
            totalRows={parser.result.totalRows}
            fileName={wizard.fileName}
            onComplete={() => wizard.goToStep('report')}
            onBack={() => wizard.goToStep('staging-upload')}
          />
        ) : null;

      case 'report':
        return wizard.batchId ? (
          <StepReport batchId={wizard.batchId} onStartNew={handleStartNew} />
        ) : null;
    }
  }
}
