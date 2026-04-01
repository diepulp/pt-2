# lib/supabase/__tests__ — Test Surface Posture

**Layer**: Tier 3 — RLS Core Infrastructure  
**Phase A Completed**: 2026-04-01  
**Remediation**: Tier 3 Phase A (Slice 5)

---

## File Inventory

| File | Type | `@jest-environment node` | `RUN_INTEGRATION_TESTS` gate | Phase B |
|------|------|:---:|:---:|---------|
| `assert-rows-affected.test.ts` | Unit | ✅ | N/A | No Supabase |
| `bypass-lockdown.test.ts` | Unit | ✅ | N/A | No Supabase |
| `claims-lifecycle.test.ts` | Unit | ✅ | N/A | No Supabase |
| `pit-boss-financial-txn.test.ts` | Integration | ✅ | ✅ (normalized) | `createClient` × 2 |
| `rls-context.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 23, `set_rls_context_internal` × 5 |
| `rls-financial.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 7, `set_rls_context_internal` × 5 |
| `rls-jwt-claims.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 3, `skipIfNoEnv` per-test guards |
| `rls-mtl.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 9, `set_rls_context_internal` × 5 |
| `rls-policy-enforcement.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 6, `set_rls_context_internal` × 5 |
| `rls-pooling-safety.integration.test.ts` | Integration | ✅ | ✅ | `createClient` × 31, `set_rls_context_internal` × 5 |

---

## Layer Health

| Metric | Before Phase A | After Phase A |
|--------|:--------------:|:-------------:|
| Files with `@jest-environment node` | 1 / 10 | 10 / 10 |
| Integration files with `RUN_INTEGRATION_TESTS` gate | 1 / 6 | 6 / 6 (+ normalized) |
| Gate uses canonical form (`'true'` ∥ `'1'`) | 0 / 6 | 7 / 7 (incl. pit-boss) |
| Unit tests accidentally in jsdom | 3 / 4 | 0 / 4 |

---

## Phase B Assessment

Phase B covers test correctness: mock fidelity, fixture hygiene, and RPC contract alignment. Key observations per file:

### `rls-context.integration.test.ts`
- Uses `set_rls_context_internal` (service-role path) — correct for test lane (ADR-024 note)
- Contains `set_rls_context` (non-internal variant) reference in README/inline comments only — no raw call to production path
- `skipIfNoEnv()` helper is **defined but never called** — dead code, harmless
- 23 `createClient` calls — heavy fixture setup; Phase B should audit for shared-client reuse

### `rls-financial.integration.test.ts`
- Uses `set_rls_context_internal` correctly
- 7 `createClient` calls — moderate fixture footprint
- Phase B: verify `player_financial_transaction` INSERT fixtures clean up via `afterAll`

### `rls-jwt-claims.integration.test.ts`
- Does **not** call `set_rls_context_internal` — uses `syncUserRLSClaims`/`clearUserRLSClaims` and trigger-based sync
- Uses `skipIfNoEnv()` per-test (25 call sites) as a secondary env guard — redundant with the `RUN_INTEGRATION` gate but harmless
- Phase B: consider removing `skipIfNoEnv` per-test guards now that gate is canonical

### `rls-mtl.integration.test.ts`
- Old env-credential skip pattern (`shouldSkip` / `describeOrSkip`) replaced by canonical gate
- `supabaseUrl` / `supabaseServiceKey` variables remain — still consumed inside describe block for client creation
- Uses `set_rls_context_internal` correctly
- Phase B: verify `mtl_entry` / `mtl_audit_note` fixtures are scoped to test casino IDs

### `rls-policy-enforcement.integration.test.ts`
- Uses `set_rls_context_internal` correctly
- Phase B: verify cross-casino staff fixtures (Casino 1 / Casino 2) are cleaned up atomically

### `rls-pooling-safety.integration.test.ts`
- Highest `createClient` density (31 calls) — stress-tests pooling context leakage
- Uses `set_rls_context_internal` (5 call sites for helper, many invocations)
- Phase B: ensure `supabaseAnonKey` fixture path is still valid after pooler migration (ADR-015)

---

## Known Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| KI-001 | Low | `rls-context.integration.test.ts` | `skipIfNoEnv()` defined but never called — dead code |
| KI-002 | Low | `rls-jwt-claims.integration.test.ts` | Per-test `skipIfNoEnv()` guards redundant with top-level `RUN_INTEGRATION` gate |
| KI-003 | Info | `rls-pooling-safety.integration.test.ts` | 31 `createClient` calls — highest fixture cost in layer; monitor for timeout flakiness |
| KI-004 | Info | `rls-mtl.integration.test.ts` | `supabaseUrl` / `supabaseServiceKey` no longer used for skip-gating but still needed for client init inside describe |
