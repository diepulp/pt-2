# Governance & Patterns Analysis - Agent 5 Findings

**Analysis Date**: 2025-11-14
**Agent**: Agent 5 - Governance & Patterns Agent
**Scope**: DTO contracts, domain modeling patterns, service factories, error handling, CI tooling
**Documents Analyzed**:
- SERVICE_RESPONSIBILITY_MATRIX.md v3.1.0 (2118 lines)
- DOCUMENTATION_DRIFT_REPORT_2025-11-13.md
- DTO_CANONICAL_STANDARD.md
- SERVICE_TEMPLATE.md v1.2
- ERROR_TAXONOMY_AND_RESILIENCE.md
- SDLC_TAXONOMY_EXTENSION_AUDIT_2025-11-14.md
- Existing ESLint rules in .eslint-rules/
- ANTI_PATTERN_CATALOG.md

**Status**: RESEARCH COMPLETE - NO FILES CREATED

---

## Executive Summary

### Critical Finding
The SRM has comprehensive DTO contract policy (lines 18-243) that is **already well-documented** but **fragmented across multiple locations**. The proposed 70-governance/ enhancements would create valuable **modular documentation** by extracting and consolidating existing scattered patterns.

### Key Insights
1. **DTO Documentation** is mature but inconsistently applied (dto.ts vs dtos.ts naming drift)
2. **Domain Modeling Patterns** exist but are embedded in 2100+ line SRM monolith
3. **Error Handling** has comprehensive taxonomy in ERROR_TAXONOMY_AND_RESILIENCE.md
4. **CI Tooling** has 4 ESLint rules implemented but lacks documentation
5. **Service Factory Pattern** is well-defined but documentation is scattered

---

## 1. SRM DTO Policy Analysis (Lines 18-243)

### Content Extraction Feasibility: ✅ EXCELLENT

**Location**: Lines 18-243 of SERVICE_RESPONSIBILITY_MATRIX.md v3.1.0

**Current Structure**:
```markdown
Line 18-48:  Contract Policy (Canonical)
Line 49-71:  Table Ownership → DTO Ownership
Line 72-114: Bounded Context DTO Access Rules (9 allowed patterns)
Line 115-155: Contract-First DTO Pattern (Complex Services)
Line 156-196: Canonical DTO Pattern (Simple CRUD)
Line 197-236: Hybrid DTO Pattern (RatingSlip)
Line 237-250: Column Exposure Policy
```

### Strengths

1. **Comprehensive Ownership Matrix** (Lines 59-69):
   - Maps 9 services to owned tables
   - Explicit DTO export requirements
   - Clear file location: `services/{service}/dtos.ts` (plural)

2. **Cross-Context Consumption Matrix** (Lines 81-93):
   - 9 allowed cross-context DTO import patterns
   - SRM reference for each pattern
   - Explicit CORRECT vs FORBIDDEN examples

3. **Three DTO Derivation Patterns**:
   - **Contract-First** (Loyalty, Finance, MTL, TableContext)
   - **Canonical** (Player, Visit, Casino) - Pick/Omit from Database
   - **Hybrid** (RatingSlip) - Mixed approach

4. **Mapper Pattern Documentation** (Lines 120-134, 223-233):
   - Clear internal-only usage
   - Explicit field omission rationale
   - Separation of database schema from domain contracts

### Gaps

1. **File Naming Inconsistency**:
   - SRM specifies `dtos.ts` (plural) at line 71
   - SERVICE_TEMPLATE.md uses `dto.ts` (singular)
   - DOCUMENTATION_DRIFT_REPORT identifies this as CRITICAL-001

2. **Enforcement Documentation**:
   - ESLint rules exist (.eslint-rules/) but not documented in SRM
   - CI gates referenced but implementation not specified

---

## 2. DTO Documentation Assessment (25-api-data/)

### Current State

**Existing Files**:
- `DTO_CANONICAL_STANDARD.md` (779 lines) - Comprehensive type system guide
- `API_SURFACE_MVP.md` - API contracts
- `OPENAPI_USAGE.md`, `OPENAPI_QUICKSTART.md` - API tooling

**Missing Files** (referenced but don't exist):
- `DTO_CATALOG.md` - Referenced by EDGE_TRANSPORT_POLICY.md (lines 70, 99)

### Proposed Enhancements

#### **DTO_CATALOG.md** - Priority: P0 (CRITICAL)

**Necessity**: HIGH - Already referenced by 3 canonical documents

**Proposed Structure**:
```markdown
# DTO Catalog - Cross-Reference Registry

## Casino Service DTOs
- CasinoDTO (SRM:line, dtos.ts:line)
- CasinoSettingsDTO (SRM:line, dtos.ts:line)
- StaffDTO (SRM:line, dtos.ts:line)

## Player Service DTOs
- PlayerDTO (SRM:line, dtos.ts:line)
- PlayerEnrollmentDTO (SRM:line, dtos.ts:line)

[... for all 9 services]

## Cross-Context Consumption Matrix
- RatingSlipTelemetryDTO consumed by: Loyalty, Finance
- VisitDTO consumed by: Loyalty, Finance, MTL
[... 9 patterns from SRM:81-93]
```

**Source Content**: Extract from SRM lines 59-93

**Value**:
- Single source of truth for DTO locations
- Eliminates "where is this DTO defined?" confusion
- Supports ESLint cross-context violation detection

---

#### **DTO_CANONICAL_STANDARD.md** - Update Required

**Current Status**: Excellent foundation (779 lines)

**Required Updates**:
1. **File Naming Convention** (address CRITICAL-001):
   ```markdown
   ## File Naming Standard
   **REQUIRED**: `dtos.ts` (plural)
   **BANNED**: `dto.ts` (singular)

   Rationale: Consistency with SRM v3.1.0 line 71
   ```

2. **Three Pattern Decision Tree** (extract from SRM lines 117-236):
   ```markdown
   ## When to Use Each Pattern

   ### Contract-First (Complex Bounded Contexts)
   Services: Loyalty, Finance, MTL, TableContext
   Use when: Domain contract must be decoupled from schema

   ### Canonical (Simple CRUD)
   Services: Player, Visit, Casino
   Use when: Direct schema mapping is appropriate

   ### Hybrid (Mixed Complexity)
   Services: RatingSlip
   Use when: Internal DTOs are canonical, published DTOs need transformation
   ```

3. **Mapper Pattern Reference** (link to GOV-PAT-002):
   ```markdown
   ## Mapper Functions
   See: docs/70-governance/patterns/domain-modeling/GOV-PAT-002-mapper-pattern.md

   Required for: Contract-First and Hybrid patterns
   File location: services/{service}/mappers.ts
   ```

**Source Content**: SRM lines 115-236, DOCUMENTATION_DRIFT CRITICAL-002

---

## 3. Domain Modeling Patterns Assessment

### Proposed Documents (GOV-PAT-001 through GOV-PAT-004)

#### **GOV-PAT-001: Service Factory Pattern** - Priority: P1

**Feasibility**: EXCELLENT - Pattern is mature and consistently applied

**Source Content Locations**:
- SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md lines 808-843 (service factory pattern)
- SERVICE_TEMPLATE.md lines 113-131 (factory example)
- ANTI_PATTERN_CATALOG.md lines 9-75 (anti-patterns)
- SRM lines 889-893 (service layer isolation guidance)

**Proposed Structure**:
```markdown
# GOV-PAT-001: Service Factory Pattern

## Canonical Pattern

### 1. Explicit Interface Declaration
REQUIRED: Export interface, not ReturnType inference

### 2. Functional Factory Implementation
REQUIRED: Function returning interface-compliant object

### 3. Typed Supabase Client
REQUIRED: SupabaseClient<Database>, never 'any'

### 4. Module Composition
Pattern: Compose from CRUD, business, queries modules

## Anti-Patterns
- Class-based services (BANNED)
- ReturnType<typeof createXService> (BANNED)
- Singleton factories (BANNED)
- Global stateful factories (BANNED)

## Examples
[Extract from SERVICE_TEMPLATE.md lines 113-131]
```

**Value**:
- Centralizes scattered factory guidance
- Clear decision criteria for new services
- Enforces architectural consistency

---

#### **GOV-PAT-002: Mapper Pattern** - Priority: P0 (CRITICAL)

**Feasibility**: EXCELLENT - Addresses DOCUMENTATION_DRIFT CRITICAL-003

**Source Content Locations**:
- SRM lines 120-134 (Contract-First mapper example)
- SRM lines 223-233 (Hybrid mapper example)
- DTO_CANONICAL_STANDARD.md lines 514-613 (Contract-First pattern section)

**Proposed Structure**:
```markdown
# GOV-PAT-002: Mapper Pattern - When and How

## When to Use Mappers

### Required For:
1. Contract-First DTOs (Loyalty, Finance, MTL, TableContext)
2. Hybrid DTOs (RatingSlip published contracts)

### NOT Required For:
- Canonical DTOs (Player, Visit, Casino) - use Pick/Omit directly

## File Structure
Location: services/{service}/mappers.ts
Scope: INTERNAL USE ONLY (never exported cross-context)

## Pattern: Database Row → DTO
[Extract SRM lines 120-134 example]

## Pattern: DTO → Database Insert
[Extract DTO_CANONICAL_STANDARD lines 563-574 example]

## Column Exposure Control
Rule: Explicit omission with rationale
[Extract SRM lines 237-250]
```

**Value**:
- Closes CRITICAL-003 gap identified in DOCUMENTATION_DRIFT_REPORT
- Provides clear guidance for complex services
- Prevents internal field leakage

---

#### **GOV-PAT-003: DTO Ownership Rules** - Priority: P1

**Feasibility**: EXCELLENT - Direct extraction from SRM

**Source Content Locations**:
- SRM lines 49-71 (Table Ownership → DTO Ownership)
- SRM lines 237-250 (Column Exposure Policy)

**Proposed Structure**:
```markdown
# GOV-PAT-003: DTO Ownership Rules

## Ownership Principle
Rule: Service that OWNS a table in SRM MUST provide canonical DTOs

## Ownership Matrix
[Extract SRM lines 59-69]

| Service | Owns Tables | MUST Export DTOs |
|---------|-------------|------------------|
| Casino  | casino, casino_settings, staff | CasinoDTO, StaffDTO, ... |
[... complete table]

## File Location Standard
REQUIRED: services/{service}/dtos.ts (plural)

## Column Exposure Policy
REQUIRED: JSDoc template for all DTOs
[Extract SRM lines 237-250]

## Validation
ESLint Rule: no-cross-context-db-imports
Pre-commit Hook: Verify dtos.ts exists for all services
```

**Value**:
- Clear ownership boundaries
- Prevents "who owns this DTO?" confusion
- Supports automated compliance checks

---

#### **GOV-PAT-004: Bounded Context Communication** - Priority: P1

**Feasibility**: EXCELLENT - Addresses CRITICAL-004 from DOCUMENTATION_DRIFT_REPORT

**Source Content Locations**:
- SRM lines 72-114 (Bounded Context DTO Access Rules)
- SRM lines 889-893 (Service Layer Isolation)
- DTO_CANONICAL_STANDARD.md lines 166-233 (no-cross-context-db-imports rule)

**Proposed Structure**:
```markdown
# GOV-PAT-004: Bounded Context Communication

## Core Principle
RULE: Services MUST NOT directly access Database types for tables they don't own

## Cross-Context DTO Consumption (Allowed Patterns)

[Extract SRM lines 81-93]

| Consumer | Can Import From | Use Case | SRM Ref |
|----------|----------------|----------|---------|
| Loyalty  | RatingSlip (RatingSlipTelemetryDTO) | Mid-session rewards | SRM:358 |
[... 9 patterns]

## Correct Pattern
[Extract SRM lines 95-104 example]

## Forbidden Pattern
[Extract SRM lines 106-113 example]

## Enforcement
ESLint Rule: no-cross-context-db-imports
Implementation: .eslint-rules/no-cross-context-db-imports.js

## Service Boundary Notes
[Extract SRM lines 968-970, 889-893]
```

**Value**:
- Prevents bounded context violations
- Clear allowed cross-context patterns
- Eliminates vague "published views" references

---

## 4. Error Handling Patterns Assessment

### Current State: EXCELLENT

**Existing Documentation**:
- `ERROR_TAXONOMY_AND_RESILIENCE.md` (comprehensive, 100+ lines)
- SERVICE_TEMPLATE.md lines 417-435 (error code catalog)

### Proposed Documents (GOV-ERR-001 through GOV-ERR-003)

#### **GOV-ERR-001: Error Taxonomy** - Priority: P2

**Status**: DUPLICATE - Already comprehensively documented

**Recommendation**: **DO NOT CREATE** - Instead:
1. Reference ERROR_TAXONOMY_AND_RESILIENCE.md from SERVICE_TEMPLATE.md
2. Add cross-reference in INDEX.md under "Error Handling"

**Rationale**:
- ERROR_TAXONOMY_AND_RESILIENCE.md is complete (lines 1-100)
- Creating GOV-ERR-001 would violate DRY principle
- Current doc has excellent examples and anti-patterns

---

#### **GOV-ERR-002: Error Response Standard** - Priority: P3

**Status**: PARTIAL - ServiceHttpResult documented in multiple places

**Source Content Locations**:
- DOCUMENTATION_DRIFT_REPORT lines 240-291 (ServiceHttpResult contract)
- SERVICE_TEMPLATE.md lines 211-220 (ServiceResult)
- SERVICE_LAYER_ARCHITECTURE_DIAGRAM (ServiceHttpResult examples)

**Recommendation**: **LOW PRIORITY** - Consider consolidating if:
- HTTP boundary transformation needs clarification
- toServiceHttpResponse() helper needs documentation

**Proposed Structure** (if created):
```markdown
# GOV-ERR-002: Error Response Standard

## Internal Envelope (Service Layer)
ServiceResult<T> contract
[Extract from SERVICE_TEMPLATE lines 211-220]

## External Envelope (HTTP Boundary)
ServiceHttpResult<T> contract
[Extract from DOCUMENTATION_DRIFT lines 260-272]

## Transformation
toServiceHttpResponse() helper
[Extract examples from SERVICE_LAYER_ARCHITECTURE_DIAGRAM]
```

---

#### **GOV-ERR-003: Error Logging Policy** - Priority: P2

**Status**: PARTIAL - Scattered across observability docs

**Source Content Locations**:
- ERROR_TAXONOMY_AND_RESILIENCE.md (PII scrubbing references)
- SRM line 33 (correlation ID propagation)
- OBSERVABILITY_SPEC.md (correlation ID patterns)

**Recommendation**: **USEFUL** - Consolidate logging patterns

**Proposed Structure**:
```markdown
# GOV-ERR-003: Error Logging Policy

## Correlation ID Propagation
[Extract SRM line 33]

## PII Scrubbing
[Extract from ERROR_TAXONOMY_AND_RESILIENCE]

## Log Levels
- ERROR: 5xx responses, domain errors
- WARN: 4xx responses, validation failures
- INFO: Successful operations with metadata

## Structured Logging Format
{
  ts, actor_id, casino_id, domain, action,
  correlation_id, error_code, error_message
}
```

**Value**:
- Centralized logging guidance
- Prevents PII leakage in logs
- Supports observability requirements

---

## 5. CI Tooling Documentation Assessment

### Current State: IMPLEMENTATION EXISTS, DOCUMENTATION MISSING

**Implemented Tooling** (.eslint-rules/):
1. `no-manual-dto-interfaces.js` - Syntax validation
2. `no-cross-context-db-imports.js` - Bounded context enforcement
3. `dto-column-allowlist.js` - Field-level security
4. `no-return-type-inference.js` - Type system integrity

**Missing**: Documentation for these tools

### Proposed Documents (GOV-TOOL-001 through GOV-TOOL-003)

#### **GOV-TOOL-001: CI Validation Scripts** - Priority: P1

**Feasibility**: EXCELLENT - Implementations exist, need documentation

**Source Content Locations**:
- DTO_CANONICAL_STANDARD.md lines 149-342 (ESLint rules specification)
- .eslint-rules/ directory (actual implementations)
- DOCUMENTATION_DRIFT_REPORT lines 540-605 (validation plan)

**Proposed Structure**:
```markdown
# GOV-TOOL-001: CI Validation Scripts

## 1. validate-srm-ownership.js
Purpose: Ensure services only access owned tables
Implementation: [Link to .eslint-rules/no-cross-context-db-imports.js]
Usage: npm run validate:ownership

## 2. validate-dto-fields.js
Purpose: Enforce column allowlist for sensitive tables
Implementation: [Link to .eslint-rules/dto-column-allowlist.js]
Usage: npm run validate:dto-fields

## 3. validate-service-structure.py
Purpose: Check for dtos.ts (plural), mappers.ts in complex services
Referenced in: DOCUMENTATION_DRIFT lines 559-567
Status: TO BE IMPLEMENTED

## GitHub Actions Integration
[Extract from DTO_CANONICAL_STANDARD lines 325-341]
```

**Value**:
- Documents existing tooling
- Provides usage examples
- Supports onboarding

---

#### **GOV-TOOL-002: Pre-Commit Hooks** - Priority: P1

**Feasibility**: EXCELLENT - Implementation patterns exist

**Source Content Locations**:
- DTO_CANONICAL_STANDARD.md lines 299-318 (pre-commit hook specification)
- DOCUMENTATION_DRIFT_REPORT lines 592-605 (validation gates)

**Proposed Structure**:
```markdown
# GOV-TOOL-002: Pre-Commit Hooks

## Hook: ESLint DTO Compliance
File: .husky/pre-commit-service-check.sh
Checks:
- no-manual-dto-interfaces
- no-cross-context-db-imports
- dto-column-allowlist

## Hook: Type Checking
npm run type-check

## Hook: File Naming Validation
Check for dto.ts (singular) - FAIL
Require dtos.ts (plural) - PASS

## Bypass (Emergency Only)
git commit --no-verify
Usage: Document reason in commit message
```

**Value**:
- Prevents violations from entering codebase
- Fast feedback loop for developers
- Complements CI gates

---

#### **GOV-TOOL-003: Schema Verification Test** - Priority: P0

**Feasibility**: EXCELLENT - Critical for type safety

**Source Content Locations**:
- CLAUDE.md line 22 (schema verification MUST pass before merge)
- DTO_CANONICAL_STANDARD.md lines 689-728 (automatic schema sync)
- SRM line 18 (contract-first policy)

**Proposed Structure**:
```markdown
# GOV-TOOL-003: Schema Verification Test

## Purpose
Ensure generated types match deployed schema

## Workflow
1. Run migration: npx supabase migration up
2. Regenerate types: npm run db:types
3. Run verification: npm run test:schema-verify

## Verification Checks
- All SRM-defined tables exist
- All DTO Pick<> references resolve
- No manual DTO interfaces (ESLint)
- RLS policies present per SEC-001

## CI Gate
REQUIRED: Schema verification MUST pass before PR merge
Reference: CLAUDE.md line 22

## Implementation
[Spec for test that compares SRM ownership matrix to schema]
```

**Value**:
- Prevents schema/code drift
- Catches missing migrations
- Critical for CLAUDE.md compliance

---

## 6. Service Factory Pattern Needs

### Current State: WELL-DOCUMENTED, SCATTERED

**Existing Documentation Locations**:
- SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md lines 808-843
- SERVICE_TEMPLATE.md lines 113-131
- ANTI_PATTERN_CATALOG.md lines 9-75
- SRM lines 889-893

### Recommended Action: CONSOLIDATE to GOV-PAT-001

**Current Gaps**:
1. No single source of truth for factory pattern
2. Anti-patterns duplicated across docs
3. No decision tree for when to use composition

**Content to Extract**:

```markdown
# Service Factory Pattern Consolidation

## From SERVICE_LAYER_ARCHITECTURE_DIAGRAM (lines 808-843):
- Functional factory canonical example
- Typed SupabaseClient requirement
- Interface declaration requirement

## From SERVICE_TEMPLATE.md (lines 113-131):
- Factory composition pattern
- Module structure (crud, business, queries)

## From ANTI_PATTERN_CATALOG.md (lines 9-75):
- Class-based services (BANNED)
- ReturnType inference (BANNED)
- Singleton factories (BANNED)
- Type casting bypasses (BANNED)

## From SRM (lines 889-893):
- Service layer isolation principles
- Cross-context interaction via DTOs/RPCs
- Transport-to-service boundaries
```

**Proposed GOV-PAT-001 Enhancements**:
1. **Decision Tree**: When to split into multiple modules
2. **Composition Patterns**: How to compose CRUD + business + queries
3. **Testing Implications**: How factory pattern supports test doubles
4. **Anti-Pattern Reference**: Link to ANTI_PATTERN_CATALOG.md

---

## 7. Mapper Pattern Needs

### Current State: DOCUMENTED in SRM, MISSING from SERVICE_TEMPLATE

**Gap Identified**: DOCUMENTATION_DRIFT CRITICAL-003

**Current Documentation**:
- SRM lines 120-134 (Contract-First mapper example)
- SRM lines 223-233 (Hybrid mapper example)
- DTO_CANONICAL_STANDARD.md lines 545-574 (mapper implementation)

**Missing**:
- SERVICE_TEMPLATE.md has NO mention of mappers.ts
- File structure (lines 43-59) doesn't include mappers.ts
- No guidance on when mappers are required

### Recommended Action: CREATE GOV-PAT-002 + UPDATE SERVICE_TEMPLATE.md

**GOV-PAT-002 Content Needs**:

```markdown
# Mapper Pattern - Complete Guide

## 1. When Required
- Contract-First DTOs (Loyalty, Finance, MTL, TableContext)
- Hybrid DTOs (RatingSlip published contracts)
- NOT required for Canonical DTOs (use Pick/Omit)

## 2. File Location
services/{service}/mappers.ts
Scope: INTERNAL USE ONLY

## 3. Pattern: Row → DTO
[SRM lines 120-134 example]
toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO

## 4. Pattern: DTO → Insert
[DTO_CANONICAL_STANDARD lines 563-574 example]
toPlayerLoyaltyInsert(dto): Insert

## 5. Column Omission Rules
REQUIRED: Explicit rationale for omitted fields
Example: "Omit: preferences (internal-only field)"

## 6. Testing
Mappers MUST have unit tests
Test: Field transformations, omissions, default values
```

**SERVICE_TEMPLATE.md Updates Needed**:

```diff
Line 51: Add mappers.ts to file structure
+ ├── mappers.ts              # (if Contract-First or Hybrid)

Line 120: Add mapper reference in factory example
+ // For complex services, import mappers
+ import { toPlayerLoyaltyDTO } from './mappers';

Line 450: Add to checklist
+ [ ] Mappers.ts present for Contract-First/Hybrid services
```

---

## 8. Concerns and Risks

### Concern 1: Documentation Fragmentation

**Issue**: Creating 10+ new governance docs could scatter knowledge

**Mitigation**:
- Create comprehensive INDEX.md updates
- Add cross-references in each doc
- Use consistent "See Also" sections

**Recommendation**: Prioritize GOV-PAT and GOV-TOOL docs; defer GOV-ERR docs

---

### Concern 2: Maintenance Burden

**Issue**: More docs = more drift potential

**Mitigation**:
- Each doc MUST reference source (SRM lines, etc.)
- Add "Last Verified" dates
- Include in schema verification test (GOV-TOOL-003)

**Recommendation**: Mark SRM sections as "EXTRACTED to GOV-PAT-xxx" to prevent duplication

---

### Concern 3: Overlap with Existing Docs

**Issue**: ERROR_TAXONOMY_AND_RESILIENCE.md already covers GOV-ERR-001

**Mitigation**:
- Don't create GOV-ERR-001 (duplicate)
- Reference existing docs instead
- Focus on gaps, not redundancy

**Recommendation**: Create GOV-ERR-003 only; skip GOV-ERR-001 and GOV-ERR-002

---

### Concern 4: SRM Still Too Large After Extraction

**Issue**: SRM is 2118 lines; extraction won't shrink it enough

**Mitigation**:
- Phase 1: Extract to GOV-PAT docs (keep SRM policy statements)
- Phase 2: Convert SRM to "Bounded Context Registry" (reference pattern docs)
- Phase 3: Move schema examples to separate files

**Recommendation**: Follow SDLC_TAXONOMY_EXTENSION_AUDIT phased approach

---

## 9. Implementation Priority Matrix

| Document | Priority | Effort | Value | Rationale |
|----------|----------|--------|-------|-----------|
| **DTO_CATALOG.md** | P0 | Low | High | Already referenced by 3 docs |
| **GOV-PAT-002** (Mapper) | P0 | Medium | High | Closes CRITICAL-003 gap |
| **GOV-TOOL-003** (Schema Verify) | P0 | High | Critical | CLAUDE.md compliance |
| **GOV-PAT-003** (DTO Ownership) | P1 | Low | High | Direct SRM extraction |
| **GOV-PAT-004** (Bounded Context) | P1 | Low | High | Closes CRITICAL-004 gap |
| **GOV-PAT-001** (Service Factory) | P1 | Medium | Medium | Consolidates scattered docs |
| **GOV-TOOL-001** (CI Scripts) | P1 | Medium | High | Documents existing tools |
| **GOV-TOOL-002** (Pre-Commit) | P1 | Low | Medium | Fast feedback loop |
| **DTO_CANONICAL_STANDARD** updates | P1 | Low | High | File naming + pattern tree |
| **GOV-ERR-003** (Logging) | P2 | Low | Medium | Consolidates logging patterns |
| **GOV-ERR-001** (Taxonomy) | P3 | N/A | Low | DUPLICATE - don't create |
| **GOV-ERR-002** (Response) | P3 | Low | Low | Nice-to-have, not critical |

---

## 10. Recommended Synchronization Strategy

### Phase 1: Critical DTO Gaps (P0 - Immediate)

**Week 1**:
1. Create `DTO_CATALOG.md` (extract SRM lines 59-93)
2. Create `GOV-PAT-002-mapper-pattern.md` (extract SRM lines 120-134, 223-233)
3. Update `DTO_CANONICAL_STANDARD.md`:
   - Add file naming standard (dtos.ts plural)
   - Add three-pattern decision tree
   - Reference GOV-PAT-002 for mappers
4. Update `SERVICE_TEMPLATE.md`:
   - Rename dto.ts → dtos.ts throughout
   - Add mappers.ts to file structure
   - Add mapper example in complex service section

**Deliverable**: CRITICAL-001, CRITICAL-002, CRITICAL-003 resolved

---

### Phase 2: Bounded Context & Tooling (P1 - This Sprint)

**Week 2**:
1. Create `GOV-PAT-003-dto-ownership-rules.md` (extract SRM lines 49-71)
2. Create `GOV-PAT-004-bounded-context-communication.md` (extract SRM lines 72-114)
3. Create `GOV-TOOL-001-ci-validation-scripts.md` (document existing ESLint rules)
4. Create `GOV-TOOL-002-pre-commit-hooks.md` (document hook patterns)
5. Create `GOV-TOOL-003-schema-verification-test.md` (spec for implementation)

**Deliverable**: CRITICAL-004 resolved, tooling documented

---

### Phase 3: Service Factory & Logging (P2 - Next Sprint)

**Week 3-4**:
1. Create `GOV-PAT-001-service-factory-pattern.md` (consolidate from 4 sources)
2. Create `GOV-ERR-003-error-logging-policy.md` (consolidate observability patterns)
3. Update `ANTI_PATTERN_CATALOG.md` to reference GOV-PAT-001
4. Update `INDEX.md` with new governance docs

**Deliverable**: Complete governance documentation modularization

---

## 11. SRM Modularization Path

### Goal: Transform SRM from 2118-line monolith to lightweight registry

**Current Structure**:
- Lines 18-250: DTO Contract Policy → Extract to 25-api-data/ and 70-governance/
- Lines 568-802: RLS Policy Examples → Extract to 30-security/
- Lines 889-970: Service Layer Patterns → Extract to 70-governance/
- Lines 1000+: Service-by-service specifications → Keep (bounded context registry)

**Proposed SRM v4.0.0 Structure**:
```markdown
# Service Responsibility Matrix v4.0.0 (Modular)

## Contract Policy (lines 18-48)
See: docs/25-api-data/DTO_CATALOG.md
See: docs/70-governance/patterns/domain-modeling/GOV-PAT-003

## Table Ownership Matrix (lines 59-69)
[Keep - this is the core SRM content]

## Cross-Context Patterns (lines 72-114)
See: docs/70-governance/patterns/domain-modeling/GOV-PAT-004

## Service Specifications (lines 900+)
[Keep - bounded context registry]
```

**Reduction**: 2118 lines → ~1200 lines (45% reduction)

---

## 12. Success Criteria

### Documentation Completeness
- [ ] DTO_CATALOG.md created with 9-service matrix
- [ ] GOV-PAT-002 created (mapper pattern)
- [ ] GOV-PAT-003 created (DTO ownership)
- [ ] GOV-PAT-004 created (bounded context communication)
- [ ] GOV-TOOL-003 created (schema verification spec)
- [ ] DTO_CANONICAL_STANDARD.md updated (file naming, pattern tree)
- [ ] SERVICE_TEMPLATE.md updated (dtos.ts plural, mappers.ts)

### Gap Closure
- [ ] DOCUMENTATION_DRIFT CRITICAL-001 resolved (file naming)
- [ ] DOCUMENTATION_DRIFT CRITICAL-002 resolved (DTO derivation strategy)
- [ ] DOCUMENTATION_DRIFT CRITICAL-003 resolved (mapper pattern)
- [ ] DOCUMENTATION_DRIFT CRITICAL-004 resolved (cross-context rules)

### Tooling Documentation
- [ ] 4 existing ESLint rules documented (GOV-TOOL-001)
- [ ] Pre-commit hooks specified (GOV-TOOL-002)
- [ ] Schema verification test specified (GOV-TOOL-003)

### Cross-Reference Integrity
- [ ] INDEX.md updated with new docs
- [ ] Each GOV-PAT doc references SRM source lines
- [ ] SRM updated to reference extracted GOV-PAT docs
- [ ] No duplicate content (ERROR_TAXONOMY not duplicated)

---

## 13. Final Recommendations

### DO Create (High Value)
1. **DTO_CATALOG.md** - Already referenced, fills critical gap
2. **GOV-PAT-002** (Mapper) - Closes CRITICAL-003
3. **GOV-PAT-003** (Ownership) - Direct SRM extraction, high clarity
4. **GOV-PAT-004** (Bounded Context) - Closes CRITICAL-004
5. **GOV-TOOL-003** (Schema Verify) - CLAUDE.md compliance requirement

### DO Update (Essential)
1. **DTO_CANONICAL_STANDARD.md** - File naming + pattern decision tree
2. **SERVICE_TEMPLATE.md** - Align with SRM v3.1.0 (dtos.ts plural, mappers.ts)

### CONSIDER Creating (Medium Value)
1. **GOV-PAT-001** (Service Factory) - Consolidates scattered patterns
2. **GOV-TOOL-001** (CI Scripts) - Documents existing implementations
3. **GOV-TOOL-002** (Pre-Commit) - Fast feedback loop
4. **GOV-ERR-003** (Logging) - Useful consolidation

### DO NOT Create (Low Value / Duplicate)
1. **GOV-ERR-001** (Error Taxonomy) - Duplicates ERROR_TAXONOMY_AND_RESILIENCE.md
2. **GOV-ERR-002** (Error Response) - Marginally useful, low priority

---

## Appendix A: Content Extraction Map

| Source | Lines | Destination | Content |
|--------|-------|-------------|---------|
| SRM | 59-69 | DTO_CATALOG.md | Ownership matrix |
| SRM | 81-93 | DTO_CATALOG.md | Cross-context consumption |
| SRM | 120-134 | GOV-PAT-002 | Contract-First mapper |
| SRM | 223-233 | GOV-PAT-002 | Hybrid mapper |
| SRM | 49-71 | GOV-PAT-003 | DTO ownership rules |
| SRM | 72-114 | GOV-PAT-004 | Bounded context rules |
| SRM | 115-236 | DTO_CANONICAL_STANDARD | Three pattern decision tree |
| SLAD | 808-843 | GOV-PAT-001 | Service factory pattern |
| ANTI_PATTERN_CATALOG | 9-75 | GOV-PAT-001 | Factory anti-patterns |
| DTO_CANONICAL_STANDARD | 166-233 | GOV-TOOL-001 | ESLint rule specs |
| DTO_CANONICAL_STANDARD | 299-318 | GOV-TOOL-002 | Pre-commit hook spec |

---

## Appendix B: ESLint Rules Inventory

**Implemented** (.eslint-rules/):
1. `no-manual-dto-interfaces.js` - Enforces Pick/Omit pattern
2. `no-cross-context-db-imports.js` - Bounded context integrity
3. `dto-column-allowlist.js` - PII/sensitive field protection
4. `no-return-type-inference.js` - Explicit interfaces required

**Documentation Status**: NOT DOCUMENTED

**Action Required**: Create GOV-TOOL-001 to document usage, configuration, and examples

---

## Appendix C: Document Version Control

**Recommendation**: Add to all new governance docs:

```markdown
---
id: GOV-PAT-001
title: Service Factory Pattern
version: 1.0.0
status: CANONICAL
effective: 2025-11-14
source_of_truth:
  - SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md lines 808-843
  - SERVICE_TEMPLATE.md lines 113-131
  - ANTI_PATTERN_CATALOG.md lines 9-75
supersedes: [scattered factory guidance]
---

**Changelog**:
- v1.0.0 (2025-11-14): Initial consolidation from 4 source documents
```

---

**Report Status**: RESEARCH COMPLETE
**Next Action**: Review recommendations and prioritize P0/P1 document creation
**Estimated Effort**:
- P0 (3 docs): 12 hours
- P1 (6 docs + 2 updates): 20 hours
- Total: 32 hours over 2 sprints

**Prepared By**: Agent 5 - Governance & Patterns Agent
**Review Required**: Architecture Team, Technical Lead
**Approval Required**: Principal Architect
