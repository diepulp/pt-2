Schema UUID Migration 2025-10-07 Resolved Low P1 maintainability

schema inconsistency.id TEXT tables UUID technical debt overhead-unsafe joins ORM friction Migrated TEXT UUID zero production

Problem Statement Inconsistency Discovered Anti-Pattern Mixed ID types ratingslip.id player.id visit.id casino.id_transaction_slip_id mismatch Technical Debt Manifestations-Unsafe Foreign casting_id UUID TypeScript types Supabase inconsistent ID semantics Inconsistent player.id ratingslip.id Casting Anti-pattern casts accrual_history ratingslip_id Log Mixed types event streams audit tables

Impact Analysis Dependencies foreign key dependency accrual_history.session ratingslip.id Data Volume 17 records 5 records None domain Migration Window Near zero None production API coupling Not implemented

Resolution Migration 20251006234000 Atomic transaction verification Drop FK constraint accrual_history_id Clear test data TEXT UUID conversion TRUNCATE TABLE_history Convert types DROP CONSTRAINT ALTER COLUMN id UUID_random_uuid DEFAULT ADD PRIMARY session_id UUID Re-establish FK UUID types ADD CONSTRAINT_id_fkey KEY DELETE CASCADE Re-enable RLS ROW LEVEL SECURITY Verification data_type_schema.columns table_name column_name RAISE EXCEPTION failed ratingslipnot UUID END RAISE NOTICE consistency IDs UUID END COMMIT Function Updates changes_rated_visit adapts_slip After returns INSERT ratingslip RETURNING_slip_id

Benefits Unified ID Semantics domain tables UUID Zero casting Type-safe relationships ORM Consistency types TypeScript Future Resilience Event logs Audit polymorphic references MTL UUID Developer Experience Cleaner syntax Predictable ID Consistent validation logic

Anti-Pattern Classification Schema Design Identity Management P1 debt discovery PlayerFinancialService PRD §4 Anti-Pattern Guardrails Enforce UUID Keys Anti-Pattern Mixed ID types overhead Violation tables UUID Pre-migration audits TEXT IDs_BLUEPRINT_MVP_PRD-pattern

Post-Migration Checks Verify UUID types SELECT table column data information_schema.columns table_name_history column_name_id Expected output ratingslip uuid accrual_history session_id Type Generation typescript TypeScript types UUID ratingslip id string UUID format

Lessons Learned Detection pre audits Mixed ID types Inconsistent Non-standard constraint patterns Prevention UUID ESLint rule keys migrations changes ID justification Nascent domain production data API Near zero test fixtures 2 hours migration verification

Recommendations 2) anti-pattern PRD Update INDEX.md Audit tables 3) schema linting rules UUID consistency pipeline ID schema drift pre-production schema audit type consistency checks deployment gates

References [20251006234000_migrate_ratingslip_id_uuid.sql/migrations [CANONICAL_BLUEPRINT_MVP_PRD.md §4-guardrails_RESPONSIBILITY_MATRIX.md Drift_DRIFT_AUDIT.md Closed Schema consistency achieved Phase 3 layer implementation Backend Architecture Team
