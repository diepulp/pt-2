/**
 * Column Auto-Detection Tests
 *
 * Tests the auto-detect heuristics for mapping vendor CSV headers
 * to canonical PT-2 player fields.
 *
 * @see lib/csv/column-auto-detect.ts
 * @see PRD-037 CSV Player Import — ADR-036 D2
 */

import { autoDetectMappings } from '@/lib/csv/column-auto-detect';

describe('autoDetectMappings', () => {
  describe('email aliases', () => {
    it.each([
      ['email', 'email'],
      ['e-mail', 'e-mail'],
      ['email_address', 'email_address'],
      ['player_email', 'player_email'],
      ['Email Address', 'Email Address'],
    ])('maps "%s" to email', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.email).toBe(header);
    });
  });

  describe('phone aliases', () => {
    it.each([
      ['phone', 'phone'],
      ['phone_number', 'phone_number'],
      ['mobile', 'mobile'],
      ['cell', 'cell'],
      ['telephone', 'telephone'],
      ['Phone Number', 'Phone Number'],
    ])('maps "%s" to phone', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.phone).toBe(header);
    });
  });

  describe('first_name aliases', () => {
    it.each([
      ['first_name', 'first_name'],
      ['first', 'first'],
      ['fname', 'fname'],
      ['given_name', 'given_name'],
      ['First Name', 'First Name'],
    ])('maps "%s" to first_name', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.first_name).toBe(header);
    });
  });

  describe('last_name aliases', () => {
    it.each([
      ['last_name', 'last_name'],
      ['last', 'last'],
      ['lname', 'lname'],
      ['surname', 'surname'],
      ['family_name', 'family_name'],
      ['Last Name', 'Last Name'],
    ])('maps "%s" to last_name', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.last_name).toBe(header);
    });
  });

  describe('dob aliases', () => {
    it.each([
      ['dob', 'dob'],
      ['date_of_birth', 'date_of_birth'],
      ['birthday', 'birthday'],
      ['birth_date', 'birth_date'],
      ['DOB', 'DOB'],
      ['Date of Birth', 'Date of Birth'],
    ])('maps "%s" to dob', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.dob).toBe(header);
    });
  });

  describe('external_id aliases', () => {
    it.each([
      ['external_id', 'external_id'],
      ['player_id', 'player_id'],
      ['member_id', 'member_id'],
      ['patron_id', 'patron_id'],
      ['Player ID', 'Player ID'],
    ])('maps "%s" to external_id', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.external_id).toBe(header);
    });
  });

  describe('notes aliases', () => {
    it.each([
      ['notes', 'notes'],
      ['comment', 'comment'],
      ['comments', 'comments'],
      ['note', 'note'],
      ['remarks', 'remarks'],
    ])('maps "%s" to notes', (_alias, header) => {
      const result = autoDetectMappings([header]);
      expect(result.notes).toBe(header);
    });
  });

  describe('case insensitivity', () => {
    it('maps "EMAIL" to email', () => {
      const result = autoDetectMappings(['EMAIL']);
      expect(result.email).toBe('EMAIL');
    });

    it('maps "Email" to email', () => {
      const result = autoDetectMappings(['Email']);
      expect(result.email).toBe('Email');
    });

    it('maps "email" to email', () => {
      const result = autoDetectMappings(['email']);
      expect(result.email).toBe('email');
    });

    it('maps "PHONE_NUMBER" to phone', () => {
      const result = autoDetectMappings(['PHONE_NUMBER']);
      expect(result.phone).toBe('PHONE_NUMBER');
    });
  });

  describe('unknown headers', () => {
    it('does not map unknown headers', () => {
      const result = autoDetectMappings(['foobar', 'xyz_column', '123']);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('mixed headers', () => {
    it('maps multiple known headers simultaneously', () => {
      const result = autoDetectMappings([
        'Email Address',
        'Phone Number',
        'First Name',
        'Last Name',
        'DOB',
        'unknown_col',
      ]);

      expect(result.email).toBe('Email Address');
      expect(result.phone).toBe('Phone Number');
      expect(result.first_name).toBe('First Name');
      expect(result.last_name).toBe('Last Name');
      expect(result.dob).toBe('DOB');
      expect(result.unknown_col).toBeUndefined();
    });

    it('uses first matching header when duplicates exist', () => {
      // If two headers both map to email, only the first should be used
      const result = autoDetectMappings(['email', 'e-mail', 'phone']);
      expect(result.email).toBe('email');
      expect(result.phone).toBe('phone');
    });
  });

  describe('edge cases', () => {
    it('handles empty headers array', () => {
      const result = autoDetectMappings([]);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('trims whitespace from headers', () => {
      const result = autoDetectMappings(['  email  ']);
      expect(result.email).toBe('  email  ');
    });
  });
});
