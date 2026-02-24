/**
 * Rundown Report CRUD Operations (PRD-038)
 *
 * Service functions for rundown report persistence, finalization, and queries.
 * All mutations call SECURITY DEFINER RPCs via supabase.rpc().
 *
 * Error mapping contract (EXEC-SPEC):
 * - SQL error codes are the entire error.message string
 * - Service layer matches error.message exactly against the mapping table
 * - Unrecognized codes fall through to INTERNAL_ERROR
 *
 * @see EXEC-038 WS2 Service Layer
 * @see ADR-024 (RLS context injection)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  TableRundownReportDTO,
  TableRundownReportSummaryDTO,
} from './dtos';
import {
  toRundownReportDTO,
  toRundownReportDTOFromFinalizeRpc,
  toRundownReportDTOFromPersistRpc,
  toRundownReportSummaryDTOList,
} from './mappers';

// === Error Mapping (SQL -> TypeScript) ===

/**
 * Maps Supabase RPC error to DomainError per EXEC-SPEC error contract.
 * The error code IS the entire error.message string from the SQL RAISE EXCEPTION.
 */
function mapRundownRpcError(error: {
  code?: string;
  message: string;
}): DomainError {
  switch (error.message) {
    case 'TBLRUN_ALREADY_FINALIZED':
      return new DomainError('TABLE_RUNDOWN_ALREADY_FINALIZED', undefined, {
        httpStatus: 409,
      });
    case 'TBLRUN_NOT_FOUND':
      return new DomainError('TABLE_RUNDOWN_NOT_FOUND');
    case 'TBLRUN_SESSION_NOT_CLOSED':
      return new DomainError('TABLE_RUNDOWN_SESSION_NOT_CLOSED', undefined, {
        httpStatus: 400,
      });
    case 'FORBIDDEN':
      return new DomainError('FORBIDDEN');
    default:
      // Check for Postgres NO_DATA_FOUND (session lookup)
      if (error.code === 'P0002') {
        return new DomainError('TABLE_RUNDOWN_SESSION_NOT_FOUND');
      }
      // Check for TOO_MANY_ROWS (unique active session index violated)
      if (error.code === 'P0003') {
        return new DomainError('TABLE_SESSION_INVARIANT_VIOLATION', undefined, {
          httpStatus: 500,
        });
      }
      return new DomainError('INTERNAL_ERROR', error.message);
  }
}

// === Mutation Operations ===

/**
 * Persist a table rundown report via UPSERT RPC.
 * Creates or updates the report for the given session.
 * Rejects if the report is already finalized (409).
 *
 * @param supabase - Supabase client with staff context
 * @param sessionId - Table session UUID
 * @returns Persisted TableRundownReportDTO
 * @throws DomainError on RPC failure
 */
export async function persistRundown(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<TableRundownReportDTO> {
  const { data, error } = await supabase
    .rpc('rpc_persist_table_rundown', { p_table_session_id: sessionId })
    .single();

  if (error) throw mapRundownRpcError(error);
  if (!data)
    throw new DomainError(
      'INTERNAL_ERROR',
      'No data returned from persist RPC',
    );

  return toRundownReportDTOFromPersistRpc(data);
}

/**
 * Finalize a rundown report (stamp finalized_at/finalized_by).
 * Requires session to be CLOSED.
 * Immutability guard: rejects if already finalized.
 *
 * @param supabase - Supabase client with staff context
 * @param reportId - Report UUID
 * @returns Finalized TableRundownReportDTO
 * @throws DomainError on RPC failure
 */
export async function finalizeRundown(
  supabase: SupabaseClient<Database>,
  reportId: string,
): Promise<TableRundownReportDTO> {
  const { data, error } = await supabase
    .rpc('rpc_finalize_rundown', { p_report_id: reportId })
    .single();

  if (error) throw mapRundownRpcError(error);
  if (!data) throw new DomainError('TABLE_RUNDOWN_NOT_FOUND');

  return toRundownReportDTOFromFinalizeRpc(data);
}

// === Query Operations ===

/**
 * Get rundown report by session ID.
 * Returns null if no report exists for the session.
 */
export async function getRundownBySession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<TableRundownReportDTO | null> {
  const { data, error } = await supabase
    .from('table_rundown_report')
    .select('*')
    .eq('table_session_id', sessionId)
    .maybeSingle();

  if (error) throw new DomainError('INTERNAL_ERROR', error.message);
  if (!data) return null;

  return toRundownReportDTO(data);
}

/**
 * Get rundown report by ID.
 */
export async function getRundownById(
  supabase: SupabaseClient<Database>,
  reportId: string,
): Promise<TableRundownReportDTO> {
  const { data, error } = await supabase
    .from('table_rundown_report')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('TABLE_RUNDOWN_NOT_FOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message);
  }

  return toRundownReportDTO(data);
}

/**
 * List rundown reports by gaming day.
 * Returns summary DTOs for dashboard list views.
 */
export async function listRundownsByDay(
  supabase: SupabaseClient<Database>,
  gamingDay: string,
): Promise<TableRundownReportSummaryDTO[]> {
  const { data, error } = await supabase
    .from('table_rundown_report')
    .select('*')
    .eq('gaming_day', gamingDay)
    .order('created_at', { ascending: false });

  if (error) throw new DomainError('INTERNAL_ERROR', error.message);

  return toRundownReportSummaryDTOList(data ?? []);
}
