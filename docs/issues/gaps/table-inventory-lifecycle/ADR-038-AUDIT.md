---
doc: "ADR Audit"
target: "ADR-038-rundown-persistence-finalization-contract"
date: "2026-02-24"
status: "Review"
---

# Audit: ADR-038 — Table Rundown Persistence & Finalization Contract

Source: **ADR-038: Table Rundown Persistence & Finalization Contract** fileciteturn2file0

## Verdict

ADR-038 is **directionally correct and accept-worthy**, but it still contains a few **implementation drift traps** (role naming, security phrasing, late-event handling visibility) and one **corruption-masking pattern** (`LIMIT 1`) that will bite you later unless you tighten it now.

---

## What’s strong (keep)

- **D1 (no triggers, atomic increments in fill/credit RPCs)**: correct for your RLS + SECURITY DEFINER posture; avoids silent desync and concurrency lost updates.
- **D2 UPSERT by `(table_session_id)`**: deterministic recompute + provenance update is the right audit-friendly behavior.
- **D3 finalization as report-level immutability stamp**: clean boundary; avoids inventing new session lifecycle states.
- **Partial unique index is defined** for “one active session per table” — good (this was previously vague elsewhere).

---

## Critical issues to fix (before “Accepted”)

### 1) Staff role naming drift (pit_boss/admin) vs canonical `staff_role` enum

ADR gates finalization by checking `current_setting('app.staff_role') IN ('pit_boss','admin')`. If your canonical enum differs (very likely over time), you’ll ship a **broken authorization gate** and “fix” it ad-hoc in code.

**Patch:**
- Add a note: **Role values MUST match `public.staff_role` enum** (source of truth).
- Or switch to a capability gate (`can_finalize_rundown`) with role→capability mapping (future-proof).

### 2) Trigger rationale wording is muddled (SECURITY DEFINER / RLS mechanics)

The “trigger runs as invoking role” explanation is directionally right, but the wording can mislead implementers about privilege boundaries and search_path hazards.

**Patch:**
- Rewrite rationale to emphasize: triggers add **security ownership complexity** (definer governance, search_path, RLS bypass risk), not merely “invoking role” mechanics.

### 3) “Totals current within 1 second” is an ungrounded SLO in an ADR

You already chose synchronous atomic updates. The “<1s” requirement is **decorative** and will later be used in arguments without an agreed measurement.

**Patch:**
- Replace with: “Totals MUST be **consistent at commit time** of the fill/credit transaction.”
- Put any UI timing/SLO in PRD NFRs, not here.

### 4) `LIMIT 1` masks corruption and defeats “fail loud”

ADR says the unique partial index enforces correctness, but the canonical snippet still uses `LIMIT 1`. That can hide invariant violations until much later.

**Patch (preferred):**
- Remove `LIMIT 1` in canonical code and rely on index.
- Or explicitly detect corruption:
  - If multiple sessions found: raise `INVARIANT_VIOLATION` (and log/audit).

### 5) Late events after finalization: MVP defers exception records, but **visibility cannot be deferred**

ADR says late events are recorded in raw tables but **not reflected** in frozen report, and structured exceptions are deferred. That is acceptable *only if* the system makes late activity visible (otherwise it’s omission-by-design).

**Patch:**
- Add MVP behavior:
  - When a late event is inserted for a finalized session: emit an **audit_log** entry.
  - Surface a **UI warning badge**: “Late activity after finalization”.

### 6) “No UPDATE RLS policy; all mutations via SECURITY DEFINER RPC” is overconfident

This is not a universal bypass-proof argument (service_role exists; owners exist; break-glass exists). The real mitigation is **privilege exposure control**.

**Patch:**
- State enforceables:
  - REVOKE UPDATE/DELETE on `table_rundown_report` from `authenticated`
  - Only GRANT EXECUTE on whitelisted RPCs
  - Privileged maintenance is break-glass, audited

### 7) `gaming_day` derivation references ADR-026 but does not state the rule concretely

You reference `compute_gaming_day()` but don’t pin down the key inputs (casino timezone + gaming_day_start).

**Patch:**
- Add one sentence: “`gaming_day` is derived server-side using **casino_settings.timezone** and **casino_settings.gaming_day_start** (via `compute_gaming_day`).”

---

## Recommended additions (makes the ADR bulletproof)

### Add an explicit “Invariants” section

- At most one active session per `(casino_id, gaming_table_id)` for statuses `OPEN|ACTIVE|RUNDOWN`.
- Every fill/credit belongs to exactly one session (directly or deterministically resolvable).
- Finalized rundown is immutable (non-break-glass paths).

### Promote tests into first-class consequences

- `table_session.fills_total_cents == SUM(table_fill.amount_cents)` by session
- `table_session.credits_total_cents == SUM(table_credit.amount_cents)` by session
- finalize requires `table_session.status='CLOSED'`
- persist rejects if `finalized_at IS NOT NULL` (409)
- late event after finalize emits audit log + UI warning

---

## Minimal patch list (apply these, then accept)

1. Role gate references canonical `public.staff_role` values (or capability gate)
2. Remove/replace `LIMIT 1` with invariant-fail behavior
3. Replace “<1s” with commit-consistency language
4. Late-event visibility: audit_log + UI warning (MVP)
5. Reword RLS/SECURITY DEFINER mitigation to enforceable privilege statements
6. One-line concrete `gaming_day` derivation rule

---

## Final verdict

**Accept with edits.** The architecture is right; the remaining changes are about preventing drift and avoiding “silent corruption” patterns.

