/**
 * Column Auto-Detection for CSV Import
 *
 * Maps vendor CSV headers to canonical PT-2 player fields using
 * a case-insensitive alias dictionary.
 *
 * @see PRD-037 CSV Player Import — ADR-036 D2
 * @see EXEC-037 Appendix: Column Mapping Alias Dictionary
 */

/** Canonical field names that map to ImportPlayerV1 contract fields */
export type CanonicalField =
  | 'email'
  | 'phone'
  | 'first_name'
  | 'last_name'
  | 'dob'
  | 'external_id'
  | 'notes';

/**
 * Alias dictionary: maps lowercase alias → canonical field.
 * All lookups are performed case-insensitively.
 */
const ALIAS_MAP: ReadonlyMap<string, CanonicalField> = new Map([
  // email
  ['email', 'email'],
  ['e-mail', 'email'],
  ['email_address', 'email'],
  ['player_email', 'email'],
  ['email address', 'email'],

  // phone
  ['phone', 'phone'],
  ['phone_number', 'phone'],
  ['mobile', 'phone'],
  ['cell', 'phone'],
  ['telephone', 'phone'],
  ['phone number', 'phone'],

  // first_name
  ['first_name', 'first_name'],
  ['first', 'first_name'],
  ['fname', 'first_name'],
  ['given_name', 'first_name'],
  ['first name', 'first_name'],
  ['firstname', 'first_name'],

  // last_name
  ['last_name', 'last_name'],
  ['last', 'last_name'],
  ['lname', 'last_name'],
  ['surname', 'last_name'],
  ['family_name', 'last_name'],
  ['last name', 'last_name'],
  ['lastname', 'last_name'],

  // dob
  ['dob', 'dob'],
  ['date_of_birth', 'dob'],
  ['birthday', 'dob'],
  ['birth_date', 'dob'],
  ['date of birth', 'dob'],
  ['birthdate', 'dob'],

  // external_id
  ['external_id', 'external_id'],
  ['player_id', 'external_id'],
  ['member_id', 'external_id'],
  ['patron_id', 'external_id'],
  ['player id', 'external_id'],

  // notes
  ['notes', 'notes'],
  ['comment', 'notes'],
  ['comments', 'notes'],
  ['note', 'notes'],
  ['remarks', 'notes'],
]);

/**
 * Auto-detect column mappings from CSV headers.
 *
 * Returns a record mapping canonical field names to the original CSV header
 * that matched. Only includes fields that were successfully matched.
 *
 * @param headers - Array of CSV column headers from the vendor file
 * @returns Record<CanonicalField, originalHeader> for matched fields
 */
export function autoDetectMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const usedCanonicals = new Set<string>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    const canonical = ALIAS_MAP.get(normalized);

    if (canonical && !usedCanonicals.has(canonical)) {
      mappings[canonical] = header;
      usedCanonicals.add(canonical);
    }
  }

  return mappings;
}

/** All supported canonical fields for the column mapping UI */
export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  'email',
  'phone',
  'first_name',
  'last_name',
  'dob',
  'external_id',
  'notes',
] as const;

/** Human-readable labels for canonical fields */
export const CANONICAL_FIELD_LABELS: Record<CanonicalField, string> = {
  email: 'Email',
  phone: 'Phone',
  first_name: 'First Name',
  last_name: 'Last Name',
  dob: 'Date of Birth',
  external_id: 'External ID',
  notes: 'Notes',
};
