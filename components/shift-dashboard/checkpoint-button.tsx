'use client';

/**
 * Checkpoint Button (PRD-038)
 *
 * Creates a shift checkpoint with metric snapshot.
 * Shows confirmation toast with checkpoint time.
 *
 * @see hooks/table-context/use-create-checkpoint.ts
 * @see EXEC-038 WS5
 */

import { Camera, Loader2 } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useCreateCheckpoint } from '@/hooks/table-context/use-create-checkpoint';

interface CheckpointButtonProps {
  className?: string;
}

export function CheckpointButton({ className }: CheckpointButtonProps) {
  const { mutate, isPending } = useCreateCheckpoint();

  const handleClick = useCallback(() => {
    mutate(
      { checkpointType: 'mid_shift' },
      {
        onSuccess: (checkpoint) => {
          const time = new Date(checkpoint.created_at).toLocaleTimeString(
            'en-US',
            { hour: '2-digit', minute: '2-digit' },
          );
          toast.success(`Checkpoint created — snapshot at ${time}`);
        },
        onError: () => {
          toast.error('Could not create checkpoint. Try again.');
        },
      },
    );
  }, [mutate]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className={className}
    >
      {isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Camera className="mr-1.5 h-3.5 w-3.5" />
      )}
      Checkpoint
    </Button>
  );
}
