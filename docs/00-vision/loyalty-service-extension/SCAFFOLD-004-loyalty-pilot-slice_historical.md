---
id: SCAFFOLD-004
title: "Feature Scaffold: Loyalty Pilot Slice"
owner: diepulp
status: Draft
date: 2026-03-17
---

# Feature Scaffold: Loyalty Pilot Slice

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Loyalty Pilot Slice
**Owner / driver:** diepulp
**Stakeholders (reviewers):** pit operations, admin staff
**Status:** Draft
**Last updated:** 2026-03-17

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss, I can issue a reward to a player and immediately print the physical artifact the floor needs to honor it. As an admin, I can configure which rewards are available, their pricing, and activation state.
- **Primary actor:** Pit Boss — floor supervisor issuing rewards during active play; Admin — configuring reward catalog and policies
- **Success looks like:** A real operator completes an end-to-end reward loop — admin configures a reward, pit boss issues it, system persists and prints a usable artifact — without developer intervention, for both pilot issuance families.

### Structural clarification: two issuance families, not four instrument types

The boundary doc describes "four frozen instruments" (match play, meal comp, free play, other comps). Investigation of the actual `reward_catalog` schema (ADR-033) reveals these map to **two structurally distinct issuance families**:

| Family (`reward_family` enum) | Issuance path | Ledger effect | Print artifact | Pilot `kind` values |
|-------------------------------|---------------|---------------|----------------|---------------------|
| **`points_comp`** | Debit `loyalty_ledger` | Points subtracted | Comp slip | `meal`, `beverage`, `misc` (free-text — extensible without migration) |
| **`entitlement`** | Create `promo_coupon` record | None (tier-based) | Coupon | `match_play`, `free_play` |

**"Other comps" is not a fourth structural type** — it's more entries in the `points_comp` family. The `kind` field on `reward_catalog` is unconstrained free-text, so admin can create `kind='hotel'`, `kind='spa'`, `kind='retail'` without any schema migration. This is already supported by the catalog.

**Implications:**
- Admin UI needs two configuration forms: points pricing (`reward_price_points`) vs tier-entitlement mapping (`reward_entitlement_tier`)
- Issuance has two paths: ledger debit (comps) vs coupon creation (entitlements)
- Print templates split into two structural types (comp slip vs coupon), not four
- No FK between `reward_catalog` and `promo_program` — separate domains (catalog = "what exists", promo = "what was issued" for entitlements only)

## 2) Constraints (hard walls)

- **Security / tenancy:** All operations casino-scoped via Pattern C hybrid RLS (ADR-015/020). Write RPCs use `set_rls_context_from_staff()` (ADR-024). No cross-casino data leakage.
- **Domain:** Pilot reward families are frozen: `points_comp` (meal, beverage, misc — extensible via free-text `kind`) and `entitlement` (match play, free play — requires `promo_type_enum` expansion). No new `reward_family` enum values without bounded slice review. Idempotency required on all mutation RPCs.
- **Operational:** Browser-based printing only (hidden iframe + `window.print()`). No printer fleet management, no server-side rendering. Must work on standard casino floor hardware.
- **Audit:** Every issuance produces a durable record. Printed artifacts contain validation numbers traceable to `promo_coupon` or `loyalty_ledger` records.

## 3) Non-goals (what we refuse to do in this iteration)

1. **Full loyalty platform completion** — only the two pilot issuance families (`points_comp`, `entitlement`) with their seeded `kind` values
2. **Generalized print engine** — per-family templates (comp slip + coupon) with one rendering path, not a template registry or versioning system
3. **Advanced promo campaigns** — no multi-condition targeting, no time-windowed auto-issuance, no promotional A/B testing
4. **Reward limit enforcement** — `reward_limits` table exists but RPC enforcement deferred to post-pilot (manual workaround acceptable)
5. **Reward eligibility enforcement** — `reward_eligibility` table exists but RPC enforcement deferred to post-pilot
6. **Multi-property instrument behavior** — single-casino scope only; Phase 2 dual-boundary deferred
7. **Liability measurement refinement** — existing `rpc_snapshot_loyalty_liability` is sufficient for pilot
8. **Executive reporting surfaces** — PromoExposurePanel (shift dashboard) is sufficient for pilot
9. **Sophisticated reprint lifecycle** — minimal reprint at most; manual workaround preferred
10. **Template versioning or registry** — per-instrument HTML templates hardcoded for pilot

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Admin: reward catalog definitions (type, face value, points cost, tier mapping, activation state)
  - Pit boss: player context + reward selection + issuance trigger
- **Outputs:**
  - Persisted issuance record (`loyalty_ledger` for comps, `promo_coupon` for entitlements)
  - Printed physical artifact (HTML → browser print) per issuance family (comp slip or coupon)
  - `loyalty_outbox` event for downstream side-effects
  - `audit_log` entry for traceability
- **Canonical contracts:** `IssueCouponInput/Output`, `RewardCatalogDTO`, `CouponInventoryOutput`, new `IssueCurrentMatchPlayInput/Output`

## 5) Options (2-4 max; force tradeoffs)

### Option A: Phased — Admin Config → Issuance RPC → Print → Supportability

- **Pros:** Matches boundary doc sequence (§5). Each phase is independently shippable. Admin config unblocks everything downstream.
- **Cons / risks:** 4 phases means 4 integration points. Print is blocked until Phase C.
- **Cost / complexity:** ~2-3 weeks total. Phase A (~1 week), Phase B (~3-5 days), Phase C (~3-5 days), Phase D (~2-3 days).
- **Security posture impact:** Minimal — each phase uses existing RLS patterns. New RPCs follow ADR-024.
- **Exit ramp:** Each phase ships independently. Can stop after Phase B with functional issuance (no print).

### Option B: Vertical Slice — Single Instrument End-to-End First

- **Pros:** Proves the entire loop (admin → issue → print → support) with one instrument (match play) before broadening. Fastest path to a working demo.
- **Cons / risks:** Other instrument types might need structural changes that the match-play slice doesn't surface. Admin UI built for one type may need rework.
- **Cost / complexity:** ~1 week for match play E2E, then ~1 week to broaden to other instruments.
- **Security posture impact:** Same as Option A — same RLS, same RPCs.
- **Exit ramp:** If match play works, the pattern is proven. Other instruments follow the same path.

### Option C: Admin-First — Ship Full Admin Config, Then Wire Issuance

- **Pros:** Operators can start configuring rewards immediately. Decouples admin UX from issuance timing.
- **Cons / risks:** Admin UI without issuance is theater — operators configure but can't issue. Risk of over-designing admin before learning from real issuance patterns.
- **Cost / complexity:** ~1 week admin, ~1.5 weeks issuance + print.
- **Security posture impact:** Admin CRUD uses existing API routes. Low risk.
- **Exit ramp:** Admin config is reusable regardless of issuance approach.

## 6) Decision to make (explicit)

- **Decision:** Which implementation sequence delivers pilot-ready loyalty fastest while respecting the frozen instrument set?
- **Decision drivers:**
  - Pilot needs both issuance families functional (points_comp + entitlement)
  - Print is non-negotiable for pilot instrument-backed rewards
  - Admin config is the P0 blocker (everything is blocked without it)
  - Existing backend is 85-100% complete — this is primarily an admin UI + print + wiring effort
- **Decision deadline:** Before Phase 2 (RFC/Design Brief)

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| LoyaltyService (27 methods, 3 sub-services) | Required | Implemented (100%) |
| 19 RPCs (points ledger + promo coupons + measurement) | Required | Deployed (100%) |
| `reward_catalog` + ADR-033 schema (6 tables) | Required | Deployed |
| `promo_program` + `promo_coupon` schema | Required | Deployed |
| Promo API routes (7 endpoints) | Required | Operational |
| React hooks (CRUD + mutation + query) | Required | Operational |
| `rpc_issue_current_match_play` (tier-aware auto-derivation) | Required | **0% — must build** |
| Tier-to-entitlement mapping mechanism | Required | **Decision pending (GAP-2)** |
| `promo_type_enum` expansion (3 missing values) | Required | **Bug #4 — safe migration** |
| Missing inventory API route | Required | **Bug #1 — ~40 lines** |
| `lib/print/` infrastructure | Required | **0% — must build** |
| Admin config UI | Required | **0% — must build** |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Tier-to-entitlement mapping: JSONB vs join table vs one-program-per-tier | High — blocks tier-aware issuance | Posture audit recommends Option A (JSONB). Decide in RFC. |
| Idempotency scope for `rpc_issue_current_match_play`: gaming-day vs visit | Med — affects when a player can receive another match play | Posture audit recommends gaming-day. Decide in RFC. |
| Browser print reliability on casino floor hardware | Med — print failures block reward fulfillment | Pilot uses standard `window.print()`. Manual workaround for failures. |
| `ManualRewardDialog` is a misleading stub (Bug #2) | Low — confuses operators if discovered before fix | Disable with `enabled=false` until proper wiring in admin UI phase. |
| `promo_program.status` diverges from spec (Bug #5) | Low — intentional, document as ADR addendum | Already triaged as "intentional divergence." |

## 9) Definition of Done (thin)

- [ ] Tier-to-entitlement mapping decision recorded in ADR
- [ ] Implementation sequence decision recorded
- [ ] Acceptance criteria agreed (per boundary doc §pilot reward instruments acceptance criteria)
- [ ] Implementation plan delegated to build-pipeline

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-pilot-slice/FEATURE_BOUNDARY.md`
- Pilot Slice Boundary (governing doc): `docs/00-vision/loyalty-service-extension/loyalty_pilot_slice_boundary.md`
- Posture Precis: `docs/00-vision/loyalty-service-extension/LOYALTY-SYSTEM-POSTURE-PRECIS.md`
- Posture Audit: `docs/00-vision/loyalty-service-extension/LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md`
- Bug Triage: `docs/00-vision/loyalty-service-extension/LOYALTY-INSTRUMENTS-BUG-TRIAGE.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4)
- PRD: (Phase 5)
- Exec Spec: (delegated to build-pipeline)
