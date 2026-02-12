# GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY

**Created:** 2026-02-10
**Status:** Open
**Severity:** P0 (Blocker — new tenants stuck at placeholder)
**Related PRDs:** PRD-025 (Onboarding v0.1), PRD-024 (Landing Page + Start Gateway)
**Bounded Context:** CasinoService (Foundational)

---

## Summary

PRD-025 backend is 100% deployed (3 RPCs, `staff_invite` table, company RLS lockdown, GAP-4 fix). The bootstrap and invite UI flows are functional. However, after bootstrap, every new tenant hits a dead-end at the `/setup` placeholder page because the Setup Wizard (Wizard B) does not exist. The config taxonomy for initial game types, gaming tables, and operational settings has no UI, no completion RPC, and no mechanism to transition `setup_status` from `'not_started'` to `'ready'`.

---

## 1. PRD-025 Implementation Status

### Backend (100% Complete)

| Migration | Purpose | Status |
|-----------|---------|--------|
| `20260208140545_prd024_casino_setup_status.sql` | `setup_status` + `setup_completed_at` on `casino_settings` | Deployed |
| `20260208140546_prd025_staff_invite_company_rls.sql` | `staff_invite` table, RLS (Template 2b), company lockdown | Deployed |
| `20260208140547_prd025_rpc_bootstrap_gap4.sql` | `rpc_bootstrap_casino` + GAP-4 casino active fix | Deployed |
| `20260208140548_prd025_rpc_invite_create_accept.sql` | `rpc_create_staff_invite` + `rpc_accept_staff_invite` | Deployed |

RPCs:
- `rpc_bootstrap_casino` — Atomic tenant creation (casino + casino_settings + admin staff). SECURITY DEFINER, INV-8 compliant.
- `rpc_create_staff_invite` — Admin-only, hashed token (SHA-256), 72h TTL default. Returns raw token once.
- `rpc_accept_staff_invite` — Token validation, staff binding creation, SELECT...FOR UPDATE race prevention.

Service layer: `services/casino/crud.ts` — `bootstrapCasino()`, `createStaffInvite()`, `acceptStaffInvite()`, `listStaffInvites()` — all with DTOs, schemas, mappers, query keys, mutation hooks. 33 unit tests.

Security:
- GAP-4 closed: `set_rls_context_from_staff()` validates `casino.status = 'active'`
- Company RLS: deny-by-default (no permissive policies for authenticated role)
- `staff_invite` RLS: Template 2b session-var-only, column-level REVOKE on `token_hash`

### Frontend (Functional with P0 gap)

| Route | File | Status |
|-------|------|--------|
| `/start` | `app/(public)/start/page.tsx` | Complete — full gateway decision tree |
| `/bootstrap` | `app/(onboarding)/bootstrap/page.tsx` | Complete — `BootstrapForm` component |
| `/setup` | `app/(onboarding)/setup/page.tsx` | **Placeholder only** |
| `/invite/manage` | `app/(onboarding)/invite/manage/page.tsx` | Complete — admin invite creation |
| `/invite/accept` | `app/(onboarding)/invite/accept/page.tsx` | Complete — token-based acceptance |

Components (`components/onboarding/`): `bootstrap-form.tsx`, `invite-form.tsx`, `invite-list.tsx`, `accept-invite-handler.tsx` — all functional.

### Dashboard Settings (Placeholders)

| Route | File | Status |
|-------|------|--------|
| `/settings` | `app/(dashboard)/settings/page.tsx` | Placeholder |
| `/settings/casino` | `app/(dashboard)/settings/casino/page.tsx` | Placeholder |
| `/settings/staff` | `app/(dashboard)/settings/staff/page.tsx` | Placeholder |

---

## 2. The Setup Dead-End (P0 Blocker)

### Root Cause

1. `rpc_bootstrap_casino` inserts `casino_settings` with **only** `casino_id`, `timezone`, `gaming_day_start_time`
2. The `setup_status` column defaults to `'not_started'` (the RPC does not set it)
3. The `/start` gateway checks `settings.setup_status !== 'ready'` and redirects to `/setup`
4. `/setup` renders: *"The setup wizard is coming soon. Your casino workspace is being prepared."*

### Impact

Every new tenant is trapped at the placeholder setup page after bootstrap. The existing backfill migration (`20260208140545`) only sets `setup_status = 'ready'` for rows that existed at migration time — new bootstrapped casinos get `'not_started'`.

### Flow Diagram

```
User signs up → /start → no staff → /bootstrap → creates tenant
                                                        ↓
                                         casino_settings.setup_status = 'not_started'
                                                        ↓
                                    /start → setup_status != 'ready' → /setup
                                                        ↓
                                         DEAD END: "Coming soon" placeholder
```

---

## 3. Full Gap Inventory

| Gap | Severity | Description |
|-----|----------|-------------|
| **Setup Wizard UI** | **P0 Blocker** | No setup wizard exists. New tenants are stuck at placeholder. |
| **`setup_status` transition** | **P0 Blocker** | No mechanism to move `setup_status` from `'not_started'` to `'ready'`. Needs either a wizard completion RPC or skip-setup endpoint. |
| **API route handlers** | P1 | `services/casino/http.ts` references `/api/v1/onboarding/*` endpoints that don't exist. Server actions work as alternative path, but API routes are missing for `invite-list.tsx` fetch. |
| **Casino settings page** | P2 | `app/(dashboard)/settings/casino/page.tsx` is a placeholder — no forms for post-setup config changes. |
| **Default game/table seeding** | P2 | Bootstrap creates an empty tenant — no `game_settings`, no `gaming_table`. Casino is technically usable but operationally empty. |

---

## 4. Config Taxonomy (What the Setup Wizard Must Cover)

The schema already defines the full config domain. Below maps every entity to its setup relevance.

### Tier 1: Casino-Level Settings (`casino_settings`)

Partially set during bootstrap:

| Column | Set at Bootstrap? | Setup Wizard? | Notes |
|--------|:-:|:-:|-------|
| `timezone` | Yes | Edit | Default: `America/Los_Angeles` |
| `gaming_day_start_time` | Yes | Edit | Default: `06:00` |
| `table_bank_mode` | No (has default) | Configure | Enum: controls table bank management |
| `watchlist_floor` | No (has default) | Optional | Threshold for player watchlist |
| `ctr_threshold` | No (has default) | Optional | Cash transaction reporting threshold |
| `alert_thresholds` | No (JSON defaults) | Defer | Complex nested JSON — table_idle, slip_duration, pause_duration, drop_anomaly, hold_deviation, promo thresholds, baseline config |
| `promo_allow_anonymous_issuance` | No (default) | Defer | Promo settings |
| `promo_require_exact_match` | No (default) | Defer | Promo settings |
| `setup_status` | `'not_started'` | **Set to `'ready'`** | Gate for onboarding completion |
| `setup_completed_at` | null | **Set timestamp** | Tracks when setup was completed |

### Tier 2: Game Settings (`game_settings`) — Empty after bootstrap

Per-game-type configurations. Casino needs at least one to operate:

| Column | Type | Required for MVP |
|--------|------|:-:|
| `game_type` | `blackjack \| poker \| roulette \| baccarat` | Yes |
| `name` | Display name (e.g., "Blackjack 6-Deck") | Yes |
| `decisions_per_hour` | Number (default exists) | Sensible default |
| `house_edge` | Decimal (default exists) | Sensible default |
| `min_bet` / `max_bet` | Cents (nullable) | Optional |
| `seats_available` | Number (default exists) | Sensible default |
| `point_multiplier` | Decimal (nullable) | Defer |
| `points_conversion_rate` | Decimal (nullable) | Defer |
| `rotation_interval_minutes` | Number (nullable) | Defer |

### Tier 3: Gaming Tables (`gaming_table`) — Empty after bootstrap

Physical tables on the floor. Casino needs at least one:

| Column | Type | Required for MVP |
|--------|------|:-:|
| `label` | String (e.g., "BJ-01") | Yes |
| `type` | `game_type` enum | Yes |
| `pit` | String (nullable, pit grouping) | Optional |
| `status` | `table_status` enum | Default |
| `par_total_cents` | Number (table bank par) | Optional |

### Tier 4: Per-Table Settings (`gaming_table_settings`)

Override game defaults at table level — can be deferred to post-setup.

### Tier 5: Floor Layout (`floor_layout` + `floor_table_slot`)

Physical floor plan with table placement — post-setup.

---

## 5. Recommended Setup Wizard Scope (Minimum Viable)

### Step 1 — Review Casino Basics (pre-filled from bootstrap)
- Casino name (display only or editable)
- Timezone, gaming day start (editable, pre-filled)
- Table bank mode selection

### Step 2 — Game Types (seed `game_settings`)
- Select which game types the casino offers (checkbox: blackjack, poker, roulette, baccarat)
- For each selected: name + accept sensible defaults for decisions/hour, house_edge, seats
- Offer "quick start" presets (e.g., "Standard Blackjack" = 60 decisions/hr, 2% edge, 7 seats)

### Step 3 — Initial Tables (seed `gaming_table`)
- For each enabled game type, create at least 1 table
- Table label + game type + optional pit assignment
- Offer bulk creation (e.g., "Create 5 Blackjack tables: BJ-01 through BJ-05")

### Step 4 — Complete Setup
- Mark `casino_settings.setup_status = 'ready'` + stamp `setup_completed_at`
- Redirect to `/start` → routes to `/pit`

### Skip Option
For rapid testing, a "Skip setup" action that sets `setup_status = 'ready'` with no game/table seeding — results in empty but navigable dashboard.

---

## 6. Industry-Standard Defaults (Reference for Config Taxonomy)

| Game Type | Decisions/Hr | House Edge | Seats | Min Bet | Max Bet |
|-----------|:-:|:-:|:-:|:-:|:-:|
| Blackjack (6-deck) | 60 | 2.0% | 7 | $10 | $500 |
| Roulette (Double-zero) | 35 | 5.26% | 8 | $5 | $200 |
| Baccarat | 70 | 1.06% | 14 | $25 | $5,000 |
| Poker (Texas Hold'em) | 30 | 5.0% (rake) | 10 | $1/$2 | Table stakes |

These serve as preset templates during setup wizard Step 2.

---

## 7. Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md` | Parent PRD — defines Wizard B as separate PRD |
| `docs/10-prd/PRD-024-landing-page-start-gateway-v0.md` | Owns `/start` gateway, `setup_status` migration |
| `docs/issues/gaps/GAP-COMPANY-CASINO-RLS-CONTEXT.md` | Company RLS gaps — GAP-3/GAP-4 closed by PRD-025 |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | CasinoService owns all affected tables |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | Updated with staff_invite + company policies |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Updated with onboarding security model |
