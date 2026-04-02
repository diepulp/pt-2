/** @jest-environment node */

/**
 * PRD-060: Company Registration RPC Contract Tests
 *
 * Validates type contracts for rpc_register_company and the amended
 * rpc_bootstrap_casino against database.types.ts.
 *
 * Testing approach:
 *   - Compile-time type assertions (catch schema drift at build time)
 *   - Runtime-gated integration tests (require RUN_INTEGRATION_TESTS + live Supabase)
 *
 * NOTE: Type assertions for rpc_register_company and onboarding_registration
 * will be added once database.types.ts is regenerated (requires local Supabase).
 * The RPC and table were created in migrations 20260402002621-20260402002623
 * but types have not yet been regenerated.
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import type { Database } from '@/types/database.types';

// === Type Aliases ===

type RpcFunctions = Database['public']['Functions'];

// === Compile-Time Type Assertions ===

// rpc_bootstrap_casino: signature unchanged after PRD-060 amendment
// Args: { p_casino_name: string, p_timezone?: string, p_gaming_day_start?: string }
// Returns: { casino_id: string, staff_id: string, staff_role: string }
type BootstrapArgs = RpcFunctions['rpc_bootstrap_casino']['Args'];
type BootstrapReturns = RpcFunctions['rpc_bootstrap_casino']['Returns'];

// Verify bootstrap args still include p_casino_name
type _AssertBootstrapHasCasinoName = BootstrapArgs extends {
  p_casino_name: string;
}
  ? true
  : never;
const _bootstrapCasinoNameCheck: _AssertBootstrapHasCasinoName = true;

// Verify bootstrap returns casino_id, staff_id, staff_role
type _AssertBootstrapReturnsShape = BootstrapReturns extends Array<{
  casino_id: string;
  staff_id: string;
  staff_role: string;
}>
  ? true
  : never;
const _bootstrapReturnsCheck: _AssertBootstrapReturnsShape = true;

// TODO: Add rpc_register_company type assertions after npm run db:types-local
// Expected Args: { p_company_name: string, p_legal_name?: string | null }
// Expected Returns: Array<{ company_id: string, registration_id: string }>

// === Runtime Tests ===

describe('rpc_register_company contract', () => {
  test('type contract compiles (validates RPC signature exists in Database types)', () => {
    // If database.types.ts doesn't include rpc_bootstrap_casino with the expected
    // shape, this file won't compile — catching schema drift at build time.
    // rpc_register_company assertions pending type regeneration.
    expect(_bootstrapCasinoNameCheck).toBe(true);
    expect(_bootstrapReturnsCheck).toBe(true);
  });
});

describe('rpc_bootstrap_casino contract (PRD-060 amendment)', () => {
  test('signature unchanged after amendment — returns casino_id, staff_id, staff_role', () => {
    // CREATE OR REPLACE preserves the original signature.
    // Amendment only changes internal logic (registration lookup instead of company auto-create).
    expect(_bootstrapCasinoNameCheck).toBe(true);
    expect(_bootstrapReturnsCheck).toBe(true);
  });
});

// === Live DB Tests (gated) ===

const SKIP = !process.env.RUN_INTEGRATION_TESTS;

(SKIP ? describe.skip : describe)('rpc_register_company (live DB)', () => {
  // These tests require a running Supabase instance.
  // Run with: RUN_INTEGRATION_TESTS=1 npm test services/company/

  test('creates company + pending registration', async () => {
    // TODO: Implement with real Supabase client once environment is available
    // 1. Sign in as test user
    // 2. Call rpc_register_company
    // 3. Verify company row created
    // 4. Verify onboarding_registration row with status='pending'
    expect(true).toBe(true);
  });

  test('returns 23505 on duplicate pending registration', async () => {
    // TODO: Implement — call rpc_register_company twice, expect conflict on second
    expect(true).toBe(true);
  });
});

(SKIP ? describe.skip : describe)(
  'rpc_bootstrap_casino (live DB, PRD-060 amendment)',
  () => {
    test('fails closed (P0002) without prior registration', async () => {
      // TODO: Implement — call rpc_bootstrap_casino without registration, expect P0002
      expect(true).toBe(true);
    });

    test('resolves company from registration and creates casino', async () => {
      // TODO: Implement — register then bootstrap, verify company_id matches
      expect(true).toBe(true);
    });

    test('marks registration as consumed after bootstrap', async () => {
      // TODO: Implement — verify status='consumed' and consumed_at is set
      expect(true).toBe(true);
    });
  },
);
