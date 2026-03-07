# PT-2 Measurement Surface Guidance

## Practical UI Allocation Without Overbuilding

------------------------------------------------------------------------

# Purpose

This document translates the Measurement Layer ADR decisions into
practical UI guidance.

The goal is to: - Avoid overbuilding new "consoles" - Prevent shift
dashboard overload - Preserve operational clarity - Introduce minimal
new surfaces only where justified

This is not about building new products. It is about placing
measurements where decisions are made.

------------------------------------------------------------------------

# Core Principle

Do not create new pages unless they pay rent.

Instead:

-   Operational + time-sensitive metrics → Shift Dashboard / Pit
    Terminal
-   Investigative trace tooling → Drill-down panels
-   Financial trend / liability metrics → Reports page (lightweight)

Separation is about context, not ceremony.

------------------------------------------------------------------------

# Where Each Measurement Belongs

## 1. Telemetry Completeness (`telemetry_completeness_v`)

### Shift Dashboard (Aggregate View)

Add a compact "Coverage" widget showing:

-   Casino-level accounted_ratio
-   Ranked tables by untracked_ratio
-   Quick indicator (Healthy / Warning / Critical)

This remains actionable within the shift.

### Pit Terminal (Table-Level Slice)

Expose per-table breakdown:

-   rated_seconds
-   ghost_seconds
-   untracked_seconds
-   idle_seconds

This allows immediate floor correction.

Ghost play counts as accounted time.

Do NOT place historical trend charts here.

------------------------------------------------------------------------

## 2. Audit Event Correlation (`audit_event_correlation_v`)

This does NOT belong on the shift dashboard.

Minimal implementation:

### Slip Detail → "Audit Trace" Panel

Expose:

-   Slip closed event
-   Financial transaction created
-   MTL entry derived
-   Loyalty ledger entry posted
-   Actor attribution
-   Timestamps

This is investigative tooling. It is opened when someone asks "why did
this happen?"

No new "Audit Console" required at this stage.

------------------------------------------------------------------------

## 3. Loyalty Liability Snapshots (`loyalty_liability_snapshots`)

This does NOT belong on the shift dashboard.

Minimal implementation:

### Single "Reports" Route

Start with one panel:

#### Loyalty Liability

-   total_outstanding_points (canonical truth)
-   estimated_dollar_value (policy-based, clearly labeled)
-   7/30/90 day trend
-   CSV export

Shift managers cannot act on liability trends mid-shift. This is
finance/executive context.

No need for a full "Executive Console." A single Reports page is
sufficient.

------------------------------------------------------------------------

## 4. Legacy Theo (Migration Only)

Surface only in:

-   Admin / Migration validation tooling

Never surface in live operational UI.

This is transitional validation infrastructure.

------------------------------------------------------------------------

# How to Detect Dashboard Overload

Keep metrics on the Shift Dashboard only if they are:

-   Actionable within the shift
-   Time-sensitive
-   Used for intervention in the next 15--30 minutes

Move metrics off the dashboard if they are:

-   Investigative
-   Historical trend-focused
-   Financial exposure-based
-   Export/reporting-oriented

------------------------------------------------------------------------

# Minimal Information Architecture

1.  Shift Dashboard (existing)
    -   Add small Coverage widget
    -   Link to table drill-down
2.  Slip Detail (existing or inevitable)
    -   Add Audit Trace panel/tab
3.  Reports (single lightweight route)
    -   Start with Loyalty Liability
    -   Expand later if justified

This prevents turning the Shift Dashboard into another legacy junk
drawer.

------------------------------------------------------------------------

# Final Rule

Measurement surfaces must align with operational scope.

Floor corrections → Pit Terminal\
Shift corrections → Shift Dashboard\
Financial exposure → Reports\
Regulatory trace → Slip Drill-Down

Separation preserves clarity.

Overbuilding creates noise.
