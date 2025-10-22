# SRM Canonicalization Task Board

> Short-lived board tracking the playbook swimlanes for making the SRM the canonical contract.

## Policy & Docs
- [x] SRM v3.0.2 readiness checklist green (`docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md`)
- [ ] Publish SRM_CANONICAL_ROLLUP.md with progress log
- [ ] Confirm ADR-000 alignment sign-off from architecture QA

## Schema Baseline
- [x] Draft `supabase/migrations/00000000000000_baseline_srm.sql` from canonical DDL
- [x] Add `supabase/seed.sql` with minimal non-sensitive seed data (player + rating slip + finance/MTL workflow)
- [x] Validate baseline via `supabase db reset`
  - Result: ran `supabase db reset` after baseline commit; applied migration cleanly (see SRM_CANONICAL_ROLLUP.md for log). Next: re-run to confirm seeds load.
- [ ] Regenerate types after Docker access (pending)
- [x] Define `rpc_create_financial_txn` in SRM + baseline migration for gaming day trigger workflow
- [x] Store casino gaming day boundary as `time` and adjust triggers/constraints for Supabase type alignment

## CI & Tooling
- [ ] Implement `scripts/gen_types.sh` (types regeneration gate)
- [ ] Build SRM ↔ schema diff linter (`scripts/lint_srm_schema.ts`)
- [ ] Add identifier and RLS lint scripts to CI pipeline

## Backfills
- [ ] Design idempotent script for `staff.casino_id`
- [ ] Prepare mapping/backfill for `dealer_rotation.table_id`
- [ ] Plan finance `gaming_day` backfill with auditing

## RLS
- [ ] Author per-table policies following SRM ownership rules
- [ ] Create `tests/rls/` coverage for critical tables
- [ ] Document admin bypass strategy (if required)

## Service Refactor
- [ ] Update Casino/Staff vertical slice to snake_case types
- [ ] Refactor TableContext services to use new FKs and indexes
- [ ] Align Loyalty/Rating Slip seam with RPC contract

## Verification
- [ ] Add contract tests mirroring SRM examples
- [ ] Add property tests for invariants (bet ranges, balances)
- [ ] Capture performance smoke results (top 3 queries)

## Release
- [ ] Complete release checklist (tags, logs, CI green)
- [ ] Record backfill and RLS outcomes in `audit_log`
- [ ] Update SRM_CANONICAL_ROLLUP.md with final artifacts
