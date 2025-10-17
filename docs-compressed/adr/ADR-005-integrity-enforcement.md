ADR Integrity Enforcement 2025-10-13 Engineering 6 Loyalty

Phase 6 Wave 1 schema mismatch Loyalty Service database built outdated PascalCase table names Obsolete field names_balance_balance Missing fields_type_type runtime failure first database operation Absence automated guardrails schema drift

-layer integrity automated guardrails development Layer 1: IDE Editor TypeScript Language Server checking ESLint formatting 2: Pre-commit Hooks verification linting formatting Type generation validation 3: CI/CD Pipeline schema verification type checking codebase test Layer 4: Runtime Guards error handling schema violations error reporting

Rationale Four Layers Each layer catches violations Catches 80% issues development-commit** 15% before code repository 4% before production 1% production Schema Verification Test-time leverages TypeScript type system schema alignment without runtime overhead compiles if field exists if-error Zero runtime cost Immediate feedback Documents correct schema executable code Prevents bugs Mandatory CI/CD Step **Fail-safe Mechanism\*\* pre-commit CI/CD pipeline final checkpoint before merge Schema Verification Critical Must pass

Alternatives Manual Code Review Human error fatigue No enforcement Runtime-only Validation Issues production late Poor experience 3: Linting Rules verify syntactic checks No database schema bypassed-disable 4: Database Schema Locking restrictive agile Blocks schema evolution service layer drift deployment bottlenecks

Consequences Positive Schema Catches 99% mismatches before production sync Schema verification test schema Eliminates runtime schema errors refactor guardrails developers learn test failures Negative run db:types after migrations-commit Adds seconds commit changes/CD Adds seconds pipeline execution Schema verification test new tables Neutral Requires discipline Team procedures False positives possible rate

Phase Foundation Create schema verification test Add CI/CD Update project standards framework Pre-commit Integration Add pre-commit hook Test schema changes Measure false positive Refine detection heuristics Enhanced Coverage service boundary validation import restriction enforcement context compliance checks API contract verification

Success Criteria Baseline Target Schema drift incidents 1 wave 0 sprint Pre-commit block rate <10% ~5% False positive <5% ~2% detect violation <1 minute fix <15 ~10 Monitoring Analyze false positive rate refine tests framework effectiveness feedback

Examples Preventing Schema Drift Service against stale docs PlayerLoyaltyDTO "points_balance" "points_earned_total" TypeScript accepts types stale Fails runtime 'points_balance Schema verification test catches player_loyalty-error old field name \_invalid PlayerLoyaltyRow "points Compile error"points_balance not Developer fixes commit export type PlayerLoyaltyDTO "current_balance" Correct field "lifetime_points" Example 2: Migration Workflow Developer creates add_loyalty_fields Forgets regenerate types Commits with stale types CI passes Deploys production Runtime failure Developer creates migration add_loyalty_fields Commits Pre-commit detects schema change Blocks commit-verification follows Commit succeeds CI validates schemaalignment Deploys

ADRs Service Layer structure standards Bounded Context Context separation principles-003 State Management Strategy patterns

References Fix Summary Incident ADR [Integrity Framework implementation guide [Schema Mismatch Report_REPORT incident analysis

Approval 2025-10-13 2025-10-13 Active

Changelog Author 2025-10-13 Initial ADR Claude Code Engineering Team Phase 1
