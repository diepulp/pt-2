---
name: backend-service-builder
description: Build PT-2 service layer modules following bounded context rules, service patterns, and DTO standards. This skill should be used when implementing new backend services, database migrations, or service refactoring. Validates implementation against governance documents and flags documentation inconsistencies.
---

# Backend Service Builder

## Quick Start

**Start here**: Read `references/QUICK_START.md` for the fastest path to implementation.

```
references/
├── QUICK_START.md           <- Start here (single entry point)
├── dto-rules.md             <- DTO derivation rules (Pattern A vs B) + RPC types
├── dto-compliance.md        <- DTO pattern enforcement (MANDATORY)
├── service-patterns.md      <- Pattern A/B/C + shared types + error handling (ADR-012)
├── zod-schemas.md           <- Zod validation schemas for HTTP boundaries (ADR-013)
├── security-patterns.md     <- Casino context derivation, trust boundaries (V4 critical)
├── bounded-contexts.md      <- Table ownership matrix
├── validation-checklist.md  <- Pre-merge validation (includes V1-V6, W1-W6 checks)
├── migration-workflow.md    <- Database migration workflow
├── memory-protocol.md       <- Memory recording (optional)
└── learning-system.md       <- Self-improving intelligence (optional)

generated/
└── freshness-manifest.json  <- Source document hashes for drift detection
```

### Pre-flight Check (Optional)

```bash
python .claude/skills/backend-service-builder/scripts/check_primitive_freshness.py
```

---

## Overview

This skill guides implementation of PT-2 backend services following established architecture patterns:

1. **Pattern-based service creation** (Contract-First, Canonical CRUD, or Hybrid)
2. **Database migration workflow** with RLS policy enforcement
3. **DTO standards compliance** (Pattern A vs Pattern B rules)
4. **Bounded context validation** (SRM ownership enforcement)
5. **Documentation consistency checking** (flags drift between docs and code)

## When to Use This Skill

**Use for:**
- Creating a new service module (e.g., "Create a GameSession service")
- Adding database migrations with new tables
- Refactoring existing services to match governance standards
- Validating service implementation before merge

**Do not use for:**
- Frontend development (use `frontend-design` skill)
- API endpoint creation (use `api-builder` skill)
- Simple code fixes without architectural changes

---

## Service Implementation Workflow

### Step 1: Pattern Selection

See `references/service-patterns.md` for complete decision tree.

```
Complex business logic? (Loyalty, Finance, MTL)
└─> Pattern A: Contract-First
    Files: keys.ts, {feature}.ts, {feature}.test.ts, README.md
    DTOs: Manual interfaces with inline mappers

Simple CRUD? (Player, Visit, Casino)
└─> Pattern B: Canonical CRUD
    Files: keys.ts, dtos.ts, selects.ts, mappers.ts, crud.ts, README.md
    DTOs: Pick/Omit from Database types
    Mappers: Row → DTO transformations (REQUIRED for services with crud.ts)

Mixed complexity? (RatingSlip)
└─> Pattern C: Hybrid
```

### Step 2: Database Migration (If Required)

See `references/migration-workflow.md` for complete workflow.

```bash
# Create migration with proper timestamp
.claude/skills/backend-service-builder/scripts/create_migration.sh add_achievements_table

# Apply migration
npx supabase migration up

# Regenerate types (required after every migration)
npm run db:types
```

### Step 3: Create Service Files

**All patterns require:**
- `services/{domain}/keys.ts` - React Query key factories
- `services/{domain}/README.md` - Service documentation with SRM reference

**HTTP boundary services additionally require:**
- `services/{domain}/schemas.ts` - Zod validation schemas for request bodies and query params (see ADR-013)

**Pattern A additionally requires:**
- `services/{domain}/{feature}.ts` - Business logic with inline DTOs
- `services/{domain}/{feature}.test.ts` - Unit tests

See `references/QUICK_START.md` for file templates.

### Step 4: DTO Compliance

See `references/dto-rules.md` for complete rules.

**Pattern B**: Must use `Pick`/`Omit` from Database types
**Pattern A**: Manual interfaces allowed with mappers

### Step 5: Validate Bounded Context

See `references/bounded-contexts.md` for table ownership matrix.

Services can only access tables they own. Cross-context data requires importing DTOs from the owning service.

### Step 6: Validate Implementation

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm test services/{domain}/

# Check coverage
npm run test:coverage
```

### Step 7: Documentation Consistency Check

Run the consistency checker to detect drift:

```bash
.claude/skills/backend-service-builder/scripts/check_doc_consistency.py
```

This detects:
- SLAD compliance drift
- SRM ownership conflicts
- Migration naming violations
- DTO standard violations

---

## Anti-Patterns

**Pre-commit Enforcement**: Check 11 in `.husky/pre-commit-service-check.sh` automatically blocks `as` type casting in crud.ts files.

| Anti-Pattern | Correct Pattern | Violation |
|--------------|-----------------|-----------|
| `interface` for Pattern B DTOs | Use `type` + Pick/Omit | - |
| Missing `keys.ts` | All services need key factories | - |
| Missing `mappers.ts` for Pattern B services with crud.ts | Add mappers per SLAD §326-331 | V1 |
| `as` type assertions in crud.ts | Use mapper functions from mappers.ts | V1 (Check 11) |
| Missing `schemas.ts` for HTTP boundary services | Add Zod schemas per ADR-013 | ADR-013 |
| Inline Zod schemas in route handlers | Extract to `schemas.ts` | ADR-013 |
| **Test files at service root** | **Place in `__tests__/` subdirectory** | **ADR-002** |
| Cross-context `Database['...']['other_table']` | Import DTO from owning service | - |
| `ReturnType<typeof createService>` | Explicit `interface XService` | - |
| `supabase: any` | `supabase: SupabaseClient<Database>` | - |
| `data as RatingSlipDTO` | Use mapper with RPC return types | V1 |
| Duplicate `ServiceResult<T>` definition | Import from `lib/http/service-response.ts` | V3 |
| `headers.get('x-casino-id')` | Derive from authenticated user's staff record | V4 |
| Service returning `ServiceResult<T>` | Service throws `DomainError`, transport returns envelope | ADR-012 |
| Foreign domain errors leaking across contexts | Wrap in local domain vocabulary (see service-patterns.md §Cross-Context) | ADR-012 Addendum |
| Zod schemas importing from `dtos.ts` | Keep schemas independent; DTOs for services, schemas for transport | ADR-013 |

---

## Testing Standards

See `docs/40-quality/QA-001-service-testing-strategy.md`, `docs/40-quality/QA-004-tdd-standard.md`, and `docs/80-adrs/ADR-002-test-location-standard.md`.

**Test File Organization (ADR-002 v3.0.0):**
All test files MUST be in `__tests__/` subdirectories:
```
services/{domain}/
├── __tests__/
│   ├── {domain}.test.ts              # Unit tests
│   ├── {domain}.integration.test.ts  # Integration tests
│   └── {feature}.test.ts             # Feature-specific tests
├── index.ts
├── crud.ts
├── dtos.ts
├── mappers.ts
└── README.md
```

**Coverage Targets:**
- Pattern A services: 90% for CRUD, 85% for workflows
- Pattern B services: Tests optional (logic in Server Actions)
- DTO mappers: 100% coverage

**TDD Workflow (QA-004):**
1. **RED**: Write failing test in `__tests__/` with typed Supabase double
2. **GREEN**: Implement minimal service logic
3. **REFACTOR**: Extract error mapping, add domain errors

---

## Final Checklist

Before marking service implementation complete:

- [ ] Pattern selected and justified in README.md
- [ ] Migration created with YYYYMMDDHHMMSS timestamp (if needed)
- [ ] RLS policies defined for all new tables
- [ ] Types regenerated (`npm run db:types`)
- [ ] keys.ts created with React Query key factories
- [ ] DTOs follow pattern-appropriate standards (dtos.ts with Pick/Omit for Pattern B)
- [ ] **mappers.ts created for Pattern B services with crud.ts (NO `as` casting)**
- [ ] **Tests in `__tests__/` subdirectory (ADR-002 v3.0.0)**
- [ ] **mappers.test.ts in `__tests__/` with unit tests for all mapper functions**
- [ ] **schemas.ts created for HTTP boundary services (ADR-013)**
- [ ] **Zod validation failures map to `VALIDATION_ERROR` envelope**
- [ ] No cross-context table access (validated)
- [ ] README.md complete with required sections
- [ ] All validation scripts pass
- [ ] Tests written and passing (Pattern A and mappers)
- [ ] Documentation consistency check run

---

## Self-Improving Intelligence (Optional)

This skill includes adaptive learning mechanisms. See:
- `references/learning-system.md` - Pattern effectiveness tracking, recommendations
- `references/memory-protocol.md` - Recording execution outcomes

---

## Resources

### Scripts

| Script | Purpose |
|--------|---------|
| `validate_service_structure.py` | Check service follows architecture patterns |
| `detect_cross_context_violations.ts` | Validate bounded context integrity |
| `validate_rls_coverage.ts` | Ensure RLS policies for all tables |
| `check_doc_consistency.py` | Flag documentation drift |
| `create_migration.sh` | Generate migration with proper timestamp |
| `check_primitive_freshness.py` | Verify primitives match source docs |

### Source Documents

| Document | Location |
|----------|----------|
| SLAD (patterns) | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| SRM (boundaries) | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| DTO Standard | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` |
| **Zod Schemas (ADR-013)** | `docs/80-adrs/ADR-013-zod-validation-schemas.md` |
| **Test Organization (ADR-002)** | `docs/80-adrs/ADR-002-test-location-standard.md` |
| Testing Strategy | `docs/40-quality/QA-001-service-testing-strategy.md` |
| TDD Standard | `docs/40-quality/QA-004-tdd-standard.md` |
