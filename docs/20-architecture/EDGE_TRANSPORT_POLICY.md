# Edge Transport & Middleware Policy (PT-2)

**Status:** Draft (syncs with SRM v3.0.2 transport clauses)  
**Owners:** Architecture + Backend Leads  
**Last Reviewed:** 2025-11-10  
**Related Docs:** docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md, docs/25-api-data/DTO_CATALOG.md (TBD)

---

## 1. Purpose

The Service Responsibility Matrix (SRM) now mandates a matrix-first transport contract. This document captures the operational detail: which ingress paths are allowed, how middleware is composed, and how DTOs, headers, and idempotency keys remain consistent across Server Actions, Route Handlers, and services.

---

## 2. Allowed Entry Points

| Use Case | Entry Point | Notes |
|----------|-------------|-------|
| First-party reads & mutations (staff UI, admin console, casino tooling) | **Server Actions** (`app/*`) | Must be wrapped with the middleware chain defined below. No direct `route.ts` mutations for first-party flows. |
| Third-party integrations, webhooks, hardware feeds, file uploads | **Route Handlers** (`app/api/*/route.ts`) | Must reuse the same DTO + schema as the Server Action surface and call into the same service factories. |

**Rule of thumb:** if PT-2 owns the UI, use Server Actions; if an external caller controls payloads or timing, use Route Handlers.

---

## 3. Middleware Composition (`withServerAction`)

Server Actions wrap their handler with the following chain. Each middleware stays under 100 LOC, has isolated unit tests, and exposes a pure contract so concerns can evolve independently.

```
withAuth()
  → withRLS()            # sets SET LOCAL app.casino_id, validates staff scope
    → withIdempotency()  # enforces x-idempotency-key for mutations, checks owning service store
      → withAudit()      # records audit_log row w/ actor_id + x-correlation-id + DTO hash; sets application_name
        → withTracing()  # attaches trace/span metadata, maps domain errors → HTTP responses, tags SLO budgets
```

### Responsibilities
- **withAuth**: Validates session, staff role, and casino membership. Fails fast with canonical error objects (never raw Supabase/PG errors).
- **withRLS**: Executes `SET LOCAL app.casino_id`, ensures tenant isolation, and forwards casino metadata to downstream RPCs.
- **withIdempotency**: Requires `x-idempotency-key` on every mutation, scopes uniqueness by `(casino_id, domain)`, and writes the key into the owning ledger (`loyalty_ledger`, `player_financial_transaction`, custody tables, etc.).
- **withAudit**: Writes `audit_log` rows per SRM contract, including `actor_id`, `domain`, `action`, `dto_before/after` (or hash), `casino_id`, and `correlation_id`, and issues `set_config('application_name', correlation_id, true)` so downstream PL/pgSQL inherits the trace ID.
- **withTracing**: Emits telemetry spans, records durations, propagates correlation IDs + optional `x-slo-budget` tags, and maps domain exceptions to HTTP status codes so no Postgres error leaks to the UI.
- **Realtime gating** (enforced via `withAuth` + channel join hook): channel subscriptions require matching `casino_id` **and** SRM-authorized roles; unauthorized actors never receive events.

### Testing Expectations
- Each middleware exports a deterministic handler (`(ctx, next) => Promise<Result>`). Unit tests cover success + failure paths.
- Integration tests stitch the chain to verify headers, audit rows, and idempotency persistence per service.

---

## 4. Required Headers & Metadata

| Header | Scope | Owner |
|--------|-------|-------|
| `x-correlation-id` | All actions & routes | withAudit/withTracing (persists to audit, sets `application_name`) |
| `x-idempotency-key` | Mutations only | withIdempotency (stored by service) |
| `x-pt2-client` (optional) | Diagnostics | withTracing |
| `x-slo-budget` (optional) | Internal tracing tag for SLO attribution | withTracing |

Headers must be validated inside the wrapper; downstream handlers assume presence.

---

## 5. DTO & Schema Requirements

- Each service exposes **contract-first DTOs**. Server Actions and Route Handlers import the same DTO + zod schema module.
- UI components and tests must not import generated `database.types.ts`; they consume DTOs only.
- DTO catalog lives in `docs/25-api-data/DTO_CATALOG.md` (to be finalized) and references the SRM row for each payload.
- CI check: fail when DTO schema diverges from SRM definitions or when a handler bypasses the shared schema.

---

## 6. Service-Specific Notes

| Service | Transport Notes |
|---------|-----------------|
| CasinoService | Server Actions for staff management/settings; Route Handlers limited to enterprise imports (bulk staff sync). |
| TableContextService | Server Actions for fills/credits/drops; hardware integrations via Route Handlers must reuse the DTO schema and include `x-idempotency-key`. |
| LoyaltyService | Server Actions for mid-session rewards + manual adjustments. Third-party loyalty integrations call Route Handlers that forward to the same service layer. |
| RatingSlipService | Server Actions for lifecycle changes; telemetry collectors hit Route Handlers that validate DTOs + `x-correlation-id` and throttle broadcasts to slip state transitions / 1–5s snapshots (others served via poll + ETag). |
| PlayerFinancialService | Cashier/cage actions flow through Server Actions, requiring idempotency key persistence. External payment gateways hit Route Handlers wired to the same RPCs. |
| MTLService | Compliance submissions via Server Actions; regulator interfaces/hardware via Route Handlers referencing shared DTOs. |

---

## 7. CI / Governance Hooks

1. **Middleware lint**: ensure every Server Action imports `withServerAction()`.
2. **Header audit**: confirm tests set `x-correlation-id`/`x-idempotency-key` where required.
3. **DTO drift check**: compare DTO schema to SRM table definitions.
4. **Audit proof**: verify `audit_log` rows emitted per mutation in integration suites.

---

## 8. Next Actions

- [ ] Finalize `docs/25-api-data/DTO_CATALOG.md` listing DTO ↔ SRM sections.  
- [ ] Add middleware unit tests (one file per middleware) + integration test harness.  
- [ ] Update developer onboarding to reference this policy.  
- [ ] Realtime throttling tests: prove channels emit only state transitions / periodic snapshots and enforce casino + role predicates.
