# ADR-015 Manual Checkpoint (Session State)

**Date:** 2025-12-11  
**Context:** ADR-015 RLS remediation in progress; finance service addressed; remaining legacy migrations pending.

## Current Task
- Apply ADR-015 hybrid RLS patterns across services/migrations without breaking service layer. Finance service addressed; others pending.

## Decisions Made
- Added finance hybrid RLS migration: `supabase/migrations/20251211170030_adr015_finance_rls_hybrid.sql` (Pattern C, cashier/admin gates, append-only).
- Updated `scripts/adr015-rls-scanner.sh` to flag actor_id/staff_role hybrid gaps and direct JWT-only usage.
- Documented service-by-service remediation plan: `docs/issues/remediation/ADR015_SERVICE_BY_SERVICE_REMEDIATION.md`.
- Committed finance migration + scanner + docs.

## Files Modified
- `supabase/migrations/20251211170030_adr015_finance_rls_hybrid.sql`
- `scripts/adr015-rls-scanner.sh`
- `docs/issues/adr015-compliance-report.md`
- `docs/issues/remediation/ADR015_SERVICE_BY_SERVICE_REMEDIATION.md`

## Validation Gates Passed
- Pre-commit (migration safety, API sanity, service checks) passed for the finance migration commit.
- ADR-015 scanner rerun: finance migration clears; remaining legacy migrations still flagged.

## Open Questions
- Need to upgrade legacy migrations to Pattern C and add auth.uid guards:
  - `20251128221408_rating_slip_pause_tracking.sql`
  - `20251129161956_prd000_casino_foundation.sql`
  - `20251129230733_prd003_player_visit_rls.sql`
  - `20251209023430_fix_staff_rls_bootstrap.sql`
- Need casino_id validation in `rpc_create_financial_txn` (and similar finance/loyalty RPCs).
- Role/policy naming for loyalty/MTL to match service expectations.

## Next Steps
- Create ADR-015 hybrid migrations for loyalty_ledger (and finance_outbox if needed): read/append-only, role gates intact, Pattern C.
- Create ADR-015 hybrid migrations for mtl_entry and mtl_audit_note: read/append-only, compliance/admin gates, Pattern C.
- Harden `rpc_create_financial_txn` with `p_casino_id` == `current_setting('app.casino_id', true)`; raise on null/mismatch.
- Upgrade remaining legacy migrations (listed above) to Pattern C with auth.uid() guards.
- Re-run `scripts/adr015-rls-scanner.sh supabase/migrations docs/issues/adr015-compliance-report.md` to confirm zero issues.

## Key Insights
- Scanner now enforces hybrid fallback for actor_id/staff_role; finance migration passes.
- Remaining issues are confined to older migrations; TypeScript service layer is already ADR-015-compliant per ISSUE-003.
