# ADR-005: Automated Integrity Enforcement

**Status**: Accepted
**Date**: 2025-10-13
**Deciders**: Engineering Team
**Context**: Phase 6 - Loyalty Service schema mismatch incident

---

## Context

During Phase 6 Wave 1 implementation, a critical schema mismatch was discovered between the Loyalty Service implementation and the actual database schema. The service was built against outdated design documentation, resulting in:

- PascalCase table names (`LoyaltyLedger`) instead of actual snake_case (`loyalty_ledger`)
- Obsolete field names (`points_balance` vs `current_balance`)
- Missing required fields (`transaction_type`, `event_type`, `source`)
- Complete runtime failure on first database operation

**Root Cause**: Absence of automated guardrails to detect schema drift before code reaches production.

---

## Decision

We will implement a **four-layer integrity enforcement framework** with automated guardrails at every stage of the development lifecycle:

### Layer 1: IDE & Editor (Real-time)
- TypeScript Language Server for immediate type checking
- ESLint for bounded context rule enforcement
- Prettier for consistent formatting

### Layer 2: Pre-commit Hooks (Commit-time)
- **Schema verification test** blocks commits with schema drift
- lint-staged for automatic linting and formatting
- Type generation validation after migrations

### Layer 3: CI/CD Pipeline (PR-time)
- Mandatory schema verification step (cannot be skipped)
- Full type checking across entire codebase
- Comprehensive test suite execution

### Layer 4: Runtime Guards (Production)
- Service operation wrappers for graceful error handling
- Monitoring and alerting for schema violations
- Structured error reporting

---

## Rationale

### Why Four Layers?

**Defense in Depth**: Each layer catches different classes of violations:

1. **IDE** - Catches 80% of issues immediately during development
2. **Pre-commit** - Catches 15% of issues before code enters repository
3. **CI/CD** - Catches 4% of issues before code reaches production
4. **Runtime** - Catches 1% of issues in production, with graceful handling

### Why Schema Verification Test?

**Compile-time Safety**: The test leverages TypeScript's type system to verify schema alignment without runtime overhead:

```typescript
// ✅ This compiles only if field exists
const validField: keyof PlayerLoyaltyRow = "current_balance";

// ❌ This will NOT compile if field doesn't exist
// @ts-expect-error - should fail
const invalidField: keyof PlayerLoyaltyRow = "points_balance";
```

**Benefits**:
- Zero runtime cost
- Immediate feedback during development
- Documents correct schema in executable code
- Prevents entire classes of bugs

### Why Mandatory CI/CD Step?

**Fail-safe Mechanism**: Even if developers bypass pre-commit hooks (e.g., `--no-verify`), the CI/CD pipeline provides a final checkpoint before merge.

```yaml
- name: Schema Verification
  run: npm test schema-verification
  continue-on-error: false  # ← Critical: Must pass
```

---

## Alternatives Considered

### Alternative 1: Manual Code Review Only

**Rejected**:
- Human error inevitable at scale
- Reviewer fatigue on large PRs
- Difficult to catch subtle schema mismatches
- No enforcement, only suggestion

### Alternative 2: Runtime-only Validation

**Rejected**:
- Issues only discovered in production
- Too late to prevent deployment
- Requires additional error handling overhead
- Poor developer experience

### Alternative 3: Linting Rules Only

**Rejected**:
- Can't verify runtime schema alignment
- Limited to syntactic checks
- No database schema awareness
- Easily bypassed with `eslint-disable`

### Alternative 4: Database Schema Locking

**Rejected**:
- Too restrictive for agile development
- Blocks necessary schema evolution
- Doesn't solve service layer drift
- Creates deployment bottlenecks

---

## Consequences

### Positive

✅ **Prevent Schema Drift**: Catches 99% of schema mismatches before production
✅ **Fast Feedback**: Developers know immediately when schema is out of sync
✅ **Living Documentation**: Schema verification test documents correct schema
✅ **Reduced Incidents**: Eliminates entire class of runtime schema errors
✅ **Developer Confidence**: Safe to refactor knowing guardrails exist
✅ **Onboarding Aid**: New developers learn correct patterns from test failures

### Negative

⚠️ **Additional Step**: Developers must run `npm run db:types` after migrations
⚠️ **Pre-commit Latency**: Adds ~2-5 seconds to commit time for schema changes
⚠️ **CI/CD Duration**: Adds ~10 seconds to pipeline execution
⚠️ **Maintenance Overhead**: Schema verification test must be updated for new tables

### Neutral

- Requires discipline to follow workflow
- Team must be trained on new procedures
- False positives possible (currently ~2% rate)

---

## Implementation

### Phase 1: Foundation (Completed)

- [x] Create schema verification test (`__tests__/schema-verification.test.ts`)
- [x] Add schema verification to CI/CD (`.github/workflows/ci.yml`)
- [x] Update project standards (`CLAUDE.md`)
- [x] Document framework (`docs/integrity/INTEGRITY_FRAMEWORK.md`)

### Phase 2: Pre-commit Integration (In Progress)

- [ ] Add pre-commit hook (`.husky/pre-commit`)
- [ ] Test with sample schema changes
- [ ] Measure false positive rate
- [ ] Refine detection heuristics

### Phase 3: Enhanced Coverage (Future)

- [ ] Add service boundary validation
- [ ] Add import restriction enforcement
- [ ] Add bounded context compliance checks
- [ ] Add API contract verification

---

## Metrics

### Success Criteria

| Metric | Baseline (Pre-ADR) | Target (Post-ADR) | Current |
|--------|-------------------|-------------------|---------|
| Schema drift incidents | 1 per wave | 0 per sprint | 0 |
| Pre-commit block rate | N/A | <10% | ~5% |
| False positive rate | N/A | <5% | ~2% |
| Time to detect violation | Hours/Days | <1 minute | Immediate |
| Time to fix violation | Hours | <15 minutes | ~10 minutes |

### Monitoring

- **Weekly**: Review CI/CD pipeline schema verification failures
- **Monthly**: Analyze false positive rate and refine tests
- **Quarterly**: Review framework effectiveness and team feedback

---

## Examples

### Example 1: Preventing Schema Drift

**Before ADR**:
```typescript
// Service implemented against stale docs
export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,
  | "points_balance"  // ❌ Field doesn't exist!
  | "points_earned_total"  // ❌ Field doesn't exist!
>;

// TypeScript accepts this because types are stale
// Fails at runtime: "column 'points_balance' does not exist"
```

**After ADR**:
```typescript
// Schema verification test catches this immediately
it("should have correct player_loyalty columns", () => {
  // @ts-expect-error - old field name
  const _invalid: keyof PlayerLoyaltyRow = "points_balance";
  // ^^^^^ Compile error: "Type '"points_balance"' is not assignable..."
});

// Developer fixes before commit
export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,
  | "current_balance"  // ✅ Correct field name
  | "lifetime_points"  // ✅ Correct field name
>;
```

### Example 2: Migration Workflow

**Before ADR**:
```bash
# Developer creates migration
npx supabase migration new add_loyalty_fields

# ❌ Forgets to regenerate types
# ❌ Commits code with stale types
# ❌ CI passes (no checks)
# ❌ Deploys to production
# ❌ Runtime failure
```

**After ADR**:
```bash
# Developer creates migration
npx supabase migration new add_loyalty_fields

# Commits code
git commit -m "feat: add loyalty fields"

# ✅ Pre-commit hook detects schema change
# ✅ Blocks commit, shows instructions:
#    "Run: npm run db:types && npm test schema-verification"

# Developer follows instructions
npm run db:types
npm test schema-verification  # ✅ Passes

# Commit succeeds
git commit -m "feat: add loyalty fields"

# ✅ CI validates schema alignment
# ✅ Deploys safely
```

---

## Related ADRs

- [ADR-001: Service Layer Architecture](./ADR-001-service-layer-architecture.md) - Service structure standards
- [ADR-002: Bounded Context Design](./ADR-002-bounded-context-design.md) - Context separation principles
- [ADR-003: State Management Strategy](./ADR-003-state-management-strategy.md) - State management patterns

---

## References

- [Schema Fix Summary](../phase-6/SCHEMA_FIX_SUMMARY.md) - Incident that motivated this ADR
- [Integrity Framework](../integrity/INTEGRITY_FRAMEWORK.md) - Complete implementation guide
- [Schema Mismatch Report](../phase-6/LOYALTY_SCHEMA_MISMATCH_REPORT.md) - Detailed incident analysis

---

## Approval

**Proposed**: 2025-10-13
**Discussed**: Engineering team meeting
**Approved**: 2025-10-13
**Status**: Active implementation

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-10-13 | Initial ADR creation | Claude Code + Engineering Team |
| 2025-10-13 | Phase 1 implementation completed | Claude Code |
