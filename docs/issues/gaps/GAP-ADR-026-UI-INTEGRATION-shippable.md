---
title: "Shippable Patch Plan: ADR-026 UI Integration (Scope-Trimmed)"
doc_id: "GAP-ADR-026-UI-SHIPPABLE"
version: "0.1.0"
status: "draft"
date: "2026-01-16"
owner: "VisitService"
related_docs:
  - "docs/80-adrs/ADR-026-gaming-day-scoped-visits.md"
  - "docs/20-architecture/specs/ADR-026/EXECUTION-SPEC-ADR-026-PATCH.md"
  - "docs/issues/rating-slip/GAMING-DAY-CARRYOVER-ISSUE.md"
---

# Shippable Patch Plan: ADR-026 UI Integration (Scope-Trimmed)

## Executive Summary

ADR-026 (gaming-day-scoped visits) is correct and backend-complete. The remaining production risk is **one UI entry path that bypasses rollover**, allowing staff to open a **stale slip** and then record **today's buy-ins** that disappear from the modal totals due to the intentional `gaming_day` filter.

This patch plan trims non-blocking UX enhancements and focuses on **one shippable fix set** that:
- eliminates the stale-slip bypass,
- prevents silent/incorrect “best-effort” writes,
- restores observability for failures.

**Outcome:** the UI always operates on a *current gaming-day context* and cannot “write into yesterday.”

---

## Scope (Ship This)

### In Scope (MVP Patch)

1. **GAP-3 (CRITICAL): Close the stale-slip bypass**
   - Ensure every “open slip / open modal” path resolves to a **current** visit+slip context before rendering or writing.

2. **Write Guardrail: Reject stale gaming-day writes**
   - Prevent buy-in/financial writes against stale visit/slip contexts (defensive backstop).

3. **Restore error visibility**
   - Re-enable error logging (dev) and show a non-blocking toast (prod) when buy-in recording fails or is rejected.

### Out of Scope (Defer)

- **GAP-1 “Resumed session” banner inside the rating slip modal** (nice-to-have UX; not correctness).
- **GAP-2 Adjustment breakdown display** (audit UX improvement; not correctness).
- **Per-casino cron scheduling complexity** (only do a simple global schedule if/when we implement cleanup).
- **New schema fields** (e.g., `visit.resumed_at`) solely to support UI messaging.

---

## The Bug (Why the totals “disappear”)

- Staff can open a slip directly via click:
  - `handleSlipClick → openModal("rating-slip", { slipId })`
  - This **does not call** `rpc_start_or_resume_visit` / `VisitService.startVisit()`.
- The slip’s visit is from **yesterday** (`visit.gaming_day = D-1`).
- A new buy-in today is recorded with **today’s** gaming day via trigger:
  - `NEW.gaming_day := compute_gaming_day(... now())`
- The modal BFF RPC correctly filters by **visit gaming day**:
  - `pft.gaming_day = v_visit.visit_gaming_day`
- Result: the transaction exists, but is filtered out from modal totals.

---

## Implementation (Shippable)

### Patch A — Single Entry Gate for Slip Modal (Required)

**Goal:** opening a rating slip modal always resolves to a current gaming-day slip.

**Change:** replace “open modal by slipId” with “resolve current context → open modal”.

#### A1. Add a small entry function (server action or RPC wrapper)

Create a single entrypoint used by *every* slip-open path:

`get_or_rollover_slip_context({ slip_id }) -> { slip_id_current, visit_id_current, visit_gaming_day, rolled_over:boolean }`

Behavior:
1. Load slip → visit → casino_id/player_id.
2. Compute `current_gaming_day = compute_gaming_day(casino_id, now())`.
3. If `visit.gaming_day == current_gaming_day`: return the same slip.
4. If stale:
   - close stale slip + end stale visit (same logic already exists in ADR-026 rollover path),
   - start/resume current visit for the player (existing RPC),
   - ensure a current slip exists (create/open as needed),
   - return the current slip.

**UI impact:** none besides calling this first. The user should not need to “manage” stale slips.

#### A2. Update click path to use the gate

Before:
```ts
const handleSlipClick = (slipId: string) => {
  openModal("rating-slip", { slipId });
};
```

After:
```ts
const handleSlipClick = async (slipId: string) => {
  const ctx = await getOrRolloverSlipContext({ slipId });
  openModal("rating-slip", { slipId: ctx.slipIdCurrent });

  // Optional breadcrumb (non-blocking):
  if (ctx.rolledOver) toast("Session rolled over to today’s gaming day.");
};
```

**Acceptance:** opening a stale slip never renders yesterday’s context; modal always shows current-day totals.

---

### Patch B — Defensive Write Guard for Buy-Ins (Required)

**Goal:** even if someone reintroduces a bypass later, writes cannot land in a stale context.

Wherever a buy-in / financial transaction is created:
- Load the slip’s visit gaming day
- Compare to `compute_gaming_day(casino_id, now())`
- If mismatch: raise a specific error code (e.g. `STALE_GAMING_DAY_CONTEXT`)

UI behavior:
- On this error:
  1) re-run `get_or_rollover_slip_context`
  2) refresh modal data
  3) retry once (idempotent)
- If still failing: show toast and stop (no silent success).

---

### Patch C — Restore Observability (Required)

Undo “silent catch” in `use-save-with-buyin.ts`.

Minimum:
- `console.error(...)` in dev
- production toast:
  - “Buy-in recording failed. Session refreshed; please try again.”

**Non-goal:** don’t crash the entire save flow; but never fail silently.

---

## Optional (Not Required to Ship): Cleanup Job Safety Net

A cron cleanup job reduces the number of stale slips that exist in the first place, but is not required once Patch A+B are in place.

If implemented, keep it simple:
- daily schedule
- iterate casinos
- close slips/visits where `gaming_day < current_gaming_day`

**Do not** implement per-casino schedules unless multiple cutoff policies are required *now*.

---

## Definition of Done (Explicit / Testable)

### DoD — Patch A (Entry Gate)
- [ ] Opening a slip from a previous gaming day results in the **current** slip context being displayed.
- [ ] After opening a stale slip, recording a buy-in shows up in `totalCashIn` immediately (no “disappearing” totals).

### DoD — Patch B (Write Guard)
- [ ] Attempting to record a buy-in against a stale visit/slip returns `STALE_GAMING_DAY_CONTEXT`.
- [ ] UI auto-refreshes context and retries once; if still failing, user sees a toast.

### DoD — Patch C (Observability)
- [ ] Buy-in failure is logged (dev) and surfaced (toast) in prod.
- [ ] No silent best-effort failures in buy-in recording.

---

## Out-of-Scope Backlog (Explicit)

- [ ] (GAP-1) “Resumed session” banner inside rating slip modal
- [ ] (GAP-2) Adjustment breakdown display wiring
- [ ] Cron cleanup job (optional) with monitoring/audit enhancements

---

## Release Notes (Operator Facing)

- Opening a player session always loads the current gaming day automatically.
- If a prior day session was left open, the system silently rolls it forward.
- Buy-ins can no longer be recorded into a prior gaming day by mistake.
