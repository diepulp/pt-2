/**
 * MTL Audit Note Form Component
 *
 * Form for adding audit notes to MTL entries.
 * Notes are append-only and cannot be modified after creation.
 * Requires pit_boss or admin role per ADR-025.
 *
 * Features:
 * - Textarea for note content
 * - Staff attribution (automatic)
 * - Loading state with useTransition
 * - Error handling
 *
 * @see hooks/mtl/use-mtl-mutations.ts - Mutation hook
 * @see services/mtl/dtos.ts - DTOs
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

"use client";

import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useCreateMtlAuditNote } from "@/hooks/mtl/use-mtl-mutations";
import { cn } from "@/lib/utils";

export interface AuditNoteFormProps {
  /** Entry ID to attach note to */
  entryId: string;
  /** Staff ID for note attribution */
  staffId: string;
  /** Callback after successful note creation */
  onSuccess?: () => void;
  className?: string;
}

/**
 * Audit Note Form
 *
 * @example
 * <AuditNoteForm
 *   entryId={entry.id}
 *   staffId={currentStaffId}
 *   onSuccess={() => console.log('Note added')}
 * />
 */
export function AuditNoteForm({
  entryId,
  staffId,
  onSuccess,
  className,
}: AuditNoteFormProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const createNote = useCreateMtlAuditNote();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Note content is required");
      return;
    }

    startTransition(async () => {
      try {
        await createNote.mutateAsync({
          entryId,
          input: {
            staff_id: staffId,
            note: trimmedNote,
          },
        });
        setNote("");
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add note");
      }
    });
  };

  const isDisabled = isPending || !note.trim();

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageSquarePlus className="h-4 w-4" />
        <span>Add Audit Note</span>
      </div>

      <div className="space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter audit note..."
          disabled={isPending}
          rows={3}
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            error && "border-destructive focus:ring-destructive",
          )}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isDisabled} className="gap-2">
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Add Note
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Notes are append-only and cannot be edited after submission.
      </p>
    </form>
  );
}

/**
 * Compact inline version for tight spaces
 */
export function AuditNoteFormInline({
  entryId,
  staffId,
  onSuccess,
  className,
}: AuditNoteFormProps) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const createNote = useCreateMtlAuditNote();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote) return;

    startTransition(async () => {
      try {
        await createNote.mutateAsync({
          entryId,
          input: {
            staff_id: staffId,
            note: trimmedNote,
          },
        });
        setNote("");
        onSuccess?.();
      } catch {
        // Error handled by mutation
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex gap-2 items-end", className)}
    >
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Quick note..."
        disabled={isPending}
        className={cn(
          "flex-1 rounded-md border bg-background px-3 py-1.5 text-sm",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={isPending || !note.trim()}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </form>
  );
}
