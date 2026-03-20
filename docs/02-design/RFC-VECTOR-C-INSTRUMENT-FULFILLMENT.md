---
id: RFC-VECTOR-C
title: "Design Brief: Reward Instrument Fulfillment (Vector C)"
owner: agent
status: Draft
date: 2026-03-19
affects: [LoyaltyService]
---

# Design Brief / RFC: Reward Instrument Fulfillment (Vector C)

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.
> Structure: funnel style (context -> scope -> overview -> details -> cross-cutting -> alternatives).

## 1) Context

- **Problem:** When a pit boss issues a loyalty reward (comp or entitlement coupon), the downstream custody recipient (wait staff, dealer, cashier) needs a physical printed artifact to inspect, validate, and honor the reward. The system currently has zero printing infrastructure — no `window.print()`, no `@media print`, no iframe patterns, no templates.

- **Forces/constraints:**
  - Casino floor hardware is standardized Chrome/Edge on managed workstations with thermal receipt printers
  - Browser `print()` requires user gesture — no silent printing
  - Two structurally distinct reward families (`points_comp` → comp slip, `entitlement` → coupon) per `REWARD_FULFILLMENT_POLICY.md` — must NOT be collapsed
  - All payload data arrives pre-resolved via the frozen `FulfillmentPayload` discriminated union — no API calls at print time
  - Monetary values are integer cents (`_cents` suffix)

- **Prior art:** Vector B shipped the complete trigger infrastructure (`IssuanceResultPanel` → `onFulfillmentReady` callback, auto-fire via `queueMicrotask`, manual Print button). Vector C only needs to implement the handler that receives the payload and produces print output.

## 2) Scope & Goals

- **In scope:**
  - `lib/print/iframe-print.ts` — core iframe utility (create, inject HTML, wait, print, cleanup)
  - `lib/print/templates/comp-slip.ts` — comp slip HTML template builder
  - `lib/print/templates/coupon.ts` — coupon HTML template builder
  - `lib/print/templates/shared-styles.ts` — common print CSS
  - `lib/print/print-reward.ts` — dispatch function (discriminate on `family` → route to template → call iframe print)
  - `lib/print/types.ts` — re-export `FulfillmentPayload` + local `PrintResult` type
  - `lib/print/hooks/use-print-reward.ts` — React hook wrapping dispatch with status/error state
  - Wire `onFulfillmentReady` handler in `IssueRewardButton` to call `usePrintReward`

- **Out of scope:**
  - Print history logging (P2, requires GAP-C0 migration)
  - Reprint from history view (manual workaround for pilot)
  - QR/barcode generation (deferred)
  - PDF generation
  - Generalized print/document platform

- **Success criteria:** Operator issues a comp or coupon → browser print dialog opens with correctly rendered template → floor staff can read and honor the artifact.

## 3) Proposed Direction (overview)

Hidden iframe + `window.print()`. A single dispatch function receives the `FulfillmentPayload`, discriminates on `family`, routes to the correct template builder (`buildCompSlipHtml` or `buildCouponHtml`), injects the resulting HTML into a hidden iframe, and triggers the browser print dialog. The iframe is cleaned up after the print dialog closes (via `afterprint` event with timeout fallback). A React hook (`usePrintReward`) wraps this with loading/success/error state for UI feedback.

## 4) Detailed Design

### 4.1 Data model changes

**None for core print delivery.**

Future (P2): `ALTER TABLE promo_coupon ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb` — for print history logging only.

### 4.2 Service layer

No service layer changes. Vector C is purely client-side. It consumes the existing `FulfillmentPayload` types from `@/services/loyalty/dtos`.

### 4.3 API surface

No new API endpoints. Print rendering is entirely client-side. No server roundtrips at print time.

### 4.4 UI/UX flow

```
Operator clicks "Issue Reward" → IssueRewardDrawer opens
  → Select reward → Confirm → Issuance RPC fires
  → IssuanceResultPanel renders success state
  → assembleCompFulfillment() or assembleEntitlementFulfillment() builds payload
  → queueMicrotask(() => onFulfillmentReady(payload))   [auto-fire for fresh issuance]
  → OR operator clicks Print button                      [manual trigger]
  → onFulfillmentReady(payload) fires
  → usePrintReward.print(payload) called
    → printReward(payload) dispatches by family
      → buildCompSlipHtml(payload) OR buildCouponHtml(payload)
      → iframePrint(htmlString)
        → create hidden iframe
        → write HTML
        → wait for readiness (2x rAF)
        → iframe.contentWindow.print()
        → browser print dialog opens
        → afterprint → cleanup iframe
  → UI shows "Printed" or error toast
```

**Print button states:**
- Idle: "Print" (enabled)
- Printing: "Printing..." (disabled, spinner)
- Success: "Printed" (with checkmark, re-clickable for reprint)
- Error: "Print failed — try again" (error styling, re-clickable)

### 4.5 Security considerations

- **RLS impact:** None. No database queries at print time. All data is pre-resolved in the payload.
- **RBAC requirements:** None beyond existing issuance RBAC. If a user can issue a reward, they can print the artifact.
- **Audit trail:** Deferred to P2 (GAP-C0/GAP-C3). Core printing has no audit write. Issuance itself is already audited via the loyalty ledger and promo_coupon records.
- **XSS risk:** Template builders must escape all payload string values before injecting into HTML. Use a simple `escapeHtml()` utility (entity-encode `<>&"'`). Payload values come from trusted server responses but defense-in-depth requires escaping.

## 5) Cross-Cutting Concerns

- **Performance implications:** Negligible. Template building is synchronous string concatenation (~1ms). Iframe creation and print dialog are browser-native operations. No network calls.

- **Migration strategy:** No migrations for core print. Future GAP-C0 migration (`promo_coupon.metadata`) is additive and non-breaking.

- **Observability / monitoring:** No server-side observability for pilot print. Future: print history logging (P2) provides post-hoc audit trail.

- **Rollback plan:** Delete `lib/print/` directory and remove the `onFulfillmentReady` handler wiring. The Print button in `IssuanceResultPanel` becomes a no-op. Zero database impact.

## 6) Alternatives Considered

### Alternative A: New window + `window.print()`

- **Description:** Open a new browser tab/window with the print content, call `print()` on that window.
- **Tradeoffs:** Simpler (no iframe management) but vulnerable to popup blockers. Casino floor browser policies may restrict `window.open()`. User sees a jarring new tab.
- **Why not chosen:** Popup blocker risk on managed casino floor hardware is unacceptable for a pilot where reliability matters most. Hidden iframe is same-origin and immune to popup blocking.

### Alternative B: Server-side PDF generation

- **Description:** Generate a PDF on the server (via Puppeteer, wkhtmltopdf, or similar), return PDF blob to client for download/print.
- **Tradeoffs:** Consistent rendering across browsers, high-fidelity output. But adds server-side dependency, increases latency (500ms-2s per render), requires headless browser or PDF library in deployment, over-engineered for a pilot with two templates.
- **Why not chosen:** Violates the Over-Engineering Guardrail. ~400 lines of client-side code solves the problem. Server-side PDF is the exit ramp if browser print proves unreliable on floor hardware.

### Alternative C: React-to-print library

- **Description:** Use `react-to-print` or similar npm package to render a React component tree and print it.
- **Tradeoffs:** React-idiomatic, component-based templates. But adds a dependency, templates must be mounted in the DOM (even if hidden), style isolation is harder (app CSS leaks into print content).
- **Why not chosen:** Self-contained HTML string + iframe gives perfect style isolation with zero dependencies. The templates are simple enough that React component overhead is unnecessary.

## 7) Decisions Required

1. **Decision:** Pilot print rendering mechanism
   **Options:** Hidden iframe | New window | Server-side PDF | react-to-print
   **Recommendation:** Hidden iframe — popup-immune, zero dependencies, perfect style isolation, proven POS pattern.
   **ADR:** ADR-0XX — Pilot Reward Instrument Fulfillment Standard

2. **Decision:** Comp slip reference number format
   **Options:** UUID (ledger_id) | Short alphanumeric code | Composite key
   **Recommendation:** Use `ledger_id` (UUID). Template displays truncated form (last 8 chars) with full UUID available. Already resolved by implementation reality.
   **ADR:** Same ADR as above (sub-decision).

3. **Decision:** Template structural independence
   **Options:** Unified template with conditional sections | Separate per-family templates
   **Recommendation:** Separate per-family templates. Per `REWARD_FULFILLMENT_POLICY.md`, comp slips and coupons are structurally distinct. Shared rendering path at the print CSS level only.
   **ADR:** Same ADR as above (sub-decision).

## 8) Open Questions

- **Floor hardware testing:** Will browser print dialog produce acceptable output on casino floor receipt printers? Mitigated by system fonts + generous spacing + `@page` margin rules. Early hardware test recommended.
- **Thermal printer paper width:** Standard 80mm thermal receipt paper may require narrower template layout than standard A4/Letter. Template CSS should use `max-width` that fits both.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-VECTOR-C-INSTRUMENT-FULFILLMENT.md`
- Feature Boundary: `docs/20-architecture/specs/vector-c/FEATURE_BOUNDARY.md`
- ADR(s): TBD (Phase 4)
- PRD: TBD (Phase 5)
- Exec Spec: TBD (post-pipeline)

## References

- Vector C Investigation: `docs/00-vision/loyalty-service-extension/vectors/VECTOR-C/VECTOR-C-INSTRUMENT-FULFILLMENT-INVESTIGATION.md`
- Reward Fulfillment Policy: `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
- Cross-Vector Contracts: `docs/00-vision/loyalty-service-extension/vectors/VECTOR-CONTRACTS-INTEGRATION-MAP.md`
- Frozen payload types: `services/loyalty/dtos.ts:488-538`
- IssuanceResultPanel (trigger source): `components/loyalty/issuance-result-panel.tsx`
- IssueRewardButton (handler host): `components/player-360/header/issue-reward-button.tsx`
