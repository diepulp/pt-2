'use client';

/**
 * Finalize Rundown Button (PRD-038)
 *
 * Button to finalize a rundown report.
 * Visible when session is CLOSED and report is not yet finalized.
 *
 * @see hooks/table-context/use-finalize-rundown.ts
 * @see EXEC-038 WS5
 */

import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFinalizeRundown } from '@/hooks/table-context/use-finalize-rundown';

interface FinalizeRundownButtonProps {
  reportId: string;
  disabled?: boolean;
  className?: string;
}

export function FinalizeRundownButton({
  reportId,
  disabled,
  className,
}: FinalizeRundownButtonProps) {
  const { mutate, isPending } = useFinalizeRundown(reportId);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutate()}
      disabled={disabled || isPending}
      className={className}
    >
      {isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
      )}
      Finalize
    </Button>
  );
}
