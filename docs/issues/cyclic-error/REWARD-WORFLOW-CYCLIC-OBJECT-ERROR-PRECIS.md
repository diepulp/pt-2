## Session Precis: Cyclic Object Value & Reward Issuance Investigation

### Presenting Symptom

`TypeError: cyclic object value` during the reward issuance workflow, rendering the feature non-functional. No meaningful error message surfaced to the operator.

---

### Issue A: Cyclic Object Serialization (Latent, Systemic)

**Discovery:** 65+ locations across 25 service/lib files stored raw JavaScript `Error` objects in `DomainError.details`. Supabase `PostgrestError` and Node `FetchError` objects contain internal circular references (client → request → response → client). When any error path reached `NextResponse.json()` → `JSON.stringify()`, serialization crashed.

**Why it surfaced now:** The issuance workflow (PRD-052 through PRD-061) progressively added parallel pre-flight calls (`Promise.all` with `getReward` + `getBalance` + `getValuationRate` + `checkCadence`), expanding the surface area for non-DomainError exceptions to reach the generic Error fallback in `mapDatabaseError()`.

**Fix applied (commit `0af9114`):**
- Created canonical `lib/errors/safe-error-details.ts` — extracts only `{message, name, code, hint}` primitives
- Replaced `details: error` with `safeErrorDetails(error)` in all 25 affected files
- Added `safeDetails()` boundary guard in `lib/http/service-response.ts` as last defense
- Sanitized `error.details` spread in the issuance route handler to primitive-only values
- Added `INV-ERR-DETAILS` invariant to `ERROR_TAXONOMY_AND_RESILIENCE.md` and `CLAUDE.md`

---

### Issue B: Missing Cadence Module (Merge Gap)

**Discovery:** Local `main` was 1 commit behind `origin/main`. The cadence PR (#43) added `services/loyalty/cadence.ts` (385 lines) and a lazy import in `issueComp()`: `await import('./cadence')`. The file did not exist locally, causing a module-not-found error on every issuance attempt — which then hit Issue A's cyclic serialization crash.

**Fix:** Merged `origin/main` into local. Resolved 1 conflict in `services/player360-dashboard/mappers.ts` (old hardcoded 30m cooldown → new per-reward cadence logic from PRD-061).

---

### Issue C: Empty Reward Catalog (No Seed Data)

**Discovery:** The `reward_catalog` table had zero rows. The seed file (`supabase/seed.sql`) never included reward data — it covered casinos, staff, players, visits, rating slips, loyalty balances, and valuation policies, but skipped the reward catalog entirely. The issuance drawer showed "No rewards available" or, if a stale cached reward ID was used, threw `REWARD_NOT_FOUND` — which was then masked by Issue A.

**Fix:** Added to `seed.sql`:
- 8 `reward_catalog` entries (4 per casino: 2 `points_comp`, 2 `entitlement`)
- 4 `reward_price_points` (comp pricing: 400–1500 pts)
- 8 `reward_limits` cadence rules (per_visit, per_gaming_day, per_week scopes with cooldowns)
- 9 `reward_entitlement_tier` benefit mappings (gold/platinum/diamond)
- 4 `reward_eligibility` guardrails (tier + balance minimums)

---

### Issue D: Admin Limits Not Persisting (RLS Silent Rejection)

**Discovery:** The PRD-061 cadence migration tightened `reward_limits` write policies to **admin-only** (`staff_role = 'admin'`). When a `pit_boss` saved frequency rules via the admin form, Supabase returned `{ data: [], error: null }` — RLS silently blocked the INSERT without raising an error. The service treated zero affected rows as success. The UI toast showed "Saved" but nothing persisted.

**Fix:** Added row-count verification after the `reward_limits` INSERT in `services/loyalty/reward/crud.ts`. If `insData.length !== input.limits.length`, throws `FORBIDDEN` with message "Cannot update reward limits: admin role required" — surfacing the RLS rejection as an actionable error instead of silent data loss.

---

### Causal Chain

```
Empty reward catalog (C)
  → Operator attempts issuance with stale/missing reward ID
  → Service throws REWARD_NOT_FOUND (or module-not-found from missing cadence.ts (B))
  → Error wrapping stores raw Error in details (A)
  → NextResponse.json() crashes: "cyclic object value"
  → Operator sees cryptic serialization error, no actionable message

Separately:
  Admin configures limits via UI → pit_boss role → RLS silently blocks INSERT (D)
  → Limits never persist → cadence enforcement has no rules → workflow appears broken
```

### Issue E: Tier Case Mismatch (Seed Data vs TierLevel Type)

**Discovery:** `player_loyalty.tier` was seeded with initial-caps values (`'Gold'`, `'Platinum'`, `'Silver'`, `'Bronze'`, `'Diamond'`) but `reward_entitlement_tier.tier` used lowercase (`'gold'`, `'platinum'`, etc.) — matching the canonical `TierLevel` type (`'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'`). The `issueEntitlement()` flow at `services/loyalty/promo/crud.ts:738` does a strict `===` comparison between the player's tier (from `getBalance()`) and the entitlement tier rows. `'Gold' === 'gold'` → `false` → **every entitlement issuance fails** with `CATALOG_CONFIG_INVALID`.

**Fix:** Normalized all `player_loyalty` tier values in `seed.sql` to lowercase (11 UPDATE statements across 3 casinos).

---

### Issue F: Missing `promo_program` Seed Data

**Discovery:** The `issueEntitlement()` flow at `services/loyalty/promo/crud.ts:757-763` resolves `promo_program_id` by querying for an active `promo_program` matching the instrument type (`match_play` or `free_play`). The `promo_program` table had zero rows — no seed data existed. Even with Issue E fixed, every entitlement issuance would fail at this step with `CATALOG_CONFIG_INVALID: No active promo program found`.

**Fix:** Added 4 `promo_program` rows to `seed.sql` (1 `match_play` + 1 `free_play` per casino).

---

### Updated Causal Chain

```
Empty/miscased tier data (E) + missing promo_program (F)
  → Operator attempts entitlement issuance
  → getBalance() returns tier='Gold' (capitalized from seed)
  → entitlementTiers.find(t => t.tier === 'Gold') → undefined (DB has 'gold')
  → Throws CATALOG_CONFIG_INVALID
  → If Issue A not yet fixed: error wrapping stores raw Error → cyclic crash
  → If Issue A fixed: clean error message but issuance still blocked

Even with tier match fixed:
  → promo_program query returns null (no seed data) (F)
  → Throws CATALOG_CONFIG_INVALID: "No active promo program found"
```

### Issue G: Transport Boundary Gap — `safeDetails()` Missing from Wrappers and Routes

**Discovery:** Commit `0af9114` standardized raw-error extraction at the service layer and added `safeDetails()` to the HTTP helpers (`errorResponse`/`successResponse`). However, it never touched the server-action wrappers or API routes that shortcutted straight to `NextResponse.json()`. These transport boundaries serialized `result.details` without sanitization, re-exposing cyclic object crashes whenever an upstream caller forgot to run `safeErrorDetails()`.

**Gap locations (5 sites):**

| Location | Before | After |
|----------|--------|-------|
| `lib/server-actions/middleware/tracing.ts` success path | `...result` (raw details pass-through) | `details: safeDetails(result?.details)` |
| `lib/server-actions/middleware/tracing.ts` catch path | `details: mapped.details` | `details: safeDetails(mapped.details)` |
| `lib/server-actions/with-server-action-wrapper.ts` `finalizeResult()` | `details: value.details` | `details: safeDetails(value.details)` |
| `lib/server-actions/with-server-action-wrapper.ts` catch path | `details: mapped.details` | `details: safeDetails(mapped.details)` |
| `app/api/v1/visits/route.ts` | `NextResponse.json(result, ...)` | `errorResponse(ctx, result)` |
| `app/api/v1/rating-slips/[id]/move/route.ts` | Custom `NextResponse.json({..., details: result.details})` | `errorResponse(ctx, result)` |
| `app/api/v1/rating-slips/[id]/modal-data/route.ts` | Custom `NextResponse.json({..., details: result.details})` | `errorResponse(ctx, result)` |

**Additional fix:** `errorResponse` checked `'status' in serviceResult` but the tracing middleware sets `httpStatus`, not `status`. Added `httpStatus` fallback so domain codes like `CATALOG_CONFIG_INVALID` return 400 instead of a misleading 500.

**Structural fix:** `safeDetails()` exported from `lib/http/service-response.ts` (was private) so both wrappers can import it.

See `docs/issues/cyclic-error/fix-gap.md` for full analysis.

---

### Files Changed

| Category | Files | Change |
|----------|-------|--------|
| Canonical utility | `lib/errors/safe-error-details.ts` | NEW — shared `safeErrorDetails()` |
| Serialization boundary | `lib/http/service-response.ts` | `safeDetails()` exported + deep-clone + fallback; `errorResponse` `httpStatus` fallback |
| Central error mapper | `lib/server-actions/error-map.ts` | All paths sanitized via `safeErrorDetails()` |
| Compositor tracing | `lib/server-actions/middleware/tracing.ts` | **NEW** — `safeDetails()` on both success and catch paths |
| Legacy wrapper | `lib/server-actions/with-server-action-wrapper.ts` | **NEW** — `safeDetails()` in `finalizeResult()` and catch |
| Middleware | `auth.ts`, `rls.ts` | Safe error extraction |
| Issuance route | `app/api/v1/loyalty/issue/route.ts` | Primitive-only details spread |
| Route bypass fixes | `visits/route.ts`, `move/route.ts`, `modal-data/route.ts` | **NEW** — replaced raw `NextResponse.json` with `errorResponse()` |
| 18 service files | `casino/`, `player/`, `loyalty/`, `visit/`, `mtl/`, etc. | `details: error` → `safeErrorDetails(error)` |
| Domain errors | `lib/errors/domain-errors.ts` | `toDomainError()` safe extraction |
| RLS enforcement | `services/loyalty/reward/crud.ts` | Row-count check after limits INSERT |
| Seed data | `supabase/seed.sql` | Reward catalog + child tables |
| Tier casing | `supabase/seed.sql` | `player_loyalty.tier` normalized to lowercase (11 UPDATEs) |
| Promo programs | `supabase/seed.sql` | NEW — 4 `promo_program` rows (match_play + free_play per casino) |
| Governance | `ERROR_TAXONOMY_AND_RESILIENCE.md`, `CLAUDE.md` | INV-ERR-DETAILS invariant |

### Outstanding

- `supabase db reset` needed to apply updated seed locally (Issues C, E, F)
- Remote database has zero base data (no casinos, no staff) — separate deployment concern
- 50+ migrations on local not yet applied to remote (Feb 12 → Apr 6 gap)
- **Defensive check**: Consider adding `.toLowerCase()` normalization at `promo/crud.ts:736` as defense-in-depth against future tier casing drift in production data