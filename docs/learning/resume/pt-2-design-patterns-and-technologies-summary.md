# PT-2 Design Patterns and Technologies Summary

## System Snapshot

PT-2 is a Next.js App Router application on Supabase/PostgreSQL with Row-Level Security (RLS), organized as a documented SDLC taxonomy rather than an ad hoc codebase. The taxonomy itself is part of the architecture: `20-architecture/` holds bounded-context and service patterns, `30-security/` holds tenancy and RLS policy authority, `35-integration/` covers event contracts, `50-ops/` holds runbooks, `70-governance/` enforces engineering standards, and `80-adrs/` freezes decision records.

At the application level, the dominant architectural style is DDD-lite with explicit bounded contexts. The Service Responsibility Matrix (SRM) defines service ownership by domain, while the Service Layer Architecture Diagram shows a layered flow of UI -> hooks -> route handlers/server actions -> `withServerAction` wrapper -> domain services -> typed repositories -> Supabase with RLS.

## Key Patterns Worth Mentioning

### Multi-tenant Isolation

Casino-scoped isolation is enforced in PostgreSQL, not only in application code. The current MVP stance is hybrid RLS Pattern C using transaction context plus JWT fallback, with `auth.uid() IS NOT NULL` guards throughout. This gives the system strong tenant isolation without relying on a purely app-layer filter model.

### RLS as a Core Security Primitive

RLS is a first-class architectural mechanism, not a late hardening add-on. PT-2 uses authoritative context derivation so client-callable RPCs do not accept spoofable `casino_id` or `actor_id` inputs. Instead, staff, casino, and role are derived from JWT identity plus the `staff` table, then injected transaction-locally. This is a notable secure pattern for pooled Postgres environments.

### Transactional Outbox

Financial and loyalty side effects are modeled with append-only outbox tables. The core rule is that the authoring write and outbox insert must succeed or fail in the same database transaction. Consumers are projection-only and idempotent, and workers drain the outbox with `FOR UPDATE SKIP LOCKED`. This is a clean implementation of the transactional outbox pattern for reliable downstream propagation.

### DDD / Bounded Context Architecture

The system is split into clear service domains such as `CasinoService`, `PlayerService`, `VisitService`, `RatingSlipService`, `LoyaltyService`, `PlayerFinancialService`, and `MTLService`. Each service owns its tables and publishes DTOs across context boundaries. That separation of ownership, contracts, and cross-context consumption rules is the strongest DDD characteristic in the application.

### Contract-First Service Layer

The service architecture formalizes typed repositories, DTO contracts, route/service separation, and `withServerAction` as a transport wrapper. This yields a disciplined application-service pattern rather than direct DB-from-UI access or fat controller logic. Route handlers and server actions act as transport edges; domain services remain the core business layer.

### Evented Integration and Realtime Reconciliation

The integration model is event-catalog driven. Event payloads mirror SRM table foreign keys and types, channels are casino-scoped, and realtime listeners reconcile state through invalidation rather than implicit client recomputation. This keeps realtime behavior aligned with bounded-context ownership and data contracts.

### SDLC Governance Library

PT-2 uses a formal SDLC governance model as part of the engineering system: ADRs, PRDs, execution specs, runbooks, migration standards, and pre-commit/CI gates. The governance layer explicitly prevents unsafe migration drift, policy regressions, and premature infrastructure. This is notable as an example of architecture governance operationalized as code and process.

### Lean Architecture Guardrails

The project explicitly guards against over-engineering. It prefers direct call orchestration, database-level idempotency, single authoritative mutators, and small targeted abstractions unless measured triggers justify more infrastructure. That makes the architecture notable not only for what it contains, but for what it deliberately excludes.

## Technologies and Platform Signals

- Next.js App Router
- React 19
- TypeScript
- Supabase
- PostgreSQL
- Row-Level Security (RLS)
- React Query
- Zustand
- Tailwind CSS
- Zod
- Route Handlers and Server Actions
- PostgreSQL RPC-based workflows
- Idempotency keys and append-only ledger patterns
- Realtime invalidation/event-driven UI refresh

## Resume / Presentation Framing

A concise way to describe PT-2:

Built and evolved a multi-tenant casino operations platform using bounded-context service architecture, PostgreSQL RLS tenant isolation, authoritative RPC context derivation, transactional outbox patterns, and a governance-heavy ADR/PRD/exec-spec SDLC framework with automated migration and security gates.

## Taxonomy References

- `docs/INDEX.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- `docs/30-security/SEC-001-rls-policy-matrix.md`
- `docs/35-integration/INT-002-event-catalog.md`
- `docs/50-ops/runbooks/RUN-001-outbox-worker-playbook.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- `docs/70-governance/MIGRATION_SAFETY_HOOK.md`
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`
- `docs/80-adrs/ADR-024_DECISIONS.md`
- `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md`
