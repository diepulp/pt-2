# Architecture Context (ARCH - 20-architecture/)
canonical_source: docs/patterns/SDLC_DOCS_TAXONOMY.md
owner: Architecture
docs:
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
  - docs/20-architecture/BALANCED_ARCHITECTURE_QUICK.md
  - docs/80-adrs/ADR-000-matrix-as-contract.md
  - docs/80-adrs/ADR-008-service-layer-architecture.md
  - docs/80-adrs/ADR-009-balanced-architecture-intake.md

## Core Principles

### SRM as Canonical Contract (ADR-000)
- **Schema mirrors SRM**: All identifiers are `lower_snake_case`, UUIDs for PKs/FKs
- **Matrix-first flow**: SRM change → migration SQL → regenerated types → services → tests
- **Ownership enforcement**: Records carry `casino_id` (tenancy), financial records store `gaming_day`
- **RLS derives from SRM**: Row-level security policies ship with schema changes

### Service Layer Architecture (ADR-008)
- **Functional factories**: Export explicit interfaces, no `ReturnType<typeof>` inference
- **DTO derivation**: `type XDTO = Pick<Database['public']['Tables']['x']['Row'], ...>`
- **Shared helpers**: Operation wrappers, ServiceResult, error maps in `services/shared/`
- **No cross-context imports**: Only consume published DTOs/views from other domains
- **RPC/DTO only**: Cross-context consumers must call service-owned RPCs or DTO mappers (per SRM). Direct table reads across bounded contexts are forbidden.
- **CQRS light for telemetry**: Hot domains (RatingSlip, TableContext) write to append-only models and expose read-side projections/events; downstream readers use those projections.
- **Outbox reliability**: Finance/Loyalty services append to service-owned outbox tables for external side effects; workers drain via `FOR UPDATE SKIP LOCKED` to guarantee exactly-once delivery.

### DTO Contract Policy (Type System Integrity)
**Reference**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`, `SRM:28-295`

**Three DTO Patterns by Service Type**:

1. **Bounded Context Services** (Loyalty, Finance, MTL, TableContext)
   - Pattern: Contract-First DTOs (SRM-aligned interfaces + mappers)
   - DTOs live in `services/{service}/dtos.ts` (domain contracts)
   - Mappers in `services/{service}/mappers.ts` (DB ↔ DTO transformation)
   - Database types imported ONLY in mappers (internal use)
   - Example: `PlayerLoyaltyDTO` interface with explicit fields, decoupled from schema

2. **Thin CRUD Services** (Player, Visit, Casino)
   - Pattern: Canonical DTOs (Pick/Omit from Database types with allowlist)
   - DTOs live in `services/{service}/dtos.ts`
   - Use `Pick<Database['public']['Tables']['x']['Row'], ...>` with explicit fields
   - ESLint enforces column allowlist for sensitive tables (player, staff)
   - Example: `type PlayerDTO = Pick<Database['public']['Tables']['player']['Row'], 'id' | 'first_name' | 'last_name'>`

3. **Hybrid Services** (RatingSlip)
   - Pattern: Canonical DTOs for owned data + mapper for cross-context publishing
   - Internal DTO: `type RatingSlipDTO = Database['public']['Tables']['rating_slip']['Row']`
   - Published DTO: `interface RatingSlipTelemetryDTO` (explicit contract for Loyalty/Finance consumers)
   - Mapper: `toTelemetryDTO(slip: RatingSlipDTO): RatingSlipTelemetryDTO`

**Bounded Context Enforcement**:
- ❌ FORBIDDEN: `type X = Database['public']['Tables']['other_service_table']['Row']`
- ✅ REQUIRED: `import type { XDTO } from '@/services/other-service/dtos'`
- ESLint rule: `no-cross-context-db-imports` (errors on cross-context table access)
- Ownership matrix: SRM:28-295

**Column Exposure Policy**:
- All DTOs MUST include JSDoc with `Exposure:` and `Excludes:` sections
- Sensitive tables (player, staff, financial, loyalty) have explicit allowlists
- PII fields (ssn, birth_date, email) forbidden from public DTOs
- Internal fields (idempotency_key, preferences) forbidden from external APIs
- ESLint rule: `dto-column-allowlist` (errors on forbidden field usage)

**Migration Workflow**:
1. Update SRM with table ownership
2. Run migration: `npx supabase migration new {description}`
3. Regenerate types: `npm run db:types` (CRITICAL)
4. Create/Update DTOs in owning service's `dtos.ts`
5. Add mappers (if bounded context service)
6. Run type check: `npm run type-check` (must pass)
7. Run ESLint: `npx eslint services/{service}/` (must pass)
8. Update tests with same DTOs

### Balanced Architecture Intake (ADR-009)
- **Intake card required**: Every feature needs classification (Vertical/Horizontal/Hybrid)
- **Transport decision**: React Query → Route Handler, Forms/RSC → Server Action
- **Scope control**: Default to vertical slices unless trigger justifies horizontal infrastructure

## Service Ownership Matrix (Quick Reference)

| Domain | Service | Owns | References |
|--------|---------|------|------------|
| **Foundational** | Casino | `casino`, `casino_settings` (exclusive write) | Company data |
| **Identity** | Player | `player` profile & documents | Casino, visits |
| **Session** | Visit | `visit` lifecycle (check-in/out) | Player, casino, rating slips |
| **Telemetry** | RatingSlip | Gameplay measurement (`rating_slip`) | Visit, table, loyalty |
| **Reward** | Loyalty | Points engine (`player_loyalty`, ledger) | Player, rating slips |
| **Finance** | PlayerFinancial | Transaction ledger (append-only) | Player, visit, MTL |
| **Compliance** | MTL | Immutable cash log (`mtl_entry`) | Casino settings, player |
| **Operational** | TableContext | Tables, dealers, fills/drops | Casino, staff |
| **Operational** | FloorLayoutService | Tables, dealers, fills/drops | Casino, staff | Floor layout drafts & approvals, Layout versions (immutable snapshots), Pit definitions & sections, Table slot placements, Layout activation log/events | • Casino (FK), Staff (FK, admins), TableContext (event consumers), Activation history, Layout review queues
| **Observability** | Performance | Metrics, alerts (read-only) | All domains |

## Bounded Context Rules

✅ **Allowed**:
- Services consume their owned tables via Supabase client
- Read published views/DTOs from other contexts
- Orchestrate cross-context calls in server actions/route handlers

❌ **Forbidden**:
- Direct joins across bounded contexts in service layer
- Service-to-service calls (services are stateless factories)
- Bypassing RLS with service-role keys in runtime code
- Caching or adding state to service factories

## Work Classification Quick Reference

| Type | Contexts | Layers | Timeline | Transport |
|------|----------|--------|----------|-----------|
| **Vertical** | 1 | DB→Service→UI | 2-5 days | Server Action |
| **Horizontal** | 2+ | Service only | 3-7 days | Route Handler |
| **Hybrid** | 2+ | DB→Service→UI | 5-10 days | Mixed |
| **Service** | 1 | Service only | 1-3 days | Route Handler |

## When to Reference Full Docs

- **Creating new service**: Read ADR-008 + docs/70-governance/SERVICE_TEMPLATE.md
- **Schema changes**: Read ADR-000 + SRM + docs/30-security/SEC-001-rls-policy-matrix.md
- **Architecture decisions**: Read ADR-009 intake process
- **Bounded context questions**: Read full SRM in docs/20-architecture/
