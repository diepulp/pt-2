---
id: PRD-090-WS5
title: Legacy Consumer Suppression Inventory
owner: Lead Architect
status: Certified
created: 2026-05-30
last_updated: 2026-06-01
prd: docs/10-prd/PRD-090-table-inventory-accounting-canon-exemplar-v0.md
authority: docs/issues/table-inventory-accounting-canon/LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml
da_review: DA-REVIEW-06-01
---

# PRD-090 WS5 — Legacy Consumer Suppression Inventory

This artifact is the required WS5 inventory for PRD-090. It is the authoritative
enumeration of every active legacy table-result consumer that must be suppressed
or migrated before the exemplar lands. The detailed per-consumer classification
is in `LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml`; this document is the
certification summary and gate record.

---

## Scope

**In scope:** Active UI routes, dashboards, reports, API routes, route DTOs, and
v2/v3 dashboard components reachable by pit boss or operator workflows.

**Out of scope:** Deleted routes, archived documentation, test fixtures, SQL
migration artifacts, internal-only fields never returned to an operator boundary.

---

## Disposition Values

| Disposition | Meaning |
|---|---|
| `consume_projection` | Consumer uses `TableInventoryAccountingProjection` exclusively — no legacy formula |
| `suppress_rendering` | Active surface — forbidden fields and labels removed from render and serialization |
| `inactive_or_internal_only_with_reason` | Deleted, archived, test-only, or internal bookkeeping never returned to an operator boundary |

---

## Forbidden Terms

**Fields:**
`win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`,
`win_loss_inventory_total_cents`, `estimated_drop_buyins_cents`, `table_win_cents`,
`win_loss_cents` (checkpoint DTO aggregate — forbidden at DTO+API+label level)

**Labels:**
`"Win/Loss"` (unqualified), `"Estimated Win/Loss"`, `"Total Drop"`, `"Posted Drop"`,
`"Final Win/Loss"`, `"Settled Result"`, `"Reconciled Result"`

---

## UI Consumer Inventory

| Consumer ID | Path | Forbidden term(s) | Disposition | Code change? | Follow-up ticket |
|---|---|---|---|---|---|
| LEGACY-CONSUMER-001 | `components/shift-dashboard/table-metrics-table.tsx` | `win_loss_inventory_cents`, `win_loss_estimated_cents`, `"Win/Loss"` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-002 | `components/shift-dashboard/pit-metrics-table.tsx` | `win_loss_inventory_total_cents`, `win_loss_estimated_total_cents` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-003 | `components/shift-dashboard/casino-summary-card.tsx` | `win_loss_inventory_total_cents`, `win_loss_estimated_total_cents` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-004 | `components/pit-panels/analytics-panel.tsx` | `win_loss_inventory_cents`, `estimated_drop_buyins_cents`, `"Win/Loss"` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-005 | `components/table/rundown-summary-panel.tsx` | `table_win_cents` | `consume_projection` | Yes (WS4) | — (exemplar) |
| LEGACY-CONSUMER-006 | `components/table/rundown-report-card.tsx` | `table_win_cents`, `"Win/Loss"` | `suppress_rendering` | Yes | PRD-090-FU-RUNDOWN-REPORT |
| LEGACY-CONSUMER-007 | `components/shift-dashboard-v3/center/metrics-table.tsx` | `win_loss_estimated_cents`, `"Win/Loss"` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-008 | `components/shift-dashboard-v3/center/pit-table.tsx` | `win_loss_estimated_total_cents`, `"Win/Loss"` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-009 | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | `win_loss_estimated_total_cents` (prop pass-through) | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-010 | `components/shift-dashboard-v3/charts/win-loss-trend-chart.tsx` | `win_loss_estimated_total_cents`, `"Win/Loss"` (×6) | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-011 | `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` | `"Win/Loss"` label (×3) | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-CONSUMER-012 | `components/reports/shift-report/sections/executive-summary.tsx` | `"Win/Loss"` KPI label | `suppress_rendering` | Yes | PRD-090-FU-REPORTS |
| LEGACY-CONSUMER-013 | `components/reports/shift-report/sections/financial-summary.tsx` | `"Win/Loss"` column header | `suppress_rendering` | Yes | PRD-090-FU-REPORTS |
| LEGACY-CONSUMER-014 | `components/shift-intelligence/anomaly-alert-card.tsx` | `"Win/Loss"` label map entry | `suppress_rendering` | Yes | PRD-090-FU-ANOMALY |

**Total UI consumers: 14. Exemplar (consume_projection): 1. Suppress_rendering: 13.**

---

## API / DTO Surface Inventory

| API ID | Path / Route | Forbidden field(s) | Disposition | Code change? | Follow-up ticket |
|---|---|---|---|---|---|
| LEGACY-API-001 | `services/table-context/shift-metrics/dtos.ts` — ShiftTableMetricsDTO | `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-API-002 | `services/table-context/dtos.ts` — TableRundownDTO.table_win_cents | `table_win_cents` | `consume_projection` | Yes (WS4) | — (exemplar) |
| LEGACY-API-003 | `services/table-context/rundown-report/dtos.ts` — RundownReportTableDTO, RundownReportCasinoDTO | `table_win_cents` | `suppress_rendering` | Yes | PRD-090-FU-RUNDOWN-REPORT |
| LEGACY-API-004 | `services/table-context/shift-metrics/dtos.ts` — ShiftPitMetricsDTO | `win_loss_estimated_total_cents`, `win_loss_inventory_total_cents` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-API-005 | `services/table-context/shift-metrics/dtos.ts` — ShiftCasinoMetricsDTO | `win_loss_estimated_total_cents`, `win_loss_inventory_total_cents` | `suppress_rendering` | Yes | PRD-090-FU-DASHBOARD |
| LEGACY-API-006 | `app/api/v1/shift-dashboards/metrics/tables/route.ts` | serializes LEGACY-API-001 fields | `suppress_rendering` | Yes (post-DTO) | PRD-090-FU-DASHBOARD |
| LEGACY-API-007 | `services/reporting/shift-report/assembler.ts` | maps all five forbidden fields to report facts | `suppress_rendering` | Yes | PRD-090-FU-REPORTS |
| LEGACY-API-008 | `services/table-context/shift-checkpoint/dtos.ts` — ShiftTableCheckpointDTO, ShiftCheckpointDeltaDTO | `win_loss_cents` | `suppress_rendering` | Yes | PRD-090-FU-ANOMALY |
| LEGACY-API-009 | `app/api/v1/shift-dashboards/metrics/pits/route.ts` | serializes LEGACY-API-004 fields via passthrough | `suppress_rendering` | Verify after DTO | PRD-090-FU-DASHBOARD |
| LEGACY-API-010 | `app/api/v1/shift-dashboards/metrics/casino/route.ts` | serializes LEGACY-API-005 fields via passthrough | `suppress_rendering` | Verify after DTO | PRD-090-FU-DASHBOARD |

**Total API/DTO surfaces: 10. Exemplar (consume_projection): 1. Suppress_rendering: 9.**

---

## RPC / Query Source Inventory

| RPC ID | Path | RPC / Query | Issue | Disposition |
|---|---|---|---|---|
| LEGACY-RPC-001 | `services/table-context/rundown.ts` | `rpc_compute_table_rundown` | PATCHED stub — WS4 removes from exemplar path | `consume_projection` (WS4); fate (drop vs. quarantine) is EXEC decision post-WS4 — see `tia.rpc_compute_table_rundown_fate` |
| LEGACY-RPC-002 | `services/table-context/shift-metrics/service.ts` | `rpc_shift_table_metrics` | Gaming-day scope; COALESCE(SUM,0) — ADR-061 violations | Service call may remain for non-forbidden fields; DTO fields derived from it must be suppressed per LEGACY-API-001/004/005 |
| LEGACY-RPC-003 | `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql` | SQL definition | COALESCE-to-zero in DB; gaming-day scope | `inactive_or_internal_only_with_reason` — migration artifact; no operator-visible surface; dropping is EXEC decision |
| LEGACY-RPC-004 | `supabase/migrations/20260114004455_rpc_shift_rollups.sql` | `rpc_shift_pit_metrics`, `rpc_shift_casino_metrics` | Rollup of forbidden fields | `inactive_or_internal_only_with_reason` — migration artifact; operator-visible exposure closed by LEGACY-API-004/005 suppression |

---

## Label Suppression Coverage

| Label | Consumer(s) | Disposition | Required action |
|---|---|---|---|
| `"Win/Loss"` (unqualified) | LEGACY-CONSUMER-001/004/006/007/008/010/011/012/013/014 | suppress_rendering | Remove from all render paths per individual consumer obligations |
| `"Estimated Win/Loss"` | Shift dashboard v1/v3 surfaces | suppress_rendering | Remove from chart config, axis labels, tooltip text, ARIA strings |
| `"Win/Loss (Inv)"`, `"Win/Loss (Est)"` | LEGACY-CONSUMER-002 | suppress_rendering | Remove both columns from pit-metrics-table.tsx |
| `"Win/Loss (Inventory)"`, `"Win/Loss (Estimated)"` | LEGACY-CONSUMER-003 | suppress_rendering | Remove both KpiCards from casino-summary-card.tsx |
| `"Estimated Drop"` | LEGACY-CONSUMER-004 | suppress_rendering | Remove from analytics panel metrics array |
| `"Table Win"`, `"Table Loss"` | LEGACY-CONSUMER-005 | `consume_projection` (WS4) | Replaced by `"Projected Win/Loss"` / `"Partial Table Result"` discriminators |

---

## provenance.ts — Build-Blocker Obligation

`services/table-context/shift-metrics/provenance.ts` (lines 65–66) references
`win_loss_inventory_cents` and `win_loss_estimated_cents` from `ShiftTableMetricsDTO`.
When LEGACY-API-001 removes those fields from the DTO, the TypeScript build **will
fail**. This must be resolved **in the same WS5 commit** as LEGACY-API-001.

**Required action (choose one):**
- (a) Replace the two field references with a non-forbidden quality signal.
- (b) Deprecate `metric_grade` from `ShiftTableMetricsDTO` entirely if no
  non-suppressed consumer requires it.

**Gate:** `npm run type-check` passes after LEGACY-API-001 changes and before any
other WS5 commit merges.

---

## Checkpoint DTO Suppression (UNRESOLVED-003 consequence)

`ShiftTableCheckpointDTO.win_loss_cents` and `ShiftCheckpointDeltaDTO.win_loss_cents`
are downstream aggregates of `win_loss_inventory_cents` (LEGACY-API-008,
`exec_obligation: code_change_required`). The checkpoint routes
`GET /api/v1/shift-checkpoints/latest` and `GET /api/v1/shift-checkpoints/delta`
serialize these DTOs. When LEGACY-API-008 removes `win_loss_cents`, route
serialization tests must verify it is absent from operator-facing JSON.

Both checkpoint route endpoints are in the automated gate target list.

---

## Follow-Up Ticket Register

These are umbrella tickets scoped by suppression domain. Each ticket covers full
canonical migration once a downstream PRD is authored for that surface group.
Suppression in PRD-090 is confirmed correct at the time of writing.

| Ticket ID | Domain | Covered consumers |
|---|---|---|
| PRD-090-FU-DASHBOARD | Shift dashboard (v1+v2+v3) + analytics panel | LEGACY-CONSUMER-001/002/003/004/007/008/009/010/011; LEGACY-API-001/004/005/006/009/010 |
| PRD-090-FU-REPORTS | Shift report | LEGACY-CONSUMER-012/013; LEGACY-API-007 |
| PRD-090-FU-RUNDOWN-REPORT | Rundown report card | LEGACY-CONSUMER-006; LEGACY-API-003 |
| PRD-090-FU-ANOMALY | Shift intelligence anomaly alerts + checkpoint DTO | LEGACY-CONSUMER-014; LEGACY-API-008 |
| PRD-090-FU-RPC-FATE | `rpc_compute_table_rundown` drop-or-quarantine decision | LEGACY-RPC-001 |

---

## Automated Suppression Gate Specification

### Forbidden field grep

Run against all `app/`, `components/`, `hooks/`, `services/` files, excluding
`**/__tests__/**`, `docs/`, `supabase/migrations/`, `lib/sentry/pii-denylist.ts`,
and `docs/issues/` (classification artifacts).

```bash
git grep -rn \
  -e 'win_loss_inventory_cents' \
  -e 'win_loss_estimated_cents' \
  -e 'win_loss_estimated_total_cents' \
  -e 'win_loss_inventory_total_cents' \
  -e 'estimated_drop_buyins_cents' \
  -e 'table_win_cents' \
  -e 'win_loss_cents' \
  -- 'app/' 'components/' 'hooks/' 'services/' \
  ':!**/__tests__/**' \
  ':!lib/sentry/pii-denylist.ts'
# Expected: zero matches in active non-test production code.
```

### Forbidden label grep

```bash
git grep -rn \
  -e '"Win/Loss"' \
  -e "'Win/Loss'" \
  -e '"Estimated Win/Loss"' \
  -- 'app/' 'components/' 'hooks/' 'services/' \
  ':!**/__tests__/**' \
  ':!lib/sentry/pii-denylist.ts'
# Expected: zero matches in active non-test production code.
# Covers both JSX attributes AND object-literal property values (e.g., label map entries).
```

### API serialization tests

Route response tests must assert forbidden fields are absent from operator-facing
JSON for every route in this list:

- `GET /api/v1/shift-dashboards/metrics/tables`
- `GET /api/v1/shift-dashboards/metrics/pits`
- `GET /api/v1/shift-dashboards/metrics/casino`
- `GET /api/v1/table-rundown-reports/[id]`
- `GET /api/v1/reports/shift-summary`
- `GET /api/v1/shift-checkpoints/latest`
- `GET /api/v1/shift-checkpoints/delta`

Test IDs: `tia.active_surface_suppression_gate`, `tia.shift_metric_api_suppression`.

---

## Shift Report Regression Disclosure

Suppressing LEGACY-API-007 removes all five forbidden fields from the shift report
assembler. The shift report executive summary and financial summary will show no
table-result values until a subsequent PRD wires `TableInventoryAccountingProjection`
into the report assembly path.

**Required in-report placeholder:** The suppressed sections must render a
disclosure rather than a blank:

> *"Table win/loss data is unavailable during the Table Inventory Accounting
> migration. Values will be restored when the canonical projection is connected
> to this report surface."*

This disclosure must be present in the WS5 commit and confirmed in PR review
before merge. Follow-up: PRD-090-FU-REPORTS.

---

## Certification Checklist

- [x] Every search target has an inventory row or documented exclusion.
  **Evidence:** 14 UI consumers + 10 API/DTO surfaces + 4 RPC sources enumerated
  above. Allowed residual matches (tests, docs, SQL migrations, PII denylist,
  migration comments) documented in LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml
  `allowed_residual_matches` section.

- [x] Every active UI/report/export consumer either consumes the projection or
  suppresses rendering.
  **Evidence:** LEGACY-CONSUMER-005 → `consume_projection` (WS4 exemplar).
  LEGACY-CONSUMER-001 through 004, 006 through 014 → `suppress_rendering` with
  `exec_obligation: code_change_required`. No active surface uses
  `inactive_or_internal_only_with_reason` while rendering forbidden values.

- [x] Every operator-facing API/DTO boundary suppresses serialization of forbidden
  fields.
  **Evidence:** LEGACY-API-001 through 010 all classified with suppression actions.
  LEGACY-API-002 → `consume_projection` (WS4). All others → `suppress_rendering`
  with `exec_obligation: code_change_required` or `verify_after_dto_suppression`.
  Seven route serialization tests required in WS6.

- [x] Follow-up tickets exist for any active consumer that is suppressed but not
  migrated.
  **Evidence:** Five umbrella tickets registered above (PRD-090-FU-DASHBOARD,
  PRD-090-FU-REPORTS, PRD-090-FU-RUNDOWN-REPORT, PRD-090-FU-ANOMALY,
  PRD-090-FU-RPC-FATE). All 13 suppressed UI consumers and 9 suppressed API
  surfaces are covered by one of these tickets.

- [x] `tia.active_surface_suppression_gate` — automated grep gate specification
  defined above; runs in CI; zero matches expected in active production code.

- [x] `tia.shift_metric_api_suppression` — route serialization tests defined for
  seven operator-facing endpoints; `win_loss_cents` included as a forbidden
  field for checkpoint route tests (UNRESOLVED-003 consequence).
