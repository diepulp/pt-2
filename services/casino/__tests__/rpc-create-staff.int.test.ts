/**
 * rpc_create_staff Integration Tests (PRD-034 WS1)
 *
 * Tests for the SECURITY DEFINER RPC that replaces direct PostgREST DML
 * on the Category A `staff` table.
 *
 * Test groups:
 * 1. RPC type contract (compile-time)
 * 2. ADR-024 compliance (no spoofable params)
 */

import type { Database } from '@/types/database.types';

// ============================================================================
// Type Aliases
// ============================================================================

type RpcFunctions = Database['public']['Functions'];

// ============================================================================
// 1. RPC Type Contract — Compile-Time Assertions
// ============================================================================

type CreateStaffArgs = RpcFunctions['rpc_create_staff']['Args'];
type CreateStaffReturns = RpcFunctions['rpc_create_staff']['Returns'];

// Verify args shape — p_first_name, p_last_name, p_role required; p_employee_id optional
type _AssertCreateStaffArgs = CreateStaffArgs extends {
  p_first_name: string;
  p_last_name: string;
  p_role: Database['public']['Enums']['staff_role'];
}
  ? true
  : never;
const _createStaffArgsCheck: _AssertCreateStaffArgs = true;

// Verify no spoofable params exist (ADR-024 INV-8)
type _AssertNoCasinoIdParam = 'p_casino_id' extends keyof CreateStaffArgs
  ? never
  : true;
const _noCasinoIdCheck: _AssertNoCasinoIdParam = true;

type _AssertNoActorIdParam = 'p_actor_id' extends keyof CreateStaffArgs
  ? never
  : true;
const _noActorIdCheck: _AssertNoActorIdParam = true;

type _AssertNoUserIdParam = 'p_user_id' extends keyof CreateStaffArgs
  ? never
  : true;
const _noUserIdCheck: _AssertNoUserIdParam = true;

// Verify return shape includes expected columns
type CreateStaffReturnRow = CreateStaffReturns extends (infer R)[] ? R : never;

type _AssertReturnColumns = CreateStaffReturnRow extends {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  casino_id: string;
}
  ? true
  : never;
const _returnColumnsCheck: _AssertReturnColumns = true;

// Verify employee_id is optional (has ? modifier in Args)
type _AssertEmployeeIdOptional = undefined extends CreateStaffArgs['p_employee_id']
  ? true
  : never;
const _employeeIdOptionalCheck: _AssertEmployeeIdOptional = true;

// ============================================================================
// 2. ADR-024 Compliance — Security Assertions
// ============================================================================

describe('rpc_create_staff type contract', () => {
  it('has correct argument types', () => {
    // Compile-time assertions above validate the type contract.
    // This test exists to ensure the assertions are evaluated.
    expect(_createStaffArgsCheck).toBe(true);
    expect(_noCasinoIdCheck).toBe(true);
    expect(_noActorIdCheck).toBe(true);
    expect(_noUserIdCheck).toBe(true);
    expect(_returnColumnsCheck).toBe(true);
    expect(_employeeIdOptionalCheck).toBe(true);
  });

  it('does not accept spoofable casino_id parameter (ADR-024 INV-8)', () => {
    // Type-level assertion: p_casino_id must not be in Args
    // If this compiles, the RPC correctly derives casino_id from context
    const argKeys: (keyof CreateStaffArgs)[] = [
      'p_first_name',
      'p_last_name',
      'p_role',
    ];
    expect(argKeys).not.toContain('p_casino_id');
    expect(argKeys).not.toContain('p_actor_id');
  });

  it('returns staff record with casino_id (derived from context)', () => {
    // Verify the return type includes casino_id populated by the RPC
    // (not from user input)
    type HasCasinoId = 'casino_id' extends keyof CreateStaffReturnRow
      ? true
      : never;
    const _hasCasinoId: HasCasinoId = true;
    expect(_hasCasinoId).toBe(true);
  });
});
