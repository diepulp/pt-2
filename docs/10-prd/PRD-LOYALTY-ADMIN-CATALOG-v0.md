# PRD-LOYALTY-ADMIN-CATALOG — Loyalty Admin Catalog Slice

## 1. Overview

- **Owner:** loyalty bounded context
- **Status:** Draft
- **Feature Pipeline:** `loyalty-admin-catalog` (Phase 2)
- **Summary:** Build the admin UI for managing the pilot reward catalog and promo programs. Core backend services, schema, and most API surfaces are already present, but this slice still includes small contract-stabilization work (inventory route, mutation hooks, validation tightening) needed to expose the infrastructure safely through the existing `/admin/` route group. Earn rate configuration (`loyalty_earn_config`) is explicitly excluded per frozen pilot decision D2.

## 2. Problem & Goals

### 2.1 Problem

The reward catalog and promo program backend is largely built but has zero admin UI and a few unresolved contract gaps. Admins must currently rely on direct API calls, mock flows, or database manipulation to create rewards, set pricing, configure tier entitlements, or manage promo programs. This blocks pilot operationalization — the loyalty system cannot be configured by casino staff.

### 2.2 Goals

- Admin can create, edit, activate, and deactivate reward catalog entries through a UI
- Admin can configure points pricing for `points_comp` rewards and tier-entitlement mapping for `entitlement` rewards
- Admin can create and manage promo programs with lifecycle controls
- Invalid configuration states are blocked by tightened validation and surfaced in the UI
- Configuration contracts are frozen for Vector B (operator issuance) to bind to

### 2.3 Non-Goals

- Operator issuance UX (Vector B)
- Print templates / fulfillment rendering (Vector C)
- Earn rate configuration UI (`loyalty_earn_config` deferred — frozen decision D2)
- Player-facing loyalty views
- Per-game earn rate overrides
- Coupon issuance from admin (issuance is operator-side)

## 3. Users & Use Cases

- **Primary users:** Admin (casino administrator), Pit Boss (floor supervisor)

**Top Jobs:**

- As an admin, I need to create a new reward in the catalog so that operators can issue it to players
- As an admin, I need to set the points cost for a comp reward so that point redemption deducts the correct amount
- As an admin, I need to configure tier-based face values for entitlement rewards so that match play / free play instruments scale by player tier
- As an admin, I need to activate or deactivate rewards so that I can control which rewards are available for issuance
- As a pit boss, I need to create a promo program so that operators can issue promotional coupons during my shift
- As an admin, I need to view coupon inventory per program so that I can track outstanding promotional instruments

## 4. Scope & Feature List

### Reward Catalog Management
- Reward catalog list page with family/kind/status filtering
- Create reward dialog (both `points_comp` and `entitlement` families)
- Reward detail page with inline editing
- Points pricing form (`reward_price_points` — cost in points per comp)
- Tier-entitlement mapping form (`reward_entitlement_tier` — tier → face value + instrument type)
- Activate/deactivate toggle per reward

### Promo Program Management
- Promo program list page with status filtering
- Create program dialog
- Program detail page with inline editing
- Coupon inventory summary display (read-only)

### Contract Stabilization Work (Included in Slice)
- Expose or implement reward mutation hooks required by the admin UI (`useCreateReward`, `useUpdateReward`, `useToggleRewardActive`)
- Inventory API route: `GET /api/v1/promo-coupons/inventory`
- Validation tightening for reward and child-record payloads

### 4.1 Decision Freeze

The following decisions are frozen for this slice:

- **Tier enum policy:** `bronze | silver | gold | platinum | diamond`
- **Earn config exclusion:** `loyalty_earn_config` admin UI remains out of scope for pilot
- **Slice posture:** Vector A includes admin UI plus small backend/API contract stabilization; it is not frontend-only

## 5. Requirements

### 5.1 Functional Requirements

- Reward catalog list displays all rewards for the current casino, filterable by family (`points_comp` / `entitlement`), kind, and active status
- Create reward form enforces family-specific validation: `points_comp` requires `pricePoints`; `entitlement` requires at least one `entitlementTier`
- Points pricing form allows editing `points_cost` and `allow_overdraw` for `points_comp` rewards
- Tier-entitlement form allows adding/editing/removing tier entries with `benefit` JSONB (`face_value_cents`, `instrument_type`)
- Tier names use the frozen slice enum (see §4.1)
- Activate/deactivate toggle updates `is_active` via `toggleRewardActive` service method
- Promo program list displays programs with status badge (active/inactive/archived)
- Create program form validates via existing `createPromoProgramSchema`
- Role gating: reward catalog and promo program writes require the roles already authorized by deployed RLS and route guards; admin-only destructive actions must remain reflected in the UI

### 5.2 Non-Functional Requirements

- Pages render acceptably at pilot-scale data volumes (seeded catalog of ~10–50 entries)
- All mutations use `Idempotency-Key` headers per existing API contract
- UI follows existing admin section patterns (shadcn/ui, Tailwind v4)

> Architecture and schema details: see SRM v4.19.0 (LoyaltyService section), ADR-033 migration `20260206005751`.

## 6. UX / Flow Overview

**Reward catalog flow:**
1. Admin navigates to `/admin/loyalty/rewards/`
2. Sees catalog list (5 seeded entries) with family badges and active status
3. Clicks "Add Reward" → dialog with family selector → fills fields → saves
4. Clicks reward row → detail page with pricing config (points or tier form based on family)
5. Toggles active/inactive via switch control

**Promo program flow:**
1. Admin navigates to `/admin/loyalty/promo-programs/`
2. Sees program list with status filtering
3. Clicks "Add Program" → dialog → fills fields → saves
4. Clicks program row → detail page with edit form + coupon inventory count

**Route structure:**
```
app/(dashboard)/admin/loyalty/
├── rewards/
│   ├── page.tsx              # Catalog list + create dialog
│   └── [id]/page.tsx         # Detail + pricing/tier config
└── promo-programs/
    ├── page.tsx              # Program list + create dialog
    └── [id]/page.tsx         # Detail + inventory (no tier-ladder UX until D1 frozen)
```

**Implementation note:** Prior frontend-only estimates are superseded. This slice includes UI work plus small contract-stabilization work; estimates must be treated as provisional until the API/validation corrections are applied.

## 7. Dependencies & Risks

### 7.1 Dependencies

- Existing `/admin/` layout with role guard (deployed)
- RewardService (8 methods, 100% implemented)
- PromoService (11 methods, 100% implemented)
- ADR-033 tables with RLS policies (deployed + seeded)
- shadcn/ui component library (available)

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|---|---|
| D1: Tier-to-entitlement mapping approach on `promo_program` remains unresolved | This slice may proceed for reward catalog administration, but promo-program-related UI and future issuance binding must not imply that D1 is solved. Treat `reward_entitlement_tier` and `promo_program` as adjacent but distinct configuration surfaces until D1 is explicitly frozen. |
| GAP-A2: Missing child record API routes for granular updates | Use inline update pattern via existing `updateReward` with nested payload. Add granular routes post-pilot if UX demands it. |
| GAP-A2b: Zod validation gaps (fulfillment, scope, benefit JSONB) | Fix in this slice — tighten existing schemas with enum constraints. |

## 8. Definition of Done (DoD)

The slice is **Done** when:

**Functionality**
- [ ] Admin can create reward catalog entries for both `points_comp` and `entitlement` families
- [ ] Admin can edit existing reward catalog entries
- [ ] Admin can activate and deactivate rewards
- [ ] Admin can configure points pricing for `points_comp` rewards
- [ ] Admin can configure tier-entitlement mapping for `entitlement` rewards
- [ ] Admin can create and edit promo programs
- [ ] Admin can view coupon inventory per program
- [ ] Invalid configurations are blocked by validation and surfaced in the UI

**Data & Integrity**
- [ ] Reward and program records persist correctly across page reloads
- [ ] Casino-scoping is enforced — admin sees only their casino's rewards/programs

**Security & Access**
- [ ] Deployed RLS policies enforce role-based access for all write operations
- [ ] Admin route guard prevents unauthorized access

**Testing**
- [ ] One integration test proving reward create/update path with family-specific validation
- [ ] One integration test proving promo inventory fetch path
- [ ] One happy-path Playwright smoke flow: create reward → configure pricing/tier data → activate → verify in list

**Operational Readiness**
- [ ] Errors surface via existing error boundary architecture (ADR-032)

**Documentation**
- [ ] Configuration contracts frozen for Vector B handoff

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/loyalty-service-extension/LOYALTY_PILOT_SLICE_BOUNDARY.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.19.0, LoyaltyService)
- **Investigation:** `docs/00-vision/loyalty-service-extension/vectors/VECTOR-A/VECTOR-A-ADMIN-CATALOG-INVESTIGATION.md`
- **Earn Config Decision:** `docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md` (earn-config D1-D4 frozen; unrelated to this PRD's open D1 on promo-program tier mapping)
- **Feature Boundary:** `docs/20-architecture/specs/loyalty-admin-catalog/FEATURE_BOUNDARY.md`
- **Feature Brief:** `docs/20-architecture/specs/loyalty-admin-catalog/SCAFFOLD-001-FEATURE-BRIEF.md`
- **Schema:** ADR-033 migration `20260206005751_adr033_reward_catalog_schema.sql`
- **Fulfillment Policy:** `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
