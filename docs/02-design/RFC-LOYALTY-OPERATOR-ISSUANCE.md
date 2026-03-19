---
id: RFC-LOYALTY-OPERATOR-ISSUANCE
title: "Design Brief: Loyalty Operator Issuance"
owner: agent/feature-pipeline
status: Draft
date: 2026-03-18
affects:
  - LoyaltyService
  - PromoService
  - Player 360 UI
  - reward_catalog
  - loyalty_ledger
  - promo_coupon
---

# Design Brief / RFC: Loyalty Operator Issuance

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.

## 1) Context

### Problem

Pit bosses have no way to issue rewards from player context. The system has extensive loyalty infrastructure (9 points RPCs, 5 promo RPCs, 8 LoyaltyService methods, 11 PromoService methods), a reward catalog schema, and player-facing UI — but the issuance workflow is missing.

**Current state of issuance UI:**
- `IssueRewardButton` — disabled stub with "Coming soon" tooltip (`components/player-360/header/issue-reward-button.tsx`)
- `ManualRewardDialog` — broken stub that collects wrong fields (bonus points + reason) and doesn't call any backend (`components/loyalty/manual-reward-dialog.tsx`)
- No reward selection surface exists
- No family-aware issuance flow exists

### Forces / constraints

1. **Two structurally distinct families** (`points_comp` and `entitlement`) must remain separate per REWARD_FULFILLMENT_POLICY.md — they use different RPCs, different persistence targets, and different ledger effects
2. **Pilot instrument set is frozen**: match play, meal comp, free play, other floor comps
3. **Printing is required** for all player-facing pilot instruments (Vector C scope, not this vector) — but issuance must freeze the contract surface that fulfillment binds to
4. **Existing RPCs are explicit-param**: `rpc_redeem` and `rpc_issue_promo_coupon` require the caller to supply computed values (points amount, program ID, validation number) — no auto-derivation from tier/policy exists
5. **Vector A dependency**: entitlement auto-derivation (tier → face value → match wager) requires the tier-to-entitlement mapping from Vector A (GAP-A5)

### Prior art

- **Points accrual on close**: `rpc_accrue_on_close` → `loyalty_ledger` + `player_loyalty` — proven atomic pattern
- **Promo coupon lifecycle**: `rpc_issue_promo_coupon` / `rpc_void_promo_coupon` / `rpc_replace_promo_coupon` — full lifecycle exists
- **TanStack Query hooks**: `useRedeem`, `useIssueCoupon`, `useVoidCoupon`, `useReplaceCoupon` — mutation hooks exist but are not connected to any issuance UI

## 2) Scope & Goals

### In scope
- Unified issuance drawer/dialog from player context
- `points_comp` issuance: catalog selection → balance check → confirm → debit
- `entitlement` issuance: catalog selection → confirm (using catalog/config-frozen params) → coupon creation. Full one-click tier auto-derivation deferred pending Vector A GAP-A5.
- Issuance persistence for both families
- Unified reward history (both families visible)
- Stubbed API routes wired (GAP-B4): balances, mid-session-reward, player loyalty
- Issuance-to-fulfillment contract surface frozen (for Vector C to bind)

### Out of scope
- Admin catalog CRUD (Vector A)
- Print templates or rendering (Vector C)
- `rpc_issue_current_match_play` one-click RPC (depends on Vector A tier mapping)
- Mid-session auto-trigger (GAP-B5 divergent module)
- Multi-property issuance

### Success criteria
- Pit boss can issue any pilot reward type (both families) from Player 360 in under 10 seconds
- Issuance produces correct persistence per family (ledger debit OR coupon record)
- Invalid states are prevented: insufficient balance, inactive reward, duplicate coupon
- Reward history shows both families in unified view
- Issuance contract surface documented for Vector C binding

## 3) Proposed Direction (overview)

**Unified Issue Drawer** with family-aware sub-flows, driven by `reward_catalog` data.

The operator clicks "Issue Reward" in Player 360 → a drawer opens showing available rewards from the catalog (filtered by casino, active status, and family). The drawer displays rewards grouped by family but the operator doesn't need to think about families — they select a reward and the system routes to the correct issuance path:

- **`points_comp`** selection → confirm dialog showing reward name, face value, points cost, current balance, post-debit balance → calls `rpc_redeem` with `p_reward_id` linking to catalog
- **`entitlement`** selection → confirm dialog showing reward name, face value, match wager (as frozen in catalog/config — **not** auto-derived from tier) → calls `rpc_issue_promo_coupon` with explicit params from catalog record

> **Entitlement scope constraint:** Vector B supports entitlement issuance only to the extent that required face value / wager parameters are already resolvable from frozen catalog/config inputs. Full one-click tier auto-derivation (tier → face value → match wager) remains deferred pending Vector A GAP-A5 resolution. The UI and service layer are designed so that swapping to auto-derivation later requires only an implementation change in `issueEntitlement()`, not a UX or API contract change.

On success, the mutation hook's `onSuccess` fires the fulfillment handoff callback (direct call pattern — Vector C binds here).

## 4) Detailed Design

### 4.1 Data model changes

**No new tables required.** All persistence targets exist:
- `loyalty_ledger` — comp issuance (via `rpc_redeem`)
- `player_loyalty` — balance update (via `rpc_redeem`)
- `promo_coupon` — entitlement issuance (via `rpc_issue_promo_coupon`)
- `loyalty_outbox` — side-effect events (via `rpc_issue_promo_coupon`)

**Metadata extension for `rpc_redeem`:** The existing `p_reference` param can carry structured metadata (reward catalog ID, family discriminator). No schema change needed — just a convention for the reference field:

```
reference format: "reward_catalog:{reward_id}:{reward_code}"
```

**Issuance record shape (frozen contract for Vector C):**

| Family | Primary record | Key fields for fulfillment |
|--------|---------------|---------------------------|
| `points_comp` | `loyalty_ledger` row | `player_id`, `points_delta`, `reason='redemption'`, `metadata.reward_id`, `metadata.reward_code`, `metadata.face_value_cents` |
| `entitlement` | `promo_coupon` row | `player_id`, `validation_number`, `face_value`, `status='issued'`, `metadata.tier`, `metadata.reward_id` |

**Fulfillment payload contract (frozen for Vector C):**

Vector C's print/fulfillment layer receives a typed payload from the issuance mutation's `onSuccess` callback. These schemas are the binding contract — Vector C must not need to re-query issuance state.

```typescript
/** Payload Vector C receives for points_comp fulfillment (comp slip print) */
interface CompFulfillmentPayload {
  family: 'points_comp';
  ledger_id: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  face_value_cents: number;
  points_redeemed: number;
  balance_after: number;
  // Context for print template
  player_name: string;
  player_id: string;
  casino_name: string;
  staff_name: string;
  issued_at: string;           // ISO 8601
}

/** Payload Vector C receives for entitlement fulfillment (coupon print) */
interface EntitlementFulfillmentPayload {
  family: 'entitlement';
  coupon_id: string;
  validation_number: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  face_value_cents: number;
  required_match_wager_cents: number | null;  // null for free play
  expires_at: string | null;                  // ISO 8601
  // Context for print template
  player_name: string;
  player_id: string;
  player_tier: string;
  casino_name: string;
  staff_name: string;
  issued_at: string;           // ISO 8601
}

type FulfillmentPayload = CompFulfillmentPayload | EntitlementFulfillmentPayload;
```

The `onSuccess` callback signature for Vector C binding:
```typescript
onFulfillmentReady: (payload: FulfillmentPayload) => void
```

Vector C owns what happens after this callback fires. Vector B owns assembling the payload from issuance result + UI context.

### 4.2 Service layer

**LoyaltyService additions:**
- `issueComp(params: IssueCompParams): Promise<CompIssuanceResult>` — wraps `rpc_redeem` with reward catalog context
  - Validates: reward exists, is active, is `points_comp` family, player has sufficient balance
  - Passes `p_reward_id` and structured `p_reference` to existing RPC

**PromoService additions:**
- `issueEntitlement(params: IssueEntitlementParams): Promise<EntitlementIssuanceResult>` — wraps `rpc_issue_promo_coupon` with catalog context
  - Resolves: active promo program for casino, generates validation number
  - For pilot: face value and match wager are read from the catalog/config record — **not** auto-derived from player tier. The `IssueEntitlementParams` interface accepts these as required fields so the dependency on frozen catalog data is explicit, not hidden behind a tier-lookup that doesn't exist yet.
  - Upgrade path: when Vector A resolves GAP-A5 and `rpc_issue_current_match_play` exists, this method swaps its resolution strategy internally. Callers and API contract unchanged.

**New DTOs:**
```typescript
// Published for UI consumption
interface RewardCatalogDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  reward_family: 'points_comp' | 'entitlement';
  face_value_cents: number;
  is_active: boolean;
  // points_comp specific
  points_cost: number | null;
  // entitlement specific
  tier_mappings: TierEntitlementDTO[] | null;
}

interface IssuanceResultDTO {
  success: boolean;
  family: 'points_comp' | 'entitlement';
  // points_comp fields
  ledger_id?: string;
  points_debited?: number;
  balance_after?: number;
  // entitlement fields
  coupon_id?: string;
  validation_number?: string;
  face_value?: number;
  // common
  reward_id: string;
  reward_code: string;
  issued_at: string;
}
```

### 4.3 API surface

**Wire stubbed routes (GAP-B4):**

| Route | Method | Action |
|-------|--------|--------|
| `GET /api/v1/loyalty/balances` | GET | Wire to `player_loyalty` query — return balance + tier for current casino |
| `POST /api/v1/loyalty/mid-session-reward` | POST | **Scope decision: return 501 Not Implemented** (see D6 below) |
| `GET /api/v1/players/[id]/loyalty` | GET | Wire to player loyalty summary query — return balance, tier, recent history |

> **D6 — Mid-session-reward stub disposition:** The investigation (GAP-B4) lists this as "wire to service method," but the mid-session module has a known divergence (GAP-B5: `MidSessionRewardReason` conflicts with canonical `LoyaltyReason`, flagged in ADR-033). Wiring a divergent module into a live route creates a false signal that mid-session issuance works. Replacing the silent null stub with an explicit 501 is the honest disposition: it unblocks no pilot workflow (mid-session auto-trigger is out of scope) and avoids inheriting the GAP-B5 conflict. This is a deliberate scope change from the investigation's "wire it" framing.

**New route:**

| Route | Method | Action |
|-------|--------|--------|
| `POST /api/v1/loyalty/issue` | POST | Unified issuance endpoint — routes to comp or entitlement path based on `reward_family` |

The unified endpoint accepts:
```json
{
  "player_id": "uuid",
  "reward_id": "uuid",
  "visit_id": "uuid | null",
  "idempotency_key": "uuid"
}
```

The backend resolves `reward_family` from the catalog and routes to the correct service method. The caller doesn't need to know which family — just the reward ID.

### 4.4 UI/UX flow

**Component tree:**

```
Player360Header
  └─ IssueRewardButton (enable=true, onClick → open drawer)
      └─ IssueRewardDrawer (new)
          ├─ RewardSelector
          │   ├─ RewardCatalogList (grouped by family, filtered by casino + active)
          │   └─ RewardCard (name, description, family badge, points cost or "tier-based")
          ├─ CompConfirmPanel (if points_comp selected)
          │   └─ Shows: reward name, face value, points cost, current balance, post-debit balance
          ├─ EntitlementConfirmPanel (if entitlement selected)
          │   └─ Shows: reward name, face value (from catalog config), match wager (from catalog config)
          └─ IssuanceResultPanel
              └─ Shows: success/failure, issued details, "Print" button (Vector C binding point)
```

**Key interactions:**
1. Click "Issue Reward" → drawer opens with reward list
2. Select reward → family-specific confirm panel appears
3. Confirm → mutation fires → loading state
4. Success → result panel with details + fulfillment trigger point
5. Failure → error message with actionable feedback

**TanStack Query integration:**
- `useRewardCatalog(casinoId, { active: true })` — fetches available rewards
- `useIssueReward()` — mutation that calls unified `/api/v1/loyalty/issue`
- Invalidates: `playerLoyalty`, `loyaltyLedger`, `rewardHistory` on success

**Delete `ManualRewardDialog`:** The stub collects wrong fields and is misleading. Replace entirely with the `IssueRewardDrawer`.

### 4.5 Security considerations

- **RLS**: All issuance RPCs already use `set_rls_context_from_staff()` (ADR-024) — no new RLS work needed
- **RBAC**: Issuance restricted to roles that can call existing loyalty RPCs (pit_boss, floor_supervisor)
- **Audit trail**: Both persistence paths already write actor_id + timestamp. The unified endpoint adds `reward_id` correlation.
- **Idempotency**: Both RPCs already support idempotency keys. The unified endpoint enforces one per request.
- **Balance validation**: `rpc_redeem` already enforces balance check with configurable overdraw. No new validation needed at RPC level — service layer adds pre-check for UX.

## 5) Cross-Cutting Concerns

### Performance implications
- Reward catalog query adds one SELECT per drawer open — indexed on `(casino_id, is_active)`, negligible cost
- Issuance mutation is single RPC call — same as existing accrual/redemption patterns
- No new real-time subscriptions needed

### Migration strategy
- No schema migrations required — all tables and RPCs exist
- Service layer additions are additive (new methods, not changes to existing)
- UI is new component tree — no breaking changes to existing Player 360

### Observability / monitoring
- Issuance events already flow through `loyalty_outbox` (entitlement) and `loyalty_ledger` (comp)
- Add structured logging in unified endpoint: `{ action: 'reward_issued', family, reward_id, player_id }`

### Rollback plan
- Feature flag on `IssueRewardButton.enabled` prop — set to `false` to disable
- No schema changes to roll back
- Service methods are additive — can be removed without affecting existing flows

## 6) Alternatives Considered

### Alternative A: Per-family trigger buttons (Option B from scaffold)

- **Description:** Separate "Issue Comp" and "Issue Match Play" buttons in Player 360 header, each opening a dedicated dialog
- **Tradeoffs:** Simpler per-component, but operator must understand family distinction. Two entry points to maintain. Doesn't scale.
- **Why not chosen:** Violates pilot principle — operator thinks "give this player a reward", not "select the correct accounting family." Unified drawer abstracts the domain complexity.

### Alternative B: Fix ManualRewardDialog stub (Option C from scaffold)

- **Description:** Rewire existing dialog to call backend with correct fields
- **Tradeoffs:** Smallest diff, but the dialog collects wrong fields (bonus points + reason instead of reward selection from catalog)
- **Why not chosen:** The stub is fundamentally wrong — it's a "manual point adjustment" dialog, not a "catalog reward issuance" dialog. Fixing it would be more work than replacing it.

### Alternative C: Build `rpc_issue_current_match_play` first

- **Description:** Create the one-click auto-derivation RPC before building UI
- **Tradeoffs:** Would give entitlements a cleaner path, but blocks on Vector A tier mapping decision (GAP-A5)
- **Why not chosen:** Blocks entire feature on Vector A. Instead, build UI with explicit-param path first; swap to one-click RPC when available.

## 7) Decisions Required

1. **Decision D1:** Unified drawer vs per-family triggers
   **Options:** Unified drawer (A) | Per-family buttons (B) | Fix stub (C)
   **Recommendation:** Unified drawer (A) — operator cognitive load is the primary driver

2. **Decision D2:** Entitlement idempotency scope
   **Options:** Gaming-day | Visit | None
   **Recommendation:** Gaming-day — matches floor reality, simpler than visit-scoping

3. **Decision D3:** Comp issuance RPC approach
   **Options:** Extend `rpc_redeem` with metadata | New `rpc_issue_comp`
   **Recommendation:** Extend `rpc_redeem` — it already has `p_reward_id` and `p_reference` params. Metadata convention suffices for pilot.

4. **Decision D4:** Issuance-to-fulfillment handoff mechanism
   **Options:** Direct callback in `onSuccess` | Event via `loyalty_outbox` | Separate mutation
   **Recommendation:** Direct callback in mutation hook `onSuccess` — simplest for pilot, fulfillment is synchronous user action (print)

5. **Decision D5:** Entitlement replacement behavior
   **Options:** Honor issued (Behavior 1) | Auto-replace on policy change (Behavior 2)
   **Recommendation:** Honor issued — what was issued stays valid. Replacement is an explicit operator action via existing `rpc_replace_promo_coupon`.

6. **Decision D6:** Mid-session-reward stub disposition (scope change from investigation)
   **Options:** Wire to divergent mid-session module | Return 501 Not Implemented | Delete route
   **Recommendation:** Return 501 — the mid-session module has a known GAP-B5 divergence (conflicting `MidSessionRewardReason`), mid-session auto-trigger is out of scope for this vector, and wiring a broken module creates false confidence. Explicit 501 is the honest stub.

## 8) Open Questions

- **Q1:** Should the unified endpoint validate reward eligibility (tier, visit kind, etc.) or leave that to the RPC layer? Recommendation: service layer validates for UX feedback; RPC is the hard enforcement.
- **Q2:** Should the `ManualRewardDialog` be kept for internal adjustments (`internal_adjustment` family), or should that be an admin-only surface? Recommendation: defer to admin route (PRD-040/042 scope).
- **Q3:** When Vector A resolves GAP-A5, how does the entitlement path upgrade from explicit-param to auto-derivation? Answer: swap `issueEntitlement` implementation to call new RPC; UI stays the same.

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-operator-issuance/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-LOYALTY-OPERATOR-ISSUANCE.md`
- ADR(s): (Phase 4)
- PRD: (Phase 5)
- Exec Spec: (post-pipeline)

## References

- Investigation: `docs/00-vision/loyalty-service-extension/vectors/vector-B/VECTOR-B-OPERATOR-ISSUANCE-INVESTIGATION.md`
- REWARD_FULFILLMENT_POLICY.md: `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
- LOYALTY_PILOT_SLICE_BOUNDARY.md: `docs/00-vision/loyalty-service-extension/LOYALTY_PILOT_SLICE_BOUNDARY.md`
- `rpc_redeem` latest: `supabase/migrations/20260307114447_adr040_loyalty_identity_derivation.sql:24`
- `rpc_issue_promo_coupon`: `supabase/migrations/20260106235611_loyalty_promo_instruments.sql:244`
- SRM v4.19.0: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §LoyaltyService
