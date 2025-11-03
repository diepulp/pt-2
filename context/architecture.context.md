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
