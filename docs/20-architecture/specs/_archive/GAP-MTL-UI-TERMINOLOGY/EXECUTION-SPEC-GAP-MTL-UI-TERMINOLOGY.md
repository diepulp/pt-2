---
prd: GAP-MTL-UI
prd_title: "MTL UI Terminology and Form Integration"
version: "1.0.0"
date: "2026-01-19"
owner: MTLService
status: draft
service: MTLService
bounded_contexts:
  - MTLService
  - Frontend

workstreams:
  WS1:
    name: "Stats Card Terminology Fix"
    type: react-components
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - "components/mtl/compliance-dashboard.tsx (edited)"
    gate: type-check

  WS2:
    name: "Badge Display Updates for MTL Threshold"
    type: react-components
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - "components/mtl/gaming-day-summary.tsx (edited)"
    gate: type-check

  WS3:
    name: "DOB Display in Gaming Day Summary"
    type: database
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - "supabase/migrations/YYYYMMDDHHMMSS_add_patron_dob_to_mtl_gaming_day_summary.sql"
      - "services/mtl/selects.ts (edited)"
      - "services/mtl/dtos.ts (edited)"
      - "components/mtl/gaming-day-summary.tsx (edited)"
    gate: schema-validation

  WS4:
    name: "Form Replacement with Simplified Entry Form"
    type: react-components
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - "components/mtl/mtl-entry-form.tsx (replaced)"
      - "components/mtl/mtl-txn-type-codes.ts (edited)"
    gate: type-check

  WS5:
    name: "Modal Integration for New Form"
    type: react-components
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS4]
    outputs:
      - "components/mtl/compliance-dashboard.tsx (edited)"
    gate: build

execution_phases:
  - name: "Phase 1 - Foundation Work"
    phase: 1
    parallel: [WS1, WS2, WS3, WS4]
    gate: type-check
  - name: "Phase 2 - Integration"
    phase: 2
    parallel: [WS5]
    gate: build

gates:
  schema-validation:
    command: "npm run db:types"
    success_criteria: "Exit 0, types regenerated successfully"
  type-check:
    command: "npm run type-check"
    success_criteria: "Exit 0, no type errors"
  build:
    command: "npm run build"
    success_criteria: "Exit 0, no build errors"
---

# EXECUTION-SPEC: GAP-MTL-UI-TERMINOLOGY

## Overview

This execution spec addresses the MTL UI terminology and form integration gaps identified in `docs/issues/gaps/GAP-MTL-UI-TERMINOLOGY.md`.

**Key Changes:**
1. Fix terminology: "CTR Thresholds Met" → "MTL Thresholds Met"
2. Update badge logic to reflect MTL ($3,000) thresholds vs CTR ($10,000)
3. Add patron DOB to gaming day summary for disambiguation
4. Replace complex 12-code form with simplified 2-type form
5. Wire up modal integration for new form

**Regulatory Context:**
- **MTL**: Internal log for any single transaction ≥ $3,000 (house policy, per-transaction)
- **CTR**: External filing when aggregate > $10,000 (federal, per gaming day)

---

## Workstream Details

### WS1: Stats Card Terminology Fix

**Executor**: `frontend-design-pt-2`

**Problem**: The compliance dashboard stats card displays "CTR Thresholds Met" when showing patrons who have crossed MTL thresholds.

**File**: `components/mtl/compliance-dashboard.tsx`

**Changes Required**:

1. **Line 246**: Change stats card label
```tsx
// BEFORE
<StatCard
  title="CTR Thresholds Met"
  ...

// AFTER
<StatCard
  title="MTL Thresholds Met"
  ...
```

2. **Lines 104-112**: Update stats calculation to count MTL threshold crossings
```tsx
// BEFORE - counts CTR ($10k aggregate)
const ctrInCount = items.filter(
  (s) => s.agg_badge_in === "agg_ctr_met",
).length;
const ctrOutCount = items.filter(
  (s) => s.agg_badge_out === "agg_ctr_met",
).length;

// AFTER - count patrons with ANY MTL-triggering activity (row exists = MTL threshold met)
// Note: A row in gaming_day_summary means at least one transaction ≥ $3k occurred
const mtlThresholdMetCount = items.length; // All patrons in MTL tracking
// Keep CTR counts for reference in description
const ctrInCount = items.filter(
  (s) => s.agg_badge_in === "agg_ctr_met",
).length;
const ctrOutCount = items.filter(
  (s) => s.agg_badge_out === "agg_ctr_met",
).length;
```

3. **Update stats object**:
```tsx
return {
  mtlThresholdMetCount,
  ctrInCount,
  ctrOutCount,
  totalCtr: ctrInCount + ctrOutCount,
  totalPatrons,
  totalVolume,
};
```

4. **Update StatCard usage**:
```tsx
<StatCard
  title="MTL Thresholds Met"
  value={stats.mtlThresholdMetCount}
  description={`${stats.totalCtr > 0 ? `${stats.totalCtr} CTR triggers` : "No CTR triggers"}`}
  variant={stats.totalCtr > 0 ? "danger" : "default"}
/>
```

**Gate**: `npm run type-check`

---

### WS2: Badge Display Updates for MTL Threshold

**Executor**: `frontend-design-pt-2`

**Problem**: The UI badges focus on CTR ($10k) thresholds when the MTL Tracking panel should emphasize MTL ($3k) thresholds.

**File**: `components/mtl/gaming-day-summary.tsx`

**Changes Required**:

1. **Add MTL threshold indicator column** - Since a row exists only when MTL threshold is met (≥$3k transaction), every row implicitly has "MTL CROSSED" status. The current agg_badge system tracks CTR thresholds (correct for CTR filing).

2. **Update row styling** - Per GAP-2: "No approaching badge (redundant - row only exists after threshold met)"
   - Remove any "approaching" badge logic
   - Keep CTR alert banner for compliance (correct at $10k)

3. **Add MTL indicator badge** to show that MTL threshold was crossed:
```tsx
// Add a simple "MTL" indicator for all rows (since row existence = MTL threshold met)
// Keep existing agg_badge for CTR tracking
<TableCell>
  <div className="flex flex-col items-center gap-1">
    <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      MTL
    </Badge>
    <AggBadgePair
      badgeIn={summary.agg_badge_in}
      badgeOut={summary.agg_badge_out}
      size="sm"
    />
  </div>
</TableCell>
```

4. **Update table header** from "Badges" to "Status":
```tsx
<TableHead className="text-center">Status</TableHead>
```

**Gate**: `npm run type-check`

---

### WS3: DOB Display in Gaming Day Summary

**Executor**: `backend-service-builder`

**Problem**: Multiple patrons may share names. Adding DOB provides disambiguation for compliance staff.

**Files**:
- `supabase/migrations/YYYYMMDDHHMMSS_add_patron_dob_to_mtl_gaming_day_summary.sql`
- `services/mtl/selects.ts`
- `services/mtl/dtos.ts`
- `components/mtl/gaming-day-summary.tsx`

**Migration** (new file):
```sql
-- =====================================================
-- Migration: Add patron DOB to MTL Gaming Day Summary
-- Created: 2026-01-19
-- Purpose: Include patron date_of_birth for compliance disambiguation
-- References: GAP-MTL-UI-TERMINOLOGY, PRD-005
-- =====================================================

BEGIN;

-- Drop and recreate view to add date_of_birth column
DROP VIEW IF EXISTS mtl_gaming_day_summary;

CREATE VIEW mtl_gaming_day_summary AS
SELECT
  e.casino_id,
  e.patron_uuid,
  p.first_name AS patron_first_name,
  p.last_name AS patron_last_name,
  p.date_of_birth AS patron_date_of_birth,
  e.gaming_day,
  -- Cash-in aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE 0 END), 0) AS total_in,
  COUNT(CASE WHEN e.direction = 'in' THEN 1 END) AS count_in,
  MAX(CASE WHEN e.direction = 'in' THEN e.amount END) AS max_single_in,
  MIN(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS first_in_at,
  MAX(CASE WHEN e.direction = 'in' THEN e.occurred_at END) AS last_in_at,
  -- Cash-out aggregates
  COALESCE(SUM(CASE WHEN e.direction = 'out' THEN e.amount ELSE 0 END), 0) AS total_out,
  COUNT(CASE WHEN e.direction = 'out' THEN 1 END) AS count_out,
  MAX(CASE WHEN e.direction = 'out' THEN e.amount END) AS max_single_out,
  MIN(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS first_out_at,
  MAX(CASE WHEN e.direction = 'out' THEN e.occurred_at END) AS last_out_at,
  -- Overall
  COALESCE(SUM(e.amount), 0) AS total_volume,
  COUNT(*) AS entry_count
FROM mtl_entry e
LEFT JOIN player p ON e.patron_uuid = p.id
WHERE e.gaming_day IS NOT NULL
GROUP BY e.casino_id, e.patron_uuid, p.first_name, p.last_name, p.date_of_birth, e.gaming_day;

COMMENT ON VIEW mtl_gaming_day_summary IS
  'Aggregates MTL entries per patron per gaming day with patron names and DOB. Uses occurred_at for timestamps. Authoritative surface for Tier 2 compliance badges (CTR/AML).';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;
```

**Update selects.ts**:
```typescript
export const MTL_GAMING_DAY_SUMMARY_SELECT = `
  casino_id,
  patron_uuid,
  patron_first_name,
  patron_last_name,
  patron_date_of_birth,
  gaming_day,
  total_in,
  count_in,
  max_single_in,
  first_in_at,
  last_in_at,
  total_out,
  count_out,
  max_single_out,
  first_out_at,
  last_out_at,
  total_volume,
  entry_count
` as const;
```

**Update dtos.ts** - Add field to `MtlGamingDaySummaryDTO`:
```typescript
export interface MtlGamingDaySummaryDTO {
  casino_id: string;
  patron_uuid: string;
  patron_first_name: string | null;
  patron_last_name: string | null;
  patron_date_of_birth: string | null;  // NEW FIELD
  gaming_day: string;
  // ... rest unchanged
}
```

**Update gaming-day-summary.tsx** - Display DOB in patron cell:
```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <User className="h-4 w-4 text-muted-foreground" />
    <div className="flex flex-col">
      <span className="text-sm font-medium truncate max-w-[150px]">
        {summary.patron_first_name && summary.patron_last_name
          ? `${summary.patron_first_name} ${summary.patron_last_name}`
          : "Unknown Player"}
      </span>
      {summary.patron_date_of_birth && (
        <span className="text-xs text-muted-foreground">
          DOB: {format(new Date(summary.patron_date_of_birth), "MM/dd/yyyy")}
        </span>
      )}
      <span className="font-mono text-xs text-muted-foreground">
        {summary.patron_uuid.slice(0, 8)}
      </span>
    </div>
  </div>
</TableCell>
```

**Gate**: `npm run db:types` then `npm run type-check`

---

### WS4: Form Replacement with Simplified Entry Form

**Executor**: `frontend-design-pt-2`

**Problem**: The existing form uses 12 transaction type codes per official paper form. A new simplified form exists with better UX (2 types, progress bars, optimistic updates).

**Files**:
- `components/mtl/mtl-entry-form.tsx` (replace content)
- `components/mtl/mtl-txn-type-codes.ts` (add helper function)

**Strategy**:
1. **RETAIN** all 12 transaction codes in `mtl-txn-type-codes.ts` for future regulatory use
2. **ADD** `getDisplayedTypes()` helper that returns only 2 types for current UI
3. **MOVE** simplified form logic from `app/review/mtl-form/mtl-entry-form.tsx` to `components/mtl/mtl-entry-form.tsx`
4. **INTEGRATE** with existing MTL service hooks

**Update mtl-txn-type-codes.ts** - Add helper:
```typescript
// Simplified transaction types for pit floor UX
// Maps to official codes: chip_purchase → code 1, chip_redemption → code 6
export const DISPLAYED_TRANSACTION_TYPES = [
  {
    value: "chip_purchase" as const,
    label: "Chip Purchase (Buy-In)",
    direction: "cash_in" as const,
    mappedCode: 1  // Maps to MTL paper form code 1
  },
  {
    value: "chip_redemption" as const,
    label: "Chip Redemption (Cash-Out)",
    direction: "cash_out" as const,
    mappedCode: 6  // Maps to MTL paper form code 6
  },
] as const;

export type DisplayedTransactionType = typeof DISPLAYED_TRANSACTION_TYPES[number]['value'];

/**
 * Get transaction types displayed in the UI (simplified 2-type UX).
 * All 12 official codes are retained in MTL_TXN_TYPE_CODES for future use.
 */
export function getDisplayedTypes() {
  return DISPLAYED_TRANSACTION_TYPES;
}
```

**Replace mtl-entry-form.tsx**:
The new form should:
1. Use 2 simplified transaction types from `getDisplayedTypes()`
2. Include visual progress bars showing threshold proximity ($3k MTL)
3. Support optimistic updates with `useOptimistic`
4. Include append-only transaction log table
5. Include collapsible physical characteristics section
6. Wire to existing `useCreateMtlEntry()` mutation
7. Accept `PatronData` prop for auto-population

**Key Props**:
```typescript
export interface MtlEntryFormProps {
  casinoId: string;
  staffId: string;
  patron?: PatronData;
  visitId?: string;
  ratingSlipId?: string;
  gamingDay: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}
```

**Gate**: `npm run type-check`

---

### WS5: Modal Integration for New Form

**Executor**: `frontend-design-pt-2`

**Dependencies**: WS4 (form replacement must be complete)

**Problem**: When clicking an MTL row in the compliance dashboard, the modal should display the new entry form with the transaction log.

**File**: `components/mtl/compliance-dashboard.tsx`

**Changes Required**:

1. **Update Dialog content** to show patron info header + new form:
```tsx
<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
  <DialogHeader>
    <DialogTitle>MTL Entry - {selectedPatron?.name}</DialogTitle>
    <DialogDescription>
      Multiple Transaction Log entry for {gamingDay}
    </DialogDescription>
  </DialogHeader>
  <MtlEntryForm
    casinoId={casinoId}
    staffId={staffId}
    patron={selectedPatron ? {
      id: selectedPatron.uuid,
      firstName: /* from summary data */,
      lastName: /* from summary data */,
      dateOfBirth: /* from summary data (after WS3) */,
    } : undefined}
    gamingDay={gamingDay}
    onSuccess={() => setNewEntryDialogOpen(false)}
    onCancel={() => setNewEntryDialogOpen(false)}
  />
</DialogContent>
```

2. **Add row click handler** that opens modal with patron context:
```tsx
const handlePatronClick = (summary: MtlGamingDaySummaryDTO) => {
  setSelectedPatron({
    uuid: summary.patron_uuid,
    name: `${summary.patron_first_name ?? ''} ${summary.patron_last_name ?? ''}`.trim() || 'Unknown',
  });
  setSelectedPatronData(summary); // Store full summary for form props
  setNewEntryDialogOpen(true);
};
```

3. **Add state for selected patron data**:
```tsx
const [selectedPatronData, setSelectedPatronData] = useState<MtlGamingDaySummaryDTO | null>(null);
```

**Gate**: `npm run build`

---

## Execution Phases

### Phase 1: Parallel Foundation Work
**Workstreams**: WS1, WS2, WS3, WS4 (all parallel)
**Gate**: `npm run type-check`

These workstreams have no dependencies on each other and can be executed concurrently.

### Phase 2: Integration
**Workstreams**: WS5
**Dependencies**: WS4 (form replacement)
**Gate**: `npm run build`

The modal integration requires the new form to be in place.

---

## Definition of Done

- [ ] Stats card displays "MTL Thresholds Met" (not CTR)
- [ ] MTL badge/indicator shows threshold crossed ($3,000)
- [ ] CTR badges continue to show for $10,000 aggregate thresholds
- [ ] No redundant "approaching" badge displayed
- [ ] Patron DOB displayed in summary row for disambiguation
- [ ] New simplified form replaces old 12-code form
- [ ] All 12 transaction codes retained in mtl-txn-type-codes.ts
- [ ] getDisplayedTypes() helper returns 2 simplified types
- [ ] Click MTL row → modal shows new form
- [ ] Form submission creates MTL entry with correct direction
- [ ] CTR banner only appears when $10k threshold exceeded
- [ ] All quality gates pass (type-check, lint, build)
- [ ] No regressions in existing tests

---

## Files Affected Summary

| File | Action | Workstream |
|------|--------|------------|
| `components/mtl/compliance-dashboard.tsx` | Edit | WS1, WS5 |
| `components/mtl/gaming-day-summary.tsx` | Edit | WS2, WS3 |
| `components/mtl/mtl-entry-form.tsx` | Replace | WS4 |
| `components/mtl/mtl-txn-type-codes.ts` | Edit | WS4 |
| `services/mtl/dtos.ts` | Edit | WS3 |
| `services/mtl/selects.ts` | Edit | WS3 |
| `supabase/migrations/YYYYMMDDHHMMSS_*.sql` | Create | WS3 |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DOB view migration fails | Medium | Test in dev environment first; view is idempotent |
| Form replacement breaks existing flows | High | Keep old form backup; test modal integration thoroughly |
| Badge terminology confuses users | Low | Document changes in release notes |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-19 | Initial EXECUTION-SPEC |
