/**
 * Onboarding RPC Contract Tests (PRD-025 WS5)
 *
 * Compile-time type assertions ensuring TypeScript RPC parameter types
 * align with Database types from types/database.types.ts.
 */

import type { Database } from '@/types/database.types';

import type {
  AcceptInviteResult,
  BootstrapCasinoResult,
  CreateInviteResult,
  StaffInviteDTO,
} from '../dtos';

// === Type Assertions ===

// These are compile-time checks — they produce no runtime code.
// If any type shape changes, these will cause TypeScript errors.

type RpcFunctions = Database['public']['Functions'];

// --- rpc_bootstrap_casino ---

type BootstrapArgs = RpcFunctions['rpc_bootstrap_casino']['Args'];
type BootstrapReturns = RpcFunctions['rpc_bootstrap_casino']['Returns'];

// Verify args shape
type _AssertBootstrapArgs = BootstrapArgs extends {
  p_casino_name: string;
  p_timezone?: string;
  p_gaming_day_start?: string;
}
  ? true
  : never;
const _bootstrapArgsCheck: _AssertBootstrapArgs = true;

// Verify return shape matches BootstrapCasinoResult
type _AssertBootstrapReturn =
  BootstrapReturns extends Array<{
    casino_id: string;
    staff_id: string;
    staff_role: string;
  }>
    ? true
    : never;
const _bootstrapReturnCheck: _AssertBootstrapReturn = true;

// Verify our DTO covers the RPC return shape
type _AssertBootstrapResultCompat = BootstrapCasinoResult extends {
  casino_id: string;
  staff_id: string;
  staff_role: string;
}
  ? true
  : never;
const _bootstrapDtoCheck: _AssertBootstrapResultCompat = true;

// --- rpc_create_staff_invite ---

type CreateInviteArgs = RpcFunctions['rpc_create_staff_invite']['Args'];
type CreateInviteReturns = RpcFunctions['rpc_create_staff_invite']['Returns'];

// Verify args shape
type _AssertCreateInviteArgs = CreateInviteArgs extends {
  p_email: string;
  p_role: Database['public']['Enums']['staff_role'];
}
  ? true
  : never;
const _createInviteArgsCheck: _AssertCreateInviteArgs = true;

// Verify return shape matches CreateInviteResult
type _AssertCreateInviteReturn =
  CreateInviteReturns extends Array<{
    invite_id: string;
    raw_token: string;
    expires_at: string;
  }>
    ? true
    : never;
const _createInviteReturnCheck: _AssertCreateInviteReturn = true;

type _AssertCreateInviteResultCompat = CreateInviteResult extends {
  invite_id: string;
  raw_token: string;
  expires_at: string;
}
  ? true
  : never;
const _createInviteDtoCheck: _AssertCreateInviteResultCompat = true;

// --- rpc_accept_staff_invite ---

type AcceptInviteArgs = RpcFunctions['rpc_accept_staff_invite']['Args'];
type AcceptInviteReturns = RpcFunctions['rpc_accept_staff_invite']['Returns'];

// Verify args shape
type _AssertAcceptInviteArgs = AcceptInviteArgs extends {
  p_token: string;
}
  ? true
  : never;
const _acceptInviteArgsCheck: _AssertAcceptInviteArgs = true;

// Verify return shape matches AcceptInviteResult
type _AssertAcceptInviteReturn =
  AcceptInviteReturns extends Array<{
    casino_id: string;
    staff_id: string;
    staff_role: string;
  }>
    ? true
    : never;
const _acceptInviteReturnCheck: _AssertAcceptInviteReturn = true;

type _AssertAcceptInviteResultCompat = AcceptInviteResult extends {
  staff_id: string;
  casino_id: string;
  staff_role: string;
}
  ? true
  : never;
const _acceptInviteDtoCheck: _AssertAcceptInviteResultCompat = true;

// --- staff_invite table columns ---

type StaffInviteRow = Database['public']['Tables']['staff_invite']['Row'];

type _AssertStaffInviteColumns = StaffInviteRow extends {
  id: string;
  casino_id: string;
  email: string;
  staff_role: Database['public']['Enums']['staff_role'];
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  created_by: string;
  created_at: string;
}
  ? true
  : never;
const _staffInviteColumnsCheck: _AssertStaffInviteColumns = true;

// Verify StaffInviteDTO excludes token_hash
type _AssertStaffInviteDTONoTokenHash = StaffInviteDTO extends {
  id: string;
  casino_id: string;
  email: string;
  staff_role: Database['public']['Enums']['staff_role'];
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}
  ? true
  : never;
const _staffInviteDtoCheck: _AssertStaffInviteDTONoTokenHash = true;

// Ensure token_hash is NOT in StaffInviteDTO
type _AssertNoTokenHash = 'token_hash' extends keyof StaffInviteDTO
  ? never
  : true;
const _noTokenHashCheck: _AssertNoTokenHash = true;

// === Runtime tests (minimal — contract tests are primarily compile-time) ===

describe('Onboarding RPC Contract Types', () => {
  it('compile-time type assertions pass', () => {
    // If this file compiles, all type assertions are valid.
    // Runtime checks verify the constants aren't optimized away.
    expect(_bootstrapArgsCheck).toBe(true);
    expect(_bootstrapReturnCheck).toBe(true);
    expect(_bootstrapDtoCheck).toBe(true);
    expect(_createInviteArgsCheck).toBe(true);
    expect(_createInviteReturnCheck).toBe(true);
    expect(_createInviteDtoCheck).toBe(true);
    expect(_acceptInviteArgsCheck).toBe(true);
    expect(_acceptInviteReturnCheck).toBe(true);
    expect(_acceptInviteDtoCheck).toBe(true);
    expect(_staffInviteColumnsCheck).toBe(true);
    expect(_staffInviteDtoCheck).toBe(true);
    expect(_noTokenHashCheck).toBe(true);
  });
});
