# GAP-SEC007-D3D4: p_casino_id Removal Blocked Unnecessarily by Delegation Params

**Filed**: 2026-03-04
**Severity**: P2 — Deferred remediation blocking SEC-003 zero-tolerance
**Source**: PRD-043 EXEC-043 Phase 1-3 execution review
**Status**: OPEN — requires triage decision

## Finding

PRD-043 bundles `p_casino_id` removal with the delegation param decision (OQ-1/OQ-2) for 4 RPCs. These are **independent concerns**:

| RPC | `p_casino_id` | Delegation param | Can decouple? |
|-----|---------------|------------------|---------------|
| `rpc_create_financial_txn` | Remove now | `p_created_by_staff_id` | YES |
| `rpc_create_financial_adjustment` | Remove now | *(none)* | YES — fully clean |
| `rpc_manual_credit` | Remove now | `p_awarded_by_staff_id` | YES |
| `rpc_redeem` | Remove now | `p_issued_by_staff_id` | YES |

`p_casino_id` is a spoofable tenant boundary parameter (ADR-024 violation). The delegation params (`p_created_by_staff_id`, `p_awarded_by_staff_id`, `p_issued_by_staff_id`) are a separate identity attribution question — they record *which staff member* performed an action, not *which casino*. These can coexist with derived `casino_id`.

## Impact of Current Bundling

- SEC-003 allowlist stuck at 4 entries instead of 0
- SEC-003 enforcement flip (hard-fail on allowlisted RPCs) reverted to NOTICE
- Zero-tolerance posture for `p_casino_id` cannot be achieved until OQ-1/OQ-2 resolve
- `rpc_create_financial_adjustment` has no delegation param at all — it is blocked for no reason

## Proposed Resolution

**Option A (recommended): Decouple now.**
Remove `p_casino_id` from all 4 RPCs using the same D1/D2 pattern. Leave delegation params untouched. Track delegation params as a separate issue (they are already tracked by SEC-003 check 4 as `p_created_by_staff_id` NOTICE). This zeroes out the SEC-003 allowlist and enables enforcement flip.

**Option B: Wait for OQ-1/OQ-2.**
Keep current state. SEC-003 allowlist stays at 4 entries with NOTICE severity. Delegation params and `p_casino_id` are resolved together per original PRD-043 plan. Risk: OQ-1/OQ-2 have no firm timeline.

## Catalog Evidence

Current signatures (from `pg_proc`):

```sql
-- rpc_create_financial_adjustment: NO delegation param, clean removal
(p_casino_id uuid, p_player_id uuid, p_visit_id uuid, p_delta_amount numeric,
 p_reason_code adjustment_reason_code, p_note text,
 p_original_txn_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL)

-- rpc_create_financial_txn: delegation param is p_created_by_staff_id
(p_casino_id uuid, p_player_id uuid, p_visit_id uuid, p_amount numeric,
 p_direction financial_direction, p_source financial_source,
 p_created_by_staff_id uuid, ...)

-- rpc_manual_credit: delegation param is p_awarded_by_staff_id
(p_casino_id uuid, p_player_id uuid, p_points integer,
 p_awarded_by_staff_id uuid, p_note text, p_idempotency_key uuid)

-- rpc_redeem: delegation param is p_issued_by_staff_id
(p_casino_id uuid, p_player_id uuid, p_points integer,
 p_issued_by_staff_id uuid, p_note text, p_idempotency_key uuid, ...)
```

## References

- PRD-043 OQ-1/OQ-2: `docs/10-prd/PRD-043-sec007-remaining-rpc-p-casino-id-remediation-v0.md` §7.3
- EXEC-043 WS6-WS9: `docs/21-exec-spec/PRD-043/EXEC-043-sec007-remaining-rpc-remediation.md` §WS6
- SEC-003 gate: `supabase/tests/security/03_identity_param_check.sql` (check 2 + check 4)
- ADR-024: Authoritative context derivation
