import { z } from 'zod';

// Canonical email: lowercase + trim. DB CHECK constraint is authoritative (DEC-7);
// this schema is defense-in-depth only.
export const canonicalEmailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .transform((v) => v.toLowerCase().trim());

export const requestAccessSchema = z.object({
  email: canonicalEmailSchema,
  name: z.string().min(1, 'Name is required').max(255),
  casino_name: z.string().min(1, 'Casino name is required').max(255),
  role: z.string().min(1, 'Role is required').max(255),
  estimated_table_count: z.coerce.number().int().positive().optional(),
  message: z.string().max(1000).optional(),
});

export type RequestAccessInput = z.output<typeof requestAccessSchema>;

export const sendMagicLinkSchema = z.object({
  email: canonicalEmailSchema,
});

export type SendMagicLinkInput = z.output<typeof sendMagicLinkSchema>;
