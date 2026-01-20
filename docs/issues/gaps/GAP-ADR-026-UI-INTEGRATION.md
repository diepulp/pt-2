---
title: "Gap Analysis: ADR-026 Gaming-Day-Scoped Visits UI Integration"
doc_id: "GAP-ADR-026-UI"
version: "0.2.0"
status: "draft"
date: "2026-01-16"
owner: "VisitService"
related_docs:
  - "docs/80-adrs/ADR-026-gaming-day-scoped-visits.md"
  - "docs/20-architecture/specs/ADR-026/EXECUTION-SPEC-ADR-026-PATCH.md"
  - "docs/issues/rating-slip/GAMING-DAY-CARRYOVER-ISSUE.md"
---

# Gap Analysis: ADR-026 Gaming-Day-Scoped Visits UI Integration

## Executive Summary

ADR-026 implemented gaming-day-scoped visits to fix a compliance issue where the rating slip modal displayed "Total Cash In" amounts from prior gaming days. The **database schema, RPC layer, and service layer** are fully implemented. However, the **UI integration** has gaps that prevent proper display of session continuity and financial breakdown.

This document catalogs three UI gaps discovered during post-implementation validation.

---

## Current State

### Implemented (Backend Complete)

| Component | Location | Status |
|-----------|----------|--------|
| `visit.gaming_day` column | Migration `20260116194341` | ✅ Complete |
| `set_visit_gaming_day()` trigger | Same migration | ✅ Complete |
| Unique partial index | `uq_visit_player_gaming_day_active` | ✅ Complete |
| `rpc_start_or_resume_visit` | Migration `20260116220541` | ✅ Complete |
| BFF RPC gaming_day filter | Migration `20260116220542` | ✅ Complete |
| `VisitService.startVisit()` | `services/visit/crud.ts:206-235` | ✅ Complete |
| `StartVisitResultDTO` | `services/visit/dtos.ts:135-149` | ✅ Complete |
| New slip modal toast | `components/dashboard/new-slip-modal.tsx:213-218` | ✅ Complete |
| Gaming day display in modal | `rating-slip-modal.tsx:509-521` | ✅ Complete |

### Not Implemented (UI + Backend Gaps)

| Gap | Component | Blocking Workflow | Priority |
|-----|-----------|-------------------|----------|
| GAP-1 | Resumed session notification | Staff unaware session is continued | **HIGH** |
| GAP-2 | Adjustment breakdown display | Financial audit trail obscured | MEDIUM |
| GAP-3 | Stale slip gaming day mismatch | Buy-ins disappear, compliance totals wrong | **CRITICAL** |
| GAP-4 | Automated stale visit/slip closure | No safety net for gaming day boundary | **HIGH** |

---

## Why This Worked Before ADR-026

**Pre-ADR-026 BFF RPC** (`rpc_get_rating_slip_modal_data`):
```sql
-- OLD: No gaming_day filter
WHERE pft.visit_id = v_slip.visit_id
  AND pft.casino_id = p_casino_id;
```

**Post-ADR-026 BFF RPC** (migration `20260116220542`):
```sql
-- NEW: Gaming day filter added (defense-in-depth)
WHERE pft.visit_id = v_slip.visit_id
  AND pft.gaming_day = v_visit.visit_gaming_day  -- ADR-026
  AND pft.casino_id = v_context_casino_id;
```

The gaming_day filter was added as "defense-in-depth" per ADR-026 INV-3: "Financial aggregations for 'today' use gaming_day filter". This is correct behavior, but it exposed a gap: **stale slips can be opened directly without visit rollover**.

**Additional Change** (commit `506afda`):
Error logging was removed from `use-save-with-buyin.ts`:
```diff
- console.error("[useSaveWithBuyIn] Financial transaction failed:", err);
+ // (silent)
```

This made debugging harder but is not the root cause.

---

## Gap Details

### GAP-1: "Resumed Session" Notification NOT Displayed in Rating Slip Modal

**ADR-026 Specification** (Section: UI Changes):
```tsx
{modalData.resumed && (
  <div className="p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg text-sm">
    <Info className="h-4 w-4 inline mr-2" />
    Resuming session from earlier today. Existing buy-in: ${totalCashIn}
  </div>
)}
```

**Problem**: When staff opens the rating slip modal for an existing slip on a resumed visit, there's no visual indication that the player was already seated earlier today. Staff cannot tell if the displayed `totalCashIn` includes prior activity.

**Data Flow Analysis**:

```
┌─────────────────────┐    resumed=true    ┌──────────────────┐
│ rpc_start_or_resume │ ─────────────────▶ │ VisitService     │
│ _visit()            │                    │ .startVisit()    │
└─────────────────────┘                    └────────┬─────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │ new-slip-modal   │  ✅ Shows toast
                                           │ .tsx:213-218     │
                                           └──────────────────┘

┌─────────────────────┐   NO resumed flag  ┌──────────────────┐
│ rpc_get_rating_slip │ ─────────────────▶ │ rating-slip-     │  ❌ No notification
│ _modal_data()       │                    │ modal.tsx        │
└─────────────────────┘                    └──────────────────┘
```

**Root Cause**: The `resumed` flag exists in the visit creation flow but is NOT propagated to the BFF RPC that fetches modal data for existing slips.

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `services/rating-slip-modal/dtos.ts` | Add `resumed?: boolean` to `RatingSlipModalDTO` |
| `supabase/migrations/*_bff_*.sql` | Return `resumed` indicator in BFF RPC |
| `components/modals/rating-slip/rating-slip-modal.tsx` | Add notification banner |

**Implementation Options**:

1. **Option A: Visit-level flag** - Add `visit.resumed_at` timestamp, set when resuming. BFF RPC checks if `resumed_at IS NOT NULL`.

2. **Option B: Count-based detection** - BFF RPC counts rating slips for this visit today. If count > 1, session was resumed.

3. **Option C: Query-time detection** - BFF RPC checks if other closed slips exist for same `(player_id, gaming_day)`.

**Recommended**: Option A (cleanest, explicit tracking).

---

### GAP-2: Adjustment Breakdown Not Displayed

**Problem**: `FormSectionCashIn` supports displaying adjustment breakdown (original total, adjustment amount, adjustment count), but the rating slip modal never passes these props.

**Component Interface** (`form-section-cash-in.tsx:22-39`):
```typescript
interface FormSectionCashInProps {
  totalCashIn?: number;          // ✅ Passed
  originalTotal?: number;        // ❌ NOT passed
  adjustmentTotal?: number;      // ❌ NOT passed
  adjustmentCount?: number;      // ❌ NOT passed
  onAdjust?: () => void;         // ✅ Passed
  playerDailyTotal?: number;     // ✅ Passed
}
```

**Actual Call** (`rating-slip-modal.tsx:570-576`):
```tsx
<FormSectionCashIn
  totalCashIn={totalCashIn}
  playerDailyTotal={playerDailyTotalDollars}
  onAdjust={modalData?.player ? handleOpenAdjustmentModal : undefined}
  // MISSING: originalTotal, adjustmentTotal, adjustmentCount
/>
```

**Root Cause**: The RPC `get_visit_cash_in_with_adjustments` exists in `services/player-financial/http.ts:271-309` but is not used by the modal.

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `hooks/player-financial/index.ts` | Export `useVisitCashInWithAdjustments` hook |
| `components/modals/rating-slip/rating-slip-modal.tsx` | Use hook, pass props to `FormSectionCashIn` |

**Implementation**:

```typescript
// Add to rating-slip-modal.tsx
const { data: cashInBreakdown } = useVisitCashInWithAdjustments(
  modalData?.slip.visitId
);

// Then pass to FormSectionCashIn:
<FormSectionCashIn
  totalCashIn={cashInBreakdown?.net_total ?? totalCashIn}
  originalTotal={cashInBreakdown?.original_total}
  adjustmentTotal={cashInBreakdown?.adjustment_total}
  adjustmentCount={cashInBreakdown?.adjustment_count}
  ...
/>
```

---

### GAP-3: Gaming Day Mismatch Causes Buy-Ins to Disappear

**Problem**: When staff opens a stale slip (from a previous gaming day) directly via click, the visit is not rolled over. New buy-ins are recorded with TODAY's gaming_day, but the BFF RPC filters by the VISIT's gaming_day, causing new transactions to be excluded from totals.

**Root Cause Analysis**:

```
Timeline:
┌─────────────────────────────────────────────────────────────────────────┐
│ Gaming Day: 2026-01-15                                                  │
│   └── Visit V1 created (gaming_day = 2026-01-15)                        │
│   └── Rating slip RS1 created, player buys in $500                      │
│   └── Staff goes home, slip left open                                   │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓ midnight cutoff ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ Gaming Day: 2026-01-16                                                  │
│   └── Staff clicks on RS1 directly (bypasses startVisit rollover!)     │
│   └── Modal opens with V1's data (gaming_day = 2026-01-15)              │
│   └── Staff adds buy-in $200                                            │
│   └── Transaction created: gaming_day = 2026-01-16 (via trigger)        │
│   └── BFF RPC filters: pft.gaming_day = 2026-01-15                      │
│   └── New $200 transaction EXCLUDED from totalCashIn!                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Code Path**:

1. **Modal opened directly** (`pit-panels-client.tsx:403-405`):
```typescript
const handleSlipClick = (slipId: string) => {
  openModal("rating-slip", { slipId });  // No startVisit call!
};
```

2. **Buy-in recorded with TODAY's gaming_day** (trigger `set_fin_txn_gaming_day`):
```sql
NEW.gaming_day := compute_gaming_day(NEW.casino_id, COALESCE(NEW.created_at, now()));
```

3. **BFF RPC filters by VISIT's gaming_day** (`20260116220542:232-234`):
```sql
WHERE pft.visit_id = v_slip.visit_id
  AND pft.gaming_day = v_visit.visit_gaming_day  -- Mismatch!
  AND pft.casino_id = v_context_casino_id;
```

**Why This Wasn't Caught Before**:
- ADR-026 was recently implemented
- Pre-ADR-026, there was no gaming_day filter in BFF RPC
- The filter is correct behavior, but missing guard for stale slips

**Secondary Issue**: Error logging was removed in recent refactor:
```diff
- .catch((err) => {
-   console.error("[useSaveWithBuyIn] Financial transaction failed:", err);
-   return null;
- })
+ .catch(() => {
+   // Don't fail the save operation - buy-in recording is best-effort
+   return null;
+ });
```

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `components/modals/rating-slip/rating-slip-modal.tsx` | Detect stale visit, show warning or force rollover |
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Restore error logging, add gaming_day validation |

**Implementation Options**:

1. **Option A: Validate before buy-in** (defensive):
```typescript
// Before recording buy-in, check if visit.gaming_day matches current gaming day
const currentGamingDay = await getCurrentGamingDay(casinoId);
if (modalData.slip.gamingDay !== currentGamingDay) {
  toast.error("Session from previous gaming day", {
    description: "Please close this slip and start a new session for today.",
  });
  return;
}
```

2. **Option B: Auto-rollover on modal open** (proactive):
```typescript
// When opening modal, check if visit needs rollover
useEffect(() => {
  if (modalData && isStaleVisit(modalData.slip.gamingDay)) {
    triggerVisitRollover(modalData.slip.visitId);
  }
}, [modalData]);
```

3. **Option C: Use visit's gaming_day for transaction** (backend fix):
```sql
-- In createFinancialTransaction, pass visit_id's gaming_day explicitly
-- instead of computing from now()
```

4. **Option D: Block actions on stale slips** (strict):
```typescript
// Show read-only mode for stale slips
if (isStaleGamingDay) {
  return <StaleSlipWarning onClose={handleForceClose} />;
}
```

**Recommended**: Option D (most explicit) + restore error logging.

**ADR-026 Invariant Violation**:
- **INV-6**: "Rating slips do not span gaming days: stale visit slips are closed at rollover"
- This invariant is only enforced when `rpc_start_or_resume_visit` is called
- Direct modal access bypasses this enforcement

---

### GAP-4: Automated Stale Visit/Slip Closure (Cron Job)

**Problem**: ADR-026 specified a scheduled cleanup job as a "safety net" for gaming day boundary enforcement, but it was marked as "Optional, Post-MVP" and never implemented. Without this safety net, stale visits/slips remain open indefinitely until explicitly triggered by `rpc_start_or_resume_visit`.

**ADR-026 Specification** (Section: Phase 3 - Cleanup Job):
```sql
-- Scheduled function for safety net (runs per casino)
CREATE FUNCTION close_visits_at_gaming_day_boundary(p_casino_id uuid)
RETURNS void AS $$
DECLARE
  v_current_gaming_day date;
BEGIN
  v_current_gaming_day := compute_gaming_day(p_casino_id, now());

  -- Close stale rating slips first
  UPDATE rating_slip rs
     SET status = 'closed', end_time = now()
   WHERE rs.casino_id = p_casino_id
     AND rs.status IN ('open', 'paused')
     AND rs.visit_id IN (
       SELECT v.id FROM visit v
        WHERE v.casino_id = p_casino_id
          AND v.ended_at IS NULL
          AND v.gaming_day < v_current_gaming_day
     );

  -- Then close visits
  UPDATE visit
     SET ended_at = now()
   WHERE casino_id = p_casino_id
     AND ended_at IS NULL
     AND gaming_day < v_current_gaming_day;
END;
$$ LANGUAGE plpgsql;
```

**Supabase Native Cron Support**:

Supabase includes `pg_cron` extension natively. No external scheduler needed.

```sql
-- Enable pg_cron (already enabled in Supabase by default)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup to run at 6 AM daily (after typical gaming day cutoff)
SELECT cron.schedule(
  'close-stale-visits-and-slips',
  '0 6 * * *',  -- 6:00 AM daily
  $$
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    -- Run for each casino
    FOR r IN SELECT id FROM casino LOOP
      PERFORM close_visits_at_gaming_day_boundary(r.id);
    END LOOP;
  END;
  $$
  $$
);

-- Verify scheduled job
SELECT * FROM cron.job;
```

**Alternative: Per-Casino Scheduling**:

If casinos have different gaming day cutoff times, schedule per casino:

```sql
-- For casino with 6 AM cutoff (America/Los_Angeles)
SELECT cron.schedule(
  'close-stale-casino-abc',
  '0 6 * * *',
  $$SELECT close_visits_at_gaming_day_boundary('casino-abc-uuid')$$
);

-- For casino with 4 AM cutoff (America/New_York)
SELECT cron.schedule(
  'close-stale-casino-xyz',
  '0 4 * * *',
  $$SELECT close_visits_at_gaming_day_boundary('casino-xyz-uuid')$$
);
```

**Files Requiring Changes**:

| File | Change Required |
|------|-----------------|
| `supabase/migrations/YYYYMMDD_adr026_cron_cleanup.sql` | Create function + schedule cron job |

**Implementation Notes**:

1. **Idempotency**: Function is safe to run multiple times (WHERE clauses prevent re-closing)
2. **Audit Trail**: Consider adding audit_log entries for automated closures
3. **Monitoring**: Check `cron.job_run_details` for execution history
4. **RLS Bypass**: Function runs as superuser via cron, bypasses RLS (intentional for cleanup)

**Relationship to GAP-3**:

GAP-4 (cron job) is a **preventive measure** that reduces the likelihood of GAP-3 occurring:
- With cron: Stale slips are closed automatically at boundary → fewer stale slips exist
- Without cron: Stale slips accumulate until staff triggers rollover

Both fixes are recommended:
- GAP-3 fix: UI guard when stale slip IS encountered (defensive)
- GAP-4 fix: Cron job to minimize stale slips (preventive)

---

## Validation Checklist

After implementing fixes, verify:

- [ ] **GAP-1**: Open modal for resumed visit → notification appears
- [ ] **GAP-1**: Open modal for new visit → no notification
- [ ] **GAP-2**: Add adjustment → breakdown shows in FormSectionCashIn
- [ ] **GAP-2**: No adjustments → single total displayed
- [ ] **GAP-3**: Open stale slip (previous gaming day) → warning shown
- [ ] **GAP-3**: Stale slip blocks buy-in until resolved
- [ ] **GAP-3**: After rollover, new buy-ins appear in totalCashIn correctly
- [ ] **GAP-4**: Cron job scheduled in `cron.job` table
- [ ] **GAP-4**: Stale visits/slips auto-closed after gaming day boundary
- [ ] **GAP-4**: Check `cron.job_run_details` for successful execution

## Regression Test Scenario (GAP-3)

To reproduce the bug:

```sql
-- 1. Create a visit from yesterday
INSERT INTO visit (casino_id, player_id, started_at, gaming_day)
VALUES ($casino_id, $player_id, now() - interval '1 day', current_date - 1);

-- 2. Create a rating slip on that visit
INSERT INTO rating_slip (casino_id, visit_id, table_id, status, start_time)
VALUES ($casino_id, $visit_id, $table_id, 'open', now() - interval '1 day');

-- 3. Open modal for this slip (via UI)
-- 4. Add a buy-in of $500
-- 5. Observe: totalCashIn does NOT include the $500

-- Verify transaction exists but is filtered out:
SELECT pft.*, v.gaming_day as visit_gaming_day
FROM player_financial_transaction pft
JOIN visit v ON v.id = pft.visit_id
WHERE pft.visit_id = $visit_id;
-- Shows: pft.gaming_day = today, v.gaming_day = yesterday → MISMATCH
```

---

## ADR-026 Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| New session for new gaming day shows $0 total | ✅ Pass | BFF RPC filters by gaming_day |
| Session within same gaming day is reused with notification | ⚠️ Partial | Reused, but notification only in new-slip-modal |
| Unique constraint prevents duplicate active visits | ✅ Pass | Index `uq_visit_player_gaming_day_active` |
| MTL threshold checks use gaming-day-scoped totals | ✅ Pass | Uses `compute_gaming_day()` |
| `visit_group_id` links related visits | ✅ Pass | Inherited on rollover |
| Existing visits closed on new session start | ✅ Pass | RPC handles closure |
| Regression test reproduces and verifies fix | ⏳ Pending | Need test coverage |

---

## Priority and Timeline

| Gap | Priority | Estimated Effort | Dependency |
|-----|----------|------------------|------------|
| GAP-3 | **CRITICAL** | 4-6 hours | Stale slip detection + UI guard |
| GAP-4 | **HIGH** | 2 hours | Migration only (Supabase pg_cron native) |
| GAP-1 | **HIGH** | 4 hours | Migration + UI |
| GAP-2 | MEDIUM | 2 hours | None |

**Recommended Order**: GAP-4 → GAP-3 → GAP-1 → GAP-2

**Rationale**:
- **GAP-4 first**: Quick win (2 hours), prevents future stale slips from accumulating
- **GAP-3 second**: Handles existing stale slips and edge cases cron misses
- Together they provide defense-in-depth: preventive (cron) + defensive (UI guard)

**GAP-3 Urgency**: This is a **data integrity issue**. Buy-ins recorded on stale slips are:
- Written to database correctly (transaction exists)
- But excluded from BFF aggregation (filter mismatch)
- Causing compliance totals to be incorrect
- CTR/MTL thresholds may be miscalculated

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-16 | Initial gap analysis documenting UI integration issues |
| 0.2.0 | 2026-01-16 | Added GAP-4 (cron job for automated stale closure), upgraded GAP-3 root cause to gaming day mismatch |
