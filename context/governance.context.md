# Governance Context (GOV - 70-governance/)
canonical_source: docs/patterns/SDLC_DOCS_TAXONOMY.md
owner: Engineering Lead
docs:
  - docs/70-governance/SERVICE_TEMPLATE.md
  - docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md
  - docs/70-governance/FRONT_END_CANONICAL_STANDARD.md
  - docs/80-adrs/ADR-010-dto-compliance-gate.md
  - docs/80-adrs/ADR-011-over-engineering-guardrail.md
  - docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md

## Service Template Structure (ADR-010)

```
services/{domain}/
├── index.ts          # Factory + explicit interface export
├── dtos.ts           # Derived from Database types
├── selects.ts        # Centralized column lists
├── crud.ts           # CRUD operations
├── operations.ts     # Business logic (optional)
└── README.md         # Domain ownership, operations, query keys
```

### Template Compliance Checklist
- [ ] DTOs derive from `Database['public']['Tables'][...]` (no manual interfaces)
- [ ] Service factory exports explicit interface (no `ReturnType<typeof>`)
- [ ] All operations use `executeOperation` wrapper
- [ ] Selects centralized in `selects.ts` (no inline column lists)
- [ ] Tests in `__tests__/services/{domain}/`

## Over-Engineering Guardrail (OE-01)

**Valid Triggers for Infrastructure/Abstractions**:
- ✅ **Second consumer exists**: Abstraction needed by 2+ concrete use cases
- ✅ **SLO breach**: Performance metrics require optimization/caching
- ✅ **Compliance mandate**: Audit trail, encryption, or regulatory requirement
- ✅ **Horizontal scale**: Multi-tenant or cross-domain coordination needed

**Blocked Without Trigger**:
- ❌ Generic event buses with zero consumers
- ❌ Service factories with caching/state before performance issues
- ❌ Premature optimization before measuring bottlenecks
- ❌ Abstractions "for future flexibility" without concrete need

**Enforcement**:
- PR template requires: Which OE-01 trigger applies? Link to evidence.
- Mini-ADR required for >150 LOC infrastructure changes

## Frontend Standards

### Component Patterns
- **React 19 conventions**: Avoid prop-drilling, prefer composition
- **Server components default**: Use client components only when needed (interactivity)
- **Colocation**: Components, styles, tests live together
- **Accessibility**: Focus order, ARIA labels, keyboard navigation required

### State Management (ADR-003)
- **Server data**: React Query only (staleTime: 5min, gcTime: 30min)
- **UI state**: Zustand for modals, filters, view preferences (no server data)
- **Query keys**: `[domain, operation, ...params]` pattern
- **Invalidation**: Domain-level for creates, granular for updates

### Styling
- **Tailwind utility-first**: No inline styles unless dynamic
- **shadcn/ui library**: De-facto standard for UI components
- **Design tokens**: Use CSS variables for theming

## Type System Standards (ADR-001)

### Type Generation Workflow
```bash
# After migrations
npm run db:types           # Generate local types
npm test schema-verification  # Verify schema alignment

# Before remote deployment
npm run db:types:remote    # Generate remote types
diff types/database.types.ts types/remote/database.types.ts
```

### Import Patterns
```typescript
// ✅ Services, hooks, components
import type { Database } from "@/types/database.types";

// ✅ Validation scripts
import type { Database } from "@/types/remote/database.types";
```

## Migration Standards

### Naming Convention (REQUIRED)
- **Pattern**: `YYYYMMDDHHMMSS_description.sql`
- **Generate**: `date +"%Y%m%d%H%M%S"`
- **Example**: `20251014134942_mtl_schema_enhancements.sql`
- ❌ **Never**: `YYYYMMDD000001` or `YYYYMMDD_description`

### Workflow
1. Create migration: `supabase migration new feature_name`
2. Apply locally: `supabase db reset` (or `migration up`)
3. Regenerate types: `npm run db:types`
4. Update RLS policies in same migration
5. Test schema verification: `npm test schema-verification`
6. Commit: `git add supabase/migrations/ types/database.types.ts`

## When to Reference Full Docs

- **Creating service**: Read docs/70-governance/SERVICE_TEMPLATE.md (full template)
- **New infrastructure**: Read docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md
- **Frontend patterns**: Read docs/70-governance/FRONT_END_CANONICAL_STANDARD.md
- **DTO compliance**: Read docs/80-adrs/ADR-010-dto-compliance-gate.md
