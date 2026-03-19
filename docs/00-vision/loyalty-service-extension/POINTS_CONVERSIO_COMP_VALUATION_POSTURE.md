## Points Conversion & Comp Valuation — System Posture

### Architecture Overview

The system has **three distinct conversion layers**, each at a different stage of operationalization:

| Layer | Table | Key Column | Status |
|-------|-------|-----------|--------|
| **Earn Rate** (theo → points) | `game_settings` | `points_conversion_rate` | **ACTIVE** — captured in policy snapshots |
| **Earn Rate** (admin-configurable) | `loyalty_earn_config` | `points_per_theo` | **DORMANT** — table + service + API exist, not wired to accrual |
| **Liability Valuation** (points → dollars) | `loyalty_valuation_policy` | `cents_per_point` | **ACTIVE** — used by daily liability snapshot |
| **Redemption Pricing** (points cost per comp) | `reward_price_points` | `points_cost` | **DEPLOYED** — no admin UI |

---

### Critical Finding: Two Sources of Truth for Earn Rate

**Currently active path** (in `rpc_accrue_on_close`):
```
game_settings.points_conversion_rate  →  policy_snapshot (immutable)  →  base_points = ROUND(theo × rate)
```

**Dormant path** (fully built, never invoked):
```
loyalty_earn_config.points_per_theo  →  (not read by any RPC)
```

The `loyalty_earn_config` table has:
- Schema deployed (PK = `casino_id`, 1:1 upsert-friendly)
- Service CRUD in `services/loyalty/reward/crud.ts` (`getEarnConfig`, `upsertEarnConfig`)
- Zod validation in `schemas.ts`
- API routes: `GET/PUT /api/v1/rewards/earn-config`
- HTTP fetchers in `http.ts`
- Query key factory in `keys.ts`

But `rpc_accrue_on_close()` reads `points_conversion_rate` from `game_settings` via the slip's frozen `policy_snapshot.loyalty` — it **never touches** `loyalty_earn_config`.

---

### Layer-by-Layer Detail

**1. Earning: Theo → Points**

Formula (active):
```
theo = avg_bet × (house_edge/100) × duration_hours × decisions_per_hour
base_points = ROUND(theo × points_conversion_rate)
```

All parameters snapshotted from `game_settings` at slip creation (ADR-019 D2 — deterministic, immutable). The snapshot includes `_source` tracking for audit.

Defaults if `game_settings` missing: `house_edge=1.5`, `decisions_per_hour=70`, `points_conversion_rate=10.0`, `point_multiplier=1.0`.

**2. Liability Valuation: Points → Dollars**

`rpc_snapshot_loyalty_liability()` (SECURITY DEFINER, daily idempotent):
```sql
monetary_value_cents = SUM(player_loyalty.current_balance) × cents_per_point
```

Protected by partial unique index (one active policy per casino). Admin/pit_boss gated.

**3. Redemption Pricing: Points → Comp Items**

`reward_price_points.points_cost` defines point debit per reward. Seed: meal=$25 costs 250pts, beverage=$10 costs 100pts. `allow_overdraw` flag per reward.

---

### What Admins Can Configure Today (API-Only)

| Configuration | API Route | Admin UI |
|--------------|-----------|----------|
| Earn rate (`points_per_theo`, multiplier, rounding) | `PUT /api/v1/rewards/earn-config` | **None** |
| Reward catalog CRUD | `POST/PATCH /api/v1/rewards` | **None** |
| Reward pricing (points cost) | Via reward create/update | **None** |
| Tier entitlement benefits | Via reward create/update | **None** |
| Valuation policy (`cents_per_point`) | **No API route** | **None** |
| Game settings (house_edge, conversion rate) | **No dedicated route** | **None** |

---

### Gap Analysis for Admin Conversion Configuration

**GAP-A: `loyalty_earn_config` is disconnected from accrual**
- Severity: **Design Decision Required**
- The table was built (ADR-033) to be the canonical admin knob for earn rates, but the accrual RPC reads from `game_settings` instead
- Options:
  - **(A1)** Wire `loyalty_earn_config` into `rpc_start_rating_slip()` as the source for `points_conversion_rate` in the policy snapshot — earn config becomes the admin surface, `game_settings` provides game-specific parameters (house_edge, decisions_per_hour) only
  - **(A2)** Deprecate `loyalty_earn_config` and add admin UI for `game_settings.points_conversion_rate` directly
  - **(A3)** Merge: `rpc_accrue_on_close` reads `loyalty_earn_config.points_per_theo` as a casino-wide default, `game_settings.points_conversion_rate` as a per-game override

**GAP-B: No API route for `loyalty_valuation_policy`**
- Severity: **P1** — admins cannot set `cents_per_point` without direct DB access
- Service methods exist? **No** — only the RPC reads this table
- Needs: CRUD service + API route + admin form

**GAP-C: No React hooks for earn config or reward catalog**
- Severity: **P1** — blocks admin UI
- Query key factory exists (`rewardKeys`) but no hooks consume it
- Missing: `useEarnConfig`, `useUpsertEarnConfig`, `useRewards`, `useRewardDetail`, `useEligibleRewards`

**GAP-D: Admin UI is 0%**
- The `/loyalty/page.tsx` says "Phase 3 pending"
- No forms, no list views, no settings toggles for any loyalty configuration

---

### Recommended Resolution Sequence

1. **Design decision**: Resolve GAP-A (which table governs earn rate?) — this determines the admin surface shape
2. **Valuation policy service**: Build CRUD for `loyalty_valuation_policy` (service + API + hooks)
3. **Hooks**: Implement reward/earn-config React hooks (key factory already exists)
4. **Admin UI**: Earn config form → valuation policy form → reward catalog CRUD pages

Want me to proceed with any of these — produce a design brief, build the valuation policy service layer, or scaffold the admin UI?