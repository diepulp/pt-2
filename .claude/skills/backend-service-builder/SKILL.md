---
name: backend-service-builder
description: Build PT-2 service layer modules following bounded context rules, service patterns, and DTO standards. This skill should be used when implementing new backend services, database migrations, or service refactoring. Validates implementation against governance documents and flags documentation inconsistencies. (project)
---

# Backend Service Builder

Build PT-2 backend services following established architecture patterns, bounded context rules, and DTO standards.

## When To Use

- Creating a new service module (e.g., "Create a GameSession service")
- Adding database migrations with new tables
- Refactoring existing services to match governance standards
- Validating service implementation before merge

## When NOT To Use

- Frontend development (use `frontend-design-pt-2` skill)
- API endpoint creation (use `api-builder` skill)
- Simple code fixes without architectural changes

---

## Entry Point

**Start here**: Load `references/QUICK_START.md` for the fastest path to implementation.

Run optional pre-flight check to verify reference freshness:

```bash
python .claude/skills/backend-service-builder/scripts/check_primitive_freshness.py
```

---

## Reference Loading Guide

Load references based on the task at hand. Avoid loading all references at once.

| When Implementing... | Load Reference |
|----------------------|----------------|
| Any new service | `QUICK_START.md` (single entry point) |
| Pattern A/B/C selection | `service-patterns.md` |
| DTO types and derivation | `dto-rules.md` |
| Zod validation schemas | `zod-schemas.md` |
| Database migrations | `migration-workflow.md` |
| Authentication / casino context | `security-patterns.md` |
| Table ownership validation | `bounded-contexts.md` |
| Pre-merge validation | `validation-checklist.md` |

### Optional (Self-Improving Intelligence)

| When Needed... | Load Reference |
|----------------|----------------|
| Recording execution outcomes | `memory-protocol.md` |
| Pattern effectiveness tracking | `learning-system.md` |

---

## Validation Scripts

Execute these scripts to validate implementation before merge.

| Script | Purpose | When To Run |
|--------|---------|-------------|
| `validate_service_structure.py` | Check service follows architecture patterns | After creating service files |
| `detect_cross_context_violations.ts` | Validate bounded context integrity | Before merge |
| `validate_rls_coverage.ts` | Ensure RLS policies for all tables | After migrations |
| `check_doc_consistency.py` | Flag documentation drift | Before merge |
| `create_migration.sh` | Generate migration with proper timestamp | When adding tables |
| `check_primitive_freshness.py` | Verify primitives match source docs | Start of session |

### Usage Examples

```bash
# Validate service structure
python .claude/skills/backend-service-builder/scripts/validate_service_structure.py services/player/

# Check for cross-context violations
npx ts-node .claude/skills/backend-service-builder/scripts/detect_cross_context_violations.ts

# Create a new migration
.claude/skills/backend-service-builder/scripts/create_migration.sh add_achievements_table
```

---

## Source Documents

Authoritative governance documents referenced by this skill:

| Document | Location | Purpose |
|----------|----------|---------|
| SLAD | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Service patterns |
| SRM | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded contexts |
| DTO Standard | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | DTO derivation rules |
| ADR-012 | `docs/80-adrs/ADR-012-error-handling-layers.md` | Error handling |
| ADR-013 | `docs/80-adrs/ADR-013-zod-validation-schemas.md` | Zod schemas |
| ADR-002 | `docs/80-adrs/ADR-002-test-location-standard.md` | Test organization |
| QA-001 | `docs/40-quality/QA-001-service-testing-strategy.md` | Testing strategy |
| QA-004 | `docs/40-quality/QA-004-tdd-standard.md` | TDD workflow |

---

## Critical Conventions

### Migration Naming (MUST FOLLOW)

```bash
# Format: YYYYMMDDHHMMSS_description.sql
# Generate timestamp:
date +%Y%m%d%H%M%S

# ✅ Correct: 20251211153228_add_player_achievements.sql
# ❌ Wrong:   20251212000000_description.sql (placeholder zeros)
```

### RLS Policies (ADR-015 Pattern C)

All new RLS policies MUST use Pattern C with JWT fallback. See `references/migration-workflow.md`.

---

## Final Checklist

Before marking service implementation complete, verify:

- [ ] Pattern selected and justified in README.md
- [ ] `keys.ts` created with React Query key factories
- [ ] DTOs follow pattern-appropriate standards
- [ ] Tests in `__tests__/` subdirectory (ADR-002)
- [ ] All validation scripts pass
- [ ] Documentation consistency check run
- [ ] Migration follows `YYYYMMDDHHMMSS_description.sql` naming
- [ ] RLS policies use ADR-015 Pattern C (hybrid with JWT fallback)

For detailed checklist, load `references/validation-checklist.md`.
