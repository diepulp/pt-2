---
title: "Gap Analysis: Table Rundown Read Model Integration"
doc_id: "GAP-ANALYSIS-TBL-RUNDOWN"
version: "v1.2.0"
status: "active"
created: "2026-01-15"
updated: "2026-01-15"
author: "Architecture Analysis"
relates_to:
  - "ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md"
  - "table-inventory-rundown-lifecycle.md"
  - "telemetry-semantics-grind.md"
  - "docs/20-architecture/specs/ADDENDUM-TBL-RUNDOWN/EXECUTION-SPEC-ADDENDUM-TBL-RUNDOWN.md"
  - "docs/10-prd/PRD-Shift-Dashboards-Implementation-v0.2.md"
---

# Gap Analysis: Table Rundown Read Model Integration

## Executive Summary

The **table inventory lifecycle vision** defines a comprehensive 7-phase workflow with a 10-state machine. Current implementation is **~60% complete**:

- **Database layer for read model**: 100% complete (Jan 14, 2026)
- **Telemetry logging pipeline**: 0% (RPC exists, no automatic bridge or manual UI)
- **Session state machine**: 0% (no `table_inventory_session` table)
- **Soft count integration**: 0% out of scope for MVP
- **Exception framework**: 0% out of scope for MVP

**Critical blocker**: No automatic bridge from `player_financial_transaction` to `table_buyin_telemetry`. Rated buy-ins are recorded in Finance but never populate the telemetry table that feeds shift metrics. This makes `estimated_drop_rated_cents` permanently zero.

**Secondary blocker**: No UI for logging unrated buy-ins (anonymous cash observations). This makes `estimated_drop_grind_cents` permanently zero and `telemetry_quality` always "LOW_COVERAGE" or "NONE".

---

## Lifecycle Vision vs Implementation Cross-Reference

### Vision State Machine (Not Implemented)

```
READY_TO_OPEN → OPENING → OPEN → DROP_SCHEDULED → DROPPED → COUNTED →
CLOSING → CLOSED → RECONCILED → FINALIZED
```

**Reality**: Only `gaming_table.status` exists with 3 states: `inactive | active | closed`

### Phase-by-Phase Alignment

| Phase | Vision Requirement | Implementation Status | Gap Severity |
|-------|-------------------|----------------------|--------------|
| **0: Pre-shift** | `table_inventory_session` in `READY_TO_OPEN` | ❌ Table doesn't exist | CRITICAL |
| **1: Open** | Opening snapshot + state transition + par/need | ⚠️ Snapshot exists, no state machine | HIGH |
| **2: Live Play** | Fill/credit status workflow (`REQUESTED→VERIFIED→DEPOSITED`) | ⚠️ Tables exist, no status column | MEDIUM |
| **3: Drop** | Drop events linked to session, state transition | ⚠️ Events exist, not session-scoped | MEDIUM |
| **4: Soft Count** | `soft_count_table_result`, count ingestion | ❌ Not implemented | HIGH |
| **5: Close** | Closing snapshot + state enforcement | ⚠️ Snapshot can be recorded, not enforced | MEDIUM |
| **6: Rundown** | Win/loss computation, telemetry | ✅ RPCs complete, ❌ Frontend blocked | CRITICAL |
| **7: Exceptions** | `reconciliation_exception`, resolution workflow | ❌ Not implemented | HIGH |

### Detailed Phase Analysis

#### Phase 0 — Pre-shift Setup: ❌ NOT IMPLEMENTED
- No `table_inventory_session` table
- No preconditions enforcement (drop box, forms inventory)
- **Required**: New table + RPC for session creation

#### Phase 1 — Open Table: ⚠️ PARTIAL
- ✅ `table_inventory_snapshot` with `snapshot_type='open'`
- ✅ `rpc_log_table_inventory_snapshot()` (ADR-024 compliant)
- ❌ No state machine (`OPENING → OPEN`)
- ❌ No `need_total` / par enforcement
- ❌ Snapshots not session-scoped

#### Phase 2 — Live Play (Fills/Credits): ⚠️ PARTIAL
- ✅ `table_fill` and `table_credit` tables exist
- ✅ RPCs with idempotency (`ON CONFLICT` upsert)
- ❌ No `status` column (no `REQUESTED → ISSUED → VERIFIED → DEPOSITED`)
- ❌ No workflow gates or validation
- ❌ No slip numbering enforcement

#### Phase 3 — Drop: ⚠️ PARTIAL
- ✅ `table_drop_event` with custody chain fields
- ✅ `rpc_log_table_drop()` (SECURITY DEFINER)
- ❌ Not linked to session
- ❌ No state machine (`DROP_SCHEDULED → DROPPED`)

#### Phase 4 — Soft Count: ❌ NOT IMPLEMENTED
- ❌ No `soft_count_table_result` table
- ❌ No `ingestSoftCount()` RPC
- ❌ No drop amount ingestion mechanism
- **Required**: Table + RPC + reconciliation logic

#### Phase 5 — Close Table: ⚠️ PARTIAL
- ✅ `table_inventory_snapshot` with `snapshot_type='close'`
- ❌ No enforcement (can close without snapshot)
- ❌ No state machine (`CLOSING → CLOSED`)

#### Phase 6 — Rundown Compute: ✅ DB COMPLETE, ❌ FRONTEND BLOCKED
- ✅ `table_buyin_telemetry` table (Jan 14)
- ✅ `rpc_log_table_buyin_telemetry()` (ADR-024)
- ✅ `rpc_shift_table_metrics()` with dual-stream win/loss
- ✅ `rpc_shift_pit_metrics()` and `rpc_shift_casino_metrics()`
- ❌ No service layer function to call telemetry RPC
- ❌ No HTTP endpoint for telemetry logging
- ❌ No UI for grind logging

#### Phase 7 — Exceptions: ❌ NOT IMPLEMENTED
- ❌ No `reconciliation_exception` table
- ❌ No exception detection logic
- ❌ No resolution workflow
- ❌ No finalization gates
- **Required**: Table + detection triggers + resolution UI

---

## Telemetry Semantics (Canonical)

> **Reference**: `telemetry-semantics-grind.md`

**Telemetry kind is defined by IDENTITY/LINKAGE, not by amount.**

| Telemetry Kind | Definition | `visit_id` | `rating_slip_id` |
|----------------|------------|------------|------------------|
| `RATED_BUYIN` | Any buy-in linked to a rated session | Required | Required |
| `GRIND_BUYIN` | Anonymous/unlinked observation | Must be NULL | Must be NULL |

**Key rules**:
- Sub-$100 rated buy-ins → Still `RATED_BUYIN` (threshold is UI policy, not telemetry classification)
- Shadow player with visit/slip linkage → Still `RATED_BUYIN` (loyalty opt-out modeled elsewhere)
- Anonymous cash observation → `GRIND_BUYIN` (no linkage possible)

**UI terminology**: "Log Unrated Buy-in" preferred over "Log Grind" to avoid operational ambiguity.

---

## Current Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AUTHORITATIVE METRICS (Complete ✅)                                          │
│                                                                             │
│ table_inventory_snapshot ──┐                                                │
│ table_fill ────────────────┼──► rpc_shift_table_metrics ──► Dashboard       │
│ table_credit ──────────────┤                                                │
│ table_drop_event ──────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ TELEMETRY METRICS (Broken ❌)                                                │
│                                                                             │
│ RATED BUY-IN PATH (Primary - Automatic):                                    │
│ Rating Slip Save ──► player_financial_transaction ──► (dead end)           │
│                                    │                                        │
│                                    ╳ No trigger to table_buyin_telemetry   │
│                                                                             │
│ UNRATED BUY-IN PATH (Secondary - Manual):                                   │
│ Pit Boss Observation ──► (no UI) ──► (no endpoint) ──► table_buyin_telemetry│
│                                                              │              │
│                              rpc_shift_table_metrics reads here ◄──┘       │
│                                        │                                    │
│                              estimated_drop_{rated,grind}_cents = 0        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Gaps (Priority Order)

### GAP 1: Automatic Bridge Trigger (CRITICAL - Primary Path)

**Problem**: Rated buy-ins are recorded in `player_financial_transaction` but never flow to `table_buyin_telemetry`.

**Solution**: Database trigger on `player_financial_transaction` INSERT automatically populates `table_buyin_telemetry`.

| Layer | Status | File Location | Missing |
|-------|--------|---------------|---------|
| **Trigger** | ❌ | `supabase/migrations/` | `fn_bridge_financial_txn_to_telemetry` |
| **Backfill** | ❌ | `supabase/migrations/` or script | One-time historical data population |

**Trigger conditions**:
- `direction = 'in'`
- `rating_slip_id IS NOT NULL`
- Derives `table_id` from rating slip FK

**Why trigger over service layer**:
- Single source of truth: if `player_financial_transaction` exists, telemetry exists
- Shift dashboards need completeness (can't depend on "did pit boss click")
- Decouples ingestion from UI policy

### GAP 2: Manual Telemetry Logging (MEDIUM - Secondary Paths)

For cases where automatic bridge doesn't apply:

| Scenario | Use Case | Creates Financial Txn? | Creates Telemetry? |
|----------|----------|------------------------|-------------------|
| **Log Rated Buy-in (Manual)** | Sub-$100 rated buy-in not in Finance | No | Yes (`RATED_BUYIN`) |
| **Log Unrated Buy-in** | Anonymous cash observation | No | Yes (`GRIND_BUYIN`) |

| Layer | Status | File Location | Missing |
|-------|--------|---------------|---------|
| **RPC** | ✅ | `migrations/20260114004141_rpc_log_table_buyin_telemetry.sql` | None |
| **Service** | ❌ | `services/table-context/shift-metrics/` | `logBuyinTelemetry()` |
| **HTTP** | ❌ | `app/api/v1/table-context/` | `buyin-telemetry/route.ts` |
| **Hook** | ❌ | `hooks/shift-dashboard/` | `use-log-buyin-telemetry.ts` |
| **UI** | ❌ | `components/` | "Log Unrated Buy-in" button + form |

### GAP 3: UI Components (LOW - Optional Backfill)

Per ADDENDUM §4.7-4.9 (deferred Phase 4 UI):
- Table card "Log Unrated Buy-in" button with quick-select ($25, $50, $75, $100, Custom)
- Rating slip panel "Log Rated Buy-in (Manual)" for sub-threshold observations
- "Undo last entry" functionality

### GAP 4: Real-time Dashboard Updates

When telemetry is logged (via trigger or manual), shift dashboard queries should refresh:
- Cache invalidation via TanStack Query `invalidateQueries`
- Consider WebSocket/SSE for multi-user scenarios

---

## Canonical Telemetry Pipeline

### Data Flow (Target State)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RATED BUY-IN PIPELINE (Primary - Automatic)             │
│                                                                             │
│  Rating Slip Save (≥$100 or any amount with buy-in logged)                 │
│        │                                                                    │
│        ▼                                                                    │
│  player_financial_transaction (direction='in', rating_slip_id)             │
│        │                                                                    │
│        ▼ [TRIGGER: fn_bridge_financial_txn_to_telemetry]                   │
│  table_buyin_telemetry (RATED_BUYIN, visit_id, rating_slip_id)             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                     SUB-THRESHOLD RATED (Secondary - Manual)                │
│                                                                             │
│  "Log Rated Buy-in (Manual)" button on rating slip panel                   │
│        │                                                                    │
│        ▼ [Service call, no financial txn created]                          │
│  table_buyin_telemetry (RATED_BUYIN, visit_id, rating_slip_id)             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                     UNRATED BUY-IN (Secondary - Manual)                     │
│                                                                             │
│  "Log Unrated Buy-in" button (table card in shift dashboard)               │
│        │                                                                    │
│        ▼ [Service call]                                                    │
│  table_buyin_telemetry (GRIND_BUYIN, NULL, NULL)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Plan

### Phase 1: Automatic Bridge Trigger (CRITICAL)

**1.1 Migration: Create Trigger Function**

```sql
-- File: supabase/migrations/YYYYMMDDHHMMSS_bridge_financial_txn_to_telemetry.sql

CREATE OR REPLACE FUNCTION fn_bridge_financial_txn_to_telemetry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only bridge buy-ins (direction='in') with rating slip linkage
  IF NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL THEN
    INSERT INTO table_buyin_telemetry (
      casino_id,
      gaming_day,
      table_id,
      visit_id,
      rating_slip_id,
      amount_cents,
      telemetry_kind,
      tender_type,
      occurred_at,
      actor_id,
      idempotency_key
    )
    SELECT
      NEW.casino_id,
      NEW.gaming_day,
      rs.table_id,
      NEW.visit_id,
      NEW.rating_slip_id,
      NEW.amount,
      'RATED_BUYIN',
      NEW.tender_type,
      NEW.created_at,
      NEW.created_by_staff_id,
      'pft:' || NEW.id::text  -- Idempotency: prefix + source txn ID
    FROM rating_slip rs
    WHERE rs.id = NEW.rating_slip_id
    ON CONFLICT (casino_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING;  -- Idempotent: skip if already bridged
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bridge_financial_txn_to_telemetry
  AFTER INSERT ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION fn_bridge_financial_txn_to_telemetry();
```

**1.2 Backfill Script: Historical Data**

One-time migration to populate `table_buyin_telemetry` from existing `player_financial_transaction` records.

**Deliverables**:
- `supabase/migrations/YYYYMMDDHHMMSS_bridge_financial_txn_to_telemetry.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_backfill_buyin_telemetry.sql`

---

### Phase 2: Manual Telemetry Service Layer

**2.1 Service Layer** (`services/table-context/shift-metrics/buyin-telemetry.ts`)
```typescript
export async function logBuyinTelemetry(
  supabase: SupabaseClient<Database>,
  params: LogBuyinTelemetryInput
): Promise<TableBuyinTelemetryDTO>
```

**2.2 DTO** (`services/table-context/shift-metrics/dtos.ts`)
```typescript
export interface LogBuyinTelemetryInput {
  tableId: string;
  amountCents: number;
  telemetryKind: 'RATED_BUYIN' | 'GRIND_BUYIN';
  visitId?: string;      // Required for RATED_BUYIN
  ratingSlipId?: string; // Required for RATED_BUYIN
  tenderType?: string;
  note?: string;
  idempotencyKey?: string;
}
```

**2.3 HTTP Route** (`app/api/v1/table-context/buyin-telemetry/route.ts`)
- POST endpoint with Zod validation
- Uses `withServerAction` middleware for auth/RLS/audit/idempotency
- Returns `ServiceHttpResult` per EDGE_TRANSPORT_POLICY

**Deliverables**:
- `services/table-context/shift-metrics/buyin-telemetry.ts`
- `app/api/v1/table-context/buyin-telemetry/route.ts`
- `app/api/v1/table-context/buyin-telemetry/__tests__/route.test.ts`

---

### Phase 3: UI - Manual Logging (Optional)

**3.1 Mutation Hook** (`hooks/shift-dashboard/use-log-buyin-telemetry.ts`)
```typescript
export function useLogBuyinTelemetry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogBuyinTelemetryInput) =>
      postBuyinTelemetry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.all
      });
    }
  });
}
```

**3.2 Unrated Buy-in Quick-Log Component** (`components/shift-dashboard/unrated-buyin-quick-log.tsx`)
```typescript
interface UnratedBuyinQuickLogProps {
  tableId: string;
  tableName: string;
}
// Quick-select buttons: $25, $50, $75, $100, Custom
// Calls useLogBuyinTelemetry with GRIND_BUYIN
```

**3.3 Table Row Action**

Add "Log Unrated Buy-in" button to `TableMetricsTable` row actions.

**3.4 Rating Slip Panel Action**

Add "Log Rated Buy-in (Manual)" button for sub-threshold observations.

---

### Phase 4: Dashboard Integration (Already Complete)

**4.1 Metrics Display**

The `CasinoSummaryCard` already displays:
- `estimated_drop_rated_total_cents` ✅ (will populate once trigger active)
- `estimated_drop_grind_total_cents` ✅ (will populate once manual UI exists)

**4.2 Telemetry Quality**

Once telemetry flows:
- `telemetry_quality` = `GOOD_COVERAGE` when grind is tracked
- `telemetry_quality` = `LOW_COVERAGE` when only rated buy-ins exist
- `telemetry_notes` reflects coverage status

---

## File Manifest (Changes Required)

### Phase 1: Automatic Bridge (Critical)

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/YYYYMMDDHHMMSS_bridge_financial_txn_to_telemetry.sql` | CREATE | Trigger function + trigger |
| `supabase/migrations/YYYYMMDDHHMMSS_backfill_buyin_telemetry.sql` | CREATE | One-time historical backfill |

### Phase 2: Manual Service Layer

| File | Action | Description |
|------|--------|-------------|
| `services/table-context/shift-metrics/buyin-telemetry.ts` | CREATE | Service function to call RPC |
| `services/table-context/shift-metrics/dtos.ts` | MODIFY | Add `LogBuyinTelemetryInput`, `TableBuyinTelemetryDTO` |
| `services/table-context/index.ts` | MODIFY | Export telemetry logging function |
| `app/api/v1/table-context/buyin-telemetry/route.ts` | CREATE | HTTP POST endpoint |
| `app/api/v1/table-context/buyin-telemetry/__tests__/route.test.ts` | CREATE | Route handler tests |

### Phase 3: UI Components (Optional)

| File | Action | Description |
|------|--------|-------------|
| `hooks/shift-dashboard/use-log-buyin-telemetry.ts` | CREATE | Mutation hook |
| `hooks/shift-dashboard/http.ts` | MODIFY | Add `postBuyinTelemetry` fetcher |
| `hooks/shift-dashboard/keys.ts` | MODIFY | Add telemetry mutation key |
| `components/shift-dashboard/unrated-buyin-quick-log.tsx` | CREATE | Quick-log UI for table cards |
| `components/shift-dashboard/table-metrics-table.tsx` | MODIFY | Add row action for unrated buy-in |

---

## Downstream Consumers Impact

| Consumer | Current State | After Phase 1 (Trigger) | After Phase 3 (UI) |
|----------|--------------|------------------------|-------------------|
| **Shift Dashboard** | Shows 0 for all estimates | Shows rated buy-in totals | + unrated buy-in totals |
| **Telemetry Quality** | Always NONE | LOW_COVERAGE (rated only) | GOOD_COVERAGE (rated + unrated) |
| **Win/Loss Estimated** | = inventory only | + rated buy-ins | + rated + unrated buy-ins |
| **Pit Boss UX** | Read-only metrics | Automatic rated tracking | Interactive unrated capture |

---

## Estimated Complexity

| Phase | Scope | Complexity | Blocking? |
|-------|-------|------------|-----------|
| Phase 1 | Automatic bridge trigger | Low (2 migrations) | **YES** - unblocks rated metrics |
| Phase 2 | Manual service layer | Medium (4-5 files) | NO - enables manual backfill |
| Phase 3 | UI components | Medium (4-5 files) | NO - enables unrated tracking |
| Phase 4 | Dashboard wiring | None (already done) | N/A |

---

## Verification Checklist

### Phase 1 Complete When:
- [ ] Trigger `trg_bridge_financial_txn_to_telemetry` exists on `player_financial_transaction`
- [ ] New buy-in transaction auto-creates `table_buyin_telemetry` row with `RATED_BUYIN`
- [ ] `rpc_shift_table_metrics` returns non-zero `estimated_drop_rated_cents`
- [ ] Backfill migration populates historical data

### Phase 2 Complete When:
- [ ] `POST /api/v1/table-context/buyin-telemetry` returns 201
- [ ] Service validates `RATED_BUYIN` requires `visit_id` + `rating_slip_id`
- [ ] Service validates `GRIND_BUYIN` requires both to be NULL
- [ ] Integration test passes

### Phase 3 Complete When:
- [ ] "Log Unrated Buy-in" button visible on table cards/rows
- [ ] Quick-select amounts work ($25, $50, $75, $100)
- [ ] Custom amount modal functions
- [ ] `GRIND_BUYIN` telemetry rows created
- [ ] `telemetry_quality` shows `GOOD_COVERAGE` after unrated logged

---

---

## Structural Gaps (Beyond Telemetry Pipeline)

These gaps represent missing foundational infrastructure from the lifecycle vision:

### GAP A: Session State Machine (CRITICAL)

**Vision**: 10-state machine governing entire lifecycle
**Reality**: No `table_inventory_session` table exists

**Impact**:
- Cannot enforce phase sequencing (e.g., must open before drop)
- Cannot track per-session aggregates
- Cannot link snapshots/fills/credits/drops to a session
- Cannot implement finalization gates

**Required Artifacts**:
```sql
CREATE TABLE table_inventory_session (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL,
  gaming_day date NOT NULL,
  shift_id uuid NULL,
  table_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'READY_TO_OPEN',
  need_total_cents bigint NULL,
  opened_at timestamptz NULL,
  opened_by uuid NULL,
  closed_at timestamptz NULL,
  closed_by uuid NULL,
  finalized_at timestamptz NULL,
  finalized_by uuid NULL,
  CONSTRAINT valid_status CHECK (status IN (
    'READY_TO_OPEN', 'OPENING', 'OPEN', 'DROP_SCHEDULED',
    'DROPPED', 'COUNTED', 'CLOSING', 'CLOSED',
    'RECONCILED', 'FINALIZED'
  ))
);
```

### GAP B: Fill/Credit Status Tracking (MEDIUM)

**Vision**: `REQUESTED → ISSUED → VERIFIED_AT_TABLE → DEPOSITED_IN_DROPBOX`
**Reality**: Tables are write-once with no status column

**Impact**:
- Cannot track fill/credit workflow progress
- Cannot enforce verification before deposit
- No audit trail of status transitions

**Required Change**:
```sql
ALTER TABLE table_fill ADD COLUMN status text NOT NULL DEFAULT 'REQUESTED';
ALTER TABLE table_credit ADD COLUMN status text NOT NULL DEFAULT 'REQUESTED';
```

### GAP C: Soft Count Integration (HIGH)

**Vision**: `soft_count_table_result` with drop total + evidence manifest
**Reality**: No count room integration exists

**Impact**:
- Cannot ingest authoritative drop amounts
- Cannot compute `win_loss_stat_cents` (statistical win)
- Cannot reconcile slips against count evidence
- `metric_grade` always 'ESTIMATE', never 'AUTHORITATIVE'

**Required Artifacts**:
```sql
CREATE TABLE soft_count_table_result (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES table_inventory_session(id),
  drop_total_cents bigint NOT NULL,
  evidence_manifest jsonb NOT NULL,
  counted_at timestamptz NOT NULL,
  counted_by uuid NULL,
  created_at timestamptz DEFAULT now()
);
```

### GAP D: Exception Framework (HIGH)

**Vision**: Detect variances, require resolution, gate finalization
**Reality**: No exception tracking exists

**Impact**:
- Discrepancies go undetected
- No accountability for missing slips or count variances
- Cannot enforce "no finalize with open exceptions"

**Required Artifacts**:
```sql
CREATE TABLE reconciliation_exception (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES table_inventory_session(id),
  category text NOT NULL, -- 'MISSING_SLIP', 'COUNT_VARIANCE', etc.
  variance_cents bigint NULL,
  status text NOT NULL DEFAULT 'OPEN',
  resolution_note text NULL,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz DEFAULT now()
);
```

---

## Implementation Roadmap Summary

### Immediate Priority (Unblock Shift Dashboard)
1. **Telemetry Pipeline**: Service + HTTP + Hook + UI for grind logging
2. **Rated Buy-in Bridge**: Link `player_financial_transaction` to telemetry

### Near-term (Complete Read Model)
3. **Session Table**: `table_inventory_session` with state machine
4. **Session Linkage**: FK from snapshots/fills/credits/drops to session

### Medium-term (Count Room Integration)
5. **Soft Count Table**: `soft_count_table_result`
6. **Count Ingestion RPC**: `rpc_ingest_soft_count()`
7. **Statistical Win**: Update `rpc_shift_table_metrics` to use drop amounts

### Long-term (Compliance Completeness)
8. **Exception Framework**: Detection triggers + resolution UI
9. **Fill/Credit Status**: Add status tracking to workflows
10. **Finalization Gates**: Enforce exceptions resolved before finalize

---

## References

- **Lifecycle Vision**: `table-inventory-rundown-lifecycle.md`
- **Read Model Addendum**: `ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md`
- **EXEC-SPEC**: `docs/20-architecture/specs/ADDENDUM-TBL-RUNDOWN/EXECUTION-SPEC-ADDENDUM-TBL-RUNDOWN.md`
- **PRD**: `docs/10-prd/PRD-Shift-Dashboards-Implementation-v0.2.md`
- **Telemetry RPC**: `supabase/migrations/20260114004141_rpc_log_table_buyin_telemetry.sql`
- **Telemetry Table**: `supabase/migrations/20260114003530_table_buyin_telemetry.sql`
- **Shift Metrics RPC**: `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql`
- **Chip Custody**: `supabase/migrations/20251108195341_table_context_chip_custody.sql`
