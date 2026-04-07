## Session 2 Precis: Reward Issuance — Post-Reset Testing Results

**Date:** 2026-04-07
**Predecessor:** `REWARD-WORFLOW-CYCLIC-OBJECT-ERROR-PRECIS.md` (Issues A–G)

---

### What Was Attempted

After the session-1 investigation (Issues A–G), the following fixes were applied and `supabase db reset` was executed:

| Fix | Target | Applied? |
|-----|--------|----------|
| **Issue E**: Tier casing normalized to lowercase | `seed.sql` — 11 `player_loyalty` UPDATEs | Yes (via db reset) |
| **Issue F**: Added 4 `promo_program` rows | `seed.sql` — match_play + free_play per casino | Yes (via db reset) |
| **Issue G**: Transport boundary `safeDetails()` guards | `tracing.ts`, `with-server-action-wrapper.ts`, 3 route files | In working tree (dev server running) |
| **Issue G+**: `errorResponse` `httpStatus` fallback | `service-response.ts` | In working tree |
| **Lint rule**: `error-safety/no-unsafe-error-details` | `.eslint-rules/`, `eslint.config.mjs` | In working tree |
| **Governance**: `ERROR_TAXONOMY_AND_RESILIENCE.md` updated | INV-ERR-DETAILS, 4-layer defense, amendment log | In working tree |

---

### Manual Testing Results (Post-Reset)

| Reward | Family | Cadence Scope | Result | Error |
|--------|--------|---------------|--------|-------|
| Complimentary Meal | `points_comp` | `per_gaming_day` | **PASS** | — |
| Complimentary Beverage | `points_comp` | `per_visit` | **FAIL** | "Player must have an active visit for per-visit scoped rewards" |
| Match Play $25 | `entitlement` | `per_gaming_day` | **FAIL** | Cyclic object error |
| Free Play $10 | `entitlement` | `per_week` | **FAIL** | Cyclic object error |

**1 of 4 reward types functional. Entitlements still crash with cyclic error despite transport boundary fixes.**

---

### Issue H: Beverage Comp — `per_visit` Cadence Requires Open Visit

**Symptom:** "Player must have an active visit for per-visit scoped rewards" (HTTP 422, `REWARD_VISIT_REQUIRED`)

**Root cause:** The beverage reward (`ae..002`) has `reward_limits.scope = 'per_visit'` (seed line 1347). The PRD-061 cadence module (`services/loyalty/cadence.ts:58-78`) resolves the window start by querying for an open visit:

```sql
SELECT started_at FROM visit
WHERE player_id = $1 AND casino_id = $2 AND status = 'open'
```

If no open visit exists, it throws `REWARD_VISIT_REQUIRED`. This is **correct cadence behavior** — the rule says "3 per visit" which is meaningless without an active visit. However, the seed data's visits may all be in `closed` status, or the dev-bypass player/casino has no visit at all.

**Diagnosis needed:**
- What player/casino does the dev auth bypass use?
- Does that player have an open visit in the seeded data?
- If not, does the UI have a "start visit" flow that should precede reward issuance?

**Possible fixes:**
1. Seed an open visit for the dev-bypass player/casino
2. Change beverage scope from `per_visit` to `per_gaming_day` in seed (less restrictive for testing)
3. UI should show a clear pre-condition: "Start a visit before issuing per-visit rewards"

---

### Issue I: Entitlement Issuance — Cyclic Error Persists

**Symptom:** Match Play and Free Play still crash with cyclic object value despite the Issue G transport boundary fixes being in the working tree.

**Hypotheses (to be tested in order):**

1. **Dev server not restarted** — The transport boundary fixes (tracing.ts, wrapper, routes) are uncommitted working tree changes. If the Next.js dev server was not restarted after these edits, it may be serving stale compiled code. Hot-reload may not apply to `lib/server-actions/middleware/*.ts`.

2. **Different error path for entitlements** — `issueEntitlement()` calls `rpc_issue_promo_coupon` (Postgres RPC). If the RPC itself raises an exception (e.g., missing `promo_program`, role gate failure), the error may flow through a path not yet covered by `safeDetails()`.

3. **`rpc_issue_promo_coupon` role gate** — Migration `20260319010843` added role-gated checks to the RPC. The dev auth bypass uses a mock RLS context. If the RPC's internal `current_setting('app.staff_role')` check doesn't match, it could raise a raw Postgres exception that wraps unsafely.

4. **Match Play `requires_note: true`** — Seed line 1348 sets `requires_note = true` for match play. The issuance UI may not be sending a `note` field, causing a `VALIDATION_ERROR` that was already happening but was masked by the cyclic crash. With the boundary fix, this should now surface as a clean 400.

5. **Entitlement tier eligibility gap for test player** — Casino 1's match play only has tiers `gold`, `platinum`, `diamond`. Casino 1's free play has `silver`, `gold`, `platinum`, `diamond`. If the dev-bypass player is `bronze`, both would throw `CATALOG_CONFIG_INVALID`. The dev auth bypass mock context needs to map to a player with a tier that has entitlement_tier coverage.

**Key question:** Which player does the dev-bypass issue rewards for? The `DEV_RLS_CONTEXT` in `lib/supabase/dev-context.ts` sets `actorId`/`casinoId` but the issuance UI likely picks a player from the drawer. The test player's tier determines whether entitlement_tier lookup succeeds.

---

### Seed Data Coverage Gaps Identified

| Table | Casino 1 | Casino 2 | Gap |
|-------|----------|----------|-----|
| `promo_program` | match_play + free_play | match_play + free_play | **NEW** — added in this session |
| `reward_entitlement_tier` | gold/plat/diamond (match), silver/gold/plat/diamond (free) | gold/plat (match), silver/gold (free) | **No bronze tier** for any entitlement |
| `reward_limits` | per_gaming_day (meal), **per_visit (bev)**, per_gaming_day (match), per_week (free) | Same pattern | Beverage per_visit requires open visit |
| `visit` (open) | Unknown — needs verification | Unknown | Dev-bypass player may have no open visit |
| `player_loyalty` tier alignment | Players span bronze→diamond | Gold, Platinum, Diamond only | Bronze/silver players can't issue Casino 1 match play |

---

### Next Steps

**Priority 1 — Verify transport boundary fix is live:**
1. Restart the dev server (`npm run dev`)
2. Retry match play and free play issuance
3. If cyclic error persists → the error path is NOT through the fixed transport boundaries; trace the actual call from browser DevTools Network tab

**Priority 2 — E2E test matrix:**
Build a Playwright E2E test suite that exercises all 4 reward types:
```
describe('Reward Issuance')
  it('issues meal comp (per_gaming_day)')         → expect 201
  it('issues beverage comp (per_visit, with open visit)')  → expect 201
  it('issues match play (entitlement, with note)')  → expect 201
  it('issues free play (entitlement)')              → expect 201
  it('rejects beverage without open visit')         → expect 422
  it('rejects match play without note')             → expect 400
  it('rejects entitlement for ineligible tier')     → expect 400
```

**Priority 3 — Seed data remediation:**
1. Verify dev-bypass player has an open visit; if not, seed one
2. Ensure dev-bypass player's tier has entitlement_tier coverage for all 4 rewards
3. Consider seeding `bronze` entitlement_tier rows as minimum-viable coverage

**Priority 4 — Cadence integration test:**
Run `services/loyalty/__tests__/issue-entitlement.int.test.ts` against local DB to isolate whether the entitlement failure is in the service layer or the transport layer:
```bash
npm run test -- services/loyalty/__tests__/issue-entitlement.int.test.ts
```

---

### Files Modified (Uncommitted, Session 1+2)

```
M  app/api/v1/rating-slips/[id]/modal-data/route.ts
M  app/api/v1/rating-slips/[id]/move/route.ts
M  app/api/v1/visits/route.ts
M  components/layout/lock-screen-provider.tsx
M  lib/errors/domain-errors.ts
M  lib/errors/error-utils.ts
M  lib/http/service-response.ts
M  lib/server-actions/error-map.ts
M  lib/server-actions/middleware/tracing.ts
M  lib/server-actions/with-server-action-wrapper.ts
M  scripts/dev-cleanup.sh
M  services/loyalty/reward/crud.ts
M  supabase/seed.sql
M  types/remote/database.types.ts
?? .eslint-rules/no-unsafe-error-details.js
?? docs/issues/cyclic-error/
?? docs/00-vision/smpt-client/
```
