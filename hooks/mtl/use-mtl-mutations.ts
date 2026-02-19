/**
 * MTL Entry Mutation Hooks
 *
 * Hooks for creating MTL entries and audit notes.
 * All mutations automatically invalidate relevant queries.
 * Entries and notes are append-only per PRD-005.
 *
 * Bidirectional Bridge: When MTL entries are created with a visit_id,
 * a database trigger creates a corresponding player_financial_transaction.
 * We invalidate financial queries to ensure rating slip totals refresh.
 *
 * @see services/mtl/http.ts - HTTP fetchers
 * @see services/mtl/keys.ts - Query key factory
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { playerFinancialKeys } from '@/hooks/player-financial/keys';
import type {
  CreateMtlEntryInput,
  CreateMtlAuditNoteInput,
  MtlEntryDTO,
  MtlAuditNoteDTO,
  MtlEntryWithNotesDTO,
} from '@/services/mtl/dtos';
import { createMtlEntry, createMtlAuditNote } from '@/services/mtl/http';
import { mtlKeys } from '@/services/mtl/keys';
// GAP-CASHIN-ADJUSTMENT-MTL-SYNC Fix 4: use canonical hooks key factory
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

/**
 * Creates a new MTL entry (buy-in, cash-out, marker, etc.).
 * Entries are append-only and immutable after creation.
 * Idempotent - returns existing entry if idempotency_key matches.
 *
 * Invalidates:
 * - All entry list queries (entries.scope)
 * - Gaming day summary queries (new entry affects aggregates)
 *
 * @example
 * ```tsx
 * const createEntry = useCreateMtlEntry();
 *
 * // Record a buy-in
 * await createEntry.mutateAsync({
 *   casino_id: casinoId,
 *   patron_uuid: playerId,
 *   amount: 5000,
 *   direction: 'in',
 *   txn_type: 'buy_in',
 *   source: 'table',
 *   staff_id: staffId,
 *   idempotency_key: crypto.randomUUID(),
 * });
 * ```
 */
export function useCreateMtlEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMtlEntryInput): Promise<MtlEntryDTO> =>
      createMtlEntry(input),
    onSuccess: (data: MtlEntryDTO, variables: CreateMtlEntryInput) => {
      // Set detail cache for the new entry (without notes initially)
      const entryWithNotes: MtlEntryWithNotesDTO = {
        ...data,
        audit_notes: [],
      };
      queryClient.setQueryData(mtlKeys.detail(data.id), entryWithNotes);

      // Invalidate all entry list queries
      queryClient.invalidateQueries({
        queryKey: mtlKeys.entries.scope,
      });

      // Invalidate gaming day summary (aggregates changed)
      queryClient.invalidateQueries({
        queryKey: mtlKeys.gamingDaySummary.scope,
      });

      // =========================================================================
      // Bidirectional Bridge: MTL -> Financial Transaction
      // A database trigger creates a player_financial_transaction when
      // MTL entries have a visit_id. Invalidate financial queries so
      // rating slip totals (session_total_buy_in) refresh.
      // =========================================================================
      if (variables.visit_id) {
        // Invalidate visit financial summary to refresh total_buy_in
        queryClient.invalidateQueries({
          queryKey: playerFinancialKeys.visitSummary(variables.visit_id),
        });

        // Invalidate all transaction lists (new txn was created by trigger)
        queryClient.invalidateQueries({
          queryKey: playerFinancialKeys.list.scope,
        });
      }

      // Invalidate rating slip modal if we know which slip this affects
      if (variables.rating_slip_id) {
        queryClient.invalidateQueries({
          queryKey: ratingSlipModalKeys.data(variables.rating_slip_id),
        });
      }
    },
  });
}

/**
 * Creates an audit note for an MTL entry.
 * Audit notes are append-only - cannot be modified after creation.
 * Requires pit_boss or admin role per ADR-025.
 *
 * Invalidates:
 * - Entry detail query (audit_notes array changed)
 * - Audit notes query for the entry
 *
 * @example
 * ```tsx
 * const createNote = useCreateMtlAuditNote();
 *
 * // Add an audit note
 * await createNote.mutateAsync({
 *   entryId: entry.id,
 *   input: {
 *     staff_id: staffId,
 *     note: 'Verified patron identity via driver license',
 *   },
 * });
 * ```
 */
export function useCreateMtlAuditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entryId,
      input,
    }: {
      entryId: string;
      input: Omit<CreateMtlAuditNoteInput, 'mtl_entry_id'>;
    }): Promise<MtlAuditNoteDTO> => createMtlAuditNote(entryId, input),
    onSuccess: (data: MtlAuditNoteDTO, variables) => {
      const { entryId } = variables;

      // Optimistically update the entry detail cache with new note
      queryClient.setQueryData<MtlEntryWithNotesDTO | undefined>(
        mtlKeys.detail(entryId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            audit_notes: [...old.audit_notes, data],
          };
        },
      );

      // Invalidate audit notes query
      queryClient.invalidateQueries({
        queryKey: mtlKeys.auditNotes(entryId),
      });
    },
  });
}

// Re-export types for convenience
export type { CreateMtlEntryInput, CreateMtlAuditNoteInput };
