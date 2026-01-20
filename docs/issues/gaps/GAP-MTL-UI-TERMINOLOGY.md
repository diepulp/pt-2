---
title: "Gap Analysis: MTL UI Terminology and Form Integration"
doc_id: "GAP-MTL-UI"
version: "0.1.2"
status: "draft"
date: "2026-01-19"
owner: "MTLService"
related_docs:
  - "docs/00-vision/mtl-service-evolution/MTL-CTR-UX.md"
  - "app/review/mtl-form/mtl-entry-form.tsx"
  - "components/mtl/compliance-dashboard.tsx"
---

# Gap Analysis: MTL UI Terminology and Form Integration

## Executive Summary

The MTL (Multiple Transaction Log) compliance dashboard incorrectly conflates MTL and CTR (Currency Transaction Report) terminology. Per regulatory compliance requirements documented in `MTL-CTR-UX.md`, these are distinct concepts with different threshold semantics:

| Concept | Authority | Threshold | Trigger Condition | Aggregation |
|---------|-----------|-----------|-------------------|-------------|
| **MTL** | House Policy (configurable) | Default $3,000 | Any **single** transaction ≥ threshold | Per-transaction |
| **CTR** | Federal (31 CFR § 1021.311) | >$10,000 | **Aggregate** total per gaming day | Cash-in/cash-out tracked separately |

### Threshold Semantics

**MTL Log Threshold (House Policy)**:
- **Default**: $3,000
- **Condition**: Log any single cash-in or cash-out transaction ≥ $3,000
- **Behavior**: Creates MTL entry row, patron appears in MTL Tracking panel
- **Note**: The system already tracks buy-ins ≥ $3,000 via rating slip workflow

**CTR Threshold (Federal)**:
- **Fixed**: $10,000
- **Condition**: When **aggregate** cash-in OR **aggregate** cash-out totals exceed $10,000 in a gaming day
- **Important**: Cash-in and cash-out are aggregated **separately** (not netted)
- **Behavior**: Triggers CTR filing workflow, shows CTR Required banner

**Critical Distinction**: MTL does NOT "become" a CTR. They coexist. MTL continues logging even after CTR threshold is met (supports AML structuring detection).

The current UI uses "CTR thresholds met" terminology when it should say "MTL thresholds met". Additionally, a new simplified MTL entry form has been developed that needs to replace the existing complex form.

---

## Current State

### Implemented (Correct)

| Component | Location | Status |
|-----------|----------|--------|
| MTL service layer | `services/mtl/` | ✅ Complete |
| Gaming day summary RPC | `hooks/mtl/use-gaming-day-summary.ts` | ✅ Complete |
| MTL entry mutations | `hooks/mtl/use-mtl-mutations.ts` | ✅ Complete |
| CTR banner (at $10k) | `components/mtl/ctr-banner.tsx` | ✅ Correct |
| Append-only transaction log | `components/mtl/entry-list.tsx` | ✅ Complete |

### Incorrect (Terminology Issues)

| Component | Issue | Location |
|-----------|-------|----------|
| Stats card label | "CTR Thresholds Met" | `compliance-dashboard.tsx` |
| Threshold badges | Uses $10k (CTR) instead of $3k (MTL) | `gaming-day-summary.tsx` |
| Entry form | Complex 12-code form vs simplified 2-type form | `mtl-entry-form.tsx` |
| Summary row | Missing patron DOB for disambiguation | `gaming-day-summary.tsx` |
| Approaching badge | Redundant (row only exists after $3k threshold) | `gaming-day-summary.tsx` |

---

## Regulatory Context (per MTL-CTR-UX.md)

### MTL = Internal Control (House Policy)

| Property | Value |
|----------|-------|
| **Authority** | House policy (configurable per casino) |
| **Default Threshold** | $3,000 |
| **Trigger** | Any **single** cash-in or cash-out transaction ≥ threshold |
| **Purpose** | Internal audit log for AML monitoring, structuring detection |

```
MTL is an internal log/control used to record currency activity
when any single transaction ≥ $3k. Monitors for structuring and
ensures CTR-qualifying transactions aren't missed.
```

**UI Implication**: MTL Tracking panel shows patrons who have made a transaction ≥ $3k. This is an internal audit trail. The system already creates MTL entries automatically when buy-ins ≥ $3,000 are recorded via the rating slip workflow.

### CTR = External Filing (Federal Requirement)

| Property | Value |
|----------|-------|
| **Authority** | Federal (31 CFR § 1021.311) |
| **Threshold** | >$10,000 |
| **Trigger** | **Aggregate** cash-in OR cash-out totals exceed threshold per gaming day |
| **Aggregation** | Cash-in and cash-out tracked **separately** (not netted) |

```
CTR is an external regulatory filing required when aggregate cash-in
or aggregate cash-out totals exceed $10,000 in a gaming day.
Cash-in and cash-out are NOT netted against each other.
```

**UI Implication**: CTR banner only appears when aggregate $10k threshold is exceeded. CTR is a separate filing workflow artifact, not part of MTL tracking.

### Key Rule: MTL and CTR Coexist

```
Both are tracked. MTL does not "become" a CTR.
- MTL: Per-transaction logging (single txn ≥ $3k)
- CTR: Aggregate filing trigger (total > $10k per direction)
MTL continues logging even after CTR threshold is met.
```

---

## Gap Details

### GAP-1: Incorrect Stats Card Label

**Problem**: The compliance dashboard stats card displays "CTR Thresholds Met" when it should display "MTL Thresholds Met".

**Current Code** (`components/mtl/compliance-dashboard.tsx`):
```tsx
// Stats card showing threshold count
<StatsCard
  label="CTR Thresholds Met"  // ❌ Incorrect
  value={thresholdMetCount}
  ...
/>
```

**Required Change**:
```tsx
<StatsCard
  label="MTL Thresholds Met"  // ✅ Correct
  value={thresholdMetCount}
  ...
/>
```

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `components/mtl/compliance-dashboard.tsx` | Rename label to "MTL Thresholds Met" |

---

### GAP-2: Wrong Threshold Constants

**Problem**: The UI uses $10,000 (CTR threshold) for badge styling and indicators. MTL tracking should use $3,000 threshold.

**Current Behavior**:
- Red badge at $10,000 (CTR threshold)
- Amber "approaching" badge at $9,000

**Required Behavior**:
- Badge only indicates MTL threshold crossed ($3,000)
- No "approaching" badge (redundant - row only exists after threshold met)
- CTR banner (`ctr-banner.tsx`) remains at $10k (correct)

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `components/mtl/gaming-day-summary.tsx` | Update badge logic for $3k threshold |
| `hooks/mtl/use-threshold-notifications.ts` | Update threshold constants |

**New Form Constants** (from `app/review/mtl-form/mtl-entry-form.tsx`):
```typescript
const THRESHOLD_AMOUNT = 3000;
const APPROACHING_PCT = 0.9;
const APPROACHING_AMOUNT = THRESHOLD_AMOUNT * APPROACHING_PCT; // $2,700
```

---

### GAP-3: Missing Patron DOB in Summary Row

**Problem**: The gaming day summary shows patron name only. Multiple patrons may share names. Adding DOB provides disambiguation for compliance staff.

**Current Display**:
```
John Smith | $3,500 In | $0 Out | [MTL CROSSED]
```

**Required Display**:
```
John Smith (DOB: 03/15/1975) | $3,500 In | $0 Out | [MTL CROSSED]
```

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `components/mtl/gaming-day-summary.tsx` | Add DOB display to patron row |
| `services/mtl/dtos.ts` | Ensure `dateOfBirth` included in summary DTO |

---

### GAP-4: Replace Complex Entry Form with Simplified Form

**Problem**: The existing `components/mtl/mtl-entry-form.tsx` uses 12 transaction type codes per official paper form. The new simplified form at `app/review/mtl-form/mtl-entry-form.tsx` provides a better UX with:

1. Two transaction types only: Chip Purchase (Buy-In) and Chip Redemption (Cash-Out)
2. Visual progress bars showing threshold proximity
3. Optimistic updates with `useOptimistic`
4. Append-only transaction log table
5. Collapsible physical characteristics section

**Current Form** (`components/mtl/mtl-entry-form.tsx`):
- 12 transaction type codes (codes 1-5 cash-in, 6-12 cash-out)
- Complex patron data auto-population
- Required comments field
- CTR warning banner at $9k

**New Form** (`app/review/mtl-form/mtl-entry-form.tsx`):
- 2 transaction types (chip_purchase, chip_redemption)
- Visual running totals with progress bars
- Threshold states: none → approaching ($2,700) → crossed ($3,000)
- Inline transaction log table
- Physical characteristics collapsible section

**Implementation**:

| Action | Details |
|--------|---------|
| Move | `app/review/mtl-form/mtl-entry-form.tsx` → `components/mtl/mtl-entry-form.tsx` |
| Delete | Old `components/mtl/mtl-entry-form.tsx` |
| Update | Imports in consuming components |
| **RETAIN** | `components/mtl/mtl-txn-type-codes.ts` (all 12 codes for future use) |
| Add | Helper function to filter displayed types |

**Transaction Type Strategy: RETAIN ALL 12, DISPLAY 2**

The 12 official paper form codes in `mtl-txn-type-codes.ts` **MUST be retained** for future regulatory compliance and audit requirements. However, the UI currently displays only 2 simplified types for UX purposes.

```typescript
// RETAINED in mtl-txn-type-codes.ts (all 12 codes for future development)
// Cash-In (1-5):
//   1. Purchase of Chips/Tokens (buy_in)
//   2. Front Money Deposit (front_money)
//   3. Safekeeping Deposit (front_money)
//   4. Marker Payment (marker)
//   5. Currency Exchange (chip_fill)
// Cash-Out (6-12):
//   6. Redemption of Chips/Tokens/Tickets (cash_out)
//   7. Front Money Withdrawal (front_money)
//   8. Safekeeping Withdrawal (front_money)
//   9. Marker Issuance (marker)
//   10. Cash from Wire Transfer (cash_out)
//   11. Currency Exchange (chip_fill)
//   12. Jackpot/Tournament Payout (cash_out)

// DISPLAYED in UI (2 simplified types)
const DISPLAYED_TRANSACTION_TYPES = [
  { value: "chip_purchase", label: "Chip Purchase (Buy-In)", direction: "cash_in", mappedCodes: [1] },
  { value: "chip_redemption", label: "Chip Redemption (Cash-Out)", direction: "cash_out", mappedCodes: [6] },
] as const;
```

**Rationale**:
- **Retain 12 codes**: Required for audit trails, regulatory reporting, and future feature expansion (e.g., marker tracking, front money management, jackpot payouts)
- **Display 2 types**: Pit floor UX simplification - most table transactions are buy-ins (code 1) or cash-outs (code 6)
- **Future expansion**: When cage/cashier features are added, additional codes can be surfaced without schema changes

---

### GAP-5: Modal Integration for Dashboard Row Click

**Problem**: When clicking an MTL row in the compliance dashboard, the modal should display the new entry form with the transaction log, not the old form.

**Current Behavior**:
- Click MTL row → Opens old form in modal

**Required Behavior**:
- Click MTL row → Opens modal with:
  1. Player info (name, account, DOB)
  2. Running totals with visual progress bars
  3. New transaction entry form
  4. Append-only transaction log table

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `components/mtl/compliance-dashboard.tsx` | Update modal content to use new form |
| `components/mtl/gaming-day-summary.tsx` | Pass correct props on row click |

---

## Implementation Plan

### Phase 1: Terminology Fixes (Low Risk)

| Task | File | Effort |
|------|------|--------|
| Change "CTR Thresholds Met" → "MTL Thresholds Met" | `compliance-dashboard.tsx` | 5 min |
| Update threshold constants to $3,000 | `use-threshold-notifications.ts` | 15 min |
| Remove "approaching" badge logic | `gaming-day-summary.tsx` | 15 min |

### Phase 2: Summary Row Enhancement

| Task | File | Effort |
|------|------|--------|
| Add patron DOB to summary row | `gaming-day-summary.tsx` | 30 min |
| Ensure DOB in summary DTO | `services/mtl/dtos.ts` | 15 min |

### Phase 3: Form Replacement

| Task | File | Effort |
|------|------|--------|
| Move new form to components/mtl/ | File move | 5 min |
| Delete old form | File delete | 5 min |
| Simplify transaction type codes | `mtl-txn-type-codes.ts` | 30 min |
| Update modal integration | `compliance-dashboard.tsx` | 1 hour |
| Wire up form submission to MTL service | New form | 1 hour |

### Phase 4: Validation

| Test | Expected Result |
|------|-----------------|
| Stats card label | Shows "MTL Thresholds Met" |
| Threshold badge | Appears at $3,000, not $10,000 |
| No approaching badge | Badge only shows "CROSSED" state |
| Patron row | Shows DOB next to name |
| Row click | Opens modal with new form |
| CTR banner | Only appears when $10k exceeded |
| Form submission | Creates MTL entry with correct direction |

---

## Files Affected Summary

| File | Action | Priority |
|------|--------|----------|
| `components/mtl/compliance-dashboard.tsx` | Edit labels, modal integration | HIGH |
| `components/mtl/gaming-day-summary.tsx` | Edit badges, add DOB | HIGH |
| `components/mtl/mtl-entry-form.tsx` | Replace with new form | HIGH |
| `components/mtl/mtl-txn-type-codes.ts` | **RETAIN all 12 codes**, add `getDisplayedTypes()` helper | MEDIUM |
| `hooks/mtl/use-threshold-notifications.ts` | Update constants | MEDIUM |
| `services/mtl/dtos.ts` | Ensure DOB in DTO | LOW |
| `components/mtl/ctr-banner.tsx` | No change (keep at $10k) | NONE |

---

## Definition of Done

- [ ] Stats card displays "MTL Thresholds Met" (not CTR)
- [ ] Threshold badges use $3,000 (MTL) not $10,000 (CTR)
- [ ] No "approaching" badge displayed (row exists = threshold crossed)
- [ ] Patron DOB displayed in summary row for disambiguation
- [ ] New simplified form replaces old 12-code form
- [ ] Click MTL row → modal shows new form with transaction log
- [ ] CTR banner only appears when $10k threshold exceeded
- [ ] Form submission creates MTL entry with correct direction
- [ ] All terminology in MTL Tracking panel refers to MTL, not CTR

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-19 | Initial gap analysis for MTL UI terminology and form integration |
| 0.1.1 | 2026-01-19 | Clarified threshold semantics: MTL is per-transaction (single txn ≥ $3k, house policy), CTR is aggregate (total > $10k, federal). Noted system already tracks buy-ins ≥ $3k via rating slip workflow. |
| 0.1.2 | 2026-01-19 | GAP-4 clarification: RETAIN all 12 transaction type codes in `mtl-txn-type-codes.ts` for future regulatory/audit needs; DISPLAY only 2 simplified types in UI (chip_purchase, chip_redemption). Added `mappedCodes` mapping and rationale. |
