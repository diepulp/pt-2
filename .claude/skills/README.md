# PT-2 Production Skills (Phase 1)

This directory contains Claude Code skills for enforcing PT-2 architectural standards based on the Service Responsibility Matrix (SRM) and SDLC documentation taxonomy.

## Skills Overview

### Phase 1 (Critical - Production Ready)

#### 1. `pt2-migration-manager`
**Purpose**: Enforce database migration workflow with timestamp naming, RLS policy shipping, and automatic type regeneration.

**Use when**:
- Creating new migrations
- Modifying schema
- Adding/updating RLS policies

**Key features**:
- Timestamp-named migration generation (`YYYYMMDDHHMMSS_description.sql`)
- Automated migration application + type regeneration workflow
- RLS coverage validation
- Migration checklist enforcement

**Quick start**:
```bash
# Create migration
bash skills/pt2-migration-manager/scripts/create-migration.sh "add_loyalty_table"

# Apply and regenerate types
bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh

# Validate RLS coverage
npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts
```

---

#### 2. `pt2-service-builder`
**Purpose**: Create or modify services following SRM bounded contexts, functional factory patterns, and DTO contract policies.

**Use when**:
- Creating new service layers
- Adding service functions/RPCs
- Refactoring services to follow PT-2 patterns

**Key features**:
- Service scaffold generation with proper structure
- Enforces functional factories (not classes)
- Validates bounded context isolation
- DTO co-location requirements

**Quick start**:
```bash
# Generate service stub
npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts loyalty

# Implement service following SKILL.md guidance
# Edit services/loyalty/dtos.ts (define DTOs)
# Edit services/loyalty/index.ts (implement factory)

# Validate compliance
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

---

#### 3. `pt2-dto-validator`
**Purpose**: Validate DTO contracts and detect cross-context violations to maintain bounded context integrity.

**Use when**:
- After modifying service DTOs
- Before committing service changes
- In CI/CD pipeline
- Auditing existing services

**Key features**:
- DTO export coverage validation (SRM §34-48)
- Cross-context violation detection (SRM §54-73)
- Bounded context access rule enforcement
- ESLint rule compliance checking

**Quick start**:
```bash
# Check DTO exports
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts

# Detect violations
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts

# Run all checks
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

---

## Architecture Context

These skills enforce the following PT-2 architectural principles:

### Service Responsibility Matrix (SRM v3.0.2)
- **Canonical contract**: SRM is source of truth (ADR-000)
- **Bounded contexts**: 9 service domains with clear ownership
- **Table ownership**: Each service owns specific tables
- **DTO contracts**: Services export DTOs for owned tables

### Key Standards Enforced

1. **Migration Workflow** (CLAUDE.md):
   - Timestamp naming: `YYYYMMDDHHMMSS_description.sql`
   - Type regeneration: `npm run db:types` after every migration
   - RLS policies: Must ship with schema changes

2. **Service Layer** (SERVICE_TEMPLATE.md):
   - Functional factories, not classes
   - Explicit interfaces (no ReturnType inference)
   - SupabaseClient<Database> typing
   - No global singletons

3. **DTO Contracts** (DTO_CANONICAL_STANDARD.md):
   - Table ownership → DTO ownership
   - No cross-context direct table access
   - Cross-context consumption via public DTOs only
   - Canonical vs Contract-First patterns

## Bounded Context Ownership (SRM §34-48)

| Service | Owns Tables | Service Directory |
|---------|-------------|-------------------|
| Casino | casino, casino_settings, staff, game_settings, etc. | /services/casino/ |
| Player | player | /services/player/ |
| Visit | visit | /services/visit/ |
| Loyalty | player_loyalty, loyalty_ledger, loyalty_outbox | /services/loyalty/ |
| RatingSlip | rating_slip | PENDING (removed, rebuild when needed) |
| Finance | player_financial_transaction, finance_outbox | /services/finance/ |
| MTL | mtl_entry, mtl_audit_note | /services/mtl/ |
| TableContext | gaming_table, dealer_rotation, chip custody tables | PENDING (removed, rebuild when needed) |
| FloorLayout | floor_layout, floor_layout_version, etc. | /services/floor-layout/ |

## Validation Workflow

### Pre-Commit Checks
```bash
# Run all Phase 1 validations
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

### CI Pipeline Integration
```yaml
# .github/workflows/ci.yml
- name: Validate PT-2 Architecture
  run: |
    npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
    npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

### Manual Service Audit
```bash
# Check migration naming
ls -la supabase/migrations/

# Validate service structure
ls -la services/loyalty/

# Check DTO exports
cat services/loyalty/dtos.ts

# Run validators
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

## Common Workflows

### Workflow 1: Add New Table
```bash
# 1. Create migration
bash skills/pt2-migration-manager/scripts/create-migration.sh "add_rewards_table"

# 2. Edit migration file (add table, RLS, indexes)
vim supabase/migrations/YYYYMMDDHHMMSS_add_rewards_table.sql

# 3. Apply migration and regen types
bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh

# 4. Validate RLS
npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts

# 5. Update service DTOs
vim services/loyalty/dtos.ts  # Add RewardsDTO

# 6. Validate DTO compliance
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

### Workflow 2: Create New Service
```bash
# 1. Generate service stub
npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts rewards

# 2. Review SRM for table ownership
cat docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md

# 3. Define DTOs
vim services/rewards/dtos.ts

# 4. Implement service factory
vim services/rewards/index.ts

# 5. Validate compliance
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

### Workflow 3: Refactor Cross-Context Access
```bash
# 1. Detect violations
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts

# 2. Fix violations by importing DTOs instead of direct table access
# Before: type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row']
# After:  import type { RatingSlipDTO } from '@/services/rating-slip/dtos'

# 3. Validate fix
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

## Anti-Patterns Prevented

These skills prevent the following anti-patterns (from ANTI_PATTERN_CATALOG.md):

❌ Class-based services
❌ ReturnType inference
❌ Global singletons
❌ Cross-context direct table access
❌ Missing DTO exports
❌ Untyped supabase parameters
❌ Manual migration timestamps
❌ Missing RLS policies
❌ Skipping type regeneration

## References

### Core Documentation
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v3.0.2
- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **RLS Policies**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Migration Standards**: `docs/60-release/MIGRATION_NAMING_STANDARD.md`
- **Anti-Patterns**: `docs/70-governance/anti-patterns/INDEX.md` (modular catalog)
- **SDLC Taxonomy**: `docs/patterns/SDLC_DOCS_TAXONOMY.md`

### Project Standards
- **CLAUDE.md**: Critical standards and workflows
- **ADR-000**: Matrix-as-Contract philosophy
- **ADR-003**: State management strategy
- **ADR-008**: Service layer architecture
- **ADR-010**: DTO compliance

### SDLC Audit
- **Taxonomy Audit**: `docs/audits/SDLC_TAXONOMY_AUDIT.md` (92% → 100% with these skills)
- **SRM Audit**: `docs/audits/SRM_AUDIT_REPORT_NOV_10.md`

## Future Phases

### Phase 2 (Governance - Planned)
- `pt2-adr-writer`: Create ADRs with SRM traceability
- `pt2-observability-spec`: Extract and enforce observability patterns

### Phase 3 (Developer Experience - Planned)
- `pt2-service-readme-generator`: Auto-generate service documentation from SRM

## Skill Installation

These skills are designed for Claude Code and follow Anthropic's skills specification.

**Structure**:
```
skills/
├── pt2-migration-manager/
│   ├── SKILL.md           # Skill definition
│   ├── scripts/           # Executable scripts
│   └── references/        # Bundled documentation
├── pt2-service-builder/
│   ├── SKILL.md
│   └── scripts/
└── pt2-dto-validator/
    ├── SKILL.md
    └── scripts/
```

**Usage**:
Claude Code will automatically detect and load these skills when relevant to the task at hand.

## Success Criteria

✅ Migration workflow enforced (timestamp naming, RLS, type regen)
✅ Service layer follows functional factory patterns
✅ Bounded context isolation maintained
✅ DTO contracts validated
✅ Cross-context violations prevented
✅ SDLC taxonomy compliance: 100%

## Support

For issues or questions:
1. Review skill SKILL.md files for detailed guidance
2. Check reference documentation in `docs/`
3. Consult SDLC Taxonomy Audit for architectural context

---

**Version**: 1.0.0
**Status**: Production Ready (Phase 1)
**Last Updated**: 2025-11-10
**Audit Reference**: docs/audits/SDLC_TAXONOMY_AUDIT_REPORT_NOV_10.md
