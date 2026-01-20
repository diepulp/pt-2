# MTL UI Implementation Gap Analysis

**Status:** Analysis In Progress
**Date:** 2026-01-16 (Updated)
**Category:** V&S (Vision & Strategy)
**Reference:** MTL-INTEGRATION-ROADMAP-AMENDED.md
**Version:** 1.1 - Added threshold notification gaps (2.4-2.6)

---

## Executive Summary

The MTL (Monetary Transaction Log) service has a **fully implemented service layer** but a **read-only UI** with significant gaps in data input workflows and real-time compliance feedback. The compliance dashboard can display and annotate existing MTL entries, but lacks:

1. **Manual entry form** for pit boss to create MTL entries
2. **Automated derivation** from `player_financial_transaction` to `mtl_entry`
3. **Real-time threshold notifications** during buy-in entry (warning at $2,500, watchlist at $3,000)
4. **CTR notification banner** when transactions exceed $10,000
5. **Cumulative daily total display** in rating slip modal

**Key Finding:** Buy-ins logged via rating slips create `player_financial_transaction` records but **do not** automatically create `mtl_entry` records. Manual SQL inserts to `mtl_entry` are correctly displayed in the compliance dashboard, confirming the read path is functional.

---

## 1. Current Implementation Status

### 1.1 Service Layer (COMPLETE)

| Component | Status | Location |
|-----------|--------|----------|
| DTOs & Schemas | Complete | `services/mtl/dtos.ts`, `schemas.ts` |
| CRUD Operations | Complete | `services/mtl/crud.ts` |
| Mappers & Badge Logic | Complete | `services/mtl/mappers.ts` |
| API Routes | Complete | `app/api/v1/mtl/**` |
| React Query Hooks | Complete | `hooks/mtl/use-*.ts` |
| Database Schema | Complete | `mtl_entry`, `mtl_audit_note`, `mtl_gaming_day_summary` |
| RLS Policies | Complete | ADR-025 compliant |
| Append-Only Enforcement | Complete | RLS + REVOKE + BEFORE triggers |

**Key Service Files:**

- `services/mtl/index.ts` - Service factory (`createMtlService`)
- `services/mtl/http.ts` - Client-side HTTP fetchers
- `services/mtl/keys.ts` - React Query key factory
- `hooks/mtl/use-mtl-mutations.ts` - `useCreateMtlEntry`, `useCreateMtlAuditNote`
- `hooks/mtl/use-mtl-entries.ts` - `useMtlEntries`, `useMtlEntry`
- `hooks/mtl/use-gaming-day-summary.ts` - `useGamingDaySummary`

### 1.2 UI Components (READ-ONLY)

| Component | Status | Purpose |
|-----------|--------|---------|
| `compliance-dashboard.tsx` | Complete | Main dashboard with drilldown |
| `gaming-day-summary.tsx` | Complete | Daily aggregates (COMPLIANCE AUTHORITY) |
| `entry-list.tsx` | Complete | List patron's entries |
| `entry-detail.tsx` | Complete | Entry detail with notes |
| `entry-badge.tsx` | Complete | Tier 1 badge (per-entry) |
| `agg-badge.tsx` | Complete | Tier 2 badge (aggregate) |
| `audit-note-form.tsx` | Complete | Add notes to **existing** entries |

**Component Location:** `components/mtl/`

### 1.3 Database Schema

**Tables:**
- `mtl_entry` - Immutable transaction ledger
- `mtl_audit_note` - Append-only compliance annotations

**View:**
- `mtl_gaming_day_summary` - Per-patron daily aggregates (COMPLIANCE AUTHORITY)

**Enums:**
- `mtl_txn_type`: `buy_in`, `cash_out`, `marker`, `front_money`, `chip_fill`
- `mtl_source`: `table`, `cage`, `kiosk`, `other`

---

## 2. UI Implementation Gaps

### 2.1 Gap: No Manual MTL Entry Form

**Roadmap Requirement (Phase 1):**
> "Manual MTL entry endpoint + UI entry form"
> Definition of Done: "Manual entry requires note + staff attribution"

**Current State:**
- API endpoint exists: `POST /api/v1/mtl/entries`
- Mutation hook exists: `useCreateMtlEntry()`
- **MISSING:** `<MtlEntryForm>` component

**Impact:** Pit boss cannot log late/missing transactions or make manual corrections through the UI.

**Use Cases Blocked:**
1. Late entry (telemetry arrived after transaction)
2. Manual correction (system missed a transaction)
3. Cash-out at cage not captured by table telemetry
4. Non-rated player transactions

### 2.2 Gap: No Automated Derivation from Financial Transactions

**Roadmap Requirement (Section 5):**
> "DB-atomic derivation (RPC or trigger)" to create `mtl_entry` from eligible `player_financial_transaction`

**Eligible Transaction Filter (per Section 4):**
```
channel == 'pit' AND is_currency == true AND txn_type IN ('chip_purchase', 'chip_redemption')
```

**Direction Mapping:**
- `chip_purchase` → `cash_in`
- `chip_redemption` → `cash_out`

**Current State:**
- `fn_bridge_finance_to_telemetry` exists (creates `table_buyin_telemetry`)
- **MISSING:** Trigger/RPC that creates `mtl_entry` from `player_financial_transaction`

**Impact:** Financial transactions from rating slip buy-ins don't automatically populate MTL compliance ledger.

### 2.3 Gap: No Rating Slip → MTL Integration

**Roadmap Context:**
> "Rating slip UI is where txns are entered"

**Current Flow:**
```
Rating Slip Buy-In → player_financial_transaction → table_buyin_telemetry
```

**Required Flow:**
```
Rating Slip Buy-In → player_financial_transaction → mtl_entry (derived)
```

**Gap Location:** No bridge function between `player_financial_transaction` and `mtl_entry`.

### 2.4 Gap: No Real-Time Threshold Notifications in Rating Slip UI

**Requirement:**
When pit boss enters a buy-in amount in the rating slip modal, the system should provide real-time feedback about approaching compliance thresholds.

**Current State:**
- `use-save-with-buyin.ts` records buy-in without threshold awareness
- No visual warning when amounts approach watchlist ($3,000) or CTR ($10,000) thresholds
- Toast system exists (Sonner) but only used for error notifications
- Threshold constants exist in `services/mtl/mappers.ts` but not consumed by rating slip UI

**Required Notification Tiers:**

| Threshold | Amount | Notification Type | Action |
|-----------|--------|-------------------|--------|
| **Warning** | ≥ $2,500 | Toast (warning) | "Approaching MTL watchlist threshold ($3,000)" |
| **Watchlist Met** | ≥ $3,000 | Toast (info) + Auto-create MTL | "MTL entry created - watchlist threshold met" |
| **CTR Near** | ≥ $9,000 | Toast (warning) | "Approaching CTR threshold ($10,000)" |
| **CTR Met** | > $10,000 | Banner (persistent) | "CTR REQUIRED - Transaction exceeds $10,000" |

**Impact:** Pit boss has no visibility into compliance implications during buy-in entry, leading to:
1. Missed MTL entries for watchlist transactions
2. No proactive CTR preparation for large transactions
3. Compliance gaps not surfaced until after-the-fact dashboard review

### 2.5 Gap: No CTR Banner Notification

**Regulatory Context:**
Per 31 CFR § 1021.311, casinos must file CTR for transactions **exceeding** $10,000 (strictly >).

**Current State:**
- CTR threshold ($10,000) defined in `DEFAULT_THRESHOLDS`
- Badge computation (`ctr_met`, `ctr_near`) exists in `mappers.ts`
- No UI notification when CTR threshold is exceeded
- CTR workflow itself is out of scope (manual external process)

**Required Behavior:**
When daily aggregate OR single transaction exceeds $10,000:
- Display **persistent banner** at top of rating slip modal or dashboard
- Banner text: "CTR Required - Transaction(s) exceed $10,000. File FinCEN Form 103."
- Banner should link to CTR filing guidance (external reference)
- Banner persists until explicitly dismissed by compliance staff

**Implementation Note:** Full CTR workflow (form generation, submission tracking) is **DEFERRED**. Only the notification banner is in scope for MVP.

### 2.6 Gap: Cumulative Daily Total Not Surfaced During Buy-In

**Scenario:**
Player has $8,000 cumulative buy-ins for the gaming day. Pit boss enters new $3,000 buy-in. System should warn that this pushes daily total to $11,000 (CTR territory).

**Current State:**
- `mtl_gaming_day_summary` view computes daily aggregates
- Aggregates only visible in Compliance Dashboard (after-the-fact)
- Rating slip buy-in UI has no access to player's daily aggregate

**Required Behavior:**
During buy-in entry, fetch and display:
1. Player's current gaming day aggregate (cash-in total)
2. Projected total after this buy-in
3. Threshold notifications based on projected total, not just transaction amount

**Example UX:**
```
Player: John Doe
Today's Buy-Ins: $8,000
New Buy-In: $3,000
─────────────────────
Projected Daily Total: $11,000 ⚠️ CTR REQUIRED
```

---

## 3. Roadmap Alignment

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **Phase 1** | `visit_id` required on financial txns | Complete |
| **Phase 1** | DB-atomic derivation (RPC or trigger) | **MISSING** |
| **Phase 1** | `mtl_entry` derived from eligible txns | **MISSING** |
| **Phase 1** | Manual MTL entry endpoint | Complete |
| **Phase 1** | Manual MTL entry UI form | **MISSING** |
| **Phase 1** | Idempotency constraint | Complete |
| **Phase 2** | Per-player/day aggregates in UI | Complete |
| **Phase 2** | Threshold state filtering | Complete |
| **Phase 2** | Real-time threshold notifications | **MISSING** |
| **Phase 2** | Cumulative daily total in buy-in UI | **MISSING** |
| **Phase 3** | Audit notes for entries | Complete |
| **Phase 3** | "Who did what" views | Complete |
| **Phase 3** | CTR notification banner | **MISSING** |

---

## 4. Architecture Diagrams

### 4.1 Current State

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT STATE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Rating Slip UI                                                 │
│       │                                                         │
│       ▼                                                         │
│  player_financial_transaction                                   │
│       │                                                         │
│       ├──────► table_buyin_telemetry (via fn_bridge)           │
│       │                                                         │
│       └──────► mtl_entry ◄──── [NO BRIDGE EXISTS]              │
│                    │                                            │
│                    ▼                                            │
│             Compliance Dashboard (READ-ONLY)                    │
│                    │                                            │
│              [NO MANUAL ENTRY UI]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                       TARGET STATE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Rating Slip UI ────────────────────┐                          │
│       │                              │                          │
│       ▼                              ▼                          │
│  player_financial_transaction   MtlEntryForm (MANUAL)          │
│       │                              │                          │
│       ├──► table_buyin_telemetry     │                          │
│       │                              │                          │
│       └──► mtl_entry ◄───────────────┘                          │
│            (auto-derived)     (manual entry)                    │
│                    │                                            │
│                    ▼                                            │
│             Compliance Dashboard                                │
│             (READ + WRITE)                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Required Implementations

### 5.1 Priority 1: MtlEntryForm Component

**File:** `components/mtl/mtl-entry-form.tsx`

**Required Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `patron_uuid` | UUID | Yes | Player lookup/selector |
| `amount` | number | Yes | Transaction amount (dollars) |
| `direction` | `in` \| `out` | Yes | Cash direction |
| `txn_type` | enum | Yes | `buy_in`, `cash_out`, `marker`, etc. |
| `source` | enum | Yes | `table`, `cage`, `kiosk`, `other` |
| `area` | string | No | Pit area identifier |
| `visit_id` | UUID | No | Link to visit |
| `rating_slip_id` | UUID | No | Link to rating slip |
| `note` | string | **Yes** | Required per DoD |
| `occurred_at` | timestamp | No | For late entries (defaults to now) |

**Integration:**
```tsx
// Use existing mutation hook
import { useCreateMtlEntry } from "@/hooks/mtl";

// Generate idempotency key client-side
const idempotencyKey = crypto.randomUUID();

// Call mutation
await createEntry.mutateAsync({
  casino_id: casinoId,
  patron_uuid: patronId,
  amount: 5000,
  direction: 'in',
  txn_type: 'buy_in',
  source: 'table',
  staff_id: staffId,
  note: 'Manual entry - late telemetry',
  idempotency_key: idempotencyKey,
});
```

**UI Integration Point:**
- Add "New Entry" button to `ComplianceDashboard` header
- Open modal/drawer with `MtlEntryForm`

### 5.2 Priority 2: Finance → MTL Derivation Bridge

**Option A: RPC-based (Recommended)**

Modify `rpc_create_financial_txn` to atomically create both records:

```sql
CREATE OR REPLACE FUNCTION rpc_create_financial_txn(...)
RETURNS player_financial_transaction
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1) Insert player_financial_transaction
  INSERT INTO player_financial_transaction (...) VALUES (...) RETURNING * INTO v_txn;

  -- 2) If eligible, derive mtl_entry
  IF v_txn.channel = 'pit' AND v_txn.is_currency = true
     AND v_txn.txn_type IN ('chip_purchase', 'chip_redemption') THEN
    INSERT INTO mtl_entry (
      casino_id, patron_uuid, visit_id, rating_slip_id,
      amount, direction, txn_type, source, staff_id,
      idempotency_key
    ) VALUES (
      v_txn.casino_id, v_txn.player_id, v_txn.visit_id, v_txn.rating_slip_id,
      v_txn.amount,
      CASE v_txn.txn_type WHEN 'chip_purchase' THEN 'in' ELSE 'out' END,
      CASE v_txn.txn_type WHEN 'chip_purchase' THEN 'buy_in' ELSE 'cash_out' END,
      'table', v_txn.created_by_staff_id,
      'fin:' || v_txn.id::text
    );
  END IF;

  RETURN v_txn;
END;
$$;
```

**Option B: Trigger-based**

```sql
CREATE OR REPLACE FUNCTION fn_derive_mtl_from_finance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process eligible pit cash transactions
  IF NEW.channel = 'pit' AND NEW.is_currency = true
     AND NEW.txn_type IN ('chip_purchase', 'chip_redemption') THEN

    INSERT INTO mtl_entry (
      casino_id, patron_uuid, visit_id, rating_slip_id,
      amount, direction, txn_type, source, staff_id,
      idempotency_key
    ) VALUES (
      NEW.casino_id, NEW.player_id, NEW.visit_id, NEW.rating_slip_id,
      NEW.amount,
      CASE NEW.txn_type WHEN 'chip_purchase' THEN 'in' ELSE 'out' END,
      CASE NEW.txn_type WHEN 'chip_purchase' THEN 'buy_in' ELSE 'cash_out' END,
      'table', NEW.created_by_staff_id,
      'fin:' || NEW.id::text
    )
    ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_finance_to_mtl
  AFTER INSERT ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION fn_derive_mtl_from_finance();
```

### 5.3 Priority 3: Dashboard Integration

**Compliance Dashboard Updates:**
1. Add "New Entry" button to header
2. Open modal with `MtlEntryForm`
3. Invalidate queries on success
4. Show success toast

```tsx
// In compliance-dashboard.tsx
<Button onClick={() => setShowEntryForm(true)}>
  <Plus className="h-4 w-4 mr-2" />
  New Entry
</Button>

<Dialog open={showEntryForm} onOpenChange={setShowEntryForm}>
  <DialogContent>
    <MtlEntryForm
      casinoId={casinoId}
      staffId={staffId}
      onSuccess={() => {
        setShowEntryForm(false);
        // Queries auto-invalidate via mutation hook
      }}
    />
  </DialogContent>
</Dialog>
```

### 5.4 Priority 4: Threshold Notification System

**File:** `hooks/mtl/use-threshold-notifications.ts`

**Purpose:** Provide real-time compliance threshold feedback during buy-in entry.

**Threshold Constants:**
```typescript
// Configurable per casino, with sensible defaults
export const MTL_NOTIFICATION_THRESHOLDS = {
  /** Warning threshold (approaching watchlist) */
  WARNING_FLOOR: 2500,
  /** Watchlist threshold (MTL entry auto-created) */
  WATCHLIST_FLOOR: 3000,
  /** CTR warning threshold (90% of CTR) */
  CTR_WARNING: 9000,
  /** CTR threshold (strictly >) */
  CTR_THRESHOLD: 10000,
} as const;
```

**Hook Implementation:**
```typescript
// hooks/mtl/use-threshold-notifications.ts

import { toast } from "@/hooks/ui";
import { DEFAULT_THRESHOLDS } from "@/services/mtl/mappers";

export type ThresholdLevel =
  | "none"
  | "warning"        // ≥ $2,500
  | "watchlist_met"  // ≥ $3,000
  | "ctr_near"       // ≥ $9,000
  | "ctr_met";       // > $10,000

export interface ThresholdCheckResult {
  level: ThresholdLevel;
  shouldCreateMtl: boolean;
  requiresCtr: boolean;
  message: string | null;
}

export function useThresholdNotifications() {
  /**
   * Evaluate buy-in amount against thresholds
   * @param amount - Transaction amount in dollars
   * @param dailyTotal - Player's existing daily total (optional)
   */
  function checkThreshold(
    amount: number,
    dailyTotal: number = 0
  ): ThresholdCheckResult {
    const projectedTotal = dailyTotal + amount;

    // CTR Met: strictly > $10,000
    if (projectedTotal > DEFAULT_THRESHOLDS.ctrThreshold) {
      return {
        level: "ctr_met",
        shouldCreateMtl: true,
        requiresCtr: true,
        message: `CTR REQUIRED - Daily total ($${projectedTotal.toLocaleString()}) exceeds $10,000`,
      };
    }

    // CTR Near: > $9,000 (90% threshold)
    if (projectedTotal > DEFAULT_THRESHOLDS.ctrThreshold * 0.9) {
      return {
        level: "ctr_near",
        shouldCreateMtl: true,
        requiresCtr: false,
        message: `Approaching CTR threshold - Daily total: $${projectedTotal.toLocaleString()}`,
      };
    }

    // Watchlist Met: ≥ $3,000
    if (projectedTotal >= DEFAULT_THRESHOLDS.watchlistFloor) {
      return {
        level: "watchlist_met",
        shouldCreateMtl: true,
        requiresCtr: false,
        message: `MTL entry will be created - Watchlist threshold met ($${projectedTotal.toLocaleString()})`,
      };
    }

    // Warning: ≥ $2,500
    if (projectedTotal >= 2500) {
      return {
        level: "warning",
        shouldCreateMtl: false,
        requiresCtr: false,
        message: `Approaching watchlist threshold ($3,000) - Current: $${projectedTotal.toLocaleString()}`,
      };
    }

    return {
      level: "none",
      shouldCreateMtl: false,
      requiresCtr: false,
      message: null,
    };
  }

  /**
   * Show appropriate toast notification for threshold level
   */
  function notifyThreshold(result: ThresholdCheckResult): void {
    if (!result.message) return;

    switch (result.level) {
      case "ctr_met":
        toast.error("CTR Required", {
          description: result.message,
          duration: 10000, // Persist longer for CTR
        });
        break;
      case "ctr_near":
        toast.warning("CTR Approaching", {
          description: result.message,
          duration: 6000,
        });
        break;
      case "watchlist_met":
        toast.info("MTL Entry Created", {
          description: result.message,
          duration: 4000,
        });
        break;
      case "warning":
        toast.warning("Watchlist Warning", {
          description: result.message,
          duration: 4000,
        });
        break;
    }
  }

  return { checkThreshold, notifyThreshold };
}
```

**Integration with Buy-In Flow:**
```typescript
// In use-save-with-buyin.ts - Enhanced version

import { useThresholdNotifications } from "@/hooks/mtl/use-threshold-notifications";
import { useCreateMtlEntry } from "@/hooks/mtl/use-mtl-mutations";

export function useSaveWithBuyIn() {
  const { checkThreshold, notifyThreshold } = useThresholdNotifications();
  const createMtlEntry = useCreateMtlEntry();

  return useMutation({
    mutationFn: async (input: SaveWithBuyInInput) => {
      // ... existing financial transaction logic ...

      // Check threshold and notify
      const thresholdResult = checkThreshold(
        input.newBuyIn,
        input.playerDailyTotal ?? 0  // New: pass daily total
      );

      notifyThreshold(thresholdResult);

      // Auto-create MTL entry if threshold met
      if (thresholdResult.shouldCreateMtl && input.playerId) {
        await createMtlEntry.mutateAsync({
          casino_id: input.casinoId,
          patron_uuid: input.playerId,
          amount: input.newBuyIn,
          direction: 'in',
          txn_type: 'buy_in',
          source: 'table',
          staff_id: input.staffId,
          visit_id: input.visitId,
          rating_slip_id: input.slipId,
          note: 'Auto-created from rating slip buy-in (threshold met)',
          idempotency_key: `buyin:${input.slipId}:${Date.now()}`,
        });
      }

      return updateResult;
    },
  });
}
```

### 5.5 Priority 5: CTR Banner Component

**File:** `components/mtl/ctr-banner.tsx`

**Purpose:** Persistent banner displayed when CTR threshold is exceeded.

```tsx
// components/mtl/ctr-banner.tsx

import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface CtrBannerProps {
  dailyTotal: number;
  patronName?: string;
  onDismiss?: () => void;
}

export function CtrBanner({ dailyTotal, patronName, onDismiss }: CtrBannerProps) {
  return (
    <Alert variant="destructive" className="mb-4 border-red-600 bg-red-50">
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="text-lg font-semibold">
        CTR Required - Transaction Exceeds $10,000
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p>
          {patronName ? `${patronName}'s` : "Player's"} daily cash-in total is{" "}
          <strong>${dailyTotal.toLocaleString()}</strong>.
        </p>
        <p className="mt-1">
          Per 31 CFR § 1021.311, a Currency Transaction Report (FinCEN Form 103)
          must be filed for transactions exceeding $10,000.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <a
            href="https://www.fincen.gov/resources/filing-information"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-red-700 hover:underline"
          >
            FinCEN Filing Information
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
          {onDismiss && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDismiss}
              className="ml-auto"
            >
              <X className="mr-1 h-3 w-3" />
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

**Integration Point:** Rating slip modal header when `thresholdResult.requiresCtr === true`

### 5.6 Priority 6: Daily Aggregate Display in Buy-In UI

**File:** `components/rating-slip/buy-in-threshold-indicator.tsx`

**Purpose:** Show player's current daily total and projected total during buy-in entry.

```tsx
// components/rating-slip/buy-in-threshold-indicator.tsx

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_THRESHOLDS } from "@/services/mtl/mappers";

interface BuyInThresholdIndicatorProps {
  currentDailyTotal: number;
  newBuyInAmount: number;
  className?: string;
}

export function BuyInThresholdIndicator({
  currentDailyTotal,
  newBuyInAmount,
  className,
}: BuyInThresholdIndicatorProps) {
  const projectedTotal = currentDailyTotal + newBuyInAmount;

  const status = useMemo(() => {
    if (projectedTotal > DEFAULT_THRESHOLDS.ctrThreshold) {
      return { level: "ctr", label: "CTR REQUIRED", color: "text-red-600 bg-red-50" };
    }
    if (projectedTotal > DEFAULT_THRESHOLDS.ctrThreshold * 0.9) {
      return { level: "ctr-near", label: "CTR Near", color: "text-orange-600 bg-orange-50" };
    }
    if (projectedTotal >= DEFAULT_THRESHOLDS.watchlistFloor) {
      return { level: "watchlist", label: "Watchlist", color: "text-amber-600 bg-amber-50" };
    }
    if (projectedTotal >= 2500) {
      return { level: "warning", label: "Approaching", color: "text-yellow-600 bg-yellow-50" };
    }
    return { level: "none", label: null, color: "text-muted-foreground" };
  }, [projectedTotal]);

  if (newBuyInAmount <= 0) return null;

  return (
    <div className={cn("rounded-md border p-3 text-sm", status.color, className)}>
      <div className="flex justify-between">
        <span>Today's Buy-Ins:</span>
        <span className="font-medium">${currentDailyTotal.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span>New Buy-In:</span>
        <span className="font-medium">+ ${newBuyInAmount.toLocaleString()}</span>
      </div>
      <div className="mt-1 border-t pt-1 flex justify-between font-semibold">
        <span>Projected Total:</span>
        <span>
          ${projectedTotal.toLocaleString()}
          {status.label && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded">
              {status.label}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
```

**Data Fetching Hook:**
```typescript
// hooks/mtl/use-player-daily-total.ts

import { useQuery } from "@tanstack/react-query";
import { mtlKeys } from "@/services/mtl/keys";
import { getGamingDaySummary } from "@/services/mtl/http";

/**
 * Fetch player's current gaming day cash-in total
 */
export function usePlayerDailyTotal(
  casinoId: string | undefined,
  patronUuid: string | undefined,
  gamingDay?: string,
) {
  return useQuery({
    queryKey: mtlKeys.playerDailyTotal(casinoId!, patronUuid!, gamingDay),
    queryFn: async () => {
      const summary = await getGamingDaySummary({
        casino_id: casinoId!,
        patron_uuid: patronUuid,
        gaming_day: gamingDay ?? new Date().toISOString().split('T')[0],
      });

      // Find this patron's summary (may not exist yet)
      const patronSummary = summary.find(s => s.patron_uuid === patronUuid);

      return {
        totalIn: patronSummary?.total_in ?? 0,
        totalOut: patronSummary?.total_out ?? 0,
        entryCount: patronSummary?.entry_count ?? 0,
      };
    },
    enabled: !!casinoId && !!patronUuid,
    staleTime: 30_000, // 30 seconds - reasonably fresh for compliance
  });
}
```

---

## 6. Test Coverage Requirements

### 6.1 MtlEntryForm Tests

```typescript
// components/mtl/__tests__/mtl-entry-form.test.tsx
describe('MtlEntryForm', () => {
  it('requires note field for submission');
  it('generates idempotency key on submit');
  it('validates amount > 0');
  it('validates patron_uuid format');
  it('shows loading state during mutation');
  it('displays error on mutation failure');
  it('calls onSuccess after successful creation');
});
```

### 6.2 Derivation Bridge Tests

```typescript
// supabase/tests/mtl-derivation.test.sql
-- Test: Eligible txn creates mtl_entry
-- Test: Non-eligible txn (cage channel) does NOT create mtl_entry
-- Test: Idempotency prevents duplicates
-- Test: Direction mapping is correct
-- Test: Idempotency key format is 'fin:{txn_id}'
```

### 6.3 Threshold Notification Tests

```typescript
// hooks/mtl/__tests__/use-threshold-notifications.test.ts
describe('useThresholdNotifications', () => {
  describe('checkThreshold', () => {
    it('returns "none" for amounts < $2,500');
    it('returns "warning" for amounts >= $2,500 and < $3,000');
    it('returns "watchlist_met" for amounts >= $3,000 and <= $9,000');
    it('returns "ctr_near" for amounts > $9,000 and <= $10,000');
    it('returns "ctr_met" for amounts > $10,000 (strictly greater)');
    it('considers cumulative daily total in threshold calculation');
    it('sets shouldCreateMtl=true for watchlist_met and above');
    it('sets requiresCtr=true only for ctr_met');
  });

  describe('notifyThreshold', () => {
    it('calls toast.warning for "warning" level');
    it('calls toast.info for "watchlist_met" level');
    it('calls toast.warning for "ctr_near" level');
    it('calls toast.error for "ctr_met" level with extended duration');
    it('does not call toast for "none" level');
  });
});
```

### 6.4 CTR Banner Tests

```typescript
// components/mtl/__tests__/ctr-banner.test.tsx
describe('CtrBanner', () => {
  it('displays daily total amount');
  it('displays patron name when provided');
  it('includes FinCEN filing link with external indicator');
  it('shows dismiss button when onDismiss provided');
  it('calls onDismiss when dismiss button clicked');
  it('references 31 CFR § 1021.311 regulation');
});
```

### 6.5 Buy-In Threshold Indicator Tests

```typescript
// components/rating-slip/__tests__/buy-in-threshold-indicator.test.tsx
describe('BuyInThresholdIndicator', () => {
  it('does not render when newBuyInAmount <= 0');
  it('displays current daily total');
  it('displays new buy-in amount');
  it('displays projected total');
  it('shows no label for totals < $2,500');
  it('shows "Approaching" label for totals >= $2,500');
  it('shows "Watchlist" label for totals >= $3,000');
  it('shows "CTR Near" label for totals > $9,000');
  it('shows "CTR REQUIRED" label for totals > $10,000');
  it('applies appropriate color class based on threshold level');
});
```

### 6.6 Integration Tests

```typescript
// e2e/mtl-threshold-notifications.spec.ts
describe('MTL Threshold Notifications E2E', () => {
  it('shows warning toast when buy-in reaches $2,500');
  it('shows MTL created toast when buy-in reaches $3,000');
  it('shows CTR warning toast when buy-in reaches $9,000');
  it('shows CTR banner when buy-in exceeds $10,000');
  it('auto-creates MTL entry when watchlist threshold met');
  it('persists CTR banner until dismissed');
  it('calculates thresholds based on daily cumulative total');
});
```

---

## 7. Definition of Done

### Manual Entry Form (Gap 1)
- [ ] `MtlEntryForm` component created
- [ ] Note field is required (validation)
- [ ] Staff attribution captured from context
- [ ] Idempotency key generated client-side
- [ ] Unit tests pass
- [ ] Integration with ComplianceDashboard

### Automated Derivation (Gap 2)
- [ ] Trigger/RPC created for finance → MTL bridge
- [ ] Eligible transaction filter implemented
- [ ] Direction mapping correct (`chip_purchase` → `in`, `chip_redemption` → `out`)
- [ ] Idempotency key format: `fin:{txn_id}`
- [ ] Integration tests pass
- [ ] RLS context flows correctly in trigger

### Dashboard Integration (Gap 3)
- [ ] "New Entry" button in dashboard header
- [ ] Modal/drawer opens MtlEntryForm
- [ ] Query invalidation on success
- [ ] E2E test for manual entry workflow

### Threshold Notifications (Gap 4)
- [ ] `useThresholdNotifications` hook created
- [ ] `checkThreshold()` evaluates against configurable thresholds
- [ ] Warning toast at $2,500 (approaching watchlist)
- [ ] Info toast at $3,000 (watchlist met)
- [ ] Warning toast at $9,000 (approaching CTR)
- [ ] Error toast at >$10,000 (CTR required)
- [ ] Toast durations appropriate for severity
- [ ] Unit tests pass

### CTR Banner (Gap 5)
- [ ] `CtrBanner` component created
- [ ] Displays daily total exceeding $10,000
- [ ] References 31 CFR § 1021.311 regulation
- [ ] Links to FinCEN filing information
- [ ] Dismissible with callback
- [ ] Integrated in rating slip modal (when CTR triggered)
- [ ] Component tests pass

### Daily Aggregate in Buy-In UI (Gap 6)
- [ ] `BuyInThresholdIndicator` component created
- [ ] `usePlayerDailyTotal` hook fetches gaming day summary
- [ ] Displays current daily total
- [ ] Displays projected total (current + new buy-in)
- [ ] Color-coded threshold levels (none, warning, watchlist, CTR)
- [ ] Integrated in rating slip buy-in form
- [ ] Component tests pass

### Auto-Create MTL Entry (Critical Path)
- [ ] `useSaveWithBuyIn` enhanced with threshold checking
- [ ] Fetches player's daily total before save
- [ ] Auto-creates MTL entry when threshold ≥ $3,000
- [ ] Idempotency key prevents duplicate entries
- [ ] MTL entry linked to rating slip and visit
- [ ] Toast notification confirms MTL creation
- [ ] Integration tests pass

---

## 8. Implementation Sequence

**Recommended order based on dependencies:**

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE A: Foundation (No UI, Backend Only)                      │
├─────────────────────────────────────────────────────────────────┤
│  A1. Finance → MTL derivation trigger (Priority 2)              │
│      └── Enables auto-population of mtl_entry from buy-ins      │
│                                                                 │
│  A2. mtlKeys.playerDailyTotal query key                         │
│      └── Prerequisite for usePlayerDailyTotal hook              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE B: Hooks & Logic (No Visible UI)                         │
├─────────────────────────────────────────────────────────────────┤
│  B1. useThresholdNotifications hook (Priority 4)                │
│      └── Pure logic: checkThreshold(), notifyThreshold()        │
│                                                                 │
│  B2. usePlayerDailyTotal hook (Priority 6)                      │
│      └── Fetches existing daily aggregate                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE C: UI Components                                         │
├─────────────────────────────────────────────────────────────────┤
│  C1. BuyInThresholdIndicator (Priority 6)                       │
│      └── Visual feedback during buy-in entry                    │
│                                                                 │
│  C2. CtrBanner (Priority 5)                                     │
│      └── Persistent CTR warning                                 │
│                                                                 │
│  C3. MtlEntryForm (Priority 1)                                  │
│      └── Manual entry for compliance staff                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE D: Integration                                           │
├─────────────────────────────────────────────────────────────────┤
│  D1. Enhance useSaveWithBuyIn with threshold notifications      │
│      └── Wires everything together                              │
│                                                                 │
│  D2. Add BuyInThresholdIndicator to rating slip modal           │
│                                                                 │
│  D3. Add CtrBanner to rating slip modal (conditional)           │
│                                                                 │
│  D4. Add "New Entry" button to ComplianceDashboard              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE E: Testing & Validation                                  │
├─────────────────────────────────────────────────────────────────┤
│  E1. Unit tests for all new hooks and components                │
│  E2. E2E test: buy-in flow with threshold notifications         │
│  E3. E2E test: CTR banner displayed at >$10,000                 │
│  E4. E2E test: auto-created MTL visible in dashboard            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. References

- [MTL-INTEGRATION-ROADMAP-AMENDED.md](./MTL-INTEGRATION-ROADMAP-AMENDED.md) - MVP Roadmap
- [MTL_MVP_USER_STORY_CONTRACT.md](./MTL_MVP_USER_STORY_CONTRACT.md) - User Stories
- [PRD-005-mtl-service.md](../../10-prd/PRD-005-mtl-service.md) - Product Requirements
- [ADR-025-mtl-authorization-model.md](../../80-adrs/ADR-025-mtl-authorization-model.md) - Authorization Model
- [31 CFR § 1021.311](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1021/section-1021.311) - CTR Regulatory Reference

---

## Appendix A: Existing Hook Interface

```typescript
// hooks/mtl/use-mtl-mutations.ts

export function useCreateMtlEntry(): UseMutationResult<
  MtlEntryDTO,
  Error,
  CreateMtlEntryInput
>;

// CreateMtlEntryInput (from services/mtl/dtos.ts)
interface CreateMtlEntryInput {
  casino_id: string;
  patron_uuid: string;
  amount: number;
  direction: 'in' | 'out';
  txn_type: MtlTxnType;
  source: MtlSource;
  staff_id?: string;
  visit_id?: string;
  rating_slip_id?: string;
  area?: string;
  note?: string;  // Required for manual entries per DoD
  occurred_at?: string;
  idempotency_key?: string;
}
```

## Appendix B: API Endpoint Reference

```
POST /api/v1/mtl/entries
  - Creates MTL entry (idempotent)
  - Requires: Idempotency-Key header
  - Auth: pit_boss, cashier, admin

GET /api/v1/mtl/entries
  - Lists entries with filters
  - Auth: pit_boss, cashier, admin

GET /api/v1/mtl/entries/[entryId]
  - Gets entry detail with audit notes
  - Auth: pit_boss, cashier, admin

POST /api/v1/mtl/entries/[entryId]/audit-notes
  - Creates audit note
  - Auth: pit_boss, admin

GET /api/v1/mtl/gaming-day-summary
  - Gets daily aggregates (COMPLIANCE AUTHORITY)
  - Auth: pit_boss, admin (cashier EXCLUDED)
```
