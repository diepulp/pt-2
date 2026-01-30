# GAP-LEGACY-ROUTES-NO-AUTH-MIDDLEWARE

## 7 Legacy Route Handlers Missing Auth Middleware Chain

**Status**: Open
**Created**: 2026-01-30
**Category**: Security / Technical Debt
**Severity**: CRITICAL (3 mutation endpoints), HIGH (4 read endpoints)
**Discovered By**: AUTH-HARDENING v0.1 WS3 — `auth-chain-entrypoints.test.ts` regression test
**Target**: AUTH-HARDENING v0.2

---

## Problem Statement

7 route handlers bypass the `withServerAction()` middleware chain entirely. They create a Supabase client and return stub data with no app-layer authentication, RLS context injection, idempotency enforcement, or audit logging.

These routes rely solely on RLS policies with JWT claim fallback — which is unreliable under connection pooling (transaction mode) per ADR-015 and violates ADR-024's authoritative context derivation model.

### Violation Summary

- No call to `getAuthContext()` or `injectRLSContext()`
- No `set_rls_context_from_staff()` RPC fires — `app.casino_id` / `app.actor_id` never set
- JWT fallback is sole enforcement (stale under pooling)
- Mutation endpoints accept user-provided `casino_id` / `staff_id` (ADR-024 violation)
- Idempotency keys extracted but never enforced

---

## Affected Routes

| # | Route | HTTP | Data Domain | Risk |
|---|-------|------|-------------|------|
| 1 | `app/api/v1/casinos/[casinoId]/route.ts` | GET | Casino detail | HIGH |
| 2 | `app/api/v1/casinos/[casinoId]/staff/route.ts` | GET | Staff list | HIGH |
| 3 | `app/api/v1/casinos/[casinoId]/settings/route.ts` | PATCH | Casino settings mutation | **CRITICAL** |
| 4 | `app/api/v1/finance/transactions/route.ts` | POST+GET | Financial transactions | **CRITICAL** |
| 5 | `app/api/v1/finance/transactions/[transactionId]/route.ts` | GET | Transaction detail | HIGH |
| 6 | `app/api/v1/loyalty/balances/route.ts` | GET | Player loyalty balance | HIGH |
| 7 | `app/api/v1/loyalty/mid-session-reward/route.ts` | POST | Reward issuance mutation | **CRITICAL** |

---

## Route Analysis

### CRITICAL — Mutation Endpoints

**Route 3: `casinos/[casinoId]/settings/route.ts` (PATCH)**
- Mutates `casino_settings` table (timezone, gaming day start, thresholds)
- Timezone changes propagate through all gaming day calculations, rating slips, loyalty accrual
- Idempotency key extracted but never used
- No role gate — any authenticated user could modify settings

**Route 4: `finance/transactions/route.ts` (POST + GET)**
- Creates `player_financial_transaction` entries (append-only ledger)
- User-provided `casino_id` and `player_id` in request body — ADR-024 violation
- Financial data is regulated; audit trail integrity depends on auth context
- RLS INSERT policy gates on `cashier`/`admin` role, but falls back to JWT only
- Idempotency key extracted but never enforced — replay attacks possible

**Route 7: `loyalty/mid-session-reward/route.ts` (POST)**
- Issues loyalty points by writing to `loyalty_ledger` and updating `player_loyalty`
- User-provided `casino_id`, `staff_id`, and `points` in request body
- Attacker could: issue unlimited points, attribute rewards to wrong staff, target any casino
- Idempotency key extracted but never enforced

### HIGH — Read Endpoints

**Route 1: `casinos/[casinoId]/route.ts` (GET)**
- Reads casino detail; casino-scoped via RLS fallback only

**Route 2: `casinos/[casinoId]/staff/route.ts` (GET)**
- Reads staff list; exposes role/status/employee_id data

**Route 5: `finance/transactions/[transactionId]/route.ts` (GET)**
- Reads individual financial transaction; PII/financial data

**Route 6: `loyalty/balances/route.ts` (GET)**
- Reads player loyalty balance; user-provided `casino_id` in query params

---

## Mitigating Factor

All 7 routes are **TODO stubs** — they return `null` or empty arrays. No real service logic executes. The regression test (`auth-chain-entrypoints.test.ts`) now prevents anyone from filling in the TODOs without adding the auth chain first.

Current allowlist entry:
```typescript
// lib/server-actions/middleware/__tests__/auth-chain-entrypoints.test.ts
'app/api/v1/casinos/[casinoId]/route.ts': 'Legacy route — RLS-only, no compositor (v0.2 migration)',
// ... (7 entries total)
```

---

## Remediation Plan (v0.2)

### Per-Route Migration

For each route:

1. **Wrap with `withServerAction()`**
   ```typescript
   const result = await withServerAction(
     supabase,
     async (ctx) => {
       const service = createXxxService(ctx.supabase);
       return service.method(input);
     },
     { domain: '...', action: '...', requireIdempotency: true }
   );
   ```

2. **Remove user-provided context parameters**
   - Replace `payload.casino_id` with `ctx.rlsContext.casinoId`
   - Replace `payload.staff_id` with `ctx.rlsContext.actorId`
   - Validate any remaining user-provided IDs against `ctx.rlsContext`

3. **Add `assertCasinoScope()` in service layer**
   - Double-check at app layer before RLS catches at DB layer

4. **Enable idempotency for mutations**
   - Pass `requireIdempotency: true` + `idempotencyKey` for POST/PATCH/PUT

5. **Remove from allowlist**
   - Delete entry from `AUTH_CHAIN_ALLOWLIST` in `auth-chain-entrypoints.test.ts`
   - Test will now enforce the route uses the auth chain

### Service Dependencies

| Route | Service Needed | Exists? |
|-------|---------------|---------|
| 1-3 | `CasinoService` | Yes (`services/casino/`) |
| 4-5 | `PlayerFinancialService` | Yes (`services/finance/`) |
| 6 | `LoyaltyService` | Yes (`services/loyalty/`) |
| 7 | `LoyaltyService` | Yes (`services/loyalty/`) |

### Definition of Done

- [ ] All 7 routes wrapped with `withServerAction()`
- [ ] No user-provided `casino_id` / `staff_id` accepted as context
- [ ] Mutation endpoints enforce idempotency
- [ ] `assertCasinoScope()` called in each service method
- [ ] All 7 entries removed from `AUTH_CHAIN_ALLOWLIST`
- [ ] `auth-chain-entrypoints.test.ts` passes with zero allowlisted legacy routes
- [ ] `npm run type-check && npm run lint && npm run test` all pass

---

## References

- AUTH-HARDENING v0.1 EXEC-SPEC: `docs/20-architecture/specs/AUTH-HARDENING-v0.1/EXECUTION-SPEC-AUTH-HARDENING-v0.1.md`
- ADR-024: Authoritative context derivation (`docs/80-adrs/ADR-024_DECISIONS.md`)
- ADR-015: Connection pooling strategy (`docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`)
- Regression test: `lib/server-actions/middleware/__tests__/auth-chain-entrypoints.test.ts`
