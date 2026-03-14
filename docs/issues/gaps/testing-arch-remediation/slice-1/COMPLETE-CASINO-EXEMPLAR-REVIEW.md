
---

## Slice One Status — What's Delivered

The `065c2c4` commit established the **Casino bounded context** as the exemplar:

| Artifact | Status |
|---|---|
| `jest.node.config.js` (node runtime) | Done |
| `jest.integration.config.js` (canary runtime) | Done |
| `jest.setup.node.ts` (minimal server setup) | Done |
| Integration canary (`setup-wizard-rpc.int.test.ts`, 39 tests) | Done |
| Route boundary test (`settings-route-boundary.test.ts`, 3 tests) | Done |
| npm scripts (`test:unit:node`, `test:integration:canary`, `test:slice:casino`, `test:verify`) | Done |
| Posture doc + runbook | Done |

## Next Steps — Completing the Casino Exemplar

Before rolling to the next context, Casino has gaps the posture doc flagged:

1. **Widen Casino canaries** — The integration canary only covers `setup-wizard-rpc`. The context also owns `rpc-bootstrap-casino-abuse.int.test.ts`, `rpc-accept-staff-invite-abuse.int.test.ts`, `rpc-create-staff.int.test.ts`, and `gaming-day-boundary.int.test.ts`. These already exist with `.int.test.ts` naming so they'll be picked up by `jest.integration.config.js` — but they need the `/** @jest-environment node */` directive and the `RUN_INTEGRATION_TESTS` gate pattern verified.

2. **Migrate existing Casino unit tests to node config** — Files like `mappers.test.ts`, `schemas.test.ts`, `keys.test.ts`, `http-contract.test.ts` are pure server logic running under legacy jsdom. They should work under `jest.node.config.js` already (they match the glob), but need to be verified as passing under `npm run test:slice:casino`.

3. **Tag pre-existing failures** — The checkpoint notes 2 pre-existing failures (`crud.unit.test.ts`, `casino.test.ts`). These need a `// FIXME:` or `describe.skip` annotation so they don't pollute signal.

## Reusable Rollout Pattern for Next Bounded Context

### Context Selection Criteria

Pick the next context by: **most route handlers + existing integration tests + business criticality**.

| Context | Route handlers | Existing `.int`/`.integration` tests | Unit tests | Priority |
|---|---|---|---|---|
| **PlayerService** | 8 routes | 0 | 6 tests | **High** — identity is foundational |
| **VisitService** | 6 routes | 2 (`gaming-day-boundary.int`, `visit-continuation.integration`) | 3 tests | High — session lifecycle |
| **RatingSlipService** | 11 routes | 3 (`policy-snapshot`, `continuity`, `rating-slip.integration`) | 5 tests | High — core telemetry |
| **TableContextService** | 15 routes | 1 (`table-context.integration`) | 18 tests | Largest surface |
| **LoyaltyService** | 8 routes | 3 (`accrual-lifecycle`, `points-accrual`, `promo-outbox`) | 5 tests | Complex, but dependent |

**Recommendation: PlayerService** — small surface (6 unit + 0 integration = clean starting point), foundational context, 8 route handlers to pick a boundary test from.

### Rollout Checklist (Reusable Template)

For any bounded context `{CONTEXT}`:

```
## Slice Rollout — {CONTEXT} Bounded Context

### Step 1: Inventory (read-only)
- [ ] List all files in `services/{context}/__tests__/`
- [ ] Classify each: unit (.test.ts) vs integration (.int.test.ts / .integration.test.ts)
- [ ] Identify pre-existing failures (run under `jest.node.config.js`)
- [ ] Identify route handlers owned by this context (check SRM + app/api/v1/)

### Step 2: Runtime Verification
- [ ] Verify all unit tests have `/** @jest-environment node */` directive
- [ ] Run: `npm run test:unit:node -- --testPathPatterns='services/{context}/'`
- [ ] Annotate pre-existing failures with `describe.skip` + `// FIXME: pre-existing`
- [ ] Confirm zero new failures introduced

### Step 3: Integration Canary
- [ ] Pick ONE representative RPC/contract for canary test
      (prefer: schema validation, type contract, enum drift — same pattern as setup-wizard-rpc)
- [ ] Ensure `RUN_INTEGRATION_TESTS` gate: `describe.skip` when env var unset
- [ ] Ensure `/** @jest-environment node */` directive
- [ ] Run: `npm run test:integration:canary -- services/{context}/`

### Step 4: Route Handler Boundary Test
- [ ] Pick ONE route handler (prefer GET — simplest contract)
- [ ] Follow Casino exemplar pattern:
      - Mock `withServerAction` to inject controlled MiddlewareContext
      - Mock `createClient` to avoid next/headers dependency
      - Chainable Supabase mock with spy tracking
      - Test cases: happy path (200), scoping assertion (casino_id filter), error path
- [ ] Place in `services/{context}/__tests__/{route}-boundary.test.ts`

### Step 5: Script + Slice Command
- [ ] Add to package.json:
      `"test:slice:{context}": "jest --config jest.node.config.js --testPathPatterns='services/{context}/__tests__/.*\\.test\\.ts$'"`

### Step 6: Posture Update
- [ ] Update SLICE-ONE-POSTURE.md (or create SLICE-TWO-POSTURE.md):
      - {CONTEXT}: "Trusted local verification"
      - Note any tenancy gaps (boundary ≠ isolation)
      - Theatre freeze: no new shallow tests in this context

### Gate: Pass Criteria
- `npm run test:slice:{context}` — all non-skipped tests green
- `npm run test:integration:canary -- services/{context}/` — canary green
- Zero overlap between node and integration configs for this context
- Posture doc updated
```

### Concrete Next Move: Player Context

If you want to start immediately, the Player rollout would be:

1. **Canary candidate**: No existing `.int.test.ts` files — write a new one for player identity/enrollment RPC contract (schema + type assertions, same pattern as `setup-wizard-rpc`)
2. **Boundary test candidate**: `GET /api/v1/players/[playerId]` — simple fetch-by-id, clean request-response contract
3. **Script**: `"test:slice:player": "jest --config jest.node.config.js --testPathPatterns='services/player/__tests__/.*\\.test\\.ts$'"`
4. **Existing tests to migrate**: `player.service.test.ts`, `schemas.test.ts`, `http-contract.test.ts`, `exclusion-*.test.ts` — verify under node runtime

Want me to proceed with the Player context rollout, or would you prefer a different bounded context?