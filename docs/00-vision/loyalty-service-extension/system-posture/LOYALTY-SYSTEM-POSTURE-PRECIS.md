# Loyalty System Posture Precis

**Date:** 2026-03-19
**Revision:** 2 (post-Vector B / PRD-052)
**Scope:** Full-stack inventory of what exists, what's planned, what's blocked
**Method:** 4-agent parallel investigation (service layer, API routes, UI components, database/migrations)

---

## Executive Summary

The PT-2 loyalty system has **deep plumbing and operational issuance surfaces**. Database, RPCs, service layer, hooks, and **operator issuance workflows** are 95-100% complete. Vector B (PRD-052, merged 2026-03-19) delivered the unified issuance drawer, catalog-backed comp/entitlement service methods, role-gated unified API endpoint, and comprehensive test coverage. The remaining gaps are **admin configuration UI** (program CRUD, tier editor, earn config), **one-click tier-aware auto-derivation**, and **print infrastructure**.

---

## System Posture Diagram

```mermaid
graph TB
    subgraph "UI Layer"
        direction TB
        LP["LoyaltyPanel<br/><small>tier + points display</small>"]
        PEP["PromoExposurePanel<br/><small>shift dashboard metrics</small>"]
        REC["RewardsEligibilityCard<br/><small>Player 360 eligibility</small>"]
        RHL["RewardsHistoryList<br/><small>ledger + coupon history<br/>comp/matchplay/freeplay filters</small>"]
        LLW["LoyaltyLiabilityWidget<br/><small>shift liability snapshot</small>"]

        subgraph "Issuance Workflow (NEW — PRD-052)"
            IRB["IssueRewardButton<br/><small>enabled — opens drawer</small>"]:::done
            IRD["IssueRewardDrawer<br/><small>3-step: select→confirm→result</small>"]:::done
            RS_UI["RewardSelector<br/><small>catalog grouped by family</small>"]:::done
            CCP["CompConfirmPanel<br/><small>balance preview</small>"]:::done
            ECP["EntitlementConfirmPanel<br/><small>catalog-derived values</small>"]:::done
            IRP["IssuanceResultPanel<br/><small>success/failure/duplicate<br/>fulfillment callback</small>"]:::done
        end

        subgraph "Exclusion UI (NEW — PRD-052)"
            ESB["ExclusionStatusBadge<br/><small>header severity indicator</small>"]:::done
            ET["ExclusionTile<br/><small>create/lift role-gated</small>"]:::done
        end

        STUB_ADMIN["<b>STUB</b>: Loyalty Admin Page<br/><small>Phase 3 placeholder</small>"]:::stub
        STUB_PRINT["<b>GAP</b>: Print Match Play Button<br/><small>0% — no print infra</small>"]:::gap
        STUB_CATALOG_UI["<b>GAP</b>: Promo Program Manager<br/><small>0% — no CRUD surface</small>"]:::gap
    end

    subgraph "API Routes"
        direction TB
        R_ACCRUE["POST /loyalty/accrue"]:::done
        R_REDEEM["POST /loyalty/redeem"]:::done
        R_CREDIT["POST /loyalty/manual-credit"]:::done
        R_PROMO["POST /loyalty/promotion"]:::done
        R_LEDGER["GET /loyalty/ledger"]:::done
        R_SUGGEST["GET /loyalty/suggestion"]:::done
        R_BAL["GET /loyalty/balances"]:::done
        R_ISSUE["POST /loyalty/issue<br/><small>unified issuance — NEW</small>"]:::done
        R_MSR["POST /loyalty/mid-session-reward<br/><small>501 Not Implemented</small>"]:::stub
        R_PLOY["GET /players/:id/loyalty"]:::done
    end

    subgraph "Hooks Layer"
        direction TB
        HQ["Query Hooks<br/><small>usePlayerLoyalty, useLoyaltyLedger,<br/>useLoyaltySuggestion, useLedgerInfinite</small>"]:::done
        HM["Mutation Hooks<br/><small>useAccrueOnClose, useRedeem,<br/>useManualCredit, useApplyPromotion</small>"]:::done
        HP["Promo Hooks<br/><small>useIssueCoupon, useVoidCoupon,<br/>useReplaceCoupon, usePromoPrograms</small>"]:::done
        HR["Reward Hooks<br/><small>useRewards, useRewardDetail,<br/>useEligibleRewards, useEarnConfig</small>"]:::done
        HI["Issuance Hook<br/><small>useIssueReward — NEW<br/>useTransition + UUID idempotency</small>"]:::done
    end

    subgraph "Service Layer"
        direction TB
        LS["LoyaltyService<br/><small>9 methods — 100% impl<br/>+issueComp (NEW)</small>"]:::done
        RS_SVC["RewardService<br/><small>8 methods — 100% impl</small>"]:::done
        PS["PromoService<br/><small>12 methods — 100% impl<br/>+issueEntitlement (NEW)</small>"]:::done
        P360["Player360DashboardService<br/><small>read-only aggregation — NEW</small>"]:::done
        MSR["mid-session-reward.ts<br/><small>validator only — DIVERGENT</small>"]:::warn
    end

    subgraph "RPC Layer (19 RPCs)"
        direction TB
        subgraph "Points Ledger (9)"
            RPC_ACC["rpc_accrue_on_close"]:::done
            RPC_RED["rpc_redeem<br/><small>role gate: pb/cashier/admin</small>"]:::done
            RPC_MC["rpc_manual_credit"]:::done
            RPC_AP["rpc_apply_promotion"]:::done
            RPC_REC["rpc_reconcile_loyalty_balance"]:::done
            RPC_GPL["rpc_get_player_ledger"]:::done
            RPC_ESR["evaluate_session_reward_suggestion"]:::done
            RPC_MSR["rpc_issue_mid_session_reward"]:::warn
            RPC_VLS["rpc_get_visit_loyalty_summary"]:::done
        end
        subgraph "Promo Coupons (5)"
            RPC_IC["rpc_issue_promo_coupon<br/><small>role gate: pb/admin ONLY</small>"]:::done
            RPC_VC["rpc_void_promo_coupon"]:::done
            RPC_RC["rpc_replace_promo_coupon"]:::done
            RPC_INV["rpc_promo_coupon_inventory"]:::done
            RPC_EXP["rpc_promo_exposure_rollup"]:::done
        end
        subgraph "Measurement (1)"
            RPC_SLL["rpc_snapshot_loyalty_liability"]:::done
        end
        subgraph "Missing RPCs"
            RPC_ICMP["<b>GAP</b>: rpc_issue_current_match_play<br/><small>one-click tier-aware issuance</small>"]:::gap
        end
    end

    subgraph "Database Layer (17 objects)"
        direction TB
        subgraph "Core Tables"
            T_LL["loyalty_ledger<br/><small>append-only txn log</small>"]:::done
            T_PL["player_loyalty<br/><small>balance + tier cache</small>"]:::done
            T_LO["loyalty_outbox<br/><small>event side-effects</small>"]:::done
        end
        subgraph "Promo Tables"
            T_PP["promo_program<br/><small>campaign templates</small>"]:::done
            T_PC["promo_coupon<br/><small>issued instances</small>"]:::done
        end
        subgraph "ADR-033 Reward Catalog"
            T_RC["reward_catalog"]:::done
            T_RPP["reward_price_points"]:::done
            T_RET["reward_entitlement_tier"]:::done
            T_RL["reward_limits"]:::done
            T_RE["reward_eligibility"]:::done
            T_LEC["loyalty_earn_config"]:::done
        end
        subgraph "ADR-039 Measurement"
            T_LVP["loyalty_valuation_policy"]:::done
            T_LLS["loyalty_liability_snapshot"]:::done
        end
        subgraph "Views"
            MV["mv_loyalty_balance_reconciliation<br/><small>drift detection — STALE</small>"]:::warn
        end
    end

    %% UI → Hooks
    LP --> HQ
    PEP --> HP
    REC --> HR
    RHL --> HQ
    LLW --> HQ
    IRD --> HI
    IRD --> HR

    %% Hooks → Routes
    HQ --> R_LEDGER
    HQ --> R_SUGGEST
    HM --> R_ACCRUE
    HM --> R_REDEEM
    HM --> R_CREDIT
    HM --> R_PROMO
    HI --> R_ISSUE

    %% Routes → Services
    R_ACCRUE --> LS
    R_REDEEM --> LS
    R_CREDIT --> LS
    R_LEDGER --> LS
    R_SUGGEST --> LS
    R_PROMO --> LS
    R_BAL --> LS
    R_PLOY --> LS
    R_ISSUE --> LS
    R_ISSUE --> PS

    %% Services → RPCs
    LS --> RPC_ACC
    LS --> RPC_RED
    LS --> RPC_MC
    LS --> RPC_AP
    LS --> RPC_GPL
    LS --> RPC_ESR
    LS --> RPC_REC

    RS_SVC --> T_RC
    RS_SVC --> T_RPP
    RS_SVC --> T_RET
    RS_SVC --> T_RL
    RS_SVC --> T_RE
    RS_SVC --> T_LEC

    PS --> RPC_IC
    PS --> RPC_VC
    PS --> RPC_RC
    PS --> RPC_INV

    P360 --> T_LL
    P360 --> T_PC

    %% RPCs → Tables
    RPC_ACC --> T_LL
    RPC_ACC --> T_PL
    RPC_RED --> T_LL
    RPC_RED --> T_PL
    RPC_IC --> T_PC
    RPC_IC --> T_LO
    RPC_SLL --> T_LLS
    RPC_SLL --> T_LVP

    classDef done fill:#22c55e20,stroke:#22c55e,color:#166534
    classDef stub fill:#f59e0b20,stroke:#f59e0b,color:#92400e
    classDef gap fill:#ef444420,stroke:#ef4444,color:#991b1b
    classDef warn fill:#f9731620,stroke:#f97316,color:#9a3412
```

---

## Layer-by-Layer Inventory

### Database Layer — 17 objects, 4 enums, 19 RPCs

| Category | Count | Status |
|----------|-------|--------|
| Core tables (ledger, balance, outbox) | 3 | **Deployed** |
| Promo tables (program, coupon) | 2 | **Deployed** |
| ADR-033 reward catalog tables | 6 | **Deployed** (seed: 3 comps, 2 entitlements) |
| ADR-039 measurement tables | 2 | **Deployed** |
| Materialized views | 1 | **Deployed** (never refreshed) |
| Enums | 4 | `loyalty_reason` (6), `reward_family` (2), `promo_type_enum` (2 of 4: match_play, free_play), `promo_coupon_status` (5) |
| Points ledger RPCs | 9 | **All operational** (ADR-024 hardened, ADR-040 role-gated) |
| Promo coupon RPCs | 5 | **All operational** (SECURITY DEFINER, `rpc_issue_promo_coupon` role-gated pit_boss/admin) |
| Measurement RPCs | 1 | **Operational** (daily idempotent snapshot) |
| Missing RPCs | 1 | `rpc_issue_current_match_play` (one-click tier-aware issuance) |

### Service Layer — 30 methods across 4 services

| Service | Methods | Impl | Notes |
|---------|---------|------|-------|
| **LoyaltyService** | 9 | 9/9 (100%) | accrue, redeem, credit, promo, suggestion, balance, ledger, reconcile, **issueComp** |
| **RewardService** | 8 | 8/8 (100%) | list, get, create, update, toggle, earnConfig, upsertConfig, eligible |
| **PromoService** | 12 | 12/12 (100%) | programs CRUD, coupon issue/void/replace, inventory, lookup, **issueEntitlement** |
| **Player360DashboardService** | 1+ | read-only | **NEW** — aggregates loyalty_ledger + promo_coupon for reward history (SRM v4.20.0) |
| **mid-session-reward** | 1 validator | partial | Divergent `MidSessionRewardReason` enum conflicts with canonical `LoyaltyReason` |

### API Routes — 9 live, 1 explicit 501

| Route | Status |
|-------|--------|
| `POST /loyalty/accrue` | Live |
| `POST /loyalty/redeem` | Live |
| `POST /loyalty/manual-credit` | Live |
| `POST /loyalty/promotion` | Live |
| `GET /loyalty/ledger` | Live |
| `GET /loyalty/suggestion` | Live |
| `GET /loyalty/balances` | **Live** (wired to LoyaltyService.getBalance — was stub) |
| **`POST /loyalty/issue`** | **Live — unified issuance (NEW, PRD-052)** |
| `GET /players/[id]/loyalty` | **Live** (wired to LoyaltyService.getBalance — was stub) |
| `POST /loyalty/mid-session-reward` | **501 Not Implemented** (explicit scope change per PRD §7.4) |

### UI Components — 12 live, 2 gaps

| Component | Status |
|-----------|--------|
| LoyaltyPanel (tier + points) | Live |
| PromoExposurePanel (shift dashboard) | Live |
| RewardsEligibilityCard (Player 360) | Live |
| RewardsHistoryList (ledger + coupon, comp/matchplay/freeplay filters) | Live |
| LoyaltyLiabilityWidget (measurement) | Live |
| **IssueRewardButton** (enabled, opens drawer) | **Live (NEW)** |
| **IssueRewardDrawer** (3-step state machine) | **Live (NEW)** |
| **RewardSelector** (catalog grouped by family) | **Live (NEW)** |
| **CompConfirmPanel** (balance preview) | **Live (NEW)** |
| **EntitlementConfirmPanel** (catalog-derived values) | **Live (NEW)** |
| **IssuanceResultPanel** (success/failure/duplicate + fulfillment callback) | **Live (NEW)** |
| **ExclusionStatusBadge** (header severity indicator) | **Live (NEW)** |
| Loyalty Admin Page | **Stub** ("Phase 3 pending") |
| Print Match Play Button | **Gap** (0%) |

---

## Implementation Gaps (Prioritized)

### P0 — Blocks operator self-service

| Gap | Impact | Evidence |
|-----|--------|----------|
| **No admin UI for loyalty config** | Operators cannot create/manage programs, rewards, earn config, tier mappings | `app/(dashboard)/loyalty/page.tsx` is placeholder |

### P1 — Blocks automated workflows

| Gap | Impact | Evidence |
|-----|--------|----------|
| **No one-click match play RPC** | Cannot auto-derive tier-aware coupons; blocks print feature | MATCHPLAY-PRINT-READINESS-REPORT: 0% |
| **Tier-to-entitlement design decision pending** | Blocks automated issuance; three options proposed but not chosen | LOYALTY-INSTRUMENTS-SYSTEM-POSTURE-AUDIT |
| **Divergent mid-session module** | Conflicting `MidSessionRewardReason` vs canonical `LoyaltyReason`; API returns 501 | ADR-033 flagged; `mid-session-reward.ts` |

### P2 — Technical debt

| Gap | Impact | Evidence |
|-----|--------|----------|
| **Materialized view never refreshed** | `mv_loyalty_balance_reconciliation` stale after first entry | No refresh trigger |
| **No print infrastructure** | `lib/print/` does not exist (binding point exists in IssuanceResultPanel) | MATCHPLAY-PRINT-v0.1 spec waiting |
| **`promo_type_enum` incomplete** | Has `match_play` + `free_play`; missing `nonnegotiable`, `free_bet`, `other` | Confirmed in bug triage |
| **Reward limits not enforced** | `reward_limits` table populated but no RPC checks frequency constraints | ADR-033 post-MVP |
| **Reward eligibility not enforced** | `reward_eligibility` table exists but no RPC validates tier/balance guards | ADR-033 post-MVP |

---

## Resolved Issues (Since Rev 1)

| Issue | Resolution | When |
|-------|------------|------|
| **No operator issuance workflow** (P0) | IssueRewardDrawer + issueComp/issueEntitlement + unified /issue API | PRD-052, 2026-03-19 |
| **`rpc_issue_promo_coupon` no role gate** (P0) | Migration adds pit_boss/admin gate | PRD-052 WS1, `20260319010843` |
| **`ManualRewardDialog` disconnected** (P3) | Deleted, replaced by unified IssueRewardDrawer | PRD-052 WS4 |
| **3 stubbed API routes** (P1) | `balances` + `players/[id]/loyalty` wired; `mid-session-reward` explicit 501 | PRD-052 WS3 |
| **Inventory API route missing** (P2) | `GET /api/v1/promo-coupons/inventory` now exists | PRD-052 era |
| **Rewards history mapper bug** (P1) | `'redemption'` → `'redeem'` fixed in mappers.ts | PRD-052 WS5 |
| **`promo_type_enum` only `match_play`** (partial) | `free_play` added | Migration `20260318153722` |
| `loyalty_outbox` table missing (P0) | Restored with full schema + RLS | `20260206005335` (PRD-028) |
| `player_loyalty` not created at enrollment (P0) | `rpc_create_player` now creates both records atomically | `20251229020455` |
| RLS self-injection antipattern | Replaced with `set_rls_context_from_staff()` (ADR-024) | `20251229154020` |
| Ghost visit loyalty accrual | Guard in `rpc_accrue_on_close` (ADR-014) | `20251216073543` |
| Ledger idempotency contracts | 3 partial unique indexes (base_accrual, promotion, general) | `20251213010000` |

---

## Cross-Domain Integration

```
Rating Slip Close ──→ rpc_accrue_on_close ──→ loyalty_ledger + player_loyalty
                        │
                        ├── reads policy_snapshot.loyalty from rating_slip
                        ├── ADR-014: rejects ghost visits
                        └── ADR-024: derives context from JWT + staff

Player Enrollment ──→ rpc_create_player ──→ player_casino + player_loyalty (atomic)

Visit Close ──→ (app layer triggers accrual) ──→ LoyaltyService.accrueOnClose()

Comp Issuance ──→ LoyaltyService.issueComp() ──→ rpc_redeem ──→ loyalty_ledger + player_loyalty
(NEW — PRD-052)     │
                    ├── catalog validation (reward active, family match)
                    ├── advisory balance pre-check (UX only)
                    ├── role gate: pit_boss/admin (route + RPC)
                    └── idempotency via p_idempotency_key

Entitlement Issuance ──→ PromoService.issueEntitlement() ──→ rpc_issue_promo_coupon ──→ promo_coupon + loyalty_outbox
(NEW — PRD-052)           │
                          ├── catalog validation (reward active, family match)
                          ├── commercial values from catalog metadata (no tier derivation)
                          ├── role gate: pit_boss/admin (route + RPC)
                          └── idempotency via p_idempotency_key

Promo Issuance (legacy) ──→ rpc_issue_promo_coupon ──→ promo_coupon + loyalty_outbox + audit_log

Liability Snapshot ──→ rpc_snapshot_loyalty_liability ──→ loyalty_liability_snapshot
                        │
                        ├── reads loyalty_valuation_policy (cents_per_point)
                        └── aggregates all player_loyalty.current_balance
```

---

## Recommended Development Sequence

| Phase | Scope | Unblocks |
|-------|-------|----------|
| **Phase 1** | Admin config UI (program CRUD, tier editor, earn config) | Operator self-service |
| **Phase 2** | `rpc_issue_current_match_play` + tier mapping + service/hooks/API wiring | One-click match play print |
| **Phase 3** | `lib/print/` iframe utilities + coupon template + wire `onFulfillmentReady` callback | Printable coupons (Vector C) |
| **Phase 4** | Resolve mid-session module, enforce limits/eligibility, refresh MV | Debt cleanup |

---

## Key Architectural Invariants

1. **Ledger-Balance**: `player_loyalty.current_balance = SUM(loyalty_ledger.points_delta)` — enforced by RPCs, auditable via MV
2. **Append-Only**: Ledger + outbox protected by privilege revocation + denial RLS policies (two layers)
3. **Casino-Scoped**: All 17 objects use Pattern C hybrid RLS (`app.casino_id` with JWT fallback)
4. **Idempotent**: All mutation RPCs have idempotency contracts (per-slip, per-campaign, per-key)
5. **Definition vs Issuance**: `reward_catalog` = what exists; `loyalty_ledger` + `promo_coupon` = what happened
6. **Dual Role Gates** (NEW): Operator issuance enforces role checks at both route handler (`ctx.rlsContext.staffRole`) and RPC (`app.staff_role`) layers — defense-in-depth
7. **Catalog-Backed Issuance** (NEW): `issueComp()` and `issueEntitlement()` resolve all parameters from catalog; no client-supplied amounts or commercial values
8. **Frozen Contract** (NEW): `FulfillmentPayload` discriminated union frozen for Vector C print pipeline consumption
