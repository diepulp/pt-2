---
title: Create New Service (Systematic Workflow)
description: End-to-end service creation with 3 validation gates
chatmode_sequence:
  - architect # Phase 1: Design
  - service-engineer # Phase 2: Implementation
  - service-engineer # Phase 3: Testing
  - documenter # Phase 4: Documentation
validation_gates: 3
estimated_time: 2-4 hours
version: 1.0.0
last_updated: 2025-10-17
context_files:
  - .claude/memory/service-catalog.memory.md
  - .claude/memory/anti-patterns.memory.md
  - docs/patterns/SERVICE_TEMPLATE_QUICK.md
  - docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md
  - docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md
---

# Create Service Workflow

## Overview

This workflow creates a new service following PT-2 architecture standards with built-in validation gates.

**Estimated Time**: 2-4 hours (design → implementation → testing → docs)

**Outcome**: Production-ready service with tests, documentation, and memory updates

---

## Phase 1: Design Specification (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Grep, Glob, sequential-thinking
**Output**: `.claude/specs/{service}-service.spec.md`

### Step 1.1: Define Bounded Context

Answer these questions:

1. **Key Question**: What question does this service answer?
   - Example (Player): "Who is this player?"
   - Example (MTL): "What cash transactions require regulatory reporting?"

2. **Data Ownership**: What data does this service OWN vs REFERENCE?

   ```
   OWNS:
   - table_x (full CRUD)
   - computed_field_y (business logic)

   REFERENCES:
   - table_z (from ServiceZ, read-only)
   ```

3. **Service Boundaries**: Check SERVICE_RESPONSIBILITY_MATRIX
   - No overlap with existing services?
   - Clear separation from related domains?

### Step 1.2: Create Service Specification

Generate `.claude/specs/{service}-service.spec.md`:

````markdown
---
service_name: { ServiceName }
bounded_context: "{Key question}"
status: proposed
created: { date }
---

# {ServiceName} Service Specification

## Bounded Context

[Answer to key question]

## Data Ownership

### OWNS

- `table_x`: [Description]
- `field_y`: [Computed logic]

### REFERENCES

- `table_z` (ServiceZ): [Usage]

## Interface Definition

\```typescript
export interface {ServiceName}Service {
// CRUD operations
create(data: Create{Entity}): Promise<{Entity}>;
getById(id: string): Promise<{Entity} | null>;
update(id: string, updates: Update{Entity}): Promise<{Entity}>;
delete(id: string): Promise<void>;

// Specialized queries
{specificQuery}(params: {Params}): Promise<{Result}>;
}
\```

## Implementation Requirements

1. [Technical requirement 1]
2. [Technical requirement 2]
3. [Performance target]

## Validation Criteria

- [ ] All CRUD operations implemented
- [ ] Business logic in `business.ts`, not `crud.ts`
- [ ] Test coverage ≥80%
- [ ] No anti-pattern violations
- [ ] Passes integration smoke test
````

### Step 1.3: VALIDATION GATE 1 - Design Review

🛑 **STOP: Present specification to user**

**Checklist**:

- [ ] Bounded context is clear and unique?
- [ ] No overlap with existing services?
- [ ] Follows SERVICE_RESPONSIBILITY_MATRIX principles?
- [ ] Interface is complete and unambiguous?
- [ ] Validation criteria are measurable?

**Format**:

```
🛑 VALIDATION GATE 1: Design Review

Service: {ServiceName}
Bounded Context: "{Key question}"

Data Ownership:
  OWNS: [list]
  REFERENCES: [list]

Interface: [show TypeScript interface]

Compliance Check:
  - [ ] No service overlap
  - [ ] Clear boundaries
  - [ ] Complete interface
  - [ ] Measurable validation

Specification: .claude/specs/{service}-service.spec.md

Do you approve this design? (Reply "approved" to proceed)
```

**User must explicitly approve before proceeding to Phase 2.**

---

## Phase 2: Implementation (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, MultiEdit, Bash (test execution)
**Input**: `.claude/specs/{service}-service.spec.md`
**Output**: Service implementation files

### Step 2.1: Create Directory Structure

```bash
mkdir -p services/{service}
touch services/{service}/index.ts
touch services/{service}/crud.ts
touch services/{service}/business.ts
touch services/{service}/queries.ts
```

### Step 2.2: Implement Following SERVICE_TEMPLATE_QUICK

**Required Patterns**:

- ✅ Functional factory: `export function create{Service}Service(supabase: SupabaseClient<Database>)`
- ✅ Explicit interfaces: `export interface {Service}Service { ... }`
- ✅ Type parameter: `SupabaseClient<Database>` (NEVER `any`)
- ✅ Separation: CRUD in `crud.ts`, business logic in `business.ts`
- ✅ Public API: Only export through `index.ts`

**Anti-Pattern Checks** (MUST enforce):

- ❌ NO class-based services
- ❌ NO `ReturnType<typeof create{Service}Service>`
- ❌ NO global singletons
- ❌ NO service-to-service direct calls
- ❌ NO `any` typing
- ❌ NO `console.*` in production

**File Organization**:

```
services/{service}/
├── index.ts          # Public API export only
├── crud.ts           # Database operations (CRUD)
├── business.ts       # Business logic, calculations
└── queries.ts        # Specialized queries, aggregations
```

### Step 2.3: VALIDATION GATE 2 - Implementation Review

🛑 **STOP: Present implementation summary**

**Summary Format**:

```
🛑 VALIDATION GATE 2: Implementation Review

Service: {ServiceName}Service

Files Created:
- services/{service}/index.ts (X lines)
- services/{service}/crud.ts (X lines)
- services/{service}/business.ts (X lines)
- services/{service}/queries.ts (X lines)

Interface:
[Show TypeScript interface]

Anti-Pattern Check:
- [x] Functional factory ✅
- [x] Explicit interfaces ✅
- [x] SupabaseClient<Database> typing ✅
- [x] No classes ✅
- [x] No global state ✅
- [x] No ReturnType inference ✅
- [x] No service-to-service calls ✅
- [x] No console.* ✅

Type Safety:
- [x] All types explicit
- [x] Database types imported correctly
- [x] No 'any' usage

File Organization:
- [x] CRUD in crud.ts
- [x] Business logic in business.ts
- [x] Queries in queries.ts
- [x] Clean index.ts export

Ready for testing? (Reply "proceed" to continue)
```

**User must approve before Phase 3.**

---

## Phase 3: Testing (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, Bash (test execution)
**Output**: Test files + test report

### Step 3.1: Create Test Files

```bash
mkdir -p __tests__/services/{service}
touch __tests__/services/{service}/crud.test.ts
touch __tests__/services/{service}/business.test.ts
touch __tests__/services/{service}/queries.test.ts
```

### Step 3.2: Implement Test Coverage

**Required Test Categories**:

1. **CRUD Operations** (crud.test.ts)
   - [ ] Create: Happy path
   - [ ] Create: Validation errors
   - [ ] Read: Found
   - [ ] Read: Not found
   - [ ] Update: Success
   - [ ] Update: Not found
   - [ ] Delete: Success
   - [ ] Delete: Not found

2. **Business Logic** (business.test.ts)
   - [ ] Calculations correct
   - [ ] Edge cases handled
   - [ ] Validation logic works

3. **Specialized Queries** (queries.test.ts)
   - [ ] Query returns expected results
   - [ ] Handles empty results
   - [ ] Performance within limits

**Test Structure Pattern**:

```typescript
describe('{ServiceName}Service', () => {
  let supabase: SupabaseClient<Database>;
  let service: {ServiceName}Service;

  beforeEach(() => {
    supabase = createClient(...);
    service = create{ServiceName}Service(supabase);
  });

  describe('CRUD Operations', () => {
    it('should create entity successfully', async () => {
      // Test implementation
    });
  });
});
```

### Step 3.3: Run Tests

```bash
npm test -- services/{service}
```

**Target Coverage**: ≥80% lines, branches, functions

### Step 3.4: VALIDATION GATE 3 - Test Review

🛑 **STOP: Present test results**

**Test Report Format**:

```
🛑 VALIDATION GATE 3: Test Results

Service: {ServiceName}Service

Test Execution:
  Suites: X passed, X total
  Tests:  X passed, X total
  Time:   X seconds

Coverage:
  Lines:      XX% (target: 80%) [✅/❌]
  Branches:   XX% (target: 80%) [✅/❌]
  Functions:  XX% (target: 80%) [✅/❌]
  Statements: XX% (target: 80%) [✅/❌]

All Tests Passing: [✅ YES / ❌ NO]

Test Categories:
  - [x] CRUD operations (8/8 tests)
  - [x] Business logic (X tests)
  - [x] Specialized queries (X tests)

Integration Check:
- [ ] Works with existing services?
- [ ] No breaking changes?
- [ ] Performance acceptable (<100ms CRUD)?

Issues Found: [None / List issues]

Ready for documentation phase? (Reply "finalize" to continue)
```

**User must approve before Phase 4.**

---

## Phase 4: Documentation (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Updated memory files and documentation

### Step 4.1: Update Service Catalog

Add to `.claude/memory/service-catalog.memory.md`:

```markdown
### {ServiceName}Service

**Bounded Context**: "{Key question}"

**Location**: `services/{service}/`

**Ownership**:

- OWNS: [tables/fields]
- REFERENCES: [other services]

**Interface**:

- CRUD: create, getById, update, delete
- Specialized: [list specialized methods]

**Tests**: `__tests__/services/{service}/`

- Coverage: XX% (as of {date})

**Key Patterns**:

- [Pattern 1]
- [Pattern 2]

**Created**: {date}
**Last Updated**: {date}
```

### Step 4.2: Update SERVICE_RESPONSIBILITY_MATRIX

Add row to table in `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`:

```markdown
| {ServiceName} | {Bounded Context} | {Tables Owned} | {Tables Referenced} | services/{service}/ | {Date} |
```

### Step 4.3: Create Reference Documentation (Optional)

If service is complex, create `docs/services/{service}.md` with:

- API reference
- Usage examples
- Special considerations
- Integration points

### Step 4.4: Update Phase Status

Update `.claude/memory/phase-status.memory.md`:

```markdown
## Recently Completed

- ✅ {ServiceName}Service ({date})
  - All CRUD + X specialized queries
  - XX% test coverage
  - Zero anti-pattern violations
  - 3/3 validation gates passed
```

### Step 4.5: Final Summary

```
✅ SERVICE CREATION COMPLETE

Service: {ServiceName}Service
Bounded Context: "{Key question}"

Deliverables:
  - Implementation: services/{service}/ (X files, X lines)
  - Tests: __tests__/services/{service}/ (X tests, XX% coverage)
  - Specification: .claude/specs/{service}-service.spec.md
  - Documentation: service-catalog.memory.md, SERVICE_RESPONSIBILITY_MATRIX

Validation Gates Passed: 3/3
  - ✅ Gate 1: Design approved
  - ✅ Gate 2: Implementation reviewed
  - ✅ Gate 3: Tests validated

Quality Metrics:
  - Test coverage: XX% (≥80% ✅)
  - Anti-patterns: 0 violations ✅
  - Performance: <100ms CRUD ✅

Memory Files Updated:
  - service-catalog.memory.md
  - phase-status.memory.md

Next Steps:
  - Integrate with existing services
  - Create UI components if needed
  - Monitor performance in production
```

---

## Final Checklist

Before marking service creation complete:

- [ ] Specification created and approved (Gate 1)
- [ ] Implementation follows SERVICE_TEMPLATE_QUICK
- [ ] All anti-patterns avoided (8-point checklist)
- [ ] Tests written with ≥80% coverage
- [ ] All tests passing (Gate 3)
- [ ] service-catalog.memory.md updated
- [ ] SERVICE_RESPONSIBILITY_MATRIX updated
- [ ] phase-status.memory.md updated
- [ ] No breaking changes to existing services
- [ ] Specification file committed
- [ ] Implementation committed
- [ ] Tests committed
- [ ] Documentation committed

---

## Success Metrics

**Quality**:

- Zero anti-pattern violations
- Test coverage ≥80%
- All validation gates passed
- Type safety 100% (no `any`)

**Efficiency**:

- 2-4 hours total (vs 4-6 hours ad-hoc)
- 3 human approval checkpoints (vs continuous review)
- Deterministic outcomes (same workflow every time)

**Documentation**:

- Memory files auto-updated
- No manual documentation debt
- Cross-session continuity maintained

---

## Troubleshooting

### Gate 1 Fails (Design Issues)

**Symptoms**: Bounded context unclear, service overlap detected
**Action**: Return to bounded context analysis, use sequential-thinking MCP
**Escalation**: Review SERVICE_RESPONSIBILITY_MATRIX with architect

### Gate 2 Fails (Implementation Issues)

**Symptoms**: Anti-patterns detected, type safety violations
**Action**: Review SERVICE_TEMPLATE_QUICK, fix violations
**Escalation**: Switch to reviewer chatmode for comprehensive audit

### Gate 3 Fails (Test Issues)

**Symptoms**: Coverage <80%, tests failing, performance issues
**Action**: Add missing tests, debug failures, optimize queries
**Escalation**: Review test structure, consider integration test strategy

---

## Version History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0.0   | 2025-10-17 | Initial workflow creation (Phase 3) |

---

**Workflow Status**: Production Ready
**Last Updated**: 2025-10-17
**Maintained By**: Agentic Workflow Framework (Phase 3)
