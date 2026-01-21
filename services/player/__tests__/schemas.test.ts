/**
 * Player Schema Validation Tests
 *
 * Tests Zod schemas for player CRUD operations.
 * Covers updatePlayerSchema with extended fields from PLAYER-PROFILE-EDIT PRD.
 *
 * @see services/player/schemas.ts
 * @see EXECUTION-SPEC-PLAYER-PROFILE-EDIT.md - WS5
 */

import {
  createPlayerSchema,
  playerIdentitySchema,
  updatePlayerSchema,
} from '../schemas';

describe('Player Schemas', () => {
  describe('updatePlayerSchema', () => {
    describe('core fields', () => {
      it('validates first_name when provided', () => {
        const result = updatePlayerSchema.safeParse({
          first_name: 'John',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.first_name).toBe('John');
        }
      });

      it('validates last_name when provided', () => {
        const result = updatePlayerSchema.safeParse({
          last_name: 'Doe',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.last_name).toBe('Doe');
        }
      });

      it('validates birth_date format YYYY-MM-DD', () => {
        const result = updatePlayerSchema.safeParse({
          birth_date: '1990-05-15',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.birth_date).toBe('1990-05-15');
        }
      });

      it('rejects invalid birth_date format', () => {
        const result = updatePlayerSchema.safeParse({
          birth_date: '05/15/1990',
        });

        expect(result.success).toBe(false);
      });

      it('accepts null for birth_date', () => {
        const result = updatePlayerSchema.safeParse({
          birth_date: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.birth_date).toBe(null);
        }
      });

      it('rejects empty first_name', () => {
        const result = updatePlayerSchema.safeParse({
          first_name: '',
        });

        expect(result.success).toBe(false);
      });

      it('rejects first_name exceeding 100 characters', () => {
        const result = updatePlayerSchema.safeParse({
          first_name: 'A'.repeat(101),
        });

        expect(result.success).toBe(false);
      });
    });

    describe('extended fields (PLAYER-PROFILE-EDIT)', () => {
      it('validates middle_name when provided', () => {
        const result = updatePlayerSchema.safeParse({
          middle_name: 'Alexander',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.middle_name).toBe('Alexander');
        }
      });

      it('accepts null for middle_name', () => {
        const result = updatePlayerSchema.safeParse({
          middle_name: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.middle_name).toBe(null);
        }
      });

      it('rejects middle_name exceeding 100 characters', () => {
        const result = updatePlayerSchema.safeParse({
          middle_name: 'M'.repeat(101),
        });

        expect(result.success).toBe(false);
      });

      it('validates email format', () => {
        const result = updatePlayerSchema.safeParse({
          email: 'john.doe@example.com',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe('john.doe@example.com');
        }
      });

      it('rejects invalid email format', () => {
        const result = updatePlayerSchema.safeParse({
          email: 'not-an-email',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe('Invalid email format');
        }
      });

      it('accepts null for email', () => {
        const result = updatePlayerSchema.safeParse({
          email: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe(null);
        }
      });

      it('validates phone_number when provided', () => {
        const result = updatePlayerSchema.safeParse({
          phone_number: '+1-555-123-4567',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.phone_number).toBe('+1-555-123-4567');
        }
      });

      it('accepts null for phone_number', () => {
        const result = updatePlayerSchema.safeParse({
          phone_number: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.phone_number).toBe(null);
        }
      });

      it('rejects phone_number shorter than 7 characters', () => {
        const result = updatePlayerSchema.safeParse({
          phone_number: '123',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Phone number must be at least 7 characters',
          );
        }
      });

      it('rejects phone_number exceeding 20 characters', () => {
        const result = updatePlayerSchema.safeParse({
          phone_number: '1'.repeat(21),
        });

        expect(result.success).toBe(false);
      });
    });

    describe('partial update requirements', () => {
      it('accepts multiple fields at once', () => {
        const result = updatePlayerSchema.safeParse({
          first_name: 'John',
          middle_name: 'Alexander',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          phone_number: '+1-555-123-4567',
          birth_date: '1990-05-15',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            first_name: 'John',
            middle_name: 'Alexander',
            last_name: 'Doe',
            email: 'john.doe@example.com',
            phone_number: '+1-555-123-4567',
            birth_date: '1990-05-15',
          });
        }
      });

      it('rejects empty object (at least one field required)', () => {
        const result = updatePlayerSchema.safeParse({});

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'At least one field must be provided for update',
          );
        }
      });

      it('accepts object with only null values for optional fields', () => {
        const result = updatePlayerSchema.safeParse({
          middle_name: null,
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe('createPlayerSchema', () => {
    it('requires first_name and last_name', () => {
      const result = createPlayerSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
      });

      expect(result.success).toBe(true);
    });

    it('rejects missing first_name', () => {
      const result = createPlayerSchema.safeParse({
        last_name: 'Doe',
      });

      expect(result.success).toBe(false);
    });

    it('rejects missing last_name', () => {
      const result = createPlayerSchema.safeParse({
        first_name: 'John',
      });

      expect(result.success).toBe(false);
    });

    it('accepts optional birth_date', () => {
      const result = createPlayerSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
        birth_date: '1990-05-15',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('playerIdentitySchema', () => {
    describe('address field', () => {
      it('validates complete address', () => {
        const result = playerIdentitySchema.safeParse({
          address: {
            street: '123 Main St',
            city: 'Las Vegas',
            state: 'NV',
            postalCode: '89101',
          },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.address).toEqual({
            street: '123 Main St',
            city: 'Las Vegas',
            state: 'NV',
            postalCode: '89101',
          });
        }
      });

      it('accepts partial address', () => {
        const result = playerIdentitySchema.safeParse({
          address: {
            city: 'Las Vegas',
            state: 'NV',
          },
        });

        expect(result.success).toBe(true);
      });

      it('accepts empty address object', () => {
        const result = playerIdentitySchema.safeParse({
          address: {},
        });

        expect(result.success).toBe(true);
      });
    });

    describe('date fields', () => {
      it('validates birthDate format', () => {
        const result = playerIdentitySchema.safeParse({
          birthDate: '1990-05-15',
        });

        expect(result.success).toBe(true);
      });

      it('rejects invalid birthDate format', () => {
        const result = playerIdentitySchema.safeParse({
          birthDate: 'May 15, 1990',
        });

        expect(result.success).toBe(false);
      });

      it('validates issueDate and expirationDate', () => {
        const result = playerIdentitySchema.safeParse({
          issueDate: '2020-01-15',
          expirationDate: '2028-01-15',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('enum fields', () => {
      it('validates gender values', () => {
        const validGenders = ['m', 'f', 'x'];

        validGenders.forEach((gender) => {
          const result = playerIdentitySchema.safeParse({ gender });
          expect(result.success).toBe(true);
        });
      });

      it('rejects invalid gender value', () => {
        const result = playerIdentitySchema.safeParse({
          gender: 'invalid',
        });

        expect(result.success).toBe(false);
      });

      it('validates documentType values', () => {
        const validTypes = ['drivers_license', 'passport', 'state_id'];

        validTypes.forEach((documentType) => {
          const result = playerIdentitySchema.safeParse({ documentType });
          expect(result.success).toBe(true);
        });
      });

      it('rejects invalid documentType', () => {
        const result = playerIdentitySchema.safeParse({
          documentType: 'credit_card',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('height field', () => {
      it('validates height format (feet-inches)', () => {
        const result = playerIdentitySchema.safeParse({
          height: '6-01',
        });

        expect(result.success).toBe(true);
      });

      it('rejects invalid height format', () => {
        const result = playerIdentitySchema.safeParse({
          height: '6ft 1in',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('documentNumber', () => {
      it('accepts document number', () => {
        const result = playerIdentitySchema.safeParse({
          documentNumber: 'DL12345678',
        });

        expect(result.success).toBe(true);
      });

      it('rejects empty document number', () => {
        const result = playerIdentitySchema.safeParse({
          documentNumber: '',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('complete identity', () => {
      it('validates full identity payload', () => {
        const result = playerIdentitySchema.safeParse({
          documentNumber: 'DL12345678',
          birthDate: '1985-03-20',
          gender: 'm',
          eyeColor: 'BRN',
          height: '5-10',
          weight: '180',
          address: {
            street: '456 Casino Blvd',
            city: 'Las Vegas',
            state: 'NV',
            postalCode: '89109',
          },
          issueDate: '2020-06-15',
          expirationDate: '2028-06-15',
          issuingState: 'Nevada',
          documentType: 'drivers_license',
        });

        expect(result.success).toBe(true);
      });
    });
  });
});
