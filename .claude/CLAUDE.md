# PT-2 Architecture Standards

<!-- Reference the full PRD -->

See `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` for complete architecture specification.
see `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` for service layer architecture standards and diagram
See `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md` for for vertical vs horizontal slicing decisions
See `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` for bounded context integrity
See `docs/INDEX.md` for documentation index

## Critical Standards (Quick Reference)

### Service Layer

- Use functional factories, not classes
- Explicit interfaces, ban `ReturnType` inference
- Type `supabase` parameter as `SupabaseClient<Database>`, never `any`
- No global singletons or stateful factories

### Type System

- Single source: `types/database.types.ts`
- No manual table type redefinitions
- Use Pick/Omit/mapped types only

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
