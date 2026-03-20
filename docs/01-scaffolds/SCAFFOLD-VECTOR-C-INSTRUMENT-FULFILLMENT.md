---
id: SCAFFOLD-VECTOR-C
title: "Feature Scaffold: Reward Instrument Fulfillment (Vector C)"
owner: agent
status: Draft
date: 2026-03-19
---

# Feature Scaffold: Reward Instrument Fulfillment (Vector C)

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Reward Instrument Fulfillment — Pilot Print Standard
**Owner / driver:** Agent (loyalty fulfillment sub-domain)
**Stakeholders (reviewers):** Product owner
**Status:** Draft
**Last updated:** 2026-03-19

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss or floor supervisor, after issuing a loyalty reward (comp or entitlement coupon), I need a printed physical artifact so the downstream custody recipient (wait staff, dealer, cashier) can inspect, validate, and honor the reward.
- **Primary actor:** Pit Boss / Floor Supervisor — operator who issues rewards via the IssueRewardDrawer and hands the printed slip/coupon to the next person in the custody chain.
- **Success looks like:** Every issued comp slip and entitlement coupon produces a printable artifact via the browser print dialog, and the floor can complete the custody handoff without developer intervention.

## 2) Constraints (hard walls)

- **Domain:** Comp slips and coupons must NOT be collapsed into one domain model (per `REWARD_FULFILLMENT_POLICY.md`). They share a constrained print rendering path at the fulfillment layer only.
- **Domain:** Internal/admin adjustments (`internal_adjustment` family) must NOT print. Print is for custody-validated instruments only.
- **Technical:** Browser `window.print()` requires a user gesture (button click) — no silent/background printing is possible.
- **Technical:** System fonts only — no web font loading. Casino floor hardware varies; must tolerate 95-105% scaling.
- **Technical:** All monetary values are integer cents (`_cents` suffix). Templates must divide by 100 for display.
- **Technical:** `FulfillmentPayload` contracts are frozen in `services/loyalty/dtos.ts`. Vector C must not modify these types.
- **Security:** No new RLS policies or RPCs required. All data arrives pre-resolved in the payload. Future print history logging (P2) will use existing JSONB metadata append pattern.

## 3) Non-goals (what we refuse to do in this iteration)

- No generalized print/document platform or template registry
- No printer fleet abstraction or silent printing
- No PDF generation (browser print dialog only)
- No QR/barcode generation on printed artifacts (deferred, GAP-C5)
- No print history audit logging in this iteration (P2, requires GAP-C0 migration)
- No reprint from history view (manual workaround acceptable for pilot)
- No extensibility beyond the two pilot instrument types (comp slip + coupon)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:** `FulfillmentPayload` discriminated union (arrives via `onFulfillmentReady` callback from `IssuanceResultPanel`)
  - `CompFulfillmentPayload` (family: `'points_comp'`) — 12 pre-resolved fields
  - `EntitlementFulfillmentPayload` (family: `'entitlement'`) — 14 pre-resolved fields
- **Outputs:** Browser print dialog opens with a rendered HTML document (comp slip or coupon template). No system-side state change for core print.
- **Canonical contract(s):** `FulfillmentPayload` from `@/services/loyalty/dtos`

## 5) Options (2 max — constrained by investigation)

### Option A: Hidden iframe + `window.print()` (recommended)

- **Pros:**
  - Zero dependencies — pure browser API
  - Self-contained HTML document in iframe — no interference with app styles
  - Works on all modern browsers including casino floor Chrome/Edge
  - Simple cleanup (remove iframe after print dialog closes)
  - ~80-120 lines for the core utility
- **Cons / risks:**
  - Browser print dialog UX varies across browsers/OS
  - Print scaling/margins are browser-controlled (mitigated by `@page` rules)
  - `afterprint` event for cleanup is not 100% reliable (use timeout fallback)
- **Cost / complexity:** Low. ~400-500 total lines across utility + 2 templates + dispatch + hook.
- **Security posture impact:** None. Pure client-side rendering of pre-resolved data. No API calls, no data fetching, no RLS interaction.
- **Exit ramp:** If browser print proves unreliable on floor hardware, the iframe approach can be replaced with a server-side PDF renderer without changing the payload contracts or template data shapes.

### Option B: New window + `window.print()`

- **Pros:**
  - Simpler implementation (no iframe management)
  - Print content visible to user before printing
- **Cons / risks:**
  - Popup blockers will block `window.open()` even with user gesture in many configurations
  - Casino floor browser lockdown policies may restrict new windows
  - User sees a jarring new tab/window open
  - Cleanup is harder (user may close tab before print completes)
- **Cost / complexity:** Similar LOC but higher failure rate on floor hardware.
- **Security posture impact:** None.
- **Exit ramp:** Same as Option A.

## 6) Decision to make (explicit)

- **Decision:** Option A — Hidden iframe + `window.print()`
- **Decision drivers:** Popup blocker immunity (iframe is same-origin, not blocked), cleaner UX (no visible window), reliable cleanup, proven pattern for receipt/slip printing in web POS systems.
- **Decision deadline:** N/A — investigation already validated this approach.

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `FulfillmentPayload` types (dtos.ts:488-538) | Required | **Shipped & frozen** |
| `onFulfillmentReady` callback chain (IssuanceResultPanel) | Required | **Shipped** |
| `IssuanceResultPanel` Print button | Required | **Shipped** |
| Auto-fire via `queueMicrotask` on fresh issuance | Required | **Shipped** |
| GAP-C0: `promo_coupon.metadata` column | Optional (P2) | **Not started** — blocks print history only |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Browser print dialog unreliable on floor hardware | Med | Test on actual hardware early. Fallback: screenshot + manual print. |
| Print scaling varies across browsers | Med | System fonts, `@page` margins, generous spacing, 95-105% tolerance |
| `afterprint` event inconsistency | Low | Timeout-based iframe cleanup fallback (5s) |
| Comp slip `ledger_id` (UUID) not human-readable | Low | Template can show truncated form (last 8 chars) with full UUID in small print |

## 9) Definition of Done (thin)

- [ ] Decision recorded in ADR (pilot print standard)
- [ ] Acceptance criteria agreed (from VECTOR-C investigation §Acceptance criteria)
- [ ] Implementation plan delegated (PRD → EXEC-SPEC → build)

## Links

- Feature Boundary: `docs/20-architecture/specs/vector-c/FEATURE_BOUNDARY.md`
- Investigation: `docs/00-vision/loyalty-service-extension/vectors/VECTOR-C/VECTOR-C-INSTRUMENT-FULFILLMENT-INVESTIGATION.md`
- Fulfillment Policy: `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
- Cross-Vector Contracts: `docs/00-vision/loyalty-service-extension/vectors/VECTOR-CONTRACTS-INTEGRATION-MAP.md`
- Design Brief/RFC: TBD (Phase 2)
- ADR(s): TBD (Phase 4)
- PRD: TBD (Phase 5)
- Exec Spec: TBD (post-pipeline)
