# PT-2 Architecture Standards

<!-- Auto-load Memory Files (Phase 1 Agentic Workflow) -->
<!-- These 6 memory files provide compressed context from 203k-word documentation -->

@memory/project.memory.md
@memory/anti-patterns.memory.md
@memory/architecture-decisions.memory.md
@memory/phase-status.memory.md
@memory/service-catalog.memory.md
@memory/domain-glossary.memory.md

<!-- Full Documentation References (use when memory files insufficient) -->
<!-- PRD: docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md -->
<!-- Service Architecture: docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md -->
<!-- Patterns: docs/patterns/BALANCED_ARCHITECTURE_QUICK.md -->
<!-- Bounded Contexts: docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md -->
<!-- State Management: docs/adr/ADR-003-state-management-strategy.md -->
<!-- Integrity: docs/integrity/INTEGRITY_FRAMEWORK.md -->
<!-- Index: docs/INDEX.md -->

## Critical Standards (Quick Reference)

### Over-Engineering Guardrail

See `docs/patterns/OVER_ENGINEERING_GUARDRAIL.md`

### Service Layer

- Use functional factories, not classes
- Explicit interfaces, ban `ReturnType` inference
- Type `supabase` parameter as `SupabaseClient<Database>`, never `any`
- No global singletons or stateful factories

### Type System

- Single source: `types/database.types.ts`
- No manual table type redefinitions
- Use Pick/Omit/mapped types only
- **CRITICAL**: Run `npm run db:types` after every migration
- **CRITICAL**: Schema verification test MUST pass before merge

### Real-Time

- Domain-specific hooks only
- No global connection pools or managers
- Clean up subscriptions on unmount

### Anti-Patterns (DO NOT)

- ❌ Class-based services
- ❌ `ReturnType<typeof createXService>`
- ❌ Global real-time managers
- ❌ `console.*` in production
- ❌ Deprecated code marked `@deprecated`
- ❌ `as any` type casting

### DB Workflow

- all migrations are ran against the local db
- do not use psql, it Doesn't trigger cache reload — must run NOTIFY pgrst, 'reload schema'
- Apply migrations via **npx supabase migration** up or **npx supabase db reset**

### Migration Naming Convention

- **REQUIRED**: All migration files MUST follow `YYYYMMDDHHMMSS_description.sql` pattern
- Use actual file creation timestamp: `date +"%Y%m%d%H%M%S"`
- ❌ DO NOT use simplified patterns like `YYYYMMDD000001` or `YYYYMMDD_description`
- ✅ Example: `20251014134942_mtl_schema_enhancements.sql`


### UI

- The de-facto standard for UI is shadcn UI library and the respective registries provided by the Shadcn MCP server
