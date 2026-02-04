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
| TEMP-001 | `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md` | Gaming day computation spec |
| TEMP-002 | `docs/20-architecture/temporal-patterns/TEMP-002-temporal-authority-pattern.md` | Temporal authority pattern |
| TEMP-003 | `docs/20-architecture/temporal-patterns/TEMP-003-temporal-governance-enforcement.md` | Banned patterns, enforcement |
| PRD-027 | `docs/10-prd/PRD-027-temporal-standardization-v0.1.md` | System time standardization |

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

## Temporal Patterns (TEMP-001/002/003, PRD-027)

**Registry:** `docs/20-architecture/temporal-patterns/INDEX.md`

### Non-Negotiable Rules

1. **The database owns `gaming_day`.** Application code must NEVER derive `gaming_day`, gaming-day boundaries, or weekly/monthly ranges using JS date math.
2. **All triggers must call `compute_gaming_day()`.** No inline reimplementation of boundary logic.
3. **RPCs must not accept `casino_id` for temporal computation.** Use `rpc_current_gaming_day()` which derives scope from RLS context (ADR-024).

### When Building Services That Touch Gaming Day

| Context | Correct Approach | Layer | Reference |
|---------|-----------------|-------|-----------|
| New table with `gaming_day` column | Create trigger calling Layer 1 `compute_gaming_day(ts, gstart)` | Layer 1 | TEMP-001 §3.1, §4 |
| Service needing current gaming day | Call Layer 2 `compute_gaming_day(casino_id, timestamp)` via RPC | Layer 2 | TEMP-001 §3.2 |
| RSC page needing gaming day | Use `getServerGamingDay(supabase)` → `rpc_current_gaming_day()` | Layer 3 | TEMP-003 §4.3 |
| Weekly/range date queries | Use `rpc_gaming_day_range(p_weeks)` — no JS "weeks ago" math | Layer 3 | TEMP-003 §5 |

### Banned Patterns (TEMP-003 §3)

- `new Date().toISOString().slice(0, 10)` — UTC calendar date ≠ gaming day
- `getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()` for business dates
- `new Date()` arithmetic to compute `gaming_day`
- Accepting `gaming_day` as RPC/service input

### Trigger Template (Layer 1)

```sql
-- Standard trigger: fetch gstart as TIME, call Layer 1 pure math
create or replace function set_{table}_gaming_day()
returns trigger language plpgsql as $$
declare
  gstart time;
begin
  select coalesce(gaming_day_start_time, time '06:00')
  into gstart
  from casino_settings
  where casino_id = new.casino_id;

  new.gaming_day := compute_gaming_day(
    coalesce(new.created_at, now()),
    gstart
  );
  return new;
end$$;
```

### Migration Checklist (Gaming Day Tables)

When adding `gaming_day` to a new table (per TEMP-001 §12):

- [ ] Add `gaming_day date NOT NULL` column
- [ ] Create trigger calling `compute_gaming_day()` (Layer 1)
- [ ] Attach `BEFORE INSERT OR UPDATE` trigger
- [ ] Add index on `(casino_id, gaming_day DESC)`
- [ ] Ensure service write contract rejects `gaming_day` as input
- [ ] Run `npm run db:types`

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
- [ ] RLS read policies use ADR-015 Pattern C (hybrid with JWT fallback)
- [ ] RLS write policies on critical tables use session vars only — no JWT fallback (ADR-030)
- [ ] **SECURITY DEFINER RPCs self-inject context before data access** (ADR-015)
- [ ] Claims sync/clear errors surfaced, not silently caught (ADR-030 D2)

### RPC Self-Injection Requirement (ADR-015)

Any `SECURITY DEFINER` RPC that accesses casino-scoped data MUST:

1. **Pattern 1 (RLS-only)**: Extract and inject context before queries
   ```sql
   v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
   IF v_casino_id IS NULL THEN
     v_casino_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'casino_id')::uuid;
   END IF;
   PERFORM set_config('app.casino_id', v_casino_id::text, true);
   ```

2. **Pattern 2 (with p_casino_id param)**: Also validate parameter matches context
   ```sql
   IF p_casino_id != v_context_casino_id THEN
     RAISE EXCEPTION 'casino_id mismatch';
   END IF;
   ```

**Pre-commit hook enforces this.** See `docs/70-governance/anti-patterns/07-migrations.md`.

For detailed checklist, load `references/validation-checklist.md`.
