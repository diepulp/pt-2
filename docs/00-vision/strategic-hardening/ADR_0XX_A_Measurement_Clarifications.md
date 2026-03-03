---
adr: ADR-0XX-A
date: 2026-03-01
status: Proposed
supersedes: ADR-0XX (Introduction of Measurement Layer)
title: Measurement Layer Clarifications --- Liability Valuation &
  Telemetry Accounting
---

# Purpose

This addendum clarifies two aspects of the Measurement Layer:

1.  Loyalty liability valuation policy.
2.  Telemetry completeness semantics.

These refinements ensure that measurement artifacts remain truthful,
deterministic, and architecturally aligned with PT-2's system-of-record
posture.

------------------------------------------------------------------------

# 1. Loyalty Liability Snapshots --- Canonical vs Valuated Truth

## Problem

PT-2's loyalty ledger stores canonical financial truth in the form of:

-   Signed `points_delta`
-   Append-only ledger
-   Deterministic accumulation

However, dollar valuation of loyalty points depends on policy (e.g.,
cents-per-point), which may:

-   Differ across properties
-   Change over time
-   Not be recoverable from legacy systems
-   Be subject to executive override

Therefore, dollar liability is not intrinsic truth --- it is a
valuation.

------------------------------------------------------------------------

## Decision

Separate liability into two layers:

### A. Canonical Liability (Source of Truth)

Stored and snapshot as:

-   `total_outstanding_points`

This is deterministic and derived solely from the append-only ledger.

This value is authoritative.

### B. Policy-Based Valuation (Derived)

Stored and snapshot as:

-   `estimated_dollar_value`

Derived using an admin-configured valuation policy.

------------------------------------------------------------------------

## Valuation Policy Requirements

A configurable structure must exist (e.g., `loyalty_valuation_policy`)
including:

-   `cents_per_point` (or inverse)
-   Optional tier overrides
-   Effective date
-   Version identifier

Snapshots must record:

-   Policy version used
-   Effective date of valuation

UI must clearly label:

> "Estimated liability (policy-based valuation)"

------------------------------------------------------------------------

## Architectural Constraint

-   Points are canonical truth.
-   Dollars are derived and versioned.
-   Snapshots must be reproducible from ledger + policy state.

------------------------------------------------------------------------

# 2. Telemetry Completeness --- Multi-Bucket Accounting

## Problem

PT-2 allows:

-   Rated play
-   Ghost/compliance-only tracking
-   Idle table states
-   Temporary closures

A simplistic "rated coverage" metric misrepresents operational reality.

Ghost play is not missing data. Idle time is not leakage.

------------------------------------------------------------------------

## Decision

Replace single coverage ratio with multi-bucket accounting.

`telemetry_completeness_v` must expose:

-   `open_seconds`
-   `rated_seconds`
-   `ghost_seconds`
-   `untracked_seconds`
-   `idle_seconds`

Derived metrics:

-   `accounted_ratio = (rated + ghost) / open`
-   `rated_ratio = rated / open`
-   `untracked_ratio = untracked / open`
-   `idle_ratio = idle / open`

------------------------------------------------------------------------

## Interpretation

-   Rated coverage → operational revenue visibility.
-   Accounted coverage → compliance completeness.
-   Untracked time → data integrity gap.
-   Idle time → operational inefficiency.

Ghost play counts as accounted time.

------------------------------------------------------------------------

# Architectural Principles Reinforced

1.  Measurement must distinguish canonical truth from valuation.
2.  Measurement must not misclassify valid operational states as
    defects.
3.  All surfaced metrics must be reproducible from domain state.
4.  UI language must clearly differentiate truth from estimation.

------------------------------------------------------------------------

# Status

Proposed --- Pending integration into ADR-0XX implementation plan.
