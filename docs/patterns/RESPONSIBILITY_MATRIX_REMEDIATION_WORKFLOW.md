# Responsibility Matrix Remediation Workflow

**Version**: 2.0.0 (Lean Edition)
**Status**: Ready for Execution
**Created**: 2025-10-20
**Target Completion**: 4-5 weeks
**Source Audit**: [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md)
**Changes from v1.0**: Consolidated 4 waves into 3 phases, removed ceremony, simplified tooling

## Executive Summary

This workflow addresses 8 critical inconsistencies identified in the SERVICE_RESPONSIBILITY_MATRIX.md audit. The lean 3-phase approach resolves ownership conflicts, type mismatches, boundary erosion, and documentation gaps through focused execution with minimal ceremony.

**Impact**: Restores bounded context integrity, eliminates schema drift, and establishes single source of truth for service responsibilities.

**Philosophy**: Keep heavy rigor where risk is real (UUID migration, financial boundaries). Keep it light for documentation-only tasks, naming, and sign-off paths.

---

## Phase Structure Overview

| Phase | Focus | Duration | Risk Level | Deliverables |
|-------|-------|----------|------------|--------------|
| A | Decide & Document | 1 week | Low | Matrix updates (temporal, performance, schema appendix) |
| B | Boundaries | 1 week | Medium | Financial ownership table, RatingSlip decision, Visit interface |
| C | Type Integrity | 2-3 weeks | High | Patron UUID migration with phased rollout |

**Total Timeline**: 4-5 weeks (vs 7-10 weeks in original plan)

---

## Issue → Phase Mapping

| Issue # | Description | Phase | Priority | Risk |
|---------|-------------|-------|----------|------|
| #1 | Configuration ownership duplication | Phase A | Critical | Low |
| #7 | Temporal authority leakage | Phase A | Critical | Low |
| #6 | Naming divergence | Phase A | High | Low |
| #5 | Performance context undefined | Phase A | Medium | Low |
| #8 | Legacy friction tracking | Phase A | Low | Low |
| #3 | Telemetry/finance boundary erosion | Phase B | Critical | Medium |
| #4 | Visit financial aggregation ambiguity | Phase B | High | Medium |
| #2 | MTL patron type mismatch | Phase C | Critical | High |

---

## Phase A: Decide & Document (1 week)

### Objective
Update Responsibility Matrix with all documentation fixes in a single PR: schema appendix, ownership resolution, temporal authority, performance context.

### Consolidated Deliverables

**Addresses**: Issues #1, #5, #6, #7, #8
**Effort**: 1 week (5 business days)
**Owner**: Architecture Team + 1 Reviewer
**Output**: Single PR to SERVICE_RESPONSIBILITY_MATRIX.md

### Tasks (Run in Parallel)

#### 1. Schema Identifier Appendix (Days 1-2)
- Parse `types/database.types.ts` → Extract all table names
- Map tables to owning services from existing matrix sections
- Create appendix showing Entity (Matrix) vs Table (Schema) naming

**Output Section**:
```markdown
## Appendix A: Schema Identifier Reference
| Service | Entity (Matrix) | Table (Schema) | Notes |
|---------|----------------|----------------|-------|
| Casino | CasinoSettings | casino_settings | snake_case |
| Casino | Staff | "Staff" | Quoted CamelCase |
```

#### 2. Configuration Ownership + Temporal Authority (Day 2)
- Code audit: `grep -r "casino_settings.*update\|insert\|upsert" services/`
- Confirm MTL has zero writes to `casino_settings`
- Update Casino section: Declare sole owner
- Update MTL section: Add temporal authority contract

**Output**:
```markdown
### Casino Service
**Owned Entities**: `casino_settings` - Single temporal authority

### MTL Service
**Consumed Entities**: `casino_settings` (read-only)
**Temporal Pattern**: References gaming-day logic, never modifies
```

#### 3. Performance Bounded Context (Day 3)
- Document Performance service as read-model consumer
- List data sources (Casino, Visit, RatingSlip, MTL)
- Define responsibilities vs anti-responsibilities

**Output Section**:
```markdown
## Performance Service
**Purpose**: Real-time monitoring (read-model only)
**Owned**: `performance_alerts`
**Consumed**: Casino, Visit, RatingSlip (read-only)
**Anti-Pattern**: ❌ Does NOT write source data
```

#### 4. Consistency Checklist (Day 4)
- Update audit checklist with Phase A/B/C status
- Assign owners and target dates for all 8 issues
- Link evidence for completed items

### Phase A Success Criteria (PR Checklist)

Single PR must demonstrate:
- ✅ Schema appendix maps all 50+ tables to services
- ✅ Zero duplicate ownership claims (run: `npm run validate:ownership`)
- ✅ Zero orphaned references (matrix mentions tables that don't exist)
- ✅ Temporal authority explicitly documented (Casino owns, MTL consumes)
- ✅ Performance context section added
- ✅ Remediation checklist current and accurate
- ✅ One owner + one reviewer sign-off (no ARB required)

**Validation Command**:
```bash
npm run validate:matrix-schema  # Must pass before merge
```

**Approval**: Architecture lead + 1 reviewer (no multi-gate sign-off)

---

## Phase B: Boundaries (1 week)

### Objective
Resolve financial data ownership, decide RatingSlip strategy, document Visit interface.

### Deliverables

**Addresses**: Issues #3, #4
**Effort**: 1 week (5 business days)
**Owner**: Architecture Team + Database Team
**Output**: Financial Ownership Table + ADR-006 (if removal chosen) + Matrix updates

### Tasks

#### 1. Financial Data Ownership Table (Days 1-2)
Inventory all monetary fields and assign single owning service.

**Output**:
```markdown
## Financial Data Ownership Table

| Field | Current Location | Owner | Decision | Rationale |
|-------|------------------|-------|----------|-----------|
| cash_in | ratingslip, player_financial_transaction | PlayerFinancialService | Remove from ratingslip | Finance ledger is source of truth |
| chips_brought | ratingslip, player_financial_transaction | PlayerFinancialService | Remove from ratingslip | Finance ledger is source of truth |
| chips_taken | ratingslip, player_financial_transaction | PlayerFinancialService | Remove from ratingslip | Finance ledger is source of truth |
| cash_out*   | player_financial_transaction (planned?)   | PlayerFinancialService | N/A (ensure in PFT only)    | Symmetry for reconciliation                 |
```

**Decision Framework**:
- **Telemetry**: Derived metrics, performance data, read-only caches
- **Financial**: Monetary transactions, balances, reconciliation data

#### 2. RatingSlip Decision: Remove vs Denormalize (Days 2-3)
**Choose one**:
- **Option A (Preferred)**: Remove financial fields from `ratingslip`
  - Provide compatibility **VIEW** (not materialized) for existing queries
  - Add indexes to `player_financial_transaction` for performance
  - Defer materialization until p95 query time >100ms
- **Option B**: Keep fields with documented denormalization pattern
  - Requires ADR justifying business need
  - Must document sync mechanism and consistency guarantees

**If Option A chosen**:
```sql
-- Compatibility view (not materialized by default)
CREATE VIEW ratingslip_with_financials AS
SELECT r.*, pft.cash_in, pft.chips_brought, pft.chips_taken
FROM ratingslip r
LEFT JOIN player_financial_transaction pft ON r.visit_id = pft.visit_id;

-- Indexes for performance
CREATE INDEX idx_pft_visit_id ON player_financial_transaction(visit_id);
```

**ADR-006 only if removal chosen**:
```markdown
# ADR-006: RatingSlip Financial Field Removal

## Decision
Remove cash_in, chips_brought, chips_taken from `ratingslip`.

## Implementation
1. Create compatibility view (plain view, not materialized)
2. Add indexes to player_financial_transaction
3. Update queries to use view or join directly
4. Promote to materialized view only if p95 >100ms

## Rollback
View preserves exact same schema, zero breaking changes.
```

#### 3. Visit-to-Finance Interface (Day 4)
Document read-model pattern for visit financial aggregates.

**Output Section in Matrix**:
```markdown
### Visit ↔ PlayerFinancial Interface

**Visit Service**: READS financial aggregates (via view), NEVER writes
**PlayerFinancialService**: WRITES source transactions, MAINTAINS views

**View Pattern** (start with plain view + indexes):
CREATE VIEW visit_financial_summary AS
SELECT visit_id, SUM(cash_in) as total_cash_in, ...
FROM player_financial_transaction
GROUP BY visit_id;
```

### Phase B Success Criteria (PR Checklist)

- ✅ Financial Ownership Table: Every monetary field → one owning service
- ✅ RatingSlip decision documented (removal OR denormalization with ADR)
- ✅ Compatibility view provided if removal chosen
- ✅ Visit interface pattern documented (plain view by default)
- ✅ Performance benchmarked (<100ms p95 for views)
- ✅ One owner + one reviewer sign-off

**Approval**: Architecture lead + Database lead (no ARB multi-gate)

---

## Phase C: Type Integrity (2-3 weeks)

### Objective
Migrate `mtl_entry.patron_id` from TEXT to UUID with zero data loss.

**Philosophy**: Keep rigor here—identity/UUID changes are high-risk and deserve phased execution.

### ADR-007: MTL Patron UUID Migration

**Addresses**: Issue #2
**Effort**: 2-3 weeks
**Owner**: Database Team + 1 Reviewer

**Strategy**: Dual-column migration with 4 phases + minimal monitoring windows.

### Migration Phases

#### Phase 1: Add UUID Column (2 days)
```sql
ALTER TABLE mtl_entry ADD COLUMN patron_uuid UUID;
-- Backfill from player.id
UPDATE mtl_entry SET patron_uuid = patron_id::uuid;
-- Validate 100% conversion
SELECT COUNT(*) FROM mtl_entry WHERE patron_uuid IS NULL; -- Must be 0
```

**Go/No-Go**: 100% backfill success (zero NULL values)

---

#### Phase 2: Dual-Write (3 days)
- Update application to write both `patron_id` (TEXT) and `patron_uuid` (UUID)
- Monitor for discrepancies: `patron_id::uuid != patron_uuid`
- **Validation Window**: 2-3 days (not 1 week)

**Go/No-Go**: Zero discrepancies for 2 days straight

---

#### Phase 3: Migrate Consumers (5 days)
- Update views to read from `patron_uuid`
- Update queries in application code
- Deploy with backwards compatibility

**Validation Window**: 2-3 days (not 1 week)

**Go/No-Go**: All views functional, zero errors in logs

---

#### Phase 4: Drop TEXT Column (2 days)
```sql
ALTER TABLE mtl_entry DROP COLUMN patron_id;
ALTER TABLE mtl_entry RENAME COLUMN patron_uuid TO patron_id;
```

**Validation Window**: 2-3 days post-cutover

**Go/No-Go**: Zero errors, all queries using UUID

---

### Rollback Strategy

Each phase is reversible:
- **Phase 1-2**: Simply halt, no harm done
- **Phase 3**: Keep TEXT column, rollback view changes (1-hour operation)
- **Phase 4**: Blocked until 100% validation passes

### ADR-007 Document

```markdown
# ADR-007: MTL Patron ID UUID Migration

## Decision
Migrate `mtl_entry.patron_id` from TEXT to UUID using dual-column approach.

## Rationale
Current TEXT type requires `player.id::text` casts, violating UUID identity contract.

## Implementation
4-phase migration: Add UUID → Dual-write → Migrate consumers → Drop TEXT
Validation gates at each phase with 2-3 day monitoring windows.

## Rollback
Each phase reversible. TEXT column retained until Phase 4 validation passes.

## Consequences
- Breaking changes: Views, queries with ::text casts
- Performance: UUID more efficient than TEXT
- Timeline: 2-3 weeks with conservative validation
```

### Phase C Success Criteria

- ✅ ADR-007 approved by Database lead + 1 reviewer
- ✅ All 4 migration phases completed successfully
- ✅ Zero data loss or corruption (100% backfill validated)
- ✅ `mtl_entry.patron_id` is UUID type in final schema
- ✅ All queries updated, zero ::text casts remain
- ✅ Discrepancy rate = 0% during dual-write window
- ✅ Rollback tested at Phase 2 gate

**Approval**: Database lead + Architecture lead (no multi-stakeholder ARB)

**Timeline**: 2-3 weeks (vs 3-4 weeks in original)

---


## Validation Framework (Simplified)

### Pre-Phase Checklist
Before starting any phase:
1. ✅ `npm run db:types` passes (schema current)
2. ✅ Previous phase PR merged (if applicable)

### Per-Phase Validation
Each phase PR must pass:
1. ✅ `npm run validate:matrix-schema` (zero conflicts, zero orphans)
2. ✅ PR checklist completed (see each phase's success criteria)
3. ✅ One owner + one reviewer approval

### Final Validation (Post-Phase C)
1. ✅ All 8 audit issues resolved (verify in matrix)
2. ✅ Update matrix version: v2.3.0 → v2.4.0
3. ✅ Optional: Publish compliance summary (not required)

---

## Tooling Requirements (Minimal)

### Single Validation Script

**File**: `scripts/validate_matrix_schema.ts`
**Purpose**: Thin checker for essential validations only
**Expand**: Only if new gaps emerge

```typescript
// scripts/validate_matrix_schema.ts
import { Database } from '../types/database.types';
import fs from 'fs';

interface ValidationResult {
  orphanedReferences: string[];  // Matrix → non-existent tables
  duplicateOwnership: string[];  // Same table claimed by >1 service
  success: boolean;
}

export function validateMatrixSchema(): ValidationResult {
  // 1. Extract tables from types/database.types.ts
  // 2. Parse SERVICE_RESPONSIBILITY_MATRIX.md for ownership claims
  // 3. Fail on duplicates or orphans
  // Exit code 0 if pass, 1 if fail
}
```

**Usage**:
```bash
npm run validate:matrix-schema

# Output on pass:
# ✅ 52 tables validated
# ✅ Zero duplicate ownership
# ✅ Zero orphaned references

# Output on fail:
# ❌ Duplicate ownership: casino_settings (Casino line 126, MTL line 438)
# ❌ Orphaned reference: legacy_table (not in schema)
```

**Add to package.json**:
```json
{
  "scripts": {
    "validate:matrix-schema": "tsx scripts/validate_matrix_schema.ts"
  }
}
```

---

## Governance (Simplified)

### Approval Structure

**One Owner + One Reviewer** per phase (no ARB/multi-gate)

| Phase | Owner | Reviewer | Approval Required |
|-------|-------|----------|-------------------|
| Phase A | Architecture Lead | Documentation Lead | PR approval |
| Phase B | Architecture Lead | Database Lead | PR approval |
| Phase C | Database Lead | Architecture Lead | PR approval per migration phase |

### Escalation (Rare Cases Only)
- **Ownership Disputes**: Architecture Lead decides (no ARB committee)
- **Migration Blockers**: Database Lead + Architecture Lead decide hold/pivot
- **Technical Issues**: Solve in PR comments, escalate to leads if needed

### Communication (Lightweight)
- **Pre-Phase**: Open PR with phase checklist
- **During Phase**: Updates in PR comments
- **Post-Phase**: Merge PR (approval = sign-off, no separate report)

---

## Risk Management (Focused)

### Where Rigor Matters

#### Phase C: UUID Migration (High-Risk)
- **Risk**: Data loss, breaking changes
- **Mitigation**: 4-phase rollout with 2-3 day validation windows
- **Rollback**: Each phase reversible, TEXT column retained until final validation

#### Phase B: Financial Boundaries (Medium-Risk)
- **Risk**: Breaking existing queries/reports
- **Mitigation**: Compatibility view (not materialized by default), performance benchmarks
- **Rollback**: View preserves schema compatibility indefinitely

### Where It's Light

#### Phase A: Documentation (Low-Risk)
- **Risk**: Minimal (doc-only changes)
- **Mitigation**: Code audit for ownership conflicts before matrix update
- **Rollback**: Git revert (instant)

---

## Success Metrics (Simplified)

### Must-Pass Criteria

| Phase | Success Indicator | Validation |
|-------|------------------|------------|
| Phase A | Zero duplicate ownership, zero orphans | `npm run validate:matrix-schema` |
| Phase B | <100ms p95 for views, all queries functional | Performance benchmarks |
| Phase C | Zero discrepancies during dual-write, 100% backfill | Validation script |

### Acceptance

A phase is complete when:
- ✅ Validation script passes
- ✅ PR checklist complete
- ✅ One owner + one reviewer approved PR

---

## Timeline & Resource Allocation (Lean)

### Phase A: Decide & Document (1 week)
| Tasks | Effort | Team |
|-------|--------|------|
| Schema appendix, ownership, temporal, performance, checklist | 32 hours | Arch Lead + 1 person |

**Calendar**: 5 business days | **Output**: Single PR to matrix

---

### Phase B: Boundaries (1 week)
| Tasks | Effort | Team |
|-------|--------|------|
| Financial ownership table, RatingSlip decision, Visit interface | 40 hours | Arch + DB Team |

**Calendar**: 5 business days | **Output**: Matrix updates + ADR-006 (if removal)

---

### Phase C: Type Integrity (2-3 weeks)
| Tasks | Effort | Team |
|-------|--------|------|
| UUID migration (4 phases with 2-3 day validation windows) | 80 hours | DB Team + Dev |

**Calendar**: 10-15 business days | **Output**: UUID schema + validation

---

### Overall Timeline Summary

| Phase | Calendar Days | Person-Weeks |
|-------|---------------|--------------|
| Phase A | 5 | 0.8 |
| Phase B | 5 | 1.0 |
| Phase C | 10-15 | 2.0 |
| **Total** | **20-25 days (4-5 weeks)** | **3.8 weeks** |

**Efficiency Gain**: 50% reduction from original 7-10 week plan

**Target Completion**: Mid-November 2025 (assuming start late October)

---

## Appendix: PR Checklist Template

Copy this checklist into each phase's PR description:

### Phase A PR Checklist
```markdown
- [ ] Schema appendix maps all 50+ tables to services
- [ ] Zero duplicate ownership (`npm run validate:matrix-schema` passes)
- [ ] Zero orphaned references (matrix → non-existent tables)
- [ ] Temporal authority documented (Casino owns, MTL consumes)
- [ ] Performance context section added
- [ ] Remediation checklist updated (Phase A/B/C status)
- [ ] One owner + one reviewer approval
```

### Phase B PR Checklist
```markdown
- [ ] Financial Ownership Table complete (every monetary field → one service)
- [ ] RatingSlip decision documented (removal OR denormalization with justification)
- [ ] Compatibility view provided if removal chosen
- [ ] Visit interface pattern documented (plain view by default)
- [ ] Performance benchmarked (<100ms p95 for views)
- [ ] `npm run validate:matrix-schema` passes
- [ ] One owner + one reviewer approval
```

### Phase C PR Checklist (Per Migration Phase)
```markdown
**Phase 1: Add UUID Column**
- [ ] patron_uuid column added to mtl_entry
- [ ] 100% backfill success (zero NULL values)
- [ ] Validation: `SELECT COUNT(*) FROM mtl_entry WHERE patron_uuid IS NULL` = 0

**Phase 2: Dual-Write**
- [ ] Application writes both patron_id (TEXT) and patron_uuid (UUID)
- [ ] Zero discrepancies for 2 days: `patron_id::uuid != patron_uuid`
- [ ] Monitoring in place

**Phase 3: Migrate Consumers**
- [ ] Views updated to read from patron_uuid
- [ ] Application queries updated
- [ ] All views functional, zero errors in logs
- [ ] 2-3 day validation window passed

**Phase 4: Drop TEXT**
- [ ] TEXT column dropped
- [ ] patron_uuid renamed to patron_id
- [ ] All queries using UUID (zero ::text casts)
- [ ] 2-3 day post-cutover validation passed
- [ ] Final approval: Database lead + Architecture lead
```

---

## Document Control

**Version**: 2.0.0 (Lean Edition)
**Author**: Architecture Team
**Based On**: [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md) + [overengineering.md](./overengineering.md)
**Approval**: Architecture Lead

**Changelog**:
- 2025-10-20: v1.0.0 - Initial 4-wave workflow (7-10 weeks)
- 2025-10-20: v2.0.0 - Lean 3-phase workflow (4-5 weeks)
  - Consolidated 4 waves into 3 phases
  - Removed multi-gate approval (now: 1 owner + 1 reviewer)
  - Simplified tooling (3 scripts → 1 validator)
  - Plain views by default (defer materialization)
  - PR-based sign-off (no separate reports)
  - 50% timeline reduction

---

## References

1. [SERVICE_RESPONSIBILITY_MATRIX.md](./SERVICE_RESPONSIBILITY_MATRIX.md) - Source document
2. [RESPONSIBILIY_MATRIX_AUDIT.md](./RESPONSIBILIY_MATRIX_AUDIT.md) - 8 issues identified
3. [overengineering.md](./overengineering.md) - Lean approach guidance
4. [types/database.types.ts](../../types/database.types.ts) - Canonical schema

**Questions**: Contact Architecture Lead or Database Lead
