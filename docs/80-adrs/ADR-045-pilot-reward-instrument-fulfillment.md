---
id: ADR-045
title: Pilot Reward Instrument Fulfillment Standard
status: Accepted
date: 2026-03-19
deciders: [agent, product-owner]
affects: [LoyaltyService]
references:
  - docs/00-vision/loyalty-service-extension/REWARD_FULFILLMENT_POLICY.md
  - docs/00-vision/loyalty-service-extension/vectors/VECTOR-C/VECTOR-C-INSTRUMENT-FULFILLMENT-INVESTIGATION.md
  - docs/02-design/RFC-VECTOR-C-INSTRUMENT-FULFILLMENT.md
  - docs/20-architecture/specs/vector-c/SEC_NOTE.md
---

# ADR-045: Pilot Reward Instrument Fulfillment Standard

## Context

The loyalty pilot issues two families of player-facing rewards: `points_comp` (comp slips) and `entitlement` (coupons). Each requires a printed physical artifact for downstream custody validation — wait staff, dealers, cashiers must inspect and honor the instrument. The system currently has zero printing infrastructure.

Vector B shipped the complete issuance pipeline including frozen `FulfillmentPayload` types (`services/loyalty/dtos.ts:488-538`), the `onFulfillmentReady` callback chain, and auto-fire on fresh issuance. Vector C must deliver the print rendering mechanism.

## Decision

### D1: Hidden iframe + `window.print()` for print rendering

The system uses a hidden iframe injected with self-contained HTML to render print content, then calls `iframe.contentWindow.print()` to trigger the browser print dialog.

**Rationale:**
- Avoids `window.open()` popup risk (iframe is same-origin, not subject to popup blocking)
- Strong style isolation through a self-contained iframe document (no app CSS leakage)
- Zero dependencies (pure browser API)
- Proven pattern in web POS/receipt printing systems
- Simple cleanup (remove iframe element after `afterprint` event or timeout)

**Rejected alternatives:**
- `window.open()` — popup blocker risk on managed casino floor browsers
- Server-side PDF — over-engineers a pilot with two templates; reserved as exit ramp
- `react-to-print` — unnecessary dependency; imperfect style isolation

### D1A: Manual-first print invocation policy

Print is **manual-first**. The operator-triggered Print button is the canonical path. Auto-print on fresh issuance may be attempted only as a best-effort optimization where browser behavior preserves the originating user gesture; failure of auto-print must not block issuance completion or remove access to manual print.

**Rationale:**
- Browser print behavior can vary across engines and managed floor hardware
- `queueMicrotask()`-based auto-fire is not a sufficiently strong guarantee of preserved gesture semantics
- Manual print keeps the floor workflow deterministic

### D2: Separate per-family templates, shared print path at rendering layer only

Comp slips and coupons use **separate template builders** (`buildCompSlipHtml`, `buildCouponHtml`) that produce structurally distinct HTML documents. A shared CSS base (`shared-styles.ts`) and a shared iframe print utility (`iframe-print.ts`) provide the constrained rendering path.

**Rationale (per `REWARD_FULFILLMENT_POLICY.md`):**
- `points_comp` and `entitlement` are structurally distinct families with different fields, custody chains, and operational semantics
- Shared rendering infrastructure (CSS, iframe utility) is explicitly allowed at the fulfillment layer
- Collapsing them into one template with conditional sections would violate the domain model

**Invariant:** The `FulfillmentPayload` discriminated union (`family: 'points_comp' | 'entitlement'`) routes to the correct template. No template ever handles both families.

Template builders consume the frozen `FulfillmentPayload` contracts directly. Monetary fields are integer cents (`*_cents`) and must be formatted for display at the template layer.

### D3: `ledger_id` (UUID) as comp slip reference number

Comp slips use `loyalty_ledger.id` (UUID) as the traceable reference number. Templates display a truncated form (last 8 characters) with the full UUID available in smaller print.

**Rationale:**
- Already present in the frozen `CompFulfillmentPayload`
- Unique, immutable, server-generated
- No additional reference number generation system needed
- Human-readable short form (last 8 chars) sufficient for floor use

### D4: `internal_adjustment` family does not print

The `internal_adjustment` family (admin corrections, reconciliation entries) produces no printed artifact. Print is for custody-validated instruments only.

**Rationale:** Per `REWARD_FULFILLMENT_POLICY.md` — if no downstream actor must inspect and honor the instrument, print adds no value. The `FulfillmentPayload` union does not include an `internal_adjustment` variant; this family never reaches the print path.

### D5: No generalized print/document platform

This ADR authorizes a constrained pilot print surface for two instrument types only. It does NOT authorize:
- A template registry or versioning system
- A printer fleet abstraction
- A generic rendering engine
- Extensibility beyond `points_comp` and `entitlement`

New instrument types require a new ADR decision before the print path is extended.

### D6: Reprint remains pilot-constrained

This ADR authorizes initial print plus minimal/manual reprint only. It does not authorize a generalized history-driven reprint surface, print-console workflow, or broader print-management UX.

**Rationale:**
- Minimal reprint is sufficient for pilot operations
- History-based reprint introduces additional persistence, retrieval, and audit concerns
- Prevents accidental expansion into a document platform by stealth

## Consequences

### Positive
- Floor can complete custody handoff for both reward families using browser print
- Zero server-side dependencies for print rendering (pure client-side)
- Clean rollback: delete `lib/print/`, remove handler wiring
- Exit ramp to server-side PDF preserved (payload contracts unchanged)

### Negative
- Print quality depends on browser/OS/printer combination (mitigated by system fonts + `@page` margins)
- Print audit is incomplete for the pilot: coupon print history requires `promo_coupon.metadata` (GAP-C0), and comp-slip print logging still lacks a defined persistence path/schema. Core printing is non-blocking with respect to both gaps.
- `ledger_id` UUID is not human-memorable (mitigated by truncated display)

### Neutral
- No SRM ownership changes (LoyaltyService already owns fulfillment sub-domain)
- No new database tables, RPCs, or RLS policies for core print
- No new API endpoints

## Compliance

- **Over-Engineering Guardrail:** Compliant. ~400-500 LOC for two templates + utility. No abstractions beyond what's needed.
- **REWARD_FULFILLMENT_POLICY.md:** Compliant. Structural distinction preserved. Shared path at rendering layer only.
- **SEC Note:** Reviewed. XSS mitigated via `escapeHtml()`. All print data is transient (iframe DOM destroyed after print).
