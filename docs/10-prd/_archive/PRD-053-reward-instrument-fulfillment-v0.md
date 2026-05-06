---
id: PRD-053
title: Reward Instrument Fulfillment — Pilot Print Standard
owner: Engineering
status: Draft
affects: [ARCH-SRM, ADR-045]
created: 2026-03-19
last_review: 2026-03-19
phase: Phase C (Instrument Fulfillment)
pattern: Frontend-only
http_boundary: false
---

# PRD-053 — Reward Instrument Fulfillment: Pilot Print Standard

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Delivers the pilot print surface for loyalty reward artifacts. When a pit boss issues a comp or entitlement coupon (Vector B / PRD-052), the system renders a printable artifact via hidden iframe + browser print dialog so the downstream custody recipient (wait staff, dealer, cashier) can inspect and honor the instrument. Implements `lib/print/` module with iframe utility, per-family templates (comp slip + coupon), dispatch function, and React hook. Zero backend changes — pure client-side, consuming the frozen `FulfillmentPayload` contracts from `services/loyalty/dtos.ts`.

---

## 2. Problem & Goals

### 2.1 Problem

The loyalty issuance pipeline (PRD-052) is shipped: pit bosses can issue comps and entitlement coupons, the `IssuanceResultPanel` assembles a `FulfillmentPayload` and fires `onFulfillmentReady`. But nothing happens — the callback has no handler. The Print button in the result panel has no implementation. The floor cannot produce a physical artifact, so the custody handoff chain breaks: wait staff cannot verify a meal comp, dealers cannot validate a match play coupon, cashiers cannot process redemptions.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Comp slip is printable at issuance | Pit boss issues a `points_comp` reward → comp slip is immediately available to print via Print button; auto-print may be attempted best-effort, but manual Print remains canonical. Template contains casino name, player name, comp type, face value, points redeemed, balance after, staff name, timestamp, reference number |
| **G2**: Coupon is printable at issuance | Pit boss issues an `entitlement` reward → coupon is immediately available to print via Print button; auto-print may be attempted best-effort, but manual Print remains canonical. Template contains casino name, player name, reward type, face value, match wager (if applicable), validation number (prominent, monospaced), expiry (if applicable), tier, staff name, timestamp |
| **G3**: Print feedback is clear | Operator sees neutral print-attempt feedback when the browser print dialog is invoked, and "Print failed — try again" when the app cannot start printing |
| **G4**: Comp slips and coupons are structurally distinct | Two separate templates, two separate HTML builders, different field layouts per family |
| **G5**: Reprint without re-issuance | Operator can click Print button again to reprint the same artifact without creating a new ledger entry or coupon record |

### 2.3 Non-Goals

- Admin catalog CRUD (Vector A)
- Issuance logic or persistence (Vector B / PRD-052)
- Print history audit logging (P2, requires GAP-C0 migration for `promo_coupon.metadata`)
- Comp-slip print logging schema (no defined persistence path yet)
- QR/barcode on validation numbers (deferred, GAP-C5)
- History-driven reprint surface or print-console workflow (ADR-045 D6)
- Generalized print/document platform (ADR-045 D5)
- PDF generation or server-side rendering
- Thermal printer-specific formatting (pilot uses standard browser print)

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor — issues reward and prints artifact
- **Secondary users:** Wait staff, dealers, cashiers — receive and validate printed artifact (not system users)

**Top Jobs:**

- As a **Pit Boss**, after issuing a meal comp, I need a printed comp slip so the restaurant can verify and honor it.
- As a **Pit Boss**, after issuing a match play coupon, I need a printed coupon with a prominent validation number so the dealer can verify it at the table.
- As a **Pit Boss**, if the first print didn't work (paper jam, wrong printer), I need to reprint without creating a duplicate issuance.

---

## 4. Scope Boundary

### What this PRD authorizes

1. `lib/print/iframe-print.ts` — Core iframe print utility (~80-120 LOC)
2. `lib/print/templates/comp-slip.ts` — Comp slip HTML template builder
3. `lib/print/templates/coupon.ts` — Coupon HTML template builder
4. `lib/print/templates/shared-styles.ts` — Common print CSS (system fonts, `@page` margins)
5. `lib/print/types.ts` — Re-export `FulfillmentPayload` from `@/services/loyalty/dtos` + local `PrintResult` type
6. `lib/print/print-reward.ts` — Dispatch function (discriminate on `family` → template → iframe print)
7. `lib/print/hooks/use-print-reward.ts` — React hook with loading/success/error state
8. Wiring `onFulfillmentReady` handler in `IssueRewardButton` to call print dispatch
9. HTML entity escaping utility for XSS defense-in-depth (SEC Note C1)

### What this PRD does NOT authorize

- Database migrations
- New API endpoints or RPCs
- Modifications to `FulfillmentPayload` types (frozen by PRD-052)
- Any print infrastructure beyond the two pilot templates

---

## 5. Detailed Requirements

### 5.1 Iframe Print Utility (`lib/print/iframe-print.ts`)

| Req | Description |
|-----|-------------|
| R1 | Create a hidden iframe element, append to `document.body` |
| R2 | Write self-contained HTML string into iframe via `iframe.contentDocument.write()` |
| R3 | Wait for rendering readiness (2x `requestAnimationFrame`) |
| R4 | Call `iframe.contentWindow.print()` to trigger browser print dialog |
| R5 | Cleanup: remove iframe from DOM after `afterprint` event or 5-second timeout fallback |
| R6 | Return `PrintResult` indicating success or failure |
| R7 | Must not throw — errors are captured and returned as failure result |

### 5.2 Comp Slip Template (`lib/print/templates/comp-slip.ts`)

| Req | Description |
|-----|-------------|
| R8 | Accepts `CompFulfillmentPayload` as input |
| R9 | Returns self-contained HTML string (inline CSS, no external dependencies) |
| R10 | Displays: casino name (header), player name, reward name, face value (formatted from cents), points redeemed, balance after, staff name ("Issued by"), timestamp, reference number (last 8 chars of `ledger_id` prominent, full UUID in small print) |
| R11 | Layout: generous spacing, system fonts, readable at arm's length |
| R12 | All string fields HTML-entity-escaped before injection |
| R13 | Monetary values divided by 100, formatted as `$XX.XX` |

### 5.3 Coupon Template (`lib/print/templates/coupon.ts`)

| Req | Description |
|-----|-------------|
| R14 | Accepts `EntitlementFulfillmentPayload` as input |
| R15 | Returns self-contained HTML string (inline CSS, no external dependencies) |
| R16 | Displays: casino name (header), player name, reward name, face value (formatted from cents), match wager (if not null, formatted from cents), validation number (prominent, monospaced), expiry (if not null, formatted date), tier basis, staff name ("Issued by"), timestamp |
| R17 | Validation number is the most visually prominent element on the coupon |
| R18 | Layout: generous spacing, system fonts, readable at arm's length |
| R19 | All string fields HTML-entity-escaped before injection |
| R20 | `required_match_wager_cents` renders only when not `null` (match play only) |
| R21 | `expires_at` renders only when not `null` |

### 5.4 Shared Print Styles (`lib/print/templates/shared-styles.ts`)

| Req | Description |
|-----|-------------|
| R22 | System fonts only (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) |
| R23 | `@page` margin rules for consistent print margins |
| R24 | Tolerant of 95-105% browser scaling |
| R25 | `max-width` that fits standard receipt paper (80mm) and standard letter/A4 |

### 5.5 Dispatch Function (`lib/print/print-reward.ts`)

| Req | Description |
|-----|-------------|
| R26 | Accepts `FulfillmentPayload` (discriminated union) |
| R27 | Discriminates on `payload.family` to route to correct template builder |
| R28 | Calls iframe print utility with built HTML string |
| R29 | Returns `PrintResult` |

### 5.6 React Hook (`lib/print/hooks/use-print-reward.ts`)

| Req | Description |
|-----|-------------|
| R30 | Exposes `print(payload: FulfillmentPayload)` function |
| R31 | Tracks state: `idle` | `printing` | `success` | `error` |
| R32 | On successful print-dialog invocation, state transitions to `success` (dialog opened — does not assert physical printing completed) |
| R33 | On error: state transitions to `error` with error message |
| R34 | State resets to `idle` when a new print is initiated |
| R35 | Re-callable for reprint (does not guard against re-invocation) |

### 5.7 Print Invocation Policy (ADR-045 D1A)

| Req | Description |
|-----|-------------|
| R36 | Print is **manual-first**: the Print button in `IssuanceResultPanel` is the canonical trigger |
| R37 | Auto-print on fresh issuance is best-effort only; failure must not block issuance completion |
| R38 | Manual Print button must remain available at all times regardless of auto-print outcome |

### 5.8 Wiring

| Req | Description |
|-----|-------------|
| R39 | `IssueRewardButton.onFulfillmentReady` integrates with the print flow, but implementation must preserve ADR-045 manual-first policy: auto-print on fresh issuance is optional/best-effort only, and the explicit Print button remains the canonical trigger |
| R39A | Print integration must preserve invocation mode semantics: `auto_attempt`, `manual_print`, and `manual_reprint` are distinguishable at the integration boundary even though `FulfillmentPayload` itself remains unchanged |
| R40 | Print button state in `IssuanceResultPanel` reflects hook state (idle/printing/success/error) |

#### Wiring note — invocation source is explicit

`FulfillmentPayload` remains the frozen rendering contract. However, the print integration layer must preserve whether a print request came from:
- fresh issuance auto-attempt (`auto_attempt`)
- explicit Print button click (`manual_print`)
- explicit reprint action (`manual_reprint`)

This prevents manual-first policy from being lost in generic callback wiring.

---

## 6. Consumed Contracts (Frozen — DO NOT MODIFY)

### `CompFulfillmentPayload` (`services/loyalty/dtos.ts:488-503`)

```typescript
interface CompFulfillmentPayload {
  family: 'points_comp';
  ledger_id: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  face_value_cents: number;      // INTEGER CENTS
  points_redeemed: number;
  balance_after: number;
  player_name: string;
  player_id: string;
  casino_name: string;
  staff_name: string;
  issued_at: string;             // ISO 8601
}
```

### `EntitlementFulfillmentPayload` (`services/loyalty/dtos.ts:512-529`)

```typescript
interface EntitlementFulfillmentPayload {
  family: 'entitlement';
  coupon_id: string;
  validation_number: string;
  reward_id: string;
  reward_code: string;
  reward_name: string;
  face_value_cents: number;                   // INTEGER CENTS
  required_match_wager_cents: number | null;
  expires_at: string | null;
  player_name: string;
  player_id: string;
  player_tier: string;
  casino_name: string;
  staff_name: string;
  issued_at: string;                          // ISO 8601
}
```

### `FulfillmentPayload` (`services/loyalty/dtos.ts:536-538`)

```typescript
type FulfillmentPayload = CompFulfillmentPayload | EntitlementFulfillmentPayload;
```

---

## 7. File Structure

```
lib/print/
├── iframe-print.ts           # R1-R7: Core utility
├── types.ts                  # R: Re-export FulfillmentPayload + PrintResult
├── print-reward.ts           # R26-R29: Dispatch by family
├── templates/
│   ├── comp-slip.ts          # R8-R13: Comp slip HTML builder
│   ├── coupon.ts             # R14-R21: Coupon HTML builder
│   └── shared-styles.ts      # R22-R25: Common CSS
└── hooks/
    └── use-print-reward.ts   # R30-R35: React hook
```

---

## 8. Acceptance Criteria

- [ ] **AC1:** After issuing a `points_comp` reward, the operator can print the comp slip via the Print button, and the slip contains all required fields (R10, R36)
- [ ] **AC2:** After issuing an `entitlement` reward, the operator can print the coupon via the Print button, and the coupon contains all required fields with prominent validation number (R16, R17, R36)
- [ ] **AC3:** Successful print-dialog invocation shows neutral print-attempt feedback in the UI; the app does not assert that physical printing completed (R32)
- [ ] **AC4:** If iframe creation or `print()` fails, UI shows error with retry option (R33)
- [ ] **AC5:** Clicking Print button again reprints the same artifact without creating a new issuance record (R35)
- [ ] **AC6:** Comp slips and coupons use separate template builders (R8, R14 — structural distinction per ADR-045 D2)
- [ ] **AC7:** All monetary values display as `$XX.XX` (formatted from integer cents) (R13, R20)
- [ ] **AC8:** All string fields are HTML-entity-escaped (R12, R19 — SEC Note C1)
- [ ] **AC9:** Match play coupon shows required match wager; free play coupon does not (R20)
- [ ] **AC10:** Manual Print button remains available regardless of auto-print outcome (R38)

---

## 9. Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PRD-052 (Loyalty Operator Issuance) | **Shipped** | `FulfillmentPayload` types, `onFulfillmentReady` callback, `IssuanceResultPanel` |
| `services/loyalty/dtos.ts` (frozen types) | **Shipped** | Lines 488-538 |
| `components/loyalty/issuance-result-panel.tsx` | **Shipped** | Assembles payloads, fires callback, has Print button |
| `components/player-360/header/issue-reward-button.tsx` | **Shipped** | `onFulfillmentReady` prop |

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser print dialog inconsistent on floor hardware | Med | System fonts, `@page` margins, generous spacing. Early hardware test recommended. |
| `afterprint` event unreliable across browsers | Low | 5-second timeout fallback for iframe cleanup |
| `queueMicrotask` auto-fire doesn't preserve gesture on some browsers | Med | Manual-first policy (ADR-045 D1A). Auto-print is best-effort. |
| Thermal receipt paper width (80mm) vs standard paper | Low | `max-width` in CSS fits both |

---

## 11. Definition of Done

- [ ] All files in `lib/print/` created per §7 file structure
- [ ] `onFulfillmentReady` handler wired in `IssueRewardButton`
- [ ] Unit tests for template builders (escape coverage, cents formatting, null field handling)
- [ ] Unit tests for iframe print utility (success/failure paths)
- [ ] Manual test: comp slip prints with all required fields
- [ ] Manual test: coupon prints with validation number prominent
- [ ] Manual test: reprint works without re-issuance
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

---

## 12. References

- **ADR-045:** `docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md`
- **RFC:** `docs/02-design/RFC-VECTOR-C-INSTRUMENT-FULFILLMENT.md`
- **Feature Boundary:** `docs/20-architecture/specs/vector-c/FEATURE_BOUNDARY.md`
- **SEC Note:** `docs/20-architecture/specs/vector-c/SEC_NOTE.md`
- **Scaffold:** `docs/01-scaffolds/SCAFFOLD-VECTOR-C-INSTRUMENT-FULFILLMENT.md`
- **Investigation:** `docs/00-vision/loyalty-service-extension/vectors/VECTOR-C/VECTOR-C-INSTRUMENT-FULFILLMENT-INVESTIGATION.md`
- **Fulfillment Policy:** `docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md`
- **Cross-Vector Contracts:** `docs/00-vision/loyalty-service-extension/vectors/VECTOR-CONTRACTS-INTEGRATION-MAP.md`
