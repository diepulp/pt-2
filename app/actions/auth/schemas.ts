/**
 * Auth Action Schemas
 *
 * Shared Zod schemas for PIN validation with denylist.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS5
 */

import { z } from 'zod';

const PIN_DENYLIST = new Set([
  // Repeated digits
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  // Sequential ascending
  '0123',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '01234',
  '12345',
  '23456',
  '34567',
  '45678',
  '56789',
  '012345',
  '123456',
  '234567',
  '345678',
  '456789',
  // Sequential descending
  '4321',
  '3210',
  '5432',
  '6543',
  '7654',
  '8765',
  '9876',
  '54321',
  '43210',
  '65432',
  '76543',
  '87654',
  '98765',
  '654321',
  '543210',
  '765432',
  '876543',
  '987654',
  // Doubled adjacent
  '1122',
  '2233',
  '3344',
  '4455',
  '5566',
  '6677',
  '7788',
  '8899',
  '0011',
]);

export const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
  .refine((pin) => !PIN_DENYLIST.has(pin), {
    message: 'PIN is too common. Choose a less predictable combination.',
  });
