---
prd_id: PRD-036
title: "Shift Win/Loss Opening Baseline — Ranked Fallback & Provenance"
status: draft
version: "0.1.0"
date: 2026-02-19
author: lead-architect
priority: P1
category: BUGFIX
severity: High
bounded_contexts:
  - TableContextService
affected_adrs:
  - ADR-024 (Context Derivation)
  - ADR-027 (Table Bank Mode)
dependencies:
  - "gaming_table.par_total_cents (exists — ADR-027 schema migration)"
  - "rpc_shift_table_metrics (authoritative: 20260219002247_enable_adjustment_telemetry.sql)"
triggering_issues:
  - "ISSUE-B8B516AF (Shift Dashboard Win/Loss Shows $0 After Inventory Count)"
policy_reference: "docs/00-vision/table-context-read-model/POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md"
tags: [table-context, shift-metrics, win-loss, opening-baseline, provenance, null-rendering]
---

# PRD-036: Shift Win/Loss Opening Baseline — Ranked Fallback & Provenance

## 1. Overview

**Owner:** TableContextService
**Status:** Draft v0.1.0

The shift dashboard displays "$0" for win/loss when a newly enrolled casino performs its first inventory count mid-shift. The root cause is a timing gate in `rpc_shift_table_metrics`: the opening snapshot CTE requires a snapshot **before** `window_start`, which cannot exist for a brand-new casino. The RPC correctly returns NULL, but the UI pipeline silently coalesces NULL → 0 → "$0".

This PRD implements the ranked opening baseline fallback defined in `POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md` (Sources A→E) and fixes the null rendering pipeline so the UI never lies about missing data.

## 2. Problem & Goals

### Problem

When a newly enrolled casino opens its first table and performs a mid-shift inventory count:

1. **No opening snapshot exists** before `window_start` (casino was just created)
2. `rpc_shift_table_metrics` returns `NULL` for `win_loss_inventory_cents` and `win_loss_estimated_cents`
3. The service layer coalesces `null ?? 0` during casino-level aggregation
4. `formatCents(null)` returns `"$0"` instead of indicating unknown
5. The shift dashboard hero and metrics table both display **"$0"** — indistinguishable from a true breakeven result

This affects every new casino on their first shift and any table that has never had a pre-shift inventory count.

### Goals

| # | Goal | Observable Outcome |
|---|------|--------------------|
| G1 | Ranked baseline fallback | `rpc_shift_table_metrics` tries Sources A→E in order; new casinos with par targets get a bootstrapped baseline (Source C) |
| G2 | Provenance transparency | Every win/loss result includes `opening_source`, `coverage_type`, and `opening_at` so the UI can explain the number |
| G3 | Honest null rendering | `formatCents(null)` → `"—"` globally; no silent null-to-zero coalescion at any layer |
| G4 | Actionable UX | When no baseline exists (Source E), the dashboard shows "N/A" with an "Opening count required" CTA |

### Non-Goals

- **Materialized synthetic snapshots.** The policy recommends dynamic computation for MVP (§7). Materializing `is_synthetic` / `synthetic_reason` snapshot rows is a future enhancement.
- **Modifying `rpc_open_table_session` to auto-create opening snapshots.** This was Issue doc Option A — deferred per policy guidance favoring computation-time fallback.
- **Fixing `rpc_compute_table_rundown` JSON fallback bug** (Issue doc Gap #2). Separate scope — session-level rundown, does not affect shift dashboard.
- **Fixing legacy chip custody RPC security gaps** (Issue doc Gap #4). Separate scope — tracked in SEC-001 remediation.
- **Changing `table_inventory_snapshot.snapshot_type` CHECK constraint.** No new snapshot types needed for dynamic computation.
- **Reporting-level filtering** (policy §9 "exclude bootstrapped baselines"). Future scope for audit/compliance reports.

## 3. Users & Use Cases

| User | Role | Top Jobs |
|------|------|----------|
| Pit Boss | pit_boss | View shift win/loss for all tables; understand why a number might be estimated vs counted |
| Floor Supervisor | floor_supervisor | Check individual table win/loss; take action when baseline is missing |
| Casino Operator (new) | admin | Onboard casino, open first table, see meaningful data on first shift dashboard |

**Primary Use Case:** New casino operator completes onboarding (par targets set), opens BJ-01 for the first shift, performs a mid-shift chip count. The shift dashboard shows a bootstrapped win/loss value labeled "Estimated from par target" instead of "$0" or blank.

## 4. Scope & Feature List

### In Scope

1. **RPC: Ranked opening baseline fallback** — Modify `rpc_shift_table_metrics` to cascade through Sources A→E as defined in policy §4
2. **RPC: Provenance output columns** — Add `opening_source`, `opening_bankroll_cents`, `opening_at`, `coverage_type` to the return type
3. **Service: DTO provenance fields** — Extend `ShiftTableMetricsDTO` with provenance fields from the RPC
4. **Service: Fix null aggregation** — Replace `null ?? 0` in casino-level reduce with null-aware summation
5. **Service: Extend provenance.ts** — Add `opening_source` enum to existing provenance metadata
6. **UI: Fix `formatCents(null)`** — Return `"—"` instead of `"$0"` for null inputs
7. **UI: Provenance indicators** — Show bootstrap/partial-window labels in hero and metrics table
8. **UI: Missing baseline CTA** — Show "Opening count required" when `opening_source = 'none'`

### Out of Scope

- New schema columns on `table_inventory_snapshot`
- Modifications to `rpc_open_table_session`
- `rpc_compute_table_rundown` fixes
- Legacy RPC security remediation
- Audit/compliance report filtering

## 5. Requirements

### Functional Requirements

| # | Requirement | Rationale |
|---|-------------|-----------|
| FR-1 | `rpc_shift_table_metrics` SHALL try opening baseline sources in order: (A) pre-window snapshot, (C) `gaming_table.par_total_cents`, (D) earliest in-window snapshot, (E) NULL | Policy §4 ranked hierarchy. Source B is treated as part of A **only if** the system cannot distinguish a semantic opening snapshot. In that case the baseline is labeled `snapshot:prior_count`. |
| FR-2 | When Source C is used, `opening_bankroll_cents` SHALL equal `gaming_table.par_total_cents` for that table | Policy §4.3 — par is the bootstrap estimate |
| FR-3 | The RPC return type SHALL include: `opening_source` (text), `opening_bankroll_cents` (bigint nullable), `opening_at` (timestamptz nullable), `coverage_type` (text) | Policy §6 provenance contract |
| FR-4 | `opening_source` SHALL be one of: `'snapshot:prior_count'`, `'snapshot:prior_count'`, `'bootstrap:par_target'`, `'fallback:earliest_in_window'`, `'none'` | Policy §4 enum values |
| FR-5 | `coverage_type` SHALL be `'full'` for Sources A/B/C, `'partial'` for Source D, `'unknown'` for Source E | Policy §5 decision table |
| FR-6 | Casino-level aggregation SHALL exclude tables with NULL `win_loss_inventory_cents` from the sum and track the excluded count | Prevents null-to-zero coalescing that masks missing data |
- Casino-level totals **sum known tables only** and display `missing_baseline_count` (and optionally the list of table_ids) so ops can see what's excluded.
| FR-7 | `formatCents(null)` SHALL return `"—"` (em dash), not `"$0"` | Policy §8 "stop lying" |
| FR-8 | When `opening_source = 'none'`, the UI SHALL display "N/A" with a "Record opening count" CTA | Policy §8 actionable UX |
| FR-9 | When `opening_source = 'bootstrap:par_target'`, the UI SHALL show a "Bootstrapped from par" indicator | Policy §8 transparency |
| FR-10 | When `coverage_type = 'partial'`, the UI SHALL show a "Partial window" indicator | Policy §8 transparency |

### Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NFR-1 | RPC performance: the baseline fallback MUST NOT add a sequential query. Use a single CTE with COALESCE/UNION logic. |
| NFR-2 | `formatCents` change is global — all existing callsites that pass null should render "—" instead of "$0". No per-callsite opt-in. |
| NFR-3 | Provenance fields MUST be nullable at the DTO level so existing consumers degrade gracefully during rollout. |

### References (not duplicated)

- **Policy:** `POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md` — complete ranked source definitions and UI rules
- **Issue:** `ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` — root cause analysis with line-level code references
- **SRM:** TableContextService owns `table_inventory_snapshot`, `gaming_table`, shift metrics RPC
- **ADR-024:** Context derivation — RPC continues to use `set_rls_context_from_staff()`
- **ADR-027:** Table bank mode — par columns already exist on `gaming_table`

## 6. UX / Flow Overview

### Flow 1: New Casino First Shift (Source C — Bootstrap)

1. Operator completes onboarding → par targets set on `gaming_table.par_total_cents`
2. Pit boss opens BJ-01 for first shift
3. Mid-shift, operator performs inventory count → creates closing snapshot
4. Dashboard queries `rpc_shift_table_metrics`
5. RPC: no pre-window snapshot → falls back to Source C (`par_total_cents`)
6. Dashboard shows win/loss value with "Bootstrapped from par target" indicator
7. Provenance: `opening_source = 'bootstrap:par_target'`, `coverage_type = 'full'`

### Flow 2: Established Casino Normal Shift (Source A — Snapshot)

1. Prior shift close created a snapshot before `window_start`
2. Dashboard queries `rpc_shift_table_metrics`
3. RPC: pre-window snapshot found → Source A
4. Dashboard shows normal win/loss value, no indicator
5. Provenance: `opening_source = 'snapshot:prior_count'`, `coverage_type = 'full'`

### Flow 3: No Par Set, No Snapshots (Source E — Unknown)

1. Casino has tables but par was never configured
2. No inventory counts have ever been performed
3. Dashboard queries `rpc_shift_table_metrics`
4. RPC: all sources exhausted → Source E, returns NULL
5. Dashboard shows "N/A" with "Record opening count" CTA
6. Provenance: `opening_source = 'none'`, `coverage_type = 'unknown'`

### Flow 4: Only Mid-Shift Snapshot Exists (Source D — Partial)

1. No pre-window snapshots, no par target
2. Operator performs count 2 hours into shift → creates in-window snapshot
3. RPC: uses earliest in-window snapshot as baseline → Source D
4. Dashboard shows win/loss value with "Partial window" indicator
5. Provenance: `opening_source = 'fallback:earliest_in_window'`, `coverage_type = 'partial'`

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| `gaming_table.par_total_cents` column | Exists (ADR-027 migration) | Source C reads from this column |
| `gaming_table.par_set_at (or the canonical par timestamp column; verify actual field name in current schema)` column | Exists (ADR-027 migration) | Used for `opening_at` when Source C |
| `chipset_total_cents()` function | Exists | Used by current opening/closing snapshot CTEs |
| `set_rls_context_from_staff()` | Exists (ADR-024) | RPC context derivation unchanged |

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `par_total_cents` is NULL for some tables (never set during onboarding) | Medium | Source C falls through to Source D or E. No false data. |
| Global `formatCents(null)` change affects unexpected callsites | Low | Correct behavior everywhere — null cents should never display as "$0". Run full test suite. |
| Casino-level aggregation change breaks existing dashboard totals | Low | Only affects totals when tables have NULL win/loss — currently coalesced to 0 (wrong). New behavior is strictly more correct. |
| RPC performance regression from additional CTE joins | Low | Single COALESCE cascade, no sequential queries. `gaming_table` already joined for table name. |

## 8. Definition of Done

### Functionality

- [ ] `rpc_shift_table_metrics` returns non-NULL `win_loss_inventory_cents` when `gaming_table.par_total_cents` is set (Source C fallback works)
- [ ] `rpc_shift_table_metrics` returns `opening_source`, `opening_bankroll_cents`, `opening_at`, `coverage_type` in every row
- [ ] `opening_source` correctly reflects which source was used (verified against each of Sources A, C, D, E)
- [ ] Casino-level aggregation excludes tables with NULL win/loss from the sum
- [ ] `formatCents(null)` returns `"—"` in all contexts

### Data & Integrity

- [ ] Provenance fields are populated for every table row in the RPC result — no silent NULLs in provenance when win/loss is non-NULL
- [ ] Bootstrap baseline (Source C) uses `par_total_cents` at query time (not cached) — always reflects latest par

### Security & Access

- [ ] RPC continues to derive context via `set_rls_context_from_staff()` (ADR-024) — no new parameters
- [ ] No new SECURITY DEFINER functions introduced

### Testing

- [ ] Unit test: `formatCents(null)` → `"—"`, `formatCents(0)` → `"$0"`, `formatCents(1000)` → `"$10"`
- [ ] RPC test: new casino with par set, no snapshots → Source C baseline, correct win/loss
- [ ] RPC test: new casino with no par, no snapshots → Source E, NULL win/loss
- [ ] RPC test: established casino with pre-window snapshot → Source A, unchanged behavior
- [ ] Service test: casino aggregation with mix of null and non-null tables → correct total, excluded count

### Operational Readiness

- [ ] Migration passes `npm run db:types-local` and `npm run type-check`

### Documentation

- [ ] `ShiftTableMetricsDTO` updated with provenance fields in `dtos.ts`
- [ ] Issue doc `ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` status updated to "Fixed" with PRD reference

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/gaps/table-inventory-lifecycle/ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` | Triggering issue — root cause analysis |
| `docs/00-vision/table-context-read-model/POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md` | Governing policy — ranked source definitions |
| `docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md` | Parent gap document |
| `docs/80-adrs/ADR-027-table-bank-mode.md` | Par columns, table bank mode schema |
| `docs/80-adrs/ADR-024-context-derivation.md` | RPC context derivation pattern |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | TableContextService bounded context |

---

## Appendix A: Implementation Plan

### WS1: RPC Migration — Ranked Opening Baseline Fallback

**File:** `supabase/migrations/YYYYMMDDHHMMSS_prd036_shift_metrics_opening_baseline.sql`
**Replaces:** `rpc_shift_table_metrics` in `20260219002247_enable_adjustment_telemetry.sql`

**Approach:** Replace the single `opening_snapshots` CTE with a ranked baseline CTE that cascades through sources:

```sql
-- Ranked opening baseline: A → C → D → E
opening_baseline AS (
  SELECT DISTINCT ON (gt.id)
    gt.id AS table_id,

    -- Source priority: pre-window snapshot > par > in-window snapshot > null
    COALESCE(
      pre.bankroll_total_cents,        -- Source A: pre-window snapshot
      gt.par_total_cents,              -- Source C: bootstrap from par
      inw.bankroll_total_cents         -- Source D: earliest in-window
    ) AS opening_bankroll_cents,

    CASE
      WHEN pre.snapshot_id IS NOT NULL THEN 'snapshot:prior_count'
      WHEN gt.par_total_cents IS NOT NULL THEN 'bootstrap:par_target'
      WHEN inw.snapshot_id IS NOT NULL THEN 'fallback:earliest_in_window'
      ELSE 'none'
    END AS opening_source,

    COALESCE(pre.snapshot_at, gt.par_updated_at, inw.snapshot_at) AS opening_at,

    CASE
      WHEN pre.snapshot_id IS NOT NULL THEN 'full'
      WHEN gt.par_total_cents IS NOT NULL THEN 'full'
      WHEN inw.snapshot_id IS NOT NULL THEN 'partial'
      ELSE 'unknown'
    END AS coverage_type

  FROM active_tables gt
  LEFT JOIN LATERAL (
    -- Source A: latest snapshot at or before window_start
    SELECT tis.id AS snapshot_id, tis.created_at AS snapshot_at,
           chipset_total_cents(tis.chipset) AS bankroll_total_cents
    FROM public.table_inventory_snapshot tis
    WHERE tis.casino_id = v_context_casino_id
      AND tis.table_id = gt.id
      AND tis.created_at <= p_window_start
    ORDER BY tis.created_at DESC LIMIT 1
  ) pre ON true
  LEFT JOIN LATERAL (
    -- Source D: earliest snapshot within window
    SELECT tis.id AS snapshot_id, tis.created_at AS snapshot_at,
           chipset_total_cents(tis.chipset) AS bankroll_total_cents
    FROM public.table_inventory_snapshot tis
    WHERE tis.casino_id = v_context_casino_id
      AND tis.table_id = gt.id
      AND tis.created_at > p_window_start
      AND tis.created_at <= p_window_end
    ORDER BY tis.created_at ASC LIMIT 1
  ) inw ON true
)
```

**Win/loss computation update:**

```sql
CASE
  WHEN ob.opening_bankroll_cents IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
    (cs.bankroll_total_cents - ob.opening_bankroll_cents)
        - COALESCE(fa.fills_total, 0)
        + COALESCE(ca.credits_total, 0)
  ELSE NULL
END::bigint AS win_loss_inventory_cents,

-- Provenance columns
ob.opening_source,
ob.opening_bankroll_cents,
ob.opening_at,
ob.coverage_type
```

### WS2: Service Layer — Provenance Propagation & Null Fix

**Files:**
- `services/table-context/shift-metrics/dtos.ts` — Add provenance fields
- `services/table-context/shift-metrics/service.ts` — Fix aggregation, map provenance
- `services/table-context/shift-metrics/provenance.ts` — Add `opening_source` enum

**DTO changes (dtos.ts):**

```typescript
// Add to ShiftTableMetricsDTO
opening_source: 'snapshot:prior_count' | 'snapshot:prior_count' | 'bootstrap:par_target' | 'fallback:earliest_in_window' | 'none' | null;
opening_bankroll_cents: number | null;
opening_at: string | null;
coverage_type: 'full' | 'partial' | 'unknown' | null;
```

**Aggregation fix (service.ts, casino reduce):**

```typescript
// BEFORE (lossy):
// win_loss_inventory_total_cents: tables.reduce((sum, t) => sum + (t.win_loss_inventory_cents ?? 0), 0),

// AFTER (null-aware):
const tablesWithInventory = tables.filter(t => t.win_loss_inventory_cents != null);
win_loss_inventory_total_cents: tablesWithInventory.length > 0
  ? tablesWithInventory.reduce((sum, t) => sum + t.win_loss_inventory_cents!, 0)
  : null,
tables_missing_baseline_count: tables.length - tablesWithInventory.length,
```

### WS3: UI — Null Rendering Pipeline Fix

**Files:**
- `lib/format.ts` — Fix `formatCents(null)`
- `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` — Provenance indicator
- `components/shift-dashboard-v3/center/metrics-table.tsx` — Provenance indicator, CTA

**formatCents fix:**

```typescript
// BEFORE:
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  return formatDollars(cents / 100);
}

// AFTER:
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return formatDollars(cents / 100);
}
```

**Hero component:** Replace `winLossCents ?? 0` with null-aware display:
- `null` → "N/A" + CTA
- Non-null + `opening_source = 'bootstrap:par_target'` → value + "Bootstrapped from par" badge
- Non-null + `coverage_type = 'partial'` → value + "Partial window" badge

**Metrics table:** Replace direct `formatCents(table.win_loss_estimated_cents)` with provenance-aware cell.

---

## Appendix B: Affected Files Summary

| Category | File | Change |
|----------|------|--------|
| Migration | `supabase/migrations/YYYYMMDDHHMMSS_prd036_shift_metrics_opening_baseline.sql` | New — replaces `rpc_shift_table_metrics` |
| DTO | `services/table-context/shift-metrics/dtos.ts` | Add provenance fields |
| Service | `services/table-context/shift-metrics/service.ts` | Fix null aggregation, map provenance |
| Provenance | `services/table-context/shift-metrics/provenance.ts` | Add `opening_source` enum |
| Format | `lib/format.ts` | `formatCents(null)` → `"—"` |
| UI | `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` | Null display, provenance badge |
| UI | `components/shift-dashboard-v3/center/metrics-table.tsx` | Null display, provenance badge, CTA |
| Types | `types/database.types.ts` | Regenerated after migration |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-02-19 | Initial draft from ISSUE-B8B516AF investigation + POLICY-SHIFT-WINLOSS-OPENING-BASELINE |

---
## Audit Fold-In (2026-02-19)
- Fixed win/loss SQL formula to align with canonical sign convention: `(closing - opening) - fills + credits`.
- Removed misleading `snapshot:verified_open` labeling; baseline-from-snapshot is now labeled `snapshot:prior_count` unless true opening semantics exist.
- Clarified ranked baseline order as `A/B → C → D → E`.
- Defined partial-window semantics for Source D.
- Made casino aggregation behavior explicit: sum known tables + expose missing baseline count.
- Replaced `par_updated_at` reference with a schema-verified par timestamp placeholder.
