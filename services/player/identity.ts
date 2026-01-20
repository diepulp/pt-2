/**
 * Player Identity Helper Functions
 *
 * Cryptographic and utility functions for player identity management.
 * These functions handle document hashing, PII masking, and identity operations.
 *
 * @see ADR-022 Player Identity Enrollment
 * @see EXEC-SPEC-022 Section 8 - Service Layer Changes
 */

import { createHash } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { PlayerIdentityDTO, PlayerIdentityInput } from './dtos';

// === Document Hash Computation ===

/**
 * Compute SHA-256 hash of document number for deduplication.
 *
 * Normalizes document number by:
 * - Converting to uppercase
 * - Trimming whitespace
 *
 * Returns lowercase hex digest for database storage.
 *
 * @param documentNumber - Raw document number from ID scan
 * @returns SHA-256 hash (lowercase hex)
 *
 * @example
 * computeDocumentHash('D1234567') // => 'a1b2c3d4...'
 */
export function computeDocumentHash(documentNumber: string): string {
  return createHash('sha256')
    .update(documentNumber.toUpperCase().trim())
    .digest('hex');
}

/**
 * Extract last 4 characters of document number for display.
 *
 * Removes non-alphanumeric characters before extraction.
 * Used for PII-masked display in UI.
 *
 * @param documentNumber - Raw document number
 * @returns Last 4 alphanumeric characters
 *
 * @example
 * extractLast4('D-1234-567') // => '4567'
 */
export function extractLast4(documentNumber: string): string {
  const cleaned = documentNumber.replace(/[^A-Z0-9]/gi, '');
  return cleaned.slice(-4);
}

// === Identity CRUD Operations ===

/**
 * Upsert player identity information.
 *
 * Creates or updates identity record for a player enrollment.
 * Automatically computes document hash and last4 for masking.
 *
 * Uses upsert to handle idempotency - safe to call multiple times.
 * Conflict resolution on (casino_id, player_id) unique constraint.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino identifier
 * @param playerId - Player identifier
 * @param input - Identity information from ID scan
 * @param actorId - Staff member creating/updating identity
 * @returns Created/updated identity DTO
 *
 * @throws {DomainError} IDENTITY_NOT_FOUND - Player not enrolled
 * @throws {DomainError} IDENTITY_DUPLICATE_DOCUMENT - Document already registered
 * @throws {DomainError} INTERNAL_ERROR - Database error
 */
export async function upsertIdentity(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
  input: PlayerIdentityInput,
  actorId: string,
): Promise<PlayerIdentityDTO> {
  // Compute hash and last4 if document number provided
  const documentHash = input.documentNumber
    ? computeDocumentHash(input.documentNumber)
    : null;
  const documentLast4 = input.documentNumber
    ? extractLast4(input.documentNumber)
    : null;

  const { data, error } = await supabase
    .from('player_identity')
    .upsert(
      {
        casino_id: casinoId,
        player_id: playerId,
        birth_date: input.birthDate ?? null,
        gender: input.gender ?? null,
        eye_color: input.eyeColor ?? null,
        height: input.height ?? null,
        weight: input.weight ?? null,
        address: (input.address ??
          null) as unknown as Database['public']['Tables']['player_identity']['Insert']['address'],
        document_number_hash: documentHash,
        document_number_last4: documentLast4,
        issue_date: input.issueDate ?? null,
        expiration_date: input.expirationDate ?? null,
        issuing_state: input.issuingState ?? null,
        document_type: input.documentType ?? null,
        created_by: actorId,
      },
      {
        onConflict: 'casino_id,player_id',
      },
    )
    .select()
    .single();

  if (error) {
    // Map Postgres errors to domain errors
    if (error.code === '23503') {
      throw new DomainError(
        'PLAYER_NOT_FOUND',
        'Player must be enrolled before adding identity',
        { details: error },
      );
    }
    if (
      error.code === '23505' &&
      error.message.includes('ux_player_identity_doc_hash')
    ) {
      throw new DomainError(
        'UNIQUE_VIOLATION',
        'Document number already registered in this casino',
        { details: error },
      );
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toPlayerIdentityDTO(data);
}

/**
 * Get player identity by player ID.
 *
 * Returns null if identity not found or not accessible via RLS.
 * Casino scoping handled by RLS policies.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player identifier
 * @returns Identity DTO or null
 */
export async function getIdentityByPlayerId(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PlayerIdentityDTO | null> {
  const { data, error } = await supabase
    .from('player_identity')
    .select()
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return data ? toPlayerIdentityDTO(data) : null;
}

/**
 * Verify player identity.
 *
 * Marks identity as verified by setting verified_at and verified_by.
 * Only pit_boss and admin can verify (enforced by RLS).
 *
 * @param supabase - Supabase client with RLS context
 * @param identityId - Identity record identifier
 * @param verifiedBy - Staff member verifying identity
 * @returns Updated identity DTO
 *
 * @throws {DomainError} IDENTITY_NOT_FOUND - Identity not found
 * @throws {DomainError} INTERNAL_ERROR - Database error
 */
export async function verifyIdentity(
  supabase: SupabaseClient<Database>,
  identityId: string,
  verifiedBy: string,
): Promise<PlayerIdentityDTO> {
  const { data, error } = await supabase
    .from('player_identity')
    .update({
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
    })
    .eq('id', identityId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('PLAYER_NOT_FOUND');
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toPlayerIdentityDTO(data);
}

// === Type Mappers ===

/**
 * Type for player_identity database row.
 */
type PlayerIdentityRow = Database['public']['Tables']['player_identity']['Row'];

/**
 * Map database row to PlayerIdentityDTO.
 *
 * Transforms JSONB address field and timestamps.
 * Excludes document_number_hash (internal only).
 *
 * @param row - Database row
 * @returns PlayerIdentityDTO
 */
function toPlayerIdentityDTO(row: PlayerIdentityRow): PlayerIdentityDTO {
  return {
    // Snake case fields (from DB)
    id: row.id,
    casino_id: row.casino_id,
    player_id: row.player_id,
    birth_date: row.birth_date,
    gender: row.gender,
    eye_color: row.eye_color,
    height: row.height,
    weight: row.weight,
    document_number_last4: row.document_number_last4,
    issue_date: row.issue_date,
    expiration_date: row.expiration_date,
    issuing_state: row.issuing_state,
    document_type: row.document_type,
    verified_at: row.verified_at,
    verified_by: row.verified_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    // Camel case convenience fields
    casinoId: row.casino_id,
    playerId: row.player_id,
    birthDate: row.birth_date,
    eyeColor: row.eye_color,
    documentNumberLast4: row.document_number_last4,
    issueDate: row.issue_date,
    expirationDate: row.expiration_date,
    issuingState: row.issuing_state,
    documentType: row.document_type as
      | 'drivers_license'
      | 'passport'
      | 'state_id'
      | null,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    address: row.address as PlayerIdentityDTO['address'],
  };
}
