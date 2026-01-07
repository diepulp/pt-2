# Edge Transport & Middleware Policy (PT-2)

**Status:** Accepted (syncs with SRM v4.9.0 + SERVER_ACTIONS_ARCHITECTURE.md + ADR-021)
**Owners:** Architecture + Backend Leads
**Last Reviewed:** 2026-01-06
**Related Docs:** docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md, docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md, docs/25-api-data/DTO_CATALOG.md, docs/80-adrs/ADR-021-idempotency-header-standardization.md

---

## 1. Purpose

The Service Responsibility Matrix (SRM) mandates a matrix-first transport contract. This document captures the operational detail: which ingress paths are allowed, how middleware is composed, and how DTOs, headers, and idempotency keys remain consistent across Server Actions, Route Handlers, and services.

---

## 2. Allowed Entry Points (Dual-Entry Pattern)

> **Canonical Reference:** `docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md`
> **Decision Date:** 2025-11-28 (Executive Decision: Dual-Entry Transport Pattern)

| Client Transport Mechanism | Entry Point | Notes |
|---------------------------|-------------|-------|
| React Query mutations/queries | **Route Handlers** (`app/api/v1/**/route.ts`) | JSON transport via `fetch()`, header-based idempotency (`Idempotency-Key` per ADR-021), returns `ServiceHttpResult<T>` |
| Form actions / RSC prop flows | **Server Actions** (`app/actions/**`) | Non-JSON transport, `useFormState` compatible, returns `ServiceResult<T>` |
| Third-party integrations, webhooks, hardware feeds | **Route Handlers** (`app/api/v1/**/route.ts`) | Signature validation, rate limiting, shared DTO contracts |

**Rule:** The **client transport mechanism** determines the entry point, not caller origin. Both paths MUST wrap `withServerAction()` for the middleware chain.

### Rationale for Dual-Entry Pattern

1. **React Query integration** - Route Handlers return JSON (`ServiceHttpResult<T>`) that React Query's `mutationFn` consumes directly
2. **Header semantics** - `Idempotency-Key` (ADR-021) and `x-correlation-id` are natural in HTTP headers
3. **Cache control** - React Query's `invalidateQueries` pattern is cleaner with explicit HTTP responses
4. **Implementation reality** - 30+ Route Handlers in `app/api/v1/**` follow this pattern

---

## 3. Middleware Composition (`withServerAction`)

Server Actions wrap their handler with the following chain. Each middleware stays under 100 LOC, has isolated unit tests, and exposes a pure contract so concerns can evolve independently.

```
withAuth()
  → withRLS()            # sets SET LOCAL app.casino_id, validates staff scope
    → withIdempotency()  # enforces Idempotency-Key (ADR-021) for mutations, checks owning service store
      → withAudit()      # records audit_log row w/ actor_id + x-correlation-id + DTO hash; sets application_name
        → withTracing()  # attaches trace/span metadata, maps domain errors → HTTP responses, tags SLO budgets
```

### Responsibilities
- **withAuth**: Validates session, staff role, and casino membership. Fails fast with canonical error objects (never raw Supabase/PG errors).
- **withRLS**: Executes `SET LOCAL app.casino_id`, ensures tenant isolation, and forwards casino metadata to downstream RPCs.
- **withIdempotency**: Requires `Idempotency-Key` header (per ADR-021, import `IDEMPOTENCY_HEADER` from `lib/http/headers.ts`) on every mutation, scopes uniqueness by `(casino_id, domain)`, and writes the key into the owning ledger (`loyalty_ledger`, `player_financial_transaction`, custody tables, etc.).
- **withAudit**: Writes `audit_log` rows per SRM contract, including `actor_id`, `domain`, `action`, `dto_before/after` (or hash), `casino_id`, and `correlation_id`, and issues `set_config('application_name', correlation_id, true)` so downstream PL/pgSQL inherits the trace ID.
- **withTracing**: Emits telemetry spans, records durations, propagates correlation IDs + optional `x-slo-budget` tags, and maps domain exceptions to HTTP status codes so no Postgres error leaks to the UI.
- **Realtime gating** (enforced via `withAuth` + channel join hook): channel subscriptions require matching `casino_id` **and** SRM-authorized roles; unauthorized actors never receive events.

### Testing Expectations
- Each middleware exports a deterministic handler (`(ctx, next) => Promise<Result>`). Unit tests cover success + failure paths.
- Integration tests stitch the chain to verify headers, audit rows, and idempotency persistence per service.

---

## 4. Required Headers & Metadata

| Header | Scope | Owner | Notes |
|--------|-------|-------|-------|
| `x-correlation-id` | All actions & routes | withAudit/withTracing | Persists to audit, sets `application_name` |
| `Idempotency-Key` | Mutations only | withIdempotency | Per ADR-021; import `IDEMPOTENCY_HEADER` from `lib/http/headers.ts` |
| `x-pt2-client` (optional) | Diagnostics | withTracing | — |
| `x-slo-budget` (optional) | Internal tracing | withTracing | SLO attribution tag |

Headers must be validated inside the wrapper; downstream handlers assume presence.

---

## 5. DTO & Schema Requirements

- Each service exposes **contract-first DTOs**. Server Actions and Route Handlers import the same DTO + zod schema module.
- UI components and tests must not import generated `database.types.ts`; they consume DTOs only.
- DTO catalog lives in `docs/25-api-data/DTO_CATALOG.md` (to be finalized) and references the SRM row for each payload.
- CI check: fail when DTO schema diverges from SRM definitions or when a handler bypasses the shared schema.

---

## 6. Service-Specific Notes

> **Transport Decision Rule:** React Query flows → Route Handlers; Form/RSC flows → Server Actions

| Service | Route Handlers (React Query) | Server Actions (Forms/RSC) | Notes |
|---------|------------------------------|---------------------------|-------|
| CasinoService | Staff queries, settings reads | Staff management forms | Enterprise imports via Route Handlers |
| TableContextService | Fills, credits, drops, table status | Form-based quick actions | Hardware integrations via Route Handlers with `Idempotency-Key` |
| LoyaltyService | Mid-session rewards, ledger queries | Manual adjustment forms | Third-party integrations via Route Handlers |
| RatingSlipService | Lifecycle mutations (start/pause/resume/close), telemetry | Form-based slip creation | Telemetry collectors use Route Handlers with throttling |
| PlayerFinancialService | Transactions, balance queries | Cashier/cage forms | External payment gateways via Route Handlers |
| MTLService | Compliance queries, entry mutations | Compliance submission forms | Regulator interfaces via Route Handlers |
| PlayerService | Player CRUD, enrollment | Enrollment forms | Standard dual-entry pattern |
| VisitService | Visit lifecycle (start/end) | Visit forms | Cross-domain orchestration |

---

## 7. CI / Governance Hooks

1. **Middleware lint**: ensure every Server Action imports `withServerAction()`.
2. **Header audit**: confirm tests set `x-correlation-id`/`Idempotency-Key` where required (per ADR-021).
3. **DTO drift check**: compare DTO schema to SRM table definitions.
4. **Audit proof**: verify `audit_log` rows emitted per mutation in integration suites.

---

## 8. Next Actions

- [ ] Finalize `docs/25-api-data/DTO_CATALOG.md` listing DTO ↔ SRM sections.  
- [ ] Add middleware unit tests (one file per middleware) + integration test harness.  
- [ ] Update developer onboarding to reference this policy.  
- [ ] Realtime throttling tests: prove channels emit only state transitions / periodic snapshots and enforce casino + role predicates.
