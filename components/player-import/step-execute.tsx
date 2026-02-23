/**
 * Step 5: Execute
 *
 * Confirmation dialog with useTransition pending state.
 * Triggers the execute RPC and transitions to report step on completion.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { executeBatch } from '@/services/player-import/http';
import { playerImportKeys } from '@/services/player-import/keys';

interface StepExecuteProps {
  batchId: string;
  totalRows: number;
  fileName: string;
  onComplete: () => void;
  onBack: () => void;
}

export function StepExecute({
  batchId,
  totalRows,
  fileName,
  onComplete,
  onBack,
}: StepExecuteProps) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => executeBatch(batchId, `execute-${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: playerImportKeys.batches.detail(batchId),
      });
    },
  });

  function handleExecute() {
    startTransition(async () => {
      await mutation.mutateAsync();
      onComplete();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execute Import</CardTitle>
        <CardDescription>
          This will merge {totalRows.toLocaleString()} staged rows from{' '}
          <span className="font-medium">{fileName}</span> into the player
          database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/50 p-4 text-sm">
          <p className="font-medium">What happens next:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>
              Rows with a matching email or phone are <strong>linked</strong> to
              existing players
            </li>
            <li>
              Rows with no match will generate <strong>new</strong> player
              records
            </li>
            <li>
              Rows matching multiple players are flagged as{' '}
              <strong>conflicts</strong> (no changes made)
            </li>
            <li>
              This operation is idempotent and will not produce duplicates
            </li>
          </ul>
        </div>

        {mutation.isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Execution failed. Please try again.'}
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            Executing merge... This may take up to 2 minutes.
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack} disabled={isPending}>
          Back
        </Button>
        <Button
          onClick={handleExecute}
          disabled={isPending || mutation.isSuccess}
        >
          {isPending ? 'Executing...' : 'Execute Import'}
        </Button>
      </CardFooter>
    </Card>
  );
}
