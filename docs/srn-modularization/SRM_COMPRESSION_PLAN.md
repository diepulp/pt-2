# SRM Compression Plan

**Status**: Draft - Planning Phase Only (DO NOT EXECUTE)
**Created**: 2025-11-17
**Context**: SRM Modularization Track - Compression Phase
**Related**: `SESSION_HANDOFF.md`, `SRM_MAPPING_TABLE.md`, `SDLC_TAXONOMY_INVENTORY.md`

---

## Executive Summary

The SERVICE_RESPONSIBILITY_MATRIX.md (SRM) currently stands at **2,126 lines**. Through the modularization effort, 8 major sections have been identified with "Extraction Target" anchors pointing to dedicated taxonomy documents. This plan outlines how to compress these sections into concise summaries with clear navigation links, maintaining the SRM's role as a **bounded context registry** while moving detailed specifications to their appropriate taxonomy homes.

**Estimated Impact**: Reduction of ~800-1,000 lines (37-47% compression) while improving navigability and maintainability.

---

## Identified Sections for Compression

Based on analysis of the SRM and mapping table, the following 8 sections have extraction targets:

### 1. DTO Contract Policy (Lines 49-318, ~270 lines)

**Current State**:
- Comprehensive DTO ownership tables
- Detailed derivation patterns with code examples
- Cross-context consumption rules
- Column exposure policies
- Type import restrictions
- CI validation requirements
- Migration workflow

**Extraction Target**: `docs/25-api-data/DTO_CATALOG.md`
**Additional Reference**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

**Proposed Summary** (8-12 lines):
```markdown
## DTO Contract Policy (Type System Integrity)

> **Full Specification**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
> **DTO Catalog**: `docs/25-api-data/DTO_CATALOG.md`
> **Status**: MANDATORY (Effective 2025-10-22)

**Core Rule**: Services MUST provide canonical DTOs for tables they own and MUST NOT directly access `Database['public']['Tables']['X']` for tables they don't own. Cross-context consumption happens through published DTOs only.

**Key Patterns**:
- **Bounded Context Services** (Loyalty, Finance, MTL, TableContext): Contract-first DTOs with explicit mappers
- **Thin CRUD Services** (Player, Visit, Casino): Canonical DTOs using Pick/Omit from database types
- **Hybrid Services** (RatingSlip): Mixed approach with published cross-context contracts

**Why Follow This Link**: The DTO Catalog provides the complete ownership matrix, derivation patterns, cross-context consumption rules, column exposure policies, and CI enforcement details. Essential for understanding which DTOs your service can consume and how to structure new DTOs.

See SRM service sections below for table ownership; see DTO_CATALOG for complete DTO cross-reference matrix.
```

**Estimated Reduction**: ~260 lines saved

---

### 2. Migration Workflow (Lines 302-318, ~17 lines)

**Current State**:
- 8-step migration workflow
- Pre-commit hook references

**Extraction Target**: `docs/65-migrations/MIG-001-migration-tracking-matrix.md`

**Proposed Summary** (4-6 lines):
```markdown
### Migration Workflow

> **Full Runbook**: `docs/65-migrations/MIG-001-migration-tracking-matrix.md`
> **Schema Migration Runbook**: `docs/50-ops/runbooks/RUN-003-schema-migration-runbook.md`

**TL;DR**: When modifying schema: (1) Update SRM, (2) Run migration, (3) **`npm run db:types`** (CRITICAL), (4) Update DTOs/mappers, (5) Pass type-check and ESLint, (6) Update tests.

**Why Follow This Link**: MIG-001 tracks current vs target schema state per table, migration IDs, RLS deployment status, and deprecation/EOL timelines. Essential for understanding what's deployed vs what's in progress.
```

**Estimated Reduction**: ~12 lines saved

---

### 3. Event / Telemetry Notes (Lines 336-366, ~30 lines)

**Current State**:
- Event payload examples (rating_slip.updated, loyalty.ledger_appended)
- Channel naming conventions
- Contract rules

**Extraction Target**: `docs/35-integration/INT-002-event-catalog.md`

**Proposed Summary** (5-7 lines):
```markdown
### Event / Telemetry Contracts

> **Event Catalog**: `docs/35-integration/INT-002-event-catalog.md`
> **Realtime Strategy**: `docs/80-adrs/ADR-004-real-time-strategy.md`

**Core Rule**: Event payloads mirror SRM table FKs and types; no ad-hoc keys. Channel naming: `{casino_id}` for collections, `{casino_id}:{resource_id}` for details.

**Why Follow This Link**: INT-002 catalogs all domain events (producers, consumers, payloads, channel scopes), retry semantics, and UI cache reconciliation patterns. Essential for implementing event-driven integrations.
```

**Estimated Reduction**: ~24 lines saved

---

### 4. Error Taxonomy & Resilience (Lines 405-589, ~185 lines)

**Current State**:
- Comprehensive error codes by service (Visit, Loyalty, RatingSlip, Finance, MTL, TableContext, Player, Casino, FloorLayout)
- HTTP status code mapping
- Rate limit rules by service
- Retry policies by operation
- Migration checklist

**Extraction Target**: `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`

**Proposed Summary** (10-15 lines):
```markdown
### Error Taxonomy & Resilience

> **Full Specification**: `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`
> **Status**: MANDATORY (Effective 2025-11-09)

**Core Principle**: Domain errors hide infrastructure details; Postgres errors MUST NOT leak to UI. All mutations enforce idempotency; hot paths protected by rate limiting.

**Key Mechanisms**:
- **Domain Error Codes**: Service-specific codes (e.g., `REWARD_ALREADY_ISSUED`, `VISIT_NOT_FOUND`) mapped to HTTP status
- **Retry Policies**: Exponential backoff with jitter; ONLY for idempotent operations
- **Rate Limiting**: Multi-level (actor, casino) with service-specific thresholds
- **Circuit Breaking**: Fail-fast for noisy endpoints

**Why Follow This Link**: ERROR_TAXONOMY_AND_RESILIENCE provides the complete error code catalog by service, HTTP mapping rules, retry policies, rate limit thresholds, circuit breaker configuration, and migration checklists. Essential for implementing robust error handling in any service.

**Quick Reference**: All services MUST define domain errors in `services/{service}/errors.ts` and map Postgres errors to domain codes. See canonical doc for complete taxonomy and enforcement patterns.
```

**Estimated Reduction**: ~170 lines saved

---

### 5. Security & Tenancy - Role Taxonomy (Lines 590-853, ~264 lines)

**Current State**:
- Comprehensive RLS upgrade documentation
- Pitfalls (before) vs Upgrades (now)
- Canonical RLS pattern examples
- JWT claim handling
- WRAPPER integration details
- Role-based access patterns

**Extraction Target**: `docs/30-security/SEC-005-role-taxonomy.md`
**Additional References**:
- `docs/30-security/SECURITY_TENANCY_UPGRADE.md`
- `docs/30-security/SEC-001-rls-policy-matrix.md`

**Proposed Summary** (12-18 lines):
```markdown
### Security & Tenancy

> **Role Taxonomy**: `docs/30-security/SEC-005-role-taxonomy.md`
> **Security Upgrade Spec**: `docs/30-security/SECURITY_TENANCY_UPGRADE.md`
> **RLS Policy Matrix**: `docs/30-security/SEC-001-rls-policy-matrix.md`
> **Status**: MANDATORY (Effective 2025-11-09, enforced via migration `20251110224223`)

**Core Principle**: No service keys in runtime; every call uses anon key + user context. RLS policies use canonical pattern with `current_setting('app.casino_id')` injected via WRAPPER, no JWT claim overload.

**Role Architecture**:
- **Roles**: admin, pit_boss, cage, compliance, dealer (enum: `staff_role`)
- **Auth Flow**: User context from cookies → `auth.uid()` → staff row → WRAPPER injects `actor_id` + `casino_id` via `SET LOCAL`
- **RLS Pattern**: Single deterministic path using `current_setting('app.*')`, no OR trees
- **Realtime**: Channel joins scoped by `casino_id` AND role; predicates enforce same isolation as RLS

**Schema State**: ✅ DEPLOYED - `staff.user_id` column added (dealers remain `user_id = null` as non-authenticated scheduling metadata)

**Why Follow This Link**: SEC-005 defines complete role capabilities matrix, RLS policy patterns, channel join predicates, and claim/context mappings. SECURITY_TENANCY_UPGRADE explains the canonical wrapper flow and privilege escalation prevention. Essential for implementing any authenticated operation.

**Quick Reference**: Use `createClient(url, ANON_KEY)` only; WRAPPER handles context injection. See SEC-001 for per-table RLS policies.
```

**Estimated Reduction**: ~246 lines saved

---

### 6. Client Cache & Realtime Discipline (Lines 859-867, ~9 lines)

**Current State**:
- Brief overview of React Query patterns
- Domain event emission rules
- Realtime channel scoping
- Poll vs stream guidance

**Extraction Target**: `docs/35-integration/INT-002-event-catalog.md`
**Additional References**:
- `docs/80-adrs/ADR-003-state-management-strategy.md`
- `docs/80-adrs/ADR-004-real-time-strategy.md`

**Proposed Summary** (6-8 lines):
```markdown
### Client Cache & Realtime Discipline

> **Event Catalog**: `docs/35-integration/INT-002-event-catalog.md`
> **State Management Strategy**: `docs/80-adrs/ADR-003-state-management-strategy.md`
> **Real-Time Strategy**: `docs/80-adrs/ADR-004-real-time-strategy.md`

**Core Rule**: React Query is single source of truth. Query keys follow `[domain, operation, scope?, ...params]`. Mutations emit SRM domain events; realtime listeners reconcile via `invalidateByDomainEvent()`. Channels scoped by `casino_id` and role; hot domains use snapshots (1-5s) not raw row mutations.

**Why Follow This Link**: INT-002 catalogs events and channels; ADR-003/004 define query key conventions, invalidation patterns, poll vs stream decision matrix, and stale-while-revalidate configuration. Essential for UI state management.
```

**Estimated Reduction**: ~2 lines saved (section already quite compact)

---

### 7. Deprecation Policy (Lines 907-917, ~11 lines)

**Current State**:
- Example deprecations (rating_slip.points, dealer_rotation.table_string_id)
- CI enforcement rules
- EOL grace period

**Extraction Target**: `docs/65-migrations/MIG-001-migration-tracking-matrix.md`

**Proposed Summary** (4-5 lines):
```markdown
### Deprecation Policy

> **Migration Tracking Matrix**: `docs/65-migrations/MIG-001-migration-tracking-matrix.md`

**Rule**: All deprecations tracked in MIG-001 with rationale, migration plan, owner, and EOL release. CI fails if EOL item exists past target version (5 business day grace max).

**Why Follow This Link**: MIG-001 maintains the complete deprecation/EOL table with timelines, migration strategies, and current status. Essential for planning schema evolution.
```

**Estimated Reduction**: ~7 lines saved

---

### 8. MTL Service - Compliance Context (Lines 2048-2069, ~22 lines)

**Current State**:
- Extraction target note
- Service ownership summary
- Acceptance checklist

**Extraction Target**: `docs/30-security/compliance/COMP-002-mtl-compliance-standard.md`

**Proposed Summary** (8-10 lines):
```markdown
## MTL Service - Compliance Context

### ✅ MTLService (AML/CTR Compliance Engine)

> **Compliance Standard**: `docs/30-security/compliance/COMP-002-mtl-compliance-standard.md`
> **Temporal Patterns**: `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`

**OWNS**: `mtl_entry` (immutable), `mtl_audit_note` (append-only), threshold detection rules (watchlist ≥$3k, CTR ≥$10k)
**REFERENCES**: `casino_settings` (READ-ONLY via trigger for gaming day calculation)
**BOUNDED CONTEXT**: "What cash/monetary transactions occurred for AML/CTR compliance?"

**Why Follow This Link**: COMP-002 defines AML/CTR obligations, retention requirements, threshold alerting, audit export formats, and operational controls. Essential for compliance-related development.

[Remainder of MTL section with schema/RPC details stays in SRM]
```

**Estimated Reduction**: ~14 lines saved

---

## Compression Summary Table

| Section | Current Lines | Target Lines | Reduction | Extraction Target(s) |
|---------|---------------|--------------|-----------|---------------------|
| 1. DTO Contract Policy | ~270 | ~12 | ~258 | DTO_CATALOG.md, DTO_CANONICAL_STANDARD.md |
| 2. Migration Workflow | ~17 | ~6 | ~11 | MIG-001-migration-tracking-matrix.md |
| 3. Event/Telemetry Notes | ~30 | ~7 | ~23 | INT-002-event-catalog.md |
| 4. Error Taxonomy & Resilience | ~185 | ~15 | ~170 | ERROR_TAXONOMY_AND_RESILIENCE.md |
| 5. Security & Tenancy | ~264 | ~18 | ~246 | SEC-005-role-taxonomy.md, SECURITY_TENANCY_UPGRADE.md |
| 6. Client Cache & Realtime | ~9 | ~8 | ~1 | INT-002-event-catalog.md, ADR-003, ADR-004 |
| 7. Deprecation Policy | ~11 | ~5 | ~6 | MIG-001-migration-tracking-matrix.md |
| 8. MTL Service Intro | ~22 | ~10 | ~12 | COMP-002-mtl-compliance-standard.md |
| **TOTAL** | **~808** | **~81** | **~727** | **8 target docs** |

**Projected SRM Size**: 2,126 - 727 = **~1,399 lines** (34% reduction)

---

## Link Format Standards

All compression summaries will follow this format:

```markdown
### [Section Title]

> **[Primary Doc Type]**: `docs/[category]/[DOC-ID]-[name].md`
> **[Additional Context]** (if needed): `docs/[category]/[DOC-ID]-[name].md`
> **Status**: [MANDATORY/DRAFT/etc] [(Effective date if applicable)]

**Core [Rule/Principle/Pattern]**: [1-2 sentence encapsulation of the essence]

**Key [Mechanisms/Patterns/Components]** (if complex):
- **[Aspect 1]**: [Brief description]
- **[Aspect 2]**: [Brief description]
[...up to 4-5 bullets max]

**Why Follow This Link**: [Clear value proposition - what detailed information reader will find and when they need it. 2-3 sentences max.]

**Quick Reference** (optional): [Ultra-terse cheat sheet for common case, 1 sentence]
```

**Design Principles**:
1. **Actionable Navigation**: "Why Follow This Link" must convey clear value
2. **Preserve Context**: Core rules stay in SRM; details move to targets
3. **No Orphaned Content**: Every moved detail has a clear home
4. **Maintain Discoverability**: Section headers preserved; summary aids scanning

---

## Risk Assessment

### High Risk Areas

1. **DTO Policy Compression** (Risk Level: MEDIUM)
   - **Risk**: Cross-context consumption table is heavily referenced in service sections
   - **Mitigation**: Keep the consumption table stub in SRM; full matrix in DTO_CATALOG
   - **Dependency**: 12+ service sections reference SRM line numbers for DTO rules
   - **Action Required**: Update internal SRM cross-references after compression

2. **Error Taxonomy Compression** (Risk Level: MEDIUM)
   - **Risk**: Service-specific error codes currently inline; developers scan SRM for quick reference
   - **Mitigation**: Keep 3-4 example codes per service in quick reference; full catalog in ERROR_TAXONOMY
   - **Dependency**: CI scripts may grep for error code patterns in SRM
   - **Action Required**: Verify CI scripts after compression; update if they depend on SRM structure

3. **Security & Tenancy Compression** (Risk Level: HIGH)
   - **Risk**: Largest section (264 lines); contains critical RLS patterns referenced in migrations
   - **Mitigation**: Preserve canonical RLS pattern example; defer role capabilities to SEC-005
   - **Dependency**: Multiple migration files reference "SRM security section"
   - **Action Required**: Audit migration comments; ensure they point to new SEC-005 location
   - **Timeline**: Wait until SEC-005 is fully populated before compression

4. **Internal Cross-References** (Risk Level: HIGH)
   - **Risk**: SRM contains ~50+ internal line references (e.g., "SRM:358-373")
   - **Mitigation**: All line references must be updated post-compression
   - **Action Required**: Run script to find all `SRM:\d+` patterns; update systematically
   - **Tool Needed**: `scripts/update-srm-line-refs.js` (create if not exists)

### Medium Risk Areas

5. **Service Section Dependencies** (Risk Level: MEDIUM)
   - **Risk**: Each service section references DTO policy, error taxonomy, security patterns
   - **Mitigation**: Service sections link to canonical docs, not SRM line numbers
   - **Action Required**: Update service section headers with canonical doc links

6. **CI Validation Scripts** (Risk Level: MEDIUM)
   - **Risk**: Scripts like `validate-srm-ownership.js` may parse SRM structure
   - **Mitigation**: Keep SRM ownership matrix structure intact; only compress policy sections
   - **Action Required**: Test all CI scripts after compression; update parsers if needed

### Low Risk Areas

7. **Migration Workflow** (Risk Level: LOW)
   - **Risk**: Minimal; workflow is procedural and well-documented elsewhere
   - **Mitigation**: None needed; clean compression target

8. **Deprecation Policy** (Risk Level: LOW)
   - **Risk**: Already points to MIG-001; minimal impact
   - **Mitigation**: None needed

---

## Dependencies & Prerequisites

### Before Compression Can Execute

1. **Target Documents Must Be Populated**:
   - ✅ `DTO_CATALOG.md` - Currently stub; needs full DTO matrix with fields/versioning/consumers
   - ✅ `INT-002-event-catalog.md` - Currently stub; needs complete event list beyond 2 seeded events
   - ✅ `SEC-005-role-taxonomy.md` - Currently stub; needs finalized capabilities/claims matrix
   - ✅ `COMP-002-mtl-compliance-standard.md` - Currently stub; needs thresholds/retention/hooks
   - ✅ `ERROR_TAXONOMY_AND_RESILIENCE.md` - Already populated; ready
   - ✅ `MIG-001-migration-tracking-matrix.md` - Partially populated; needs EOL sync with migrations
   - ✅ `TEMP-001/002` - Currently stubs; need DST/leap handling details

   **Status**: 3/8 ready; 5/8 need deepening (see SESSION_HANDOFF.md "Remaining workflow")

2. **Link Checker CI Must Exist**:
   - **Required**: `scripts/check-srm-links.js` to validate all `docs/` links resolve
   - **Integration**: Wire into GitHub Actions CI to fail on broken links
   - **Timeline**: Implement before compression execution

3. **Line Reference Update Tool**:
   - **Required**: `scripts/update-srm-line-refs.js` to find/update all `SRM:\d+` patterns
   - **Scope**: Search all `.md` files in `docs/`, all `.ts` files in `services/`
   - **Timeline**: Implement before compression execution

4. **Mapping Table & Inventory Sync**:
   - **Required**: `SRM_MAPPING_TABLE.md` and `SDLC_TAXONOMY_INVENTORY.md` must stay current
   - **Process**: Update both tables as target docs are populated
   - **Owner**: Track in SESSION_HANDOFF.md

---

## Execution Strategy (When Ready)

### Phase 1: Pre-Compression Validation (1-2 days)

1. **Verify Target Docs Are Populated**:
   - Audit all 8 extraction target docs
   - Ensure depth matches what's being removed from SRM
   - Confirm all code examples, tables, and checklists migrated

2. **Implement Tooling**:
   - Create `scripts/check-srm-links.js`
   - Create `scripts/update-srm-line-refs.js`
   - Test both scripts on current SRM

3. **Baseline Testing**:
   - Run full CI suite with current SRM
   - Document which scripts parse SRM structure
   - Create snapshot for rollback

### Phase 2: Incremental Compression (3-5 days)

Execute compressions in LOW → MEDIUM → HIGH risk order:

**Day 1**: Low Risk
- Compress Migration Workflow (section 2)
- Compress Deprecation Policy (section 7)
- Run link checker, test CI, commit

**Day 2**: Medium Risk - Part 1
- Compress Event/Telemetry Notes (section 3)
- Compress Client Cache & Realtime (section 6)
- Run link checker, test CI, commit

**Day 3**: Medium Risk - Part 2
- Compress MTL Service Intro (section 8)
- Run link checker, test CI, commit

**Day 4**: High Risk - Part 1
- Compress DTO Contract Policy (section 1)
- Update internal cross-references
- Run CI validation scripts
- Test service section dependencies
- Commit

**Day 5**: High Risk - Part 2
- Compress Error Taxonomy (section 4)
- Update CI scripts if needed
- Run full test suite
- Commit

**Day 6**: Highest Risk
- Compress Security & Tenancy (section 5) - ONLY if SEC-005 fully populated
- Update migration file comments
- Update service section headers
- Run full CI suite
- Commit

### Phase 3: Post-Compression Verification (1 day)

1. **Link Validation**:
   - Run `scripts/check-srm-links.js`
   - Verify all `docs/` targets exist and are accessible

2. **Cross-Reference Audit**:
   - Run `scripts/update-srm-line-refs.js` in report mode
   - Verify no dangling `SRM:\d+` references

3. **CI Health Check**:
   - Run full CI suite
   - Verify `validate-srm-ownership.js` still works
   - Verify `validate-dto-fields.js` still works
   - Check all pre-commit hooks pass

4. **Documentation Sync**:
   - Update `SRM_MAPPING_TABLE.md` with new line numbers
   - Update `SDLC_TAXONOMY_INVENTORY.md` status
   - Update `SESSION_HANDOFF.md` progress

---

## Rollback Plan

If compression causes issues:

1. **Git Revert**: Each compression is a separate commit; revert last commit
2. **Partial Rollback**: Can keep successful compressions; only revert problematic ones
3. **CI Breakage**: If CI scripts break, fix scripts first, then retry compression
4. **Link Checker Fails**: Fix target docs, don't revert compression

**Rollback Trigger Criteria**:
- CI suite fails and root cause is compression structure change
- Critical cross-references broken (>5 broken links)
- Service sections unreadable due to missing context
- Stakeholder veto (requires exec decision)

---

## Success Metrics

Post-compression, we should achieve:

1. **Line Count**: SRM reduced to ~1,400 lines (34% reduction, target 30-40%)
2. **Link Health**: 100% of extracted content links resolve (0 broken links)
3. **CI Health**: All CI validation scripts pass without modification OR updated scripts pass
4. **Cross-References**: 100% of internal `SRM:\d+` references updated or removed
5. **Navigability**: Developers can find detailed specs in ≤2 clicks from SRM
6. **Maintainability**: SRM remains canonical registry; detailed specs in taxonomy homes
7. **No Fragmentation**: No orphaned content; every detail has clear owner

---

## Next Steps (Do NOT Execute - Planning Only)

1. **Parallelizable Work** (from SESSION_HANDOFF.md):
   - **DTO/Events Track**: Populate DTO_CATALOG fields/consumers; expand INT-002 event list
   - **Security/Compliance Track**: Finalize SEC-005 capabilities; complete COMP-002 thresholds
   - **Temporal Track**: Detail TEMP-001/002 edge cases (DST, leap days)
   - **Ops Track**: Flesh out RUN-001/003/004 runbooks; sync MIG-001 with migrations
   - **Tooling Track**: Implement link checker and line reference updater

2. **Gating Decision**: Compression MUST wait until:
   - ✅ All 8 target docs populated to depth ≥ what's being removed
   - ✅ Link checker CI implemented and passing
   - ✅ Line reference updater implemented and tested
   - ✅ Stakeholder approval on compression summaries

3. **Approval Required**: Review this plan with:
   - Tech lead (architectural integrity)
   - DevOps (CI impact)
   - Documentation owner (taxonomy alignment)

---

## Recommendations

### For Executing Compression (Future)

1. **Do Not Rush**: Compression is LOW value if target docs are stubs; wait for population
2. **Incremental Commits**: Each section compression = separate commit for easy rollback
3. **Test CI Extensively**: Run full suite after each compression; fix scripts before proceeding
4. **Preserve Examples**: Keep 1-2 code examples in SRM summaries; full catalog in targets
5. **Link Generously**: When in doubt, add an extra link; navigation clarity > brevity

### For Target Doc Population (Current Priority)

1. **DTO_CATALOG Priority**: Most cross-referenced section; populate first
2. **SEC-005 Priority**: Highest risk compression; needs deepest target before compressing
3. **INT-002 Priority**: Referenced by multiple sections; populate early
4. **COMP-002/TEMP-001/002**: Lower urgency; can populate in parallel with compression

### For Tooling

1. **Link Checker**: Implement as GitHub Action; fail fast on broken links
2. **Line Reference Updater**: Build as find-and-replace with verification step
3. **SRM Parser**: If CI scripts parse SRM, consider making them resilient to line number changes

---

## Appendix: Section Boundaries Reference

For execution phase, here are the precise boundaries:

| Section | Start Line | End Line | Anchor Text |
|---------|------------|----------|-------------|
| DTO Contract Policy | 49 | 318 | `## DTO Contract Policy (Type System Integrity)` |
| Migration Workflow | 302 | 318 | `### 7. **Migration Workflow**` |
| Event/Telemetry Notes | 336 | 366 | `### Event / Telemetry Notes` |
| Error Taxonomy | 405 | 589 | `### Error Taxonomy & Resilience` |
| Security & Tenancy | 590 | 853 | `### Security & Tenancy` |
| Client Cache & Realtime | 859 | 867 | `### Client Cache & Realtime Discipline` |
| Deprecation Policy | 907 | 917 | `### Deprecation Policy` |
| MTL Service Intro | 2048 | 2069 | `> **Extraction Target**: .../COMP-002...` |

**Note**: Some sections overlap (e.g., Migration Workflow is subsection of DTO Contract Policy). Execution plan accounts for this.

---

**END OF PLAN - DO NOT EXECUTE WITHOUT APPROVAL AND PREREQUISITES**
