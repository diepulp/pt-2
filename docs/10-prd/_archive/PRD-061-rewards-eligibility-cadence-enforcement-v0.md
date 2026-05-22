---
id: PRD-061
title: Rewards Eligibility Cadence Enforcement
owner: Lead Architect
status: Draft
affects: [ADR-033, EXEC-052, SRM-v4.20, SEC-001, SEC-002]
created: 2026-04-06
last_review: 2026-04-06
phase: Phase 3 (Loyalty Maturity)
pattern: B
http_boundary: false
---

# PRD-061 — Rewards Eligibility Cadence Enforcement

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** The `reward_limits` and `reward_eligibility` tables deployed by ADR-033 are schematically complete but enforcement is zero — nothing in the issuance path reads them. The only cooldown signal is a hardcoded 30-minute timer in the dashboard mapper that is cosmetic, global, and bypassable via direct API call. This PRD wires the existing schema into the issuance service layer, adds an admin UI for configuring per-reward frequency rules, and fixes the dashboard to display real cadence status. Points comps remain balance-bounded; entitlements become cadence-limited per `reward_limits` configuration.

---

## 2. Problem & Goals

### 2.1 Problem

Operators have no way to limit how frequently a reward is issued to a player. The `reward_limits` table exists with `scope`, `max_issues`, and `cooldown_minutes` columns, and entitlement rewards are seeded with `per_gaming_day, max_issues=1` — but the issuance functions (`issueComp()`, `issueEntitlement()`) load this data and discard it. A pit boss can issue the same entitlement to the same player unlimited times per shift. The dashboard shows a flat 30-minute "cooldown" badge that applies globally across all reward types and is not enforced server-side.

Additionally, there is no admin surface for managing `reward_limits` rows — frequency rules can only be set via seed data or direct database access, which is unacceptable for pilot operations.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Entitlement issuance respects configured cadence limits | `issueEntitlement()` returns `REWARD_LIMIT_REACHED` when `max_issues` per scope exceeded |
| **G2**: Cooldown enforcement blocks rapid re-issuance | `issueEntitlement()` returns `REWARD_COOLDOWN_ACTIVE` when `cooldown_minutes` not elapsed |
| **G3**: Admin can configure frequency rules per reward | `RewardLimitsForm` on `/admin/loyalty/rewards/[id]` reads/writes `reward_limits` rows |
| **G4**: Dashboard shows real per-reward cadence status | Eligibility card displays actual configured cooldown, not hardcoded 30m |
| **G5**: Points comps remain unrestricted by default | `issueComp()` skips cadence checks when no `reward_limits` configured for the reward |

### 2.3 Non-Goals

- **Campaign engine / segmentation / time-window promotions** — cadence is per-reward, not per-campaign
- **RPC-layer hard enforcement (Phase 3)** — defense-in-depth inside `rpc_issue_promo_coupon` is a follow-on; this PRD covers service-layer enforcement
- **Per-game or per-table dynamic issuance multipliers** — out of scope per ADR-033
- **Retroactive limit enforcement** — existing issuances before limits are configured are not invalidated
- **`visit_kinds` filtering on `reward_eligibility`** — not yet needed for pilot; eligibility tier/balance checks already enforced

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Casino Admin

**Top Jobs:**

- As a **Casino Admin**, I need to configure how often each entitlement reward can be issued (e.g., "1 match play per gaming day") so that promotional instrument budgets are controlled.
- As a **Pit Boss**, I need the system to block me from over-issuing an entitlement to a player so that I don't accidentally violate promotional policy.
- As a **Pit Boss**, I need to see when a player becomes eligible for their next reward so that I can time incentive offers appropriately.
- As a **Casino Admin**, I need points comps to remain unrestricted (bounded only by balance) so that comp workflow speed is not degraded.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Admin Configuration (WS1):**
- `RewardLimitsForm` component on the reward detail page (`/admin/loyalty/rewards/[id]`)
- CRUD for `reward_limits` rows: create, update, delete frequency rules per reward (**admin role only**; pit bosses see read-only display)
- Scope selector: `per_visit` | `per_gaming_day` | `per_week` | `per_month`
- Max issues input (positive integer, default 1)
- Cooldown minutes input (optional, nullable)
- Requires-note toggle (see §5.6 for enforcement behavior)
- Form validation via Zod schema
- Unique constraint: one rule per scope per reward (add second `per_gaming_day` rule is rejected)

**Service-Layer Enforcement (WS2):**
- Pre-flight cadence check in `issueEntitlement()` before RPC call
- Optional cadence check in `issueComp()` (only when `reward_limits` rows exist for the reward)
- `countIssuances(supabase, playerId, rewardId, windowStart)` helper — queries issuance history
- `getLastIssuanceTime(supabase, playerId, rewardId)` helper — for cooldown check
- `resolveWindowStart(scope, casinoId)` helper — maps scope to timestamp boundary
- New error codes: `REWARD_LIMIT_REACHED`, `REWARD_COOLDOWN_ACTIVE`, `REWARD_VISIT_REQUIRED`
- HTTP 429 response with `Retry-After` header (limit/cooldown); HTTP 422 for visit-required

**Dashboard Mapper Fix (WS3):**
- Replace hardcoded 30m cooldown in `mapToRewardsEligibility()` with per-reward limit data
- Differentiate points_comp (always available if balance > 0) from entitlement (cadence-gated)
- Eligibility card shows actual configured cooldown timer
- Generalize reason code: replace `DAILY_LIMIT_REACHED` (stale — only covers `per_gaming_day`) with `LIMIT_REACHED`. The existing `ReasonCode` type in `services/player360-dashboard/dtos.ts` must be updated: rename `DAILY_LIMIT_REACHED` → `LIMIT_REACHED` to cover all scope types (`per_visit`, `per_gaming_day`, `per_week`, `per_month`). Guidance text carries the scope detail (e.g., "Limit reached: 1 per gaming day").

### 4.2 Out of Scope

- RPC-level hard enforcement inside `rpc_issue_promo_coupon` / `rpc_redeem` (Phase 3 follow-on)
- Admin UI for `reward_eligibility` (tier/balance rules already enforced in `listEligibleRewards()`)
- Bulk-edit limits across multiple rewards
- Audit log for limit configuration changes (standard `updated_at` column suffices for pilot)

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1**: When `issueEntitlement()` is called for a reward with `reward_limits` rows, the system counts previous issuances for the player within the configured scope window and rejects if `count >= max_issues`.
- **FR-2**: When `cooldown_minutes` is configured and the player's last issuance of that reward is within the cooldown period, the system rejects with remaining time.
- **FR-3**: When `issueComp()` is called for a reward with no `reward_limits` rows, no cadence check is performed (balance is the natural limiter).
- **FR-4**: When `issueComp()` is called for a reward WITH `reward_limits` rows (admin-configured), the cadence check applies.
- **FR-5**: The **admin** (not pit boss) can add, edit, or remove a `reward_limits` rule for any reward in the catalog via the reward detail page. Pit bosses see limit configuration as read-only.
- **FR-6**: The `per_gaming_day` scope resolves to the current gaming day boundaries using `casino_settings.gaming_day_start_time`.
- **FR-7**: The eligibility card on the player-360 dashboard shows per-reward cadence status using generalized reason codes (`AVAILABLE`, `COOLDOWN_ACTIVE`, `LIMIT_REACHED`, `VISIT_REQUIRED`), replacing the global 30m hardcoded timer. The stale `DAILY_LIMIT_REACHED` reason code is renamed to `LIMIT_REACHED`; scope detail is carried in guidance text.
- **FR-8**: Error responses include `Retry-After` header (seconds until next eligible issuance).

### 5.2 Non-Functional Requirements

- **NFR-1**: The cadence pre-flight requires up to 3 additional queries beyond the existing `getReward()` call: (a) `casino_settings` for gaming-day boundary (cacheable per casino, amortized to ~0 for repeat calls), (b) active visit lookup for `per_visit` scope (skip if no `per_visit` rule), (c) a single composed count+last-issuance query against the canonical ledger. Implementation SHOULD batch (a) and (b) into a `Promise.all` parallel fetch, and SHOULD combine the count and last-issuance check into one query (`SELECT count(*), max(created_at)`) to minimize round-trips. Worst case is 2 additional serial round-trips (parallel settings+visit, then count). All queries must hit indexed columns.
- **NFR-2**: `reward_limits` write access is RLS-protected — casino-scoped, **admin-only**. Pit bosses may read limits (displayed in UI) but may not create, update, or delete frequency rules. Policy authoring and operational issuance are distinct privileges.
- **NFR-3**: Scope window resolution for `per_gaming_day` must use the CasinoService temporal authority (TEMP-002), not JS date math.

> Architecture: See SRM v4.20 (LoyaltyService owns `reward_limits`), ADR-033 (reward catalog model), EXEC-052 (issuance infrastructure).

### 5.3 Canonical Enforcement Model

Cadence enforcement evaluates against a single canonical issuance source per reward family. The counting key shape is `(casino_id, player_id, reward_linkage, window_start)`.

**Points Comp (`family = 'points_comp'`):**
- **Source table:** `loyalty_ledger`
- **Qualifying event:** Row with `reason = 'redeem'` AND `source_kind = 'reward'` AND `source_id = <reward_catalog.id>`
- **Exclusion rules:** Rows with `reason = 'reversal'` referencing the same `source_id` cancel the original issuance from the count. Failed RPC calls that never persist a ledger row do not count.
- **Open risk — reversal/adjustment chains:** The counting query assumes a clean 1:1 relationship between `redeem` rows and issuance events. If `rpc_redeem` ever produces partial reversals, adjustment chains, or multiple `redeem` rows per logical issuance (e.g., split redemptions), the count will overstate. Implementation MUST verify during WS2 that (a) one `issueComp()` call produces exactly one `redeem` row, and (b) reversals are identifiable and excludable. If the ledger is not this clean, the counting query needs a more defensive shape (e.g., net count via `SUM(CASE WHEN reason='redeem' THEN 1 WHEN reason='reversal' THEN -1 END)`).
- **Counting query (baseline):** `SELECT count(*) FROM loyalty_ledger WHERE player_id = $1 AND source_kind = 'reward' AND source_id = $2 AND reason = 'redeem' AND created_at >= $3`

**Entitlement (`family = 'entitlement'`):**
- **Source table:** `promo_coupon`
- **Qualifying event:** Row with `status IN ('issued', 'cleared', 'expired', 'replaced')` — any coupon that was successfully issued. `replaced` counts because the original issuance consumed the cadence slot.
- **Exclusion rules:** Rows with `status = 'voided'` are excluded from the count (voided = administratively cancelled, cadence slot freed).
- **Reward linkage gap:** `promo_coupon` currently has no `reward_catalog_id` column. `rpc_issue_promo_coupon` does not accept a reward_id parameter. **This PRD requires a small schema migration** to add `reward_catalog_id uuid NULL REFERENCES reward_catalog(id)` to `promo_coupon` and thread it through the RPC. Without this column, entitlement counting must fall back to `promo_program_id` as a proxy — imprecise if multiple rewards share a program.
- **Counting query (post-migration):** `SELECT count(*) FROM promo_coupon WHERE player_id = $1 AND reward_catalog_id = $2 AND status != 'voided' AND issued_at >= $3`

**Invariant:** Issuance attempts that fail before canonical persistence (RPC error, validation failure, network timeout) SHALL NOT count toward cadence. Only rows that exist in the source table with qualifying status count.

### 5.4 Rule Semantics & Precedence

**Row cardinality:** A single reward MAY have multiple `reward_limits` rows with different scopes (e.g., `per_gaming_day` with `max_issues=2` AND `per_week` with `max_issues=5`). A reward MUST NOT have two rows with the same `scope` (enforced by unique constraint `(reward_id, scope)`).

**Multi-rule evaluation:** All active rules for a reward are evaluated conjunctively (AND). Issuance is blocked if **any** active rule blocks it.

**Violation priority:** When multiple rules block simultaneously, the error returned follows this priority (first match wins):
1. `REWARD_COOLDOWN_ACTIVE` — cooldown violations take precedence because they resolve sooner
2. `REWARD_LIMIT_REACHED` — scope-window violations are reported when no cooldown is active

**`Retry-After` derivation:** The header value is the number of seconds until the **earliest** timestamp at which all blocking rules would simultaneously evaluate to pass. For cooldown: `cooldown_minutes * 60 - elapsed_seconds`. For scope limits: seconds until the current scope window expires. When both block, use `max(cooldown_retry, scope_retry)` since both must pass.

**`nextEligibleAt` (dashboard):** Same semantics as `Retry-After` — the earliest moment all rules pass. This drives the countdown timer in the eligibility card.

### 5.5 `per_visit` Scope Resolution

The `per_visit` scope requires an active visit for the player. If the player has no active visit, issuance fails with `REWARD_VISIT_REQUIRED` (not `REWARD_LIMIT_REACHED` — "no active visit" is an eligibility/context failure, not a cadence limit being reached; conflating the two would muddy logs, API behavior, and UI messaging). This is not a fallback to `per_gaming_day`; it is a hard requirement. The window start is `visit.checked_in_at` for the player's current active visit.

### 5.6 `requires_note` Enforcement

When `reward_limits.requires_note = true` for any active limit rule on a reward:
- **Issuance path:** `issueComp()` and `issueEntitlement()` require a non-empty `note` parameter. If missing, issuance fails with existing error code `LOYALTY_NOTE_REQUIRED`.
- **UI:** The issuance form disables the submit button until a note is entered. The `RewardLimitsForm` admin UI exposes this toggle with tooltip: "Require operator to provide a justification note when issuing this reward."
- **Scope:** This applies regardless of whether the cadence limit itself is hit. If `requires_note = true`, every issuance of that reward requires a note.

---

## 6. UX / Flow Overview

**Flow 1: Admin Configures Frequency Rule**
1. Admin navigates to `/admin/loyalty/rewards/[id]` for an entitlement reward
2. Below the `TierEntitlementForm`, the `RewardLimitsForm` section loads existing limits (or empty state)
3. Admin selects scope (`per_gaming_day`), sets max issues (`1`), optionally sets cooldown (`240` minutes)
4. Admin saves — `reward_limits` row created/updated
5. Confirmation toast: "Frequency rule saved"

**Flow 2: Pit Boss Issues Entitlement (Limit Enforced)**
1. Pit boss opens player-360, selects entitlement reward
2. System calls `issueEntitlement()` — pre-flight loads `reward.limits`
3. Count query: 1 issuance already exists for this gaming day → `count >= max_issues`
4. System returns `REWARD_LIMIT_REACHED` with guidance: "Max 1 issuance per gaming day reached"
5. UI shows error with next eligible time

**Flow 3: Dashboard Eligibility Display**
1. Pit boss views player-360 rewards eligibility card
2. For entitlement rewards: card shows "Next eligible in 3h 22m" (based on `reward_limits.cooldown_minutes`)
3. For points comps: card shows "Eligible" with balance display (no cooldown)

**Dashboard Status Derivation Rules:**

The eligibility card derives a single display state per reward using this priority:

| Priority | Condition | Status | Reason Code | Timer |
|----------|-----------|--------|-------------|-------|
| 1 | No `reward_limits` rows AND `family = 'points_comp'` | `available` | `AVAILABLE` | none |
| 2 | `per_visit` rule active, no active visit | `not_available` | `VISIT_REQUIRED` | none |
| 3 | Cooldown active (any rule) | `not_available` | `COOLDOWN_ACTIVE` | countdown to cooldown expiry |
| 4 | Scope limit reached (any rule) | `not_available` | `LIMIT_REACHED` | countdown to window expiry |
| 5 | Cooldown + limit both blocking | `not_available` | `COOLDOWN_ACTIVE` | countdown to `max(cooldown, window)` expiry |
| 6 | No rules blocking | `available` | `AVAILABLE` | none |

When multiple rules exist (e.g., `per_gaming_day` + `per_week`), the card shows the **most restrictive** blocking reason. The timer always reflects `nextEligibleAt` — the earliest moment all rules pass simultaneously.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-033 schema** — `reward_limits` and `reward_eligibility` tables deployed and seeded (DONE)
- **EXEC-052 issuance infra** — `issueComp()`, `issueEntitlement()`, unified API route (DONE)
- **CasinoService temporal authority (cross-context read)** — LoyaltyService requires a sanctioned read of `casino_settings.gaming_day_start_time` for `per_gaming_day` scope resolution. This is an explicit cross-context dependency: LoyaltyService reads from CasinoService-owned data. The mechanism is a direct table read (`casino_settings` SELECT by `casino_id`) within the cadence helper, not a service-to-service API call. **SRM v4.20 must be amended** to add `casino_settings (read: gaming_day_start_time)` to LoyaltyService's `Reads From:` row, following the same pattern as Player360DashboardService reading from LoyaltyService.
- **RLS policies on `reward_limits`** — existing ADR-015 Pattern C hybrid policies must allow admin write access and pit_boss/admin read access.
- **Schema migration: `promo_coupon.reward_catalog_id`** — new nullable FK column required for entitlement counting (see §5.3 Canonical Enforcement Model).

### 7.2 Risks

- **R1: Gaming day boundary in issuance path** — `casino_settings.gaming_day_start_time` is not currently fetched during issuance. Mitigation: add single-row fetch from `casino_settings` in `resolveWindowStart()` (small, cacheable, one round-trip).
- **R2: Entitlement counting requires schema change** — `promo_coupon` has no `reward_catalog_id` column today. Without it, entitlement counting falls back to `promo_program_id` as proxy, which is imprecise if multiple rewards share a program. Mitigation: WS0 migration adds the column and threads it through `rpc_issue_promo_coupon`.
- **R3: Race condition on concurrent issuance** — Two pit bosses could issue the same entitlement simultaneously, both passing the service-layer count check before either RPC persists. Service-layer enforcement is advisory-grade and does NOT provide transactional guarantees. Mitigation: acceptable for pilot — single-operator-per-player UX pattern makes races unlikely. RPC-layer hard enforcement (Phase 3 follow-on) will provide the authoritative lock.
- **R4: Unique constraint on `(reward_id, scope)`** — Required by §5.4 rule semantics. If not present on `reward_limits`, a migration must add it.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `issueEntitlement()` rejects with `REWARD_LIMIT_REACHED` when scope limit exceeded
- [ ] `issueEntitlement()` rejects with `REWARD_COOLDOWN_ACTIVE` when cooldown not elapsed
- [ ] `issueComp()` skips cadence when no `reward_limits` exist; enforces when they do
- [ ] Admin can create/edit/delete `reward_limits` rows via reward detail page
- [ ] Dashboard eligibility card shows per-reward cadence status, not hardcoded 30m

**Data & Integrity**
- [ ] Issuance count queries use indexed columns (`player_id`, `reward_id`, `created_at`/`issued_at`)
- [ ] No false positives: voided coupons excluded from entitlement count

**Security & Access**
- [ ] `reward_limits` write access (create/update/delete) is casino-scoped via RLS — **admin only**
- [ ] `reward_limits` read access available to admin and pit_boss (for UI display)
- [ ] The `POST /api/v1/loyalty/issue` route performs cadence checks before issuance; ordinary API use cannot skip cadence validation
- [ ] Acknowledged: service-layer cadence is advisory, not race-proof; transactional enforcement deferred to RPC-layer hardening (Phase 3)

**Testing**
- [ ] Unit tests for `resolveWindowStart()` covering all 4 scope types
- [ ] Unit tests for `countIssuances()` and `getLastIssuanceTime()`
- [ ] Integration test: issue entitlement, hit limit, verify rejection
- [ ] Mapper test: verify per-reward eligibility replaces hardcoded 30m

**Operational Readiness**
- [ ] Structured log on cadence rejection: `{ event: 'cadence_rejected', code, rewardId, playerId, scope }`
- [ ] `Retry-After` header included in 429 responses

**Documentation**
- [ ] Error codes `REWARD_LIMIT_REACHED`, `REWARD_COOLDOWN_ACTIVE`, and `REWARD_VISIT_REQUIRED` documented in API contract
- [ ] SRM v4.20 amended: `casino_settings (read: gaming_day_start_time)` added to LoyaltyService `Reads From:` (mandatory — cross-context dependency is confirmed, not conditional)

---

## 9. Related Documents

- **Vision / Gap Analysis**: `docs/00-vision/loyalty-service-extension/issues/eligibility-cadence-gap.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (LoyaltyService, v4.20)
- **ADR-033**: `docs/80-adrs/ADR-033-LOYALTY-REWARD-DOMAIN-MODEL-SCAFFOLDING-MVP.md`
- **EXEC-052**: `docs/21-exec-spec/EXEC-052-loyalty-operator-issuance.md`
- **Schema / Types**: `types/database.types.ts` — `reward_limits`, `reward_eligibility`
- **Migration**: `supabase/migrations/20260206005751_adr033_reward_catalog_schema.sql`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Temporal Patterns**: `docs/20-architecture/temporal-patterns/TEMP-002-temporal-authority-pattern.md`
- **Prerequisite PRDs**: PRD-052 (Loyalty Operator Issuance)

---

## Appendix A: Schema Reference

**Asserted against `types/database.types.ts` on 2026-04-06** (column names and types spot-checked via grep against generated types). This is a point-in-time assertion, not a CI-verified guarantee. Implementers MUST re-verify column names, types, and enum values against the current generated types before writing queries — schema drift between PRD authoring and implementation is a known project risk.

### Existing Tables (ADR-033, deployed)

```sql
-- reward_limits — per-reward frequency rules
-- Verified: types/database.types.ts lines 2635-2679
CREATE TABLE public.reward_limits (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id        uuid    NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  reward_id        uuid    NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  scope            text    NOT NULL CHECK (scope IN ('per_visit', 'per_gaming_day', 'per_week', 'per_month')),
  max_issues       int     NOT NULL DEFAULT 1 CHECK (max_issues > 0),
  cooldown_minutes int     NULL,
  requires_note    boolean NOT NULL DEFAULT false
);

-- reward_eligibility — per-reward access rules
-- Verified: types/database.types.ts lines 2551-2595
CREATE TABLE public.reward_eligibility (
  id                 uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id          uuid   NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  reward_id          uuid   NOT NULL REFERENCES public.reward_catalog(id) ON DELETE CASCADE,
  min_tier           text   NULL,
  max_tier           text   NULL,
  min_points_balance int    NULL,
  visit_kinds        text[] NULL
);
```

### Counting model linkage

**Comp issuances** (`loyalty_ledger`): `rpc_redeem` stores `source_kind = 'reward'`, `source_id = <reward_catalog.id>` (verified in migration `20260306223803`). Counting query filters on `(player_id, source_kind='reward', source_id=reward_id, reason='redeem', created_at >= window)`.

**Entitlement issuances** (`promo_coupon`): Currently has NO `reward_catalog_id` column. `rpc_issue_promo_coupon` does not accept a reward_id parameter. Coupon status enum: `issued | voided | replaced | expired | cleared`.

### Required Migrations (New)

```sql
-- M1: Add reward_catalog_id to promo_coupon for entitlement counting
ALTER TABLE public.promo_coupon
  ADD COLUMN reward_catalog_id uuid NULL REFERENCES public.reward_catalog(id);

-- M2: Thread reward_catalog_id through rpc_issue_promo_coupon
-- (add p_reward_catalog_id uuid DEFAULT NULL parameter, INSERT into new column)

-- M3: Unique constraint on reward_limits (one rule per scope per reward)
ALTER TABLE public.reward_limits
  ADD CONSTRAINT uq_reward_limits_reward_scope UNIQUE (reward_id, scope);

-- M4: Partial indexes for cadence counting performance
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_cadence_count
  ON public.loyalty_ledger (player_id, source_id, created_at DESC)
  WHERE reason = 'redeem' AND source_kind = 'reward';

CREATE INDEX IF NOT EXISTS idx_promo_coupon_cadence_count
  ON public.promo_coupon (player_id, reward_catalog_id, issued_at DESC)
  WHERE status != 'voided';
```

---

## Appendix B: Implementation Plan

### WS0: Schema Amendments (P0, blocks WS1+WS2)

- [ ] Migration M1: `ALTER TABLE promo_coupon ADD COLUMN reward_catalog_id uuid NULL REFERENCES reward_catalog(id)`
- [ ] Migration M2: Update `rpc_issue_promo_coupon` to accept `p_reward_catalog_id uuid DEFAULT NULL` and INSERT into new column
- [ ] Migration M3: `ALTER TABLE reward_limits ADD CONSTRAINT uq_reward_limits_reward_scope UNIQUE (reward_id, scope)`
- [ ] Migration M4: Partial indexes for cadence counting (see Appendix A)
- [ ] Thread `reward_catalog_id` through `issueEntitlement()` → RPC call
- [ ] Run `npm run db:types-local` to regenerate types

### WS1: Admin Frequency Configuration UI (P0)

- [ ] `RewardLimitsForm` component in `components/admin/loyalty/rewards/`
- [ ] Zod schema for limit input validation (`rewardLimitInputSchema` in `services/loyalty/reward/schemas.ts`)
- [ ] CRUD methods: `upsertRewardLimit()`, `deleteRewardLimit()` in `services/loyalty/reward/crud.ts`
- [ ] Wire into reward detail page below `TierEntitlementForm`
- [ ] Role gate: form editable for `admin` only; `pit_boss` sees read-only display
- [ ] RLS: admin-only INSERT/UPDATE/DELETE policy on `reward_limits`; admin+pit_boss SELECT

### WS2: Service-Layer Cadence Enforcement (P0)

- [ ] `resolveWindowStart(scope, casinoId, supabase)` — maps scope to timestamp; uses `casino_settings.gaming_day_start_time` for `per_gaming_day`; requires active visit for `per_visit` (§5.5)
- [ ] `countIssuances(supabase, playerId, rewardId, windowStart, family)` — queries correct ledger by family per §5.3 canonical model
- [ ] `getLastIssuanceTime(supabase, playerId, rewardId, family)` — for cooldown check
- [ ] Pre-flight cadence block in `issueEntitlement()` (after reward validation, before RPC)
- [ ] Optional cadence block in `issueComp()` (only when limits exist)
- [ ] `requires_note` enforcement: check `note` parameter when any limit has `requires_note = true` (§5.6)
- [ ] New domain error codes: `REWARD_LIMIT_REACHED`, `REWARD_COOLDOWN_ACTIVE`, `REWARD_VISIT_REQUIRED`
- [ ] Error mapping in `app/api/v1/loyalty/issue/route.ts` → HTTP 429 + `Retry-After` (limit/cooldown), HTTP 422 (visit-required)
- [ ] SRM amendment: add `casino_settings (read: gaming_day_start_time)` to LoyaltyService `Reads From:`

### WS3: Dashboard Mapper Fix (P1)

- [ ] Refactor `mapToRewardsEligibility()` to accept per-reward limit data instead of hardcoded 30m
- [ ] Fetch `reward_limits` for active entitlement rewards in `getPlayerSummary()`
- [ ] Family-differentiated status: points_comp (balance check only) vs entitlement (cadence check)
- [ ] Multi-rule status derivation per §6 Dashboard Status Derivation Rules
- [ ] Update `RewardsEligibilityCard` to show per-reward cadence info
- [ ] Update mapper unit tests

---

## Appendix C: Error Codes

**Loyalty Domain (new)**

| Code | HTTP | Trigger |
|------|------|---------|
| `REWARD_LIMIT_REACHED` | 429 | `max_issues` per `scope` window exceeded |
| `REWARD_COOLDOWN_ACTIVE` | 429 | `cooldown_minutes` not elapsed since last issuance |
| `REWARD_VISIT_REQUIRED` | 422 | `per_visit` scope rule active but player has no active visit (eligibility/context failure, not a cadence violation) |

**Route-layer mapping:**

| Service Code | Route Code | HTTP |
|-------------|-----------|------|
| `REWARD_LIMIT_REACHED` | `LOYALTY_LIMIT_REACHED` | 429 |
| `REWARD_COOLDOWN_ACTIVE` | `LOYALTY_COOLDOWN_ACTIVE` | 429 |
| `REWARD_VISIT_REQUIRED` | `LOYALTY_VISIT_REQUIRED` | 422 |

`REWARD_LIMIT_REACHED` and `REWARD_COOLDOWN_ACTIVE` include `Retry-After` header (seconds until next eligible issuance). `REWARD_VISIT_REQUIRED` does not — the resolution is operational (check player in), not temporal.

**Dashboard reason codes (updated):**

| Old (stale) | New (generalized) | Rationale |
|-------------|-------------------|-----------|
| `DAILY_LIMIT_REACHED` | `LIMIT_REACHED` | Covers all scopes, not just `per_gaming_day`. Scope detail in guidance text. |
| — | `VISIT_REQUIRED` | New: `per_visit` scope with no active visit |

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-04-06 | Lead Architect | Initial draft from gap analysis |
| 0.2.0 | 2026-04-06 | Lead Architect | Audit delta remediation: added §5.3 canonical enforcement model, §5.4 rule semantics/precedence, §5.5 per_visit resolution, §5.6 requires_note behavior, dashboard multi-rule derivation rules, admin-only write permissions, honest DoD enforcement claims, promo_coupon.reward_catalog_id migration, schema validation against types |
| 0.3.0 | 2026-04-06 | Lead Architect | Second-pass fixes: NFR-1 honest round-trip budget (up to 2 serial, with batching guidance); REWARD_VISIT_REQUIRED as separate error code (not overloading LIMIT_REACHED); DAILY_LIMIT_REACHED → LIMIT_REACHED (scope-generalized); comp counting model reversal/adjustment caveat; DoD SRM line mandatory not conditional; schema validation claim softened to assertion-with-caveat |
