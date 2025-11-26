# Governance Documentation Validation Checklist

## Purpose

Detect and rectify inconsistencies in PT-2's SDLC documentation that can occur during rapid development. This checklist ensures architectural changes maintain documentation integrity across all canonical sources.

## Critical Architectural Documents

Before beginning any architectural work, consult these canonical documents:

### SDLC Documentation Taxonomy (Master Index)
**Location:** `references/SDLC_DOCS_TAXONOMY.md`

**Purpose:** The **master map** of all PT-2 documentation. Defines what belongs where, why it exists, and who owns it.

**Contains:**
- 9 canonical doc categories (V&S, PRD, ARCH, ADR, API/DATA, SEC/RBAC, DEL/QA, OPS/SRE, REL/CHANGE, GOV)
- Taxonomy matrix mapping docs to SDLC phases
- Folder structure conventions (`docs/00-vision/`, `docs/20-architecture/`, etc.)
- "Where-to-put-this?" cheatsheet
- Ownership matrix (RACI-lite)
- Status conventions (Draft → Proposed → Accepted → Superseded → Deprecated)

**Critical for Lead Architect:**
- **Discovery**: Use to locate existing RLS matrices, ADRs, API contracts, security policies
- **Validation**: Check if new docs follow taxonomy conventions and go in the right folder
- **Consistency**: Ensure doc IDs, front-matter, and status follow taxonomy standards
- **Avoid Duplication**: Reference existing docs instead of creating from scratch
- **Detect Gaps**: Identify missing docs that taxonomy says should exist

**When to Reference:**
- **ALWAYS** at the start of any architectural task to locate existing relevant docs
- Before creating new documentation (check taxonomy for correct category and folder)
- When encountering inconsistencies (taxonomy defines canonical structure)
- When unsure where information lives (use "Where-to-put-this?" cheatsheet in section 7)

**Key Insight:** The taxonomy treats **docs as organized by concern** (ARCH, SEC, OPS, etc.) NOT by implementation order. Use it to find what exists, then validate it's current and consistent.

---

### Service Layer Architecture (SLAD)
**Location:** `references/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (v2.1.2)

**Contains:**
- Complete service layer architecture patterns
- DTO derivation patterns (A/B/C)
- Transport layer architecture (Server Actions, Route Handlers, withServerAction)
- Real-time architecture (domain-scoped channels, event contracts)
- RLS patterns (auth.uid + staff.user_id + SET LOCAL)
- React Query integration patterns
- Error mapping strategy
- Idempotency implementation
- Complete mermaid diagrams for all flows

**When to Reference:**
- Designing new services or bounded contexts
- Adding new features to existing services
- Refactoring service boundaries
- Implementing transport layer changes
- Adding real-time functionality
- Implementing RLS policies

### Service Responsibility Matrix (SRM)
**Location:** `references/SERVICE_RESPONSIBILITY_MATRIX.md`

**Contains:**
- All bounded contexts and service definitions
- Service ownership and responsibilities
- Service dependencies and call patterns
- Data model ownership per service
- API surface per service
- Non-responsibilities (what each service does NOT do)

**When to Reference:**
- Identifying affected services for a feature
- Validating service boundaries
- Understanding service dependencies
- Determining which service owns which data/logic
- Avoiding scope creep and boundary violations

### Service Implementation Guide
**Location:** `references/SERVICE_TEMPLATE.md` (v2.0.3)

**Contains:**
- Pattern decision tree (A/B/C)
- Current implementation status (deployed vs. planned)
- Directory structure examples
- DTO patterns by service type
- React Query key factories
- Error handling patterns
- Testing strategies
- Anti-patterns to avoid

**When to Reference:**
- Implementing new services
- Choosing DTO pattern (Contract-First vs. Canonical)
- Creating React Query hooks
- Writing service tests
- Understanding what's deployed vs. planned

### Usage in Validation
These four documents work together as the **SDLC documentation system**:

1. **SDLC_DOCS_TAXONOMY** - Master index: WHERE to find docs and WHAT should exist
2. **SRM** - Service boundaries: WHAT services exist and their responsibilities
3. **SLAD** - Architecture patterns: HOW services are architected (patterns, flows, layers)
4. **SERVICE_TEMPLATE** - Implementation reality: Current (deployed) vs. planned patterns

**Validation workflow:**
1. **Start with taxonomy**: Locate all relevant docs (RLS matrices in `docs/30-security/`, ADRs in `docs/80-adrs/`, etc.)
2. **Load referenced docs**: Read existing RLS policies, ADRs, API contracts before proposing changes
3. **Cross-reference for consistency**: Ensure SRM + SLAD + SERVICE_TEMPLATE align
4. **Follow taxonomy conventions**: New docs use correct folder, ID format, front-matter, status
5. **Update atomically**: If one doc changes, update all affected docs (as taxonomy indicates via `affects:` field)

## Pre-Architecture Validation

Before proposing an architectural change, validate current state:

### 1. Service Responsibility Matrix (SRM) Check

**Location:** `references/SERVICE_RESPONSIBILITY_MATRIX.md`

- [ ] Identify all services/bounded contexts affected by the change
- [ ] Verify current SRM entries accurately reflect implementation
- [ ] Check for orphaned service definitions (documented but not implemented)
- [ ] Check for undocumented services (implemented but not in SRM)
- [ ] Validate service dependencies match actual call patterns

**Common regressions:**
- Service responsibilities drift from original design
- New services added without SRM updates
- Deprecated services still listed in SRM

### 2. Schema Consistency Check

**Location:** `types/database.types.ts` + migration files in `supabase/migrations/`

- [ ] Verify `database.types.ts` reflects latest migrations
- [ ] Check migration timestamps follow `YYYYMMDDHHMMSS_description.sql` pattern
- [ ] Validate RLS policies exist for all user-facing tables
- [ ] Confirm foreign key relationships match documented data model
- [ ] Check for tables referenced in docs but missing in schema

**Common regressions:**
- Types file out of sync after migration (forgot `npm run db:types`)
- RLS policies missing after table creation
- Documented relationships don't match actual foreign keys

### 3. API Surface Consistency Check

**Locations:** API route files in `app/api/` + documented in SRM or separate API docs

- [ ] List all documented API endpoints
- [ ] Verify each documented endpoint exists in codebase
- [ ] Check for undocumented endpoints (implemented but not in docs)
- [ ] Validate request/response types match schema types
- [ ] Verify status codes align with documented error handling

**Common regressions:**
- New endpoints added without documentation
- Documented payloads don't match actual types
- Error codes changed but docs not updated

### 4. ADR Consistency Check

**Location:** `docs/adr/`

- [ ] Read all ADRs related to affected domain
- [ ] Check for contradicting decisions across ADRs
- [ ] Verify "Superseded" ADRs are properly marked and linked
- [ ] Validate current implementation matches active ADR decisions
- [ ] Check if proposed change contradicts existing ADR

**Common regressions:**
- Implementation drifts from ADR decision
- New decisions made without creating ADR
- Superseded ADRs not marked as such

### 5. Anti-Patterns Check

**Locations:** `@memory/anti-patterns.memory.md` + `docs/patterns/`

- [ ] Verify proposed architecture doesn't violate PT-2 anti-patterns
- [ ] Check codebase for anti-pattern violations in related areas
- [ ] Validate no class-based services in affected domain
- [ ] Confirm no `ReturnType` inference usage
- [ ] Check for global singletons or stateful factories

**Common regressions:**
- Anti-patterns sneak in during quick fixes
- Documentation says one thing, code does another

## Post-Architecture Validation

After proposing an architectural change, validate consistency:

### 6. Cross-Reference Documentation Updates

- [ ] List all governance docs affected by change
- [ ] Verify each doc gets atomic update (all or nothing)
- [ ] Check for cascading impacts (changing one doc necessitates updating others)
- [ ] Validate new docs follow PT-2 documentation standards
- [ ] Ensure versioning/timestamps are updated where applicable

**Atomic update rule:** If architecture change touches SRM, schema, API surface, and ADR, ALL must be updated together.

### 7. Implementation-Documentation Alignment

- [ ] Verify proposed code structure matches documented architecture
- [ ] Check service layer paths align with SRM ownership
- [ ] Validate type definitions match schema documentation
- [ ] Ensure RLS policies documented match proposed implementation
- [ ] Confirm migration strategy matches documented approach

### 8. Backward Compatibility Check

- [ ] Document breaking changes explicitly
- [ ] Propose migration path for breaking changes
- [ ] Verify deprecated patterns are marked with alternatives
- [ ] Check if existing integrations need updates
- [ ] Validate data migration strategy preserves integrity

## Documentation Regression Remediation

When inconsistencies are found:

### Option A: Rectify to Align with Patterns

If current patterns/standards are sufficient:

1. Identify the canonical source of truth (usually most recent ADR or pattern doc)
2. Update all conflicting documentation to align
3. Update implementation if it drifts from canonical source
4. Add validation tests to prevent future drift

### Option B: Propose Robust Solution

If current patterns are insufficient:

1. Document the gap between current patterns and needs
2. Propose pattern enhancement or new pattern
3. Create ADR for the decision
4. Update all affected documentation
5. Update implementation to match new pattern

## Validation Frequency

Run this checklist:

- **Always:** Before proposing architectural changes
- **Always:** After completing architectural documentation
- **Weekly:** As part of architectural review process
- **Post-Migration:** After any database schema change
- **Post-Major-Feature:** After shipping significant features

## Red Flags

Stop and escalate if you find:

- 🚨 Multiple ADRs with contradictory decisions (not marked superseded)
- 🚨 Schema types completely out of sync with migrations
- 🚨 SRM shows services that don't exist in codebase
- 🚨 Anti-patterns widespread in a domain
- 🚨 No RLS policies on user-facing tables
- 🚨 Breaking changes without migration plan

## Quick Validation Commands

```bash
# Verify types are current
npm run db:types
git diff types/database.types.ts  # Should show no changes if in sync

# Find undocumented API routes
find app/api -name "route.ts" -o -name "route.js"

# Check migration naming
ls supabase/migrations/ | grep -v "^[0-9]{14}_"  # Should return empty

# Find class-based services (anti-pattern)
grep -r "export class.*Service" lib/services/
```

## Documentation Standards Reference

Always validate against:

- OVER_ENGINEERING_GUARDRAIL.md - Complexity limits
- BALANCED_ARCHITECTURE_QUICK.md - Pattern templates
- SERVICE_TEMPLATE.md - Service structure standards
- @memory/*.memory.md - Compressed patterns and decisions
