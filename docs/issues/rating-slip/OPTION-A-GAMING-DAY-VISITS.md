---
title: "Option A: Gaming-Day-Scoped Visits (Substantiation + Implementation Details)"
project: "Casino Player Tracker (PT-2)"
doc_type: "Architecture Note"
version: "v0.1"
status: "Proposed"
date: "2026-01-16"
author: "ChatGPT"
related_docs:
  - "GAMING-DAY-CARRYOVER-ISSUE.md"
  - "SRM v4.0.0 (2025-12-06)"
  - "ADR-024 (RPC self-injection via set_rls_context_from_staff)"
---

# 1) Executive Summary

## Decision
Adopt **Option A: Gaming-Day-Scoped Visits**.

A "visit" becomes a **single gaming-day session** for a given player at a given casino. When the gaming day rolls over, a new visit is created (and the prior one is closed or marked stale), instead of reusing an "active" visit indefinitely.

## Why this matters
The current bug ("Total Cash In" carrying over into the next gaming day) is not a data problem. It is a **domain boundary problem**: the system is using a *visit-lifetime* sum where the business operation expects a *gaming-day* sum.

Option A makes the boundary structural, so that:
- Compliance/ops totals are correct by default.
- The UI cannot accidentally present multi-day amounts as "today".
- You avoid a long-term whack-a-mole of adding gaming-day filters to every rollup and RPC.

## Scope note
Because PT-2 is in development with no meaningful historical data, the usual drawback of Option A (backfill/splitting existing visits and transactions) is largely irrelevant. The remaining cost is primarily **code blast radius** (changing the semantics of "active visit").

# 2) Problem Statement

## Observed issue
"Total Cash In" shown in the buy-in modal includes amounts from the prior gaming day when the player returns after the gaming day cutoff, because:
- an active visit is reused across gaming days, and
- the total is computed by summing `player_financial_transaction` by `visit_id` without a gaming-day boundary.

## Compliance risk
Operational thresholds (CTR/MTL and internal controls) are gaming-day-scoped. Presenting multi-day totals as "today" creates:
- false positives (unnecessary escalation), and
- false negatives (staff stop trusting the number or misinterpret it).

# 3) Goals and Non-Goals

## Goals
1. Make "today's" totals **unambiguously gaming-day-scoped**.
2. Preserve append-only financial ledger semantics (audit trail).
3. Reduce probability of regression by encoding the boundary in the data model.
4. Keep implementation compatible with the canonical RLS + RPC self-injection pattern.

## Non-Goals
- Implementing full CTR/MTL workflows in this note.
- Introducing cross-visit aggregation complexity into the core transactional flow.
- Solving data correction (adjustments) here; that is a separate capability.

# 4) Why Option A beats query-only fixes

## Query-only fix (anti-pattern)
You can patch the UI/RPC to filter by gaming day. That will fix the modal today, but it leaves you with:
- multiple consumers (views, RPCs, dashboards) that must all remember to apply the same filter, and
- a guaranteed future regression when someone forgets once.

## Option A (structural boundary)
If a visit is gaming-day-scoped:
- the most natural aggregation (`SUM(...) WHERE visit_id = ...`) becomes correct for "today",
- downstream consumers are harder to misuse,
- testing is simpler because "visit" is now a unit of business time.

# 5) Option A: Domain Semantics

## New definition
A **visit** is the canonical container for a player's activity **within a single gaming day** at a casino.

### Practical consequences
- A player can have multiple visits over time (one per gaming day, per casino).
- A player has at most **one active visit** per casino per gaming day.
- Re-seating a player later the same gaming day resumes the same visit.
- Crossing the gaming-day cutoff creates a new visit.

# 6) Data Model Changes

## 6.1 Add explicit `gaming_day` on `visit`
Store the computed gaming day as a `date` (or similar) on the visit record at creation.

**Rationale:**
- It makes the boundary explicit and queryable.
- It supports unique constraints and simple indexes.
- It avoids recomputing gaming day across many rows in hot paths.

## 6.2 Recommended constraints/indexes
Enforce **one active visit per player per casino per gaming day**:

- Unique index on:
  - `(casino_id, player_id, gaming_day)` **where** `status = 'active'`

Also consider:
- Index on `(casino_id, gaming_day)` for shift-level reporting.
- Index on `(casino_id, player_id, gaming_day)` for re-seat/resume.

## 6.3 Transaction linkage
`player_financial_transaction` remains append-only.

- New transactions should link to the **current** visit for the computed gaming day.
- If you also store a `gaming_day` on transactions (optional), ensure it matches the visit's `gaming_day` via constraint/trigger.

# 7) Core Write Path: Start/Resume Visit

## 7.1 Desired behavior
When the UI requests to "start a visit" for a player:

1. Compute `v_gaming_day = compute_gaming_day(now(), casino_settings)`.
2. Find an active visit for `(casino_id, player_id, v_gaming_day)`.
   - If found: return it (resume).
3. If an active visit exists for the player but with `gaming_day != v_gaming_day`:
   - Close it as `closed` or `stale_closed` with an automatic reason.
4. Create a new active visit with `gaming_day = v_gaming_day`.

This ensures you never carry an "active" visit across days.

## 7.2 Concurrency safety
Use one of:
- `INSERT ... ON CONFLICT ... DO UPDATE/NOTHING` pattern keyed by the unique index, or
- a transaction with `SELECT ... FOR UPDATE` on the candidate row.

Goal: two devices seating the same player should not create two active visits for the same day.

## 7.3 RPC alignment (ADR-024)
Client-callable RPCs should:
- `PERFORM set_rls_context_from_staff();`
- derive `casino_id` and `actor_id` from context (no spoofable params),
- then perform the start/resume logic.

# 8) Read Path: Totals in the UI

## 8.1 What becomes trivial
The modal's "Total Cash In (today)" becomes:

- `SUM(player_financial_transaction.amount WHERE visit_id = current_visit_id AND direction = 'in')`

Because `visit_id` now implies a single gaming day.

## 8.2 Optional display: Lifetime totals
If you still want lifetime totals:
- label explicitly as "Lifetime" or "Multi-day (all visits)".
- compute separately (e.g., by player across visits).

Do not present lifetime totals as "today".

# 9) Rollout Plan (Dev-friendly)

## Phase 0 (same day)
- Add `visit.gaming_day` (nullable at first if needed).
- Update `startVisit()` path (RPC/service) to compute and write gaming_day.
- Update the modal to use the returned visit id and sum by that visit.

## Phase 1 (tighten)
- Backfill `visit.gaming_day` for existing dev rows if you care; otherwise reset.
- Add the partial unique index enforcing one active visit per day.
- Add guardrails: if a txn is inserted against a visit whose gaming_day is not current, reject or require explicit override.

## Phase 2 (polish)
- Add automatic closure job only as a cleanup mechanism (optional).
- Add UI messaging: "Resuming today's session" vs "New gaming day session started".

# 10) Acceptance Criteria (Definition of Done)

1. **No carryover in "today" totals**:
   - After gaming day boundary, seating the same player yields a new visit.
   - The modal shows only the new day's totals.

2. **Structural invariant enforced**:
   - It is impossible to create two active visits for the same `(casino, player, gaming_day)`.

3. **Append-only ledger preserved**:
   - No UPDATE/DELETE required on `player_financial_transaction` for this change.

4. **RLS invariants preserved**:
   - All client-callable RPCs self-inject context using `set_rls_context_from_staff()`.

5. **Regression test**:
   - A test reproduces the original carryover scenario and proves it fixed.

# 11) Risks and Mitigations

## Risk: semantic blast radius
Anything that assumed "one active visit across days" will change behavior.

**Mitigation:**
- inventory call sites: seat/resume flows, dashboards, reports.
- add explicit "visit scope" naming in DTOs (`today_visit_id`, `visit_gaming_day`).

## Risk: gaming day cutoff ambiguity
If casino settings change or multiple casinos differ, the cutoff can surprise operators.

**Mitigation:**
- Always compute gaming day via the canonical `compute_gaming_day()` tied to casino settings.
- Surface the gaming day label in UI in small text (e.g., "Gaming Day: 2026-01-16").

## Risk: cross-midnight open sessions
A player may remain physically present past the gaming day boundary.

**Mitigation options (choose one):**
- **Strict**: force close at boundary and start a new visit automatically.
- **Operational**: allow staff to "roll" the session into the new visit, still via append-only entries.

## Risk: active rating slip spanning the gaming day cutoff
In practice, a player can still be playing when the gaming day rolls over. The system must reset gaming-day-scoped compliance totals **without losing** the prior gaming day's rating details.

**Recommendation:** Treat `rating_slip` as **visit-scoped**, which (under Option A) makes it implicitly **gaming-day-scoped**.

### What happens at cutoff?
On rollover (either exactly at cutoff via a job, or on the first user action after cutoff):
1. **Close the prior slip** (and its visit) with an automatic reason (e.g., `auto_closed_gaming_day_boundary`).
2. **Create a new visit** for the new gaming day.
3. **Instantiate a new rating slip** attached to the new visit.
4. Optionally link them for continuity:
   - `visit_group_id` links prior/next visits for the same player
   - `rating_slip_group_id` (or reuse `visit_group_id`) links prior/next slips

### What carries forward vs. what resets?
- **Resets (must be new gaming day):** buy-in totals, chips in/out, net position, and any CTR/MTL counters.
- **May carry forward (non-financial context):** table assignment, game type, staff notes, rating parameters (e.g., avg bet estimate), and UI state like "player is seated".

This keeps the compliance boundary clean while preserving the operational narrative of the player's play across midnight.

# 12) Open Questions

1. Should boundary rollover be automatic on first action after cutoff, or should there be an explicit "Roll to new gaming day" prompt?
2. Should a visit ever be allowed to span gaming days for reporting convenience? (Recommendation: no; do reporting across visits instead.)
3. Do we want `player_financial_transaction.gaming_day` stored redundantly, or derived from the visit? (Recommendation: derive from visit unless you need independent partitioning.)

# 13) Appendix: Minimal SQL Sketch (Illustrative)

> NOTE: This section is illustrative and should be adapted to the canonical PT-2 schema/types.

## Add gaming_day
- `ALTER TABLE visit ADD COLUMN gaming_day date NOT NULL;` (or staged nullable -> backfill -> NOT NULL)

## Enforce one active visit per day
- Partial unique index on `(casino_id, player_id, gaming_day)` where `status = 'active'`.

MD