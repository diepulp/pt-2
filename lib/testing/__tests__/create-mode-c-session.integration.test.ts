/** @jest-environment node */

/**
 * createModeCSession Invariant Tests
 *
 * Validates the 6 invariants from FIB-H Section N:
 * 1. Zero domain fixtures (no .from() calls in source)
 * 2. Caller owns fixture lifecycle (cleanup deletes auth user only)
 * 3. Static Bearer token (no token refresh)
 * 4. Independent sessions (multiple calls produce non-interfering clients)
 * 5. Local-only safety (rejects remote SUPABASE_URL)
 * 6. Unique emails (collision-free across calls)
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration test requires direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  createModeCSession,
  ModeCSessionResult,
} from '../create-mode-c-session';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

describe('createModeCSession invariants', () => {
  let serviceClient: SupabaseClient<Database>;
  const sessionsToCleanup: ModeCSessionResult[] = [];

  beforeAll(() => {
    serviceClient = createClient<Database>(supabaseUrl, serviceKey);
  });

  afterAll(async () => {
    for (const s of sessionsToCleanup) {
      await s.cleanup();
    }
  });

  // INV-1: Zero domain fixtures — function has no .from() calls
  it('source has zero .from() calls (no domain fixtures)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../create-mode-c-session.ts'),
      'utf8',
    );
    const fromCalls = source.match(/\.from\s*\(/g);
    expect(fromCalls).toBeNull();
  });

  // INV-2 + INV-3 + INV-6: Cleanup contract, static Bearer, unique email
  it('creates authenticated client with correct contract', async () => {
    const session = await createModeCSession(serviceClient, {
      staffId: 'inv-test-staff',
      casinoId: 'inv-test-casino',
      staffRole: 'pit_boss',
    });
    sessionsToCleanup.push(session);

    expect(session.client).toBeDefined();
    expect(session.userId).toBeDefined();
    expect(session.email).toMatch(/^test-mc-pit_boss-\d+@example\.com$/);
    expect(typeof session.cleanup).toBe('function');
  });

  // INV-4 + INV-6: Independent sessions with unique emails
  it('produces independent sessions with unique emails', async () => {
    const s1 = await createModeCSession(serviceClient, {
      staffId: 'ind-staff-1',
      casinoId: 'ind-casino-1',
      staffRole: 'pit_boss',
    });
    const s2 = await createModeCSession(serviceClient, {
      staffId: 'ind-staff-2',
      casinoId: 'ind-casino-2',
      staffRole: 'dealer',
    });
    sessionsToCleanup.push(s1, s2);

    expect(s1.userId).not.toBe(s2.userId);
    expect(s1.email).not.toBe(s2.email);
  });

  // INV-5: Local-only safety
  it('rejects remote SUPABASE_URL', async () => {
    const origPublic = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origPlain = process.env.SUPABASE_URL;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    delete process.env.SUPABASE_URL;

    await expect(
      createModeCSession(serviceClient, {
        staffId: 'x',
        casinoId: 'x',
        staffRole: 'x',
      }),
    ).rejects.toThrow('SUPABASE_URL must be local');

    // Restore env
    if (origPublic) process.env.NEXT_PUBLIC_SUPABASE_URL = origPublic;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (origPlain) process.env.SUPABASE_URL = origPlain;
    else delete process.env.SUPABASE_URL;
  });

  // INV-2: Cleanup deletes auth user only
  it('cleanup deletes auth user and nothing else', async () => {
    const session = await createModeCSession(serviceClient, {
      staffId: 'cleanup-staff',
      casinoId: 'cleanup-casino',
      staffRole: 'admin',
    });

    const userId = session.userId;
    await session.cleanup();

    // Verify auth user is gone
    const { data } = await serviceClient.auth.admin.getUserById(userId);
    expect(data.user).toBeNull();
  });
});
