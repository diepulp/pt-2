---
id: PRD-052
title: Loyalty Operator Issuance — Pilot Reward Issue Workflow
owner: Engineering
status: Draft
affects: [ARCH-SRM, ADR-024, ADR-033, ADR-041]
created: 2026-03-18
last_review: 2026-03-19
phase: Phase B (Operator Issuance Minimum)
pattern: A
http_boundary: true
---

# PRD-052 — Loyalty Operator Issuance: Pilot Reward Issue Workflow

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Enables pit bosses to issue pilot rewards (comps and entitlements) to players from the Player 360 context through a unified issue drawer. Covers both `points_comp` (ledger debit) and `entitlement` (coupon creation) families, wires stubbed API routes, and freezes the issuance-to-fulfillment contract surface that Vector C requires to build print templates. This is Phase B of the Loyalty Pilot Slice Boundary — it depends on Vector A catalog configuration existing, and Vector C print fulfillment depends on it.

---

## 2. Problem & Goals

### 2.1 Problem

The loyalty backend has substantial infrastructure — 14 RPCs, 8 LoyaltyService methods, 11 PromoService methods, a reward catalog schema — but no operator can use any of it for issuance. The `IssueRewardButton` in Player 360 shows "Coming soon." The `ManualRewardDialog` collects wrong fields (bonus points + reason) and doesn't call any backend. Three API routes return null stubs. The result: loyalty infrastructure exists but produces zero operator value.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Pit boss can issue a `points_comp` reward from Player 360 | Comp issuance produces `loyalty_ledger` debit + balance update, operator sees confirmation |
| **G2**: Pit boss can issue an `entitlement` reward from Player 360 | Entitlement issuance produces `promo_coupon` record, operator sees confirmation with validation number |
| **G3**: Invalid issuance states are prevented | Insufficient balance, inactive reward produce clear error messages before commit. Duplicate entitlement (gaming-day idempotency) returns the existing coupon with `is_existing: true` as a successful response, not an error. |
| **G4**: Reward history shows both families | `RewardsHistoryList` displays comp and entitlement issuance in unified view |
| **G5**: Fulfillment contract surface is frozen for Vector C | `FulfillmentPayload` types are published; Vector C can bind without re-querying issuance state |

### 2.3 Non-Goals

- Admin catalog CRUD — Vector A owns this; we consume the catalog, not manage it
- Print templates or rendering — Vector C; we freeze the contract, they build the print
- `rpc_issue_current_match_play` one-click RPC — blocked on Vector A GAP-A5 tier mapping
- Full tier auto-derivation for entitlements — see Entitlement Scope Constraint below
- Mid-session auto-trigger — GAP-B5 module is divergent (ADR-033 flagged); deferred
- Multi-property issuance — Phase 2 Dual Boundary scope
- ManualRewardDialog preservation — delete the broken stub; internal adjustments belong in admin route (PRD-040/042)

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (operational issuance); Admin (configuration + override)
- **Authorized issuer roles (canonical):** `pit_boss`, `admin` — enforced at RPC level via `app.staff_role` check. Floor Supervisor maps to `pit_boss` role in the system. Cashier is excluded from issuance (SEC-002: "No promo access"; comp issuance is also restricted to supervisory roles). No other roles may issue rewards.

**Top Jobs:**

- As a **Pit Boss**, I need to issue a comp (meal, beverage, misc) to a player so that they receive a loyalty reward backed by their earned points.
- As a **Pit Boss**, I need to issue a match play or free play entitlement to a player so that they receive a coupon instrument for the floor.
- As a **Pit Boss**, I need to see what rewards are available for a player before issuing so that I make an informed choice.
- As a **Pit Boss**, I need clear confirmation or failure feedback after issuance so that I know the reward was persisted correctly.
- As a **Support Agent**, I need to view reward history across both families so that I can inspect what was issued to a player.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Issuance UI:**
- Unified Issue Reward drawer in Player 360 (RFC D1: unified drawer)
- Reward catalog list filtered by casino, active status, reward family
- Family-aware confirm panels (comp: points cost + balance; entitlement: face value from catalog config)
- Issuance result panel with success/failure feedback
- Delete `ManualRewardDialog` stub

**Backend wiring:**
- `POST /api/v1/loyalty/issue` — unified issuance endpoint; resolves `reward_family` server-side from `reward_id` and routes internally to the correct issuance path
- `LoyaltyService.issueComp()` — wraps `rpc_redeem` with catalog context
- `PromoService.issueEntitlement()` — wraps `rpc_issue_promo_coupon` with catalog config params
- Wire `GET /api/v1/loyalty/balances` to `player_loyalty` query
- Wire `GET /api/v1/players/[id]/loyalty` to player loyalty summary
- Replace `POST /api/v1/loyalty/mid-session-reward` null stub with explicit 501 (RFC D6)

**History / support:**
- Extend `RewardsHistoryList` to show `points_comp` entries from `loyalty_ledger`
- Unified filter: all, matchplay, freeplay, comp
- Both families normalize into existing `RewardHistoryItemDTO` shape (id, issuedAt, rewardType, amount, issuedBy, visitId) — comp entries map `rewardType='comp'`, amount = face value cents
- Sort order: `issued_at DESC` across both sources (application-layer merge, not SQL UNION for pilot)

**Contract surface (frozen for Vector C):**
- `CompFulfillmentPayload` and `EntitlementFulfillmentPayload` type definitions published
- `onFulfillmentReady` callback signature documented
- Issuance record shape frozen per RFC §4.1

### 4.2 Out of Scope

- Admin reward catalog management (Vector A)
- Print/fulfillment rendering (Vector C)
- One-click tier auto-derivation RPC (Vector A GAP-A5 dependency)
- Mid-session reward wiring (GAP-B5 divergence — explicit 501 is the honest disposition)
- Coupon void/replace UI (existing RPCs work; UI deferred)
- Rate limiting, dollar-amount limits per role (acceptable for single-casino pilot)

---

## 5. Requirements

### 5.1 Functional Requirements

- FR-1: Pit boss can open an issuance drawer from Player 360 header
- FR-2: Drawer displays available rewards from `reward_catalog` filtered by `casino_id`, `is_active = true`
- FR-3: Selecting a `points_comp` reward shows confirm panel with: reward name, face value, points cost, current balance, post-debit balance
- FR-4: Selecting an `entitlement` reward shows confirm panel with: reward name, face value (from catalog config), match wager (from catalog config if applicable)
- FR-5: Confirming comp issuance calls `rpc_redeem` with `p_reward_id` and structured `p_reference`
- FR-5A: The unified issuance endpoint accepts only caller identity-neutral selection inputs (`player_id`, `reward_id`, optional `visit_id`, `idempotency_key`). Reward family and commercial issuance values are resolved or verified server-side from the authoritative catalog record. The public API contract must not accept caller-supplied family or commercial fields.
- FR-6: Confirming entitlement issuance calls `rpc_issue_promo_coupon` with explicit params from catalog record
- FR-6A: Entitlement issuance must validate issue-time commercial parameters (face value, match wager) against the selected active catalog record and reward-family rules on the authoritative backend path; the client may not author final reward economics
- FR-7: Insufficient balance for comp issuance shows clear error before commit
- FR-8: Duplicate entitlement coupon (gaming-day idempotency, RFC D2) returns existing coupon with `is_existing` flag
- FR-9: Issuance success fires `onFulfillmentReady(payload)` callback with typed `FulfillmentPayload`
- FR-10: `RewardsHistoryList` displays both families with filter chips
- FR-11: `GET /api/v1/loyalty/balances` returns player balance + tier for current casino
- FR-12: `GET /api/v1/players/[id]/loyalty` returns player loyalty summary
- FR-13: `POST /api/v1/loyalty/mid-session-reward` returns 501 Not Implemented

### 5.2 Non-Functional Requirements

- NFR-1: Issuance should complete within pilot-acceptable operator latency; exact performance target to be confirmed during implementation measurement
- NFR-2: All issuance paths must use `set_rls_context_from_staff()` — no spoofable casino or actor params (ADR-024)
- NFR-3: Issuance paths must enforce idempotency such that retries do not create duplicate financial impact
- NFR-4: Comp issuance must prevent concurrent balance race conditions through authoritative transactional locking in the backend
- NFR-5: Entitlement validation numbers must be generated by the authoritative issuance path using a non-predictable mechanism (e.g., UUID v4) and returned as part of the persisted issuance result
- NFR-6: Entitlement commercial parameters (face value, match wager) must be validated server-side against the selected active catalog/config record and reward-family rules; the client may not author final reward economics
- NFR-7: No new RLS model is required for pilot scope; issuance must remain within ADR-024 authoritative-context derivation

### 5.3 Enforcement Boundary: Service Layer vs RPC

The service layer (application code) and the RPC layer (database) have distinct enforcement responsibilities:

- **Service layer validates for UX feedback:** reward exists, is active, player has sufficient balance (pre-check), catalog config has required fields. Failures at this layer produce user-friendly error messages before the RPC is called.
- **RPC layer is the hard enforcement boundary:** idempotency (UNIQUE constraint), balance locking (`FOR UPDATE`), role gate (`app.staff_role`), casino scoping (`app.casino_id`), atomicity. The RPC rejects even if the service layer is bypassed.
- **No enforcement may exist only in the service layer.** If a constraint matters for correctness, it must be enforced at the RPC level. Service-layer checks are UX conveniences, not security boundaries.

> Architecture details: See SRM §LoyaltyService, RFC-LOYALTY-OPERATOR-ISSUANCE

---

## 6. UX / Flow Overview

### 6.1 Surface Classification (ADR-041)

**Rendering Delivery:** Client Shell
- The issuance drawer is a client-side interactive component within the existing Player 360 shell. No server-side rendering required — the drawer is triggered by user action and needs mutation state management.

**Data Aggregation:** Client-side Fetch (TanStack Query)
- Reward catalog: `useRewardCatalog(casinoId)` — single query on drawer open
- Player loyalty: `usePlayerLoyalty(playerId)` — already fetched by Player 360
- Issuance: `useIssueReward()` — mutation via unified endpoint

**Rejected Patterns:**
- RSC Prefetch + Hydration — rejected: issuance is interactive mutation-heavy, not read-heavy page load. Server rendering adds insufficient value for a click-triggered drawer that requires client-side mutation state management.
- BFF RPC Aggregation — rejected: issuance touches two distinct RPCs by family. A BFF aggregator would add a coordination layer with no user-facing benefit over direct client → API → RPC.

**Metric Provenance:** No new truth-bearing metrics surfaced by this feature. Player balance displayed in confirm panel is read from `player_loyalty` (source of truth: LoyaltyService, freshness: current on-demand query). This is an existing metric already surfaced by Player 360, not a new surface-introduced metric.

### 6.2 Comp Issuance Flow (points_comp)

1. Pit boss opens Player 360 for a player
2. Clicks "Issue Reward" button in header → drawer opens
3. Sees available rewards grouped by family; selects a comp (e.g., "Meal Comp $25 — 250 pts")
4. Confirm panel shows: reward name, face value, points cost, current balance (1,500), post-debit balance (1,250)
5. Clicks "Confirm" → mutation fires → loading state
6. Success → result panel: "Meal Comp issued. 250 pts debited. Balance: 1,250 pts." + fulfillment callback fires
7. Failure (insufficient balance) → error: "Insufficient balance. Need 250 pts, have 100 pts."

### 6.3 Entitlement Issuance Flow (entitlement)

1. Pit boss opens Player 360, clicks "Issue Reward"
2. Selects entitlement (e.g., "Match Play $25")
3. Confirm panel shows: reward name, face value ($25), match wager ($25) — values from catalog config, **not** auto-derived from tier
4. If coupon already outstanding for gaming day → mutation returns existing coupon with `is_existing: true`; UI shows "Already issued today" with existing coupon details and fulfillment callback
5. If no existing coupon → clicks "Confirm" → mutation fires → new coupon created
6. Success → result panel: "Match Play coupon issued. Validation: MP-xxxx-xxxx." + fulfillment callback fires

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Status | Impact |
|------------|------|--------|--------|
| Vector A: `reward_catalog` populated with active rewards | Required | Backend schema exists; admin UI pending | No rewards visible in drawer without catalog data |
| Vector A: tier-to-entitlement mapping (GAP-A5) | Blocks one-click auto-derivation | Pending | Entitlement uses explicit catalog config params for now |
| LoyaltyService + PromoService | Required | Existing methods cover pilot path | New service methods added (`issueComp`, `issueEntitlement`); existing methods unchanged |
| Existing loyalty/promo RPCs | Required | Operational | No new RPCs or schema changes required for pilot path; implementation must verify existing idempotency and locking guarantees hold under issuance usage patterns |
| Player 360 component tree | Required | Exists | Issuance button + drawer attach here |

### 7.2 Risks & Open Questions

- **R1: Vector A catalog may not be populated when Vector B ships** — Mitigation: issuance drawer shows empty state gracefully; feature is inert but not broken without catalog data
- **R2: Entitlement params from catalog config may not match what one-click RPC eventually expects** — Mitigation: `IssueEntitlementParams` interface is the abstraction boundary; swap resolution strategy inside `issueEntitlement()` without API/UI change
- **R3: `RewardsHistoryList` application-layer merge of ledger + coupon queries may have performance implications at scale** — Mitigation: pilot volume is low; two separate queries merged client-side. Revisit with SQL-level optimization if history page latency becomes measurable.

### 7.3 Entitlement Scope Constraint

> **Vector B does not implement entitlement derivation logic.** It only issues entitlements whose required issue-time commercial values (face value, match wager) are already resolvable from frozen active catalog/config inputs. There is no tier-to-entitlement lookup, no policy evaluation, and no auto-derivation of commercial parameters from player state. Full one-click tier auto-derivation remains deferred pending Vector A GAP-A5 resolution.

The UI and service layer are designed so that swapping to auto-derivation later requires only an implementation change inside `issueEntitlement()` — not a UX, API contract, or fulfillment payload change. But that upgrade is **not part of this PRD**.

### 7.4 Scope Change: Mid-Session-Reward (D6)

The investigation (GAP-B4) listed `POST /loyalty/mid-session-reward` as "wire to service method." This PRD changes that disposition to **501 Not Implemented** because:
- The mid-session module has a known divergence (GAP-B5: `MidSessionRewardReason` conflicts with canonical `LoyaltyReason`, flagged ADR-033)
- Mid-session auto-trigger is out of scope for this vector
- Wiring a divergent module into a live route creates false confidence that mid-session issuance works

This is a deliberate scope change from the investigation's framing, not an oversight.

---

## 8. Fulfillment Contract Surface (Frozen for Vector C)

This section is the binding contract between Vector B (issuance) and Vector C (fulfillment/print). Vector C must be able to build print templates from these payloads without re-querying issuance state.

### 8.1 Fulfillment Payload Types

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

### 8.2 Handoff Mechanism

- **Pattern:** Direct callback in mutation hook's `onSuccess` (RFC D4)
- **Signature:** `onFulfillmentReady: (payload: FulfillmentPayload & { is_existing: boolean }) => void`
- **Ownership:** Vector B assembles the payload from issuance result + UI context. Vector C owns what happens after the callback fires.
- **Upgrade path:** If fulfillment later needs async handling (e.g., print queue), the callback can be replaced with an event dispatch without changing the payload schema.

### 8.3 Issuance Record Shape

| Family | Primary record | Key fields |
|--------|---------------|------------|
| `points_comp` | `loyalty_ledger` row | `player_id`, `points_delta`, `reason='redeem'`, `metadata.reward_id`, `metadata.reward_code`, `metadata.face_value_cents` |
| `entitlement` | `promo_coupon` row | `player_id`, `validation_number`, `face_value`, `status='issued'`, `metadata.tier`, `metadata.reward_id` |

### 8.4 Replay / Duplicate Semantics

Duplicate issuance (idempotency hit) is a **successful response**, not an error. The public issuance contract treats replay as success-with-existing-payload.

When entitlement issuance resolves to an existing gaming-day coupon (idempotency hit), the issuance result must:

1. Return HTTP 200 with `is_existing: true` in the response
2. Still return a **fulfillment-complete payload** with all fields populated — Vector C may use this for operator confirmation or reprint without re-querying issuance state
3. The UI must distinguish between new issuance and replay (e.g., "Already issued today — showing existing coupon") but the fulfillment payload shape is identical in both cases

For `points_comp`, idempotency hit returns the existing ledger record with `is_existing: true`. The balance is not debited again. The fulfillment payload is still complete and suitable for reprint.

**Contract invariant:** Every successful call to the issuance endpoint — whether new or replay — returns a fulfillment-complete payload. Vector C never needs a follow-up query.

---

## 9. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Pit boss can issue a `points_comp` reward from Player 360 unified drawer
- [ ] Pit boss can issue an `entitlement` reward from Player 360 unified drawer
- [ ] Insufficient balance shows clear error before commit
- [ ] Duplicate entitlement returns existing coupon with feedback
- [ ] Inactive / deactivated rewards are excluded from catalog list
- [ ] `RewardsHistoryList` shows both families with filter chips
- [ ] `GET /loyalty/balances` returns real data
- [ ] `GET /players/[id]/loyalty` returns real data
- [ ] `POST /loyalty/mid-session-reward` returns 501

**Data & Integrity**
- [ ] Comp issuance produces `loyalty_ledger` debit + `player_loyalty` balance update atomically
- [ ] Entitlement issuance produces `promo_coupon` + `loyalty_outbox` entry atomically
- [ ] Idempotency keys prevent duplicate financial impact on retry
- [ ] No orphaned records on partial failure

**Security & Access**
- [ ] All issuance paths use `set_rls_context_from_staff()` (ADR-024)
- [ ] Casino scoping enforced — no cross-casino issuance possible
- [ ] Role gate enforced — only pit_boss/admin can issue (cashier excluded)

**Testing**
- [ ] Integration test for comp issuance happy path (via `rpc_redeem`)
- [ ] Integration test for entitlement issuance happy path (via `rpc_issue_promo_coupon`)
- [ ] Integration test for insufficient balance rejection
- [ ] Integration test for idempotency (duplicate key returns existing with `is_existing: true` and fulfillment-complete payload)
- [ ] Integration test verifying server-side commercial parameter validation (NFR-6: tampered face value rejected)
- [ ] Integration test verifying concurrent comp issuance does not double-debit (NFR-4)
- [ ] Unit test for `IssueRewardDrawer` component rendering

**Operational Readiness**
- [ ] Structured logging on unified issuance endpoint: `{ action, family, reward_id, player_id }`
- [ ] Rollback documented: disabling `IssueRewardButton.enabled` removes the operator entry point only. Already-persisted issuance records are not reversed; existing void/replace/manual correction paths (`rpc_void_promo_coupon`, `rpc_replace_promo_coupon`, manual ledger adjustment) remain authoritative for post-issuance remediation.

**Contract Surface**
- [ ] `FulfillmentPayload` types exported from `services/loyalty/dtos.ts`
- [ ] `onFulfillmentReady` callback wired in drawer (no-op until Vector C binds)
- [ ] `ManualRewardDialog` deleted

---

## 10. Related Documents

- **Investigation:** `docs/00-vision/loyalty-service-extension/vectors/vector-B/VECTOR-B-OPERATOR-ISSUANCE-INVESTIGATION.md`
- **RFC:** `docs/02-design/RFC-LOYALTY-OPERATOR-ISSUANCE.md`
- **Feature Boundary:** `docs/20-architecture/specs/loyalty-operator-issuance/FEATURE_BOUNDARY.md`
- **SEC Note:** `docs/20-architecture/specs/loyalty-operator-issuance/SEC_NOTE.md`
- **Scaffold:** `docs/01-scaffolds/SCAFFOLD-LOYALTY-OPERATOR-ISSUANCE.md`
- **Pilot Boundary:** `docs/00-vision/loyalty-service-extension/LOYALTY_PILOT_SLICE_BOUNDARY.md`
- **Fulfillment Policy:** `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
- **SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §LoyaltyService
- **ADR-024:** `docs/80-adrs/ADR-024_DECISIONS.md` (authoritative context derivation)
- **ADR-033:** `docs/80-adrs/ADR-033-LOYALTY-REWARD-DOMAIN-MODEL-SCAFFOLDING-MVP.md` (reward catalog schema)
- **ADR-041:** `docs/80-adrs/ADR-041-surface-governance-standard.md` (surface classification requirement)

---

## Appendix A: Frozen Decision Ledger (from RFC)

These decisions are frozen in the RFC and carried forward here. They do not require standalone ADRs — they are feature-slice scope. An ADR is warranted only if a decision hardens into a reusable platform rule.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | UI surface pattern | Unified drawer | Operator thinks "reward", not "accounting family" |
| D2 | Entitlement idempotency | Gaming-day scope | Matches floor reality, simpler than visit-scoping |
| D3 | Comp RPC approach | Extend `rpc_redeem` via `p_reward_id` + `p_reference` | Already has the params; metadata convention suffices |
| D4 | Fulfillment handoff | Direct `onSuccess` callback | Simplest for pilot; print is synchronous user action |
| D5 | Entitlement replacement | Honor issued (Behavior 1) | Explicit replace via existing `rpc_replace_promo_coupon` |
| D6 | Mid-session stub | 501 Not Implemented | GAP-B5 divergence makes wiring dishonest; auto-trigger out of scope |

---

## Appendix B: Implementation Plan

### WS1: Service Layer + API Wiring (P0)

- [ ] Implement `LoyaltyService.issueComp()` wrapping `rpc_redeem`
- [ ] Implement `PromoService.issueEntitlement()` wrapping `rpc_issue_promo_coupon`
- [ ] Create `POST /api/v1/loyalty/issue` unified endpoint
- [ ] Wire `GET /api/v1/loyalty/balances`
- [ ] Wire `GET /api/v1/players/[id]/loyalty`
- [ ] Replace `POST /api/v1/loyalty/mid-session-reward` with 501
- [ ] Export `FulfillmentPayload` types from `services/loyalty/dtos.ts`
- [ ] Integration tests for both issuance paths + error cases

### WS2: Issuance UI (P0)

- [ ] Build `IssueRewardDrawer` component with reward selector
- [ ] Build `CompConfirmPanel` with balance display
- [ ] Build `EntitlementConfirmPanel` with catalog config values
- [ ] Build `IssuanceResultPanel` with fulfillment callback binding
- [ ] Enable `IssueRewardButton` and wire to drawer
- [ ] Implement `useIssueReward()` mutation hook
- [ ] Delete `ManualRewardDialog`

### WS3: History Extension (P1)

- [ ] Extend `RewardsHistoryList` to include `points_comp` entries from `loyalty_ledger`
- [ ] Add "comp" filter chip alongside existing matchplay/freeplay
- [ ] Unit test for unified history rendering

### WS4: Contract Freeze Verification (P1)

- [ ] Verify `CompFulfillmentPayload` contains all fields LOYALTY_PILOT_SLICE_BOUNDARY §Print Standard requires
- [ ] Verify `EntitlementFulfillmentPayload` contains all fields required
- [ ] Wire no-op `onFulfillmentReady` callback in drawer (Vector C binding point)

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**Loyalty Domain**
- `LOYALTY_INSUFFICIENT_BALANCE` (400) — comp issuance with insufficient points
- `LOYALTY_REWARD_INACTIVE` (400) — reward deactivated or outside date range
- `LOYALTY_REWARD_NOT_FOUND` (404) — reward_id does not exist or not visible to caller's casino
- `LOYALTY_REWARD_FAMILY_MISMATCH` (400) — reward family does not match expected issuance path (defensive; should not occur via unified endpoint)
- `LOYALTY_CATALOG_CONFIG_INVALID` (400) — entitlement catalog record missing required commercial parameters (face_value, promo_program_id)
- `LOYALTY_IDEMPOTENCY_HIT` (200) — idempotency key already used; returns existing record with `is_existing: true` and fulfillment-complete payload. This is a **successful response**, not an error — the contract guarantees a usable payload on every non-error call.
- `LOYALTY_UNAUTHORIZED` (403) — role not authorized for issuance
- `LOYALTY_FULFILLMENT_ASSEMBLY_FAILED` (500) — issuance persisted but fulfillment payload could not be assembled; record exists, operator should not retry issuance but may need manual fulfillment
- `LOYALTY_NOT_IMPLEMENTED` (501) — mid-session-reward stub

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-19 | agent/feature-pipeline | Initial draft from feature pipeline Phase 5 |
| 0.2.0 | 2026-03-19 | agent/feature-pipeline | Audit delta remediation: P0-1 through P0-5 (NFR rewrite, server-side validation, validation number spec, replay semantics, entitlement scope hardening), P1-1 through P1-8 (role freeze, dependency wording, latency SLO, caller contract, history DTO, rollback, error codes, enforcement boundary), P2-1 through P2-6 (tone, wording, version history). Deliberate scope change from investigation noted: mid-session-reward → 501 (D6). |
