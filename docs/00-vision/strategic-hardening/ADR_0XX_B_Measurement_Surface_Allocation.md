---
adr: ADR-0XX-B
date: 2026-03-01
status: Superseded by PT2_Measurement_Surface_Guidance.md
supersedes: ADR-0XX-A (Measurement Clarifications)
superseded_by: PT2_Measurement_Surface_Guidance.md
title: Measurement Surface Allocation --- UI Placement of Measurement
  Layer Artifacts
---

> ### Superseded (2026-03-06)
>
> This document's **4-surface allocation model** (Pit Terminal, Shift Dashboard, Executive/Finance View, Audit Console) was evaluated and partially rejected by `PT2_Measurement_Surface_Guidance.md`, which is the **operative guidance**.
>
> | This Document Proposes | Guidance Decision |
> |---|---|
> | Separate "Executive / Finance View" for loyalty liability | Collapsed to single lightweight Reports page at `/admin/reports` |
> | Separate "Audit Console" for event correlation | Collapsed to Slip Detail drill-down panel (collapsible section in Rating Slip Modal) |
> | Pit Terminal + Shift Dashboard for telemetry completeness | **Retained** — no change |
>
> The Guidance document's core principle — *"Do not create new pages unless they pay rent"* — rejected the Executive Console and Audit Console as overbuilding.
>
> **Additionally**, PRD-040/042 (merged 2026-03-06) shipped the admin route group with role guard, alerts page, and reports placeholder — establishing the actual infrastructure that the Guidance doc's "Reports page" maps to.
>
> **For implementation, reference `PT2_Measurement_Surface_Guidance.md` and `MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md` (with its staleness addendum).** This document is retained for historical context on the allocation decision process.

# Purpose

This amendment formalizes where Measurement Layer artifacts must be
surfaced in the PT-2 UI.

The Measurement Layer defines what is measurable. This amendment defines
where those measurements belong operationally.

Measurements must appear in the UI context where decisions are made.

------------------------------------------------------------------------

# Principle

Measurement surfaces must align with operational scope:

-   Table-level decisions → Pit Terminal
-   Shift-level decisions → Shift Dashboard
-   Financial exposure decisions → Executive / Finance View
-   Regulatory trace decisions → Audit Console

UI placement must avoid dashboard overloading and preserve
bounded-context clarity.

------------------------------------------------------------------------

# Artifact Allocation Matrix

  -------------------------------------------------------------------------------------------------
  Artifact                        Pit Terminal           Shift         Executive /     Audit
                                  (Table-Level)          Dashboard     Finance         Console
  ------------------------------- ---------------------- ------------- --------------- ------------
  `rating_slip.legacy_theo`       ❌                     ❌            ❌              Migration
                                                                                       Validation
                                                                                       Only

  `audit_event_correlation_v`     ❌                     ❌            Optional        ✅
                                                                       (read-only)     

  `telemetry_completeness_v`      ✅ (table slice)       ✅            Optional        ❌
                                                         (aggregate)                   

  `loyalty_liability_snapshots`   ❌                     ❌            ✅              Optional
  -------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# Detailed Allocation

## 1. Telemetry Completeness

### Pit Terminal

Expose per-table metrics: - rated_seconds - ghost_seconds -
untracked_seconds - idle_seconds - accounted_ratio

Purpose: Enable immediate operational correction at the table.

### Shift Dashboard

Expose aggregated metrics: - casino-level accounted_ratio - ranked
tables by untracked_ratio - shift heat map of coverage

Purpose: Enable supervisory correction across tables.

------------------------------------------------------------------------

## 2. Audit Event Correlation

Surface exclusively in:

-   Audit console
-   Slip detail drill-down panel

Purpose: Regulatory and investigative tracing.

Must not clutter operational dashboards.

------------------------------------------------------------------------

## 3. Loyalty Liability Snapshots

Surface exclusively in:

-   Executive dashboard
-   Finance reporting view

Metrics: - total_outstanding_points - estimated_dollar_value
(policy-versioned) - historical trend

Purpose: Executive and financial oversight.

Not operational floor tooling.

------------------------------------------------------------------------

## 4. Legacy Theo (Migration Only)

Surface only in:

-   Admin / Migration validation tooling

Purpose: Parallel-run validation during cutover.

Must not appear in live operational UI.

------------------------------------------------------------------------

# Constraints

1.  Measurement artifacts must not be duplicated across contexts without
    scope justification.
2.  Operational dashboards must prioritize actionability over
    completeness.
3.  Executive views must clearly distinguish canonical truth (points)
    from valuation (estimated dollars).
4.  Audit console views must expose full lineage but remain read-only.

------------------------------------------------------------------------

# Anti-Patterns Prevented

-   Overloading shift dashboard with executive metrics.
-   Surfacing migration-only data in production UI.
-   Treating compliance trace tooling as operational telemetry.
-   Collapsing table-level and casino-level signals into a single
    undifferentiated metric.

------------------------------------------------------------------------

# Status

Proposed --- Pending integration into ADR-0XX series.
