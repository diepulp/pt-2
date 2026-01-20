---
title: Need/Par Dual Policy for Table Inventory (Inventory Count vs Imprest-to-Par)
doc_type: policy
status: draft
version: 0.1
date: 2026-01-16
owner_context: TableContext
audience: pit_ops, engineering, compliance
scope: PT-2 pilot (configurable per casino, optionally per table)
---

# 1. Purpose

PT must integrate into an existing casino workflow without forcing an operational change. Casinos commonly run table-bank controls in **two valid models**:

1) **Inventory Count model**: end-of-shift = count and record the tray (opening/closing bankroll snapshots are primary).  
2) **Imprest-to-Par model**: end-of-shift = perform a documented **final fill or credit** to restore the tray to a defined **par/need**, then record.

PT must support **both models via a single dual-policy mechanism**, and must be able to “pick up” a live casino without requiring historical data migration beyond a bootstrap step.

---

# 2. Terms

- **Need / Par**: The operational target bankroll for a table (imprest level).
- **Opening bankroll**: The counted tray at session open (opening inventory snapshot).
- **Closing bankroll**: The counted tray at session close (closing inventory snapshot).
- **Fill**: Chips moved **to** the table via a controlled fill transaction.
- **Credit**: Chips moved **from** the table via a controlled credit transaction.
- **Drop**: Cash and other accountable items removed from the table drop box and counted (soft count).
- **Rundown**: The per-table win/loss result for a shift/session.

---

# 3. Regulatory/controls anchor (why this fork exists)

Many internal control standards explicitly allow a shift close to be done either by:
- recording beginning/ending inventory counts, **or**
- (if table banks are imprest) restoring the bank to par via a final fill/credit.

Similarly, table-games revenue identities commonly treat win/loss as a function of opening/closing bankroll, fills/credits, and drop.

**Washington State Gambling Commission (WSGC) alignment (house-banked card rooms):** Washington’s WAC 230-15 rules implement the same control *shape* for house-banked card rooms: drop boxes are required and must collect requests for fills/credits, fill/credit slips, and table inventory forms; drop boxes are transported under dual-custody controls to a secured count room; and the count is conducted under defined separation-of-duties and evidence-handling procedures.

PT’s policy models below map directly to those control choices while remaining casino-configurable.

# 4. The Dual Policy

## 4.1 Policy enum: `table_bank_mode`

PT shall support:

- `INVENTORY_COUNT`
- `IMPREST_TO_PAR`
- `UNKNOWN` (bootstrap only; must transition to one of the above)

This is **casino-configurable**, and may be overridden per table.

---

# 5. Model A — INVENTORY_COUNT

## 5.1 Operational meaning
At shift close:
- Dealer + supervisor count tray
- Closing inventory is recorded on a closing slip (often multi-part; copies distributed per local procedure)
- Fills/credits may occur when needed operationally, but the close does **not** require restoring to par.

## 5.2 PT behavior
- `need_total` is a **target**, not guaranteed equal to closing inventory.
- Baselines for rundown are:
  - opening bankroll snapshot total
  - closing bankroll snapshot total
  - sum(fills), sum(credits)
  - drop total (soft count ingestion)

## 5.3 Bootstrap rule (go-live)
- Do **not** assume “last closing inventory = par.”
- PT must obtain a par target via:
  - explicit import (preferred), or
  - inferred suggestion + supervisor approval (acceptable), or
  - leave par unset and run purely on opening/closing/fills/credits/drop (minimum viable, but less helpful operationally).

---

# 6. Model B — IMPREST_TO_PAR

## 6.1 Operational meaning
At shift close:
- The table bank is maintained on an imprest basis.
- A **final fill or credit** is executed to bring the tray back to **par**.
- The closing inventory should therefore equal (or closely match) par, because it was intentionally restored.

## 6.2 PT behavior
- `need_total` (par) is **authoritative** for the table.
- PT expects a close workflow to include either:
  - a final adjustment slip (fill or credit), or
  - an explicit “restored-to-par” attestation step.
- Variance between closing inventory and par should be exception-worthy if outside tolerance.

## 6.3 Bootstrap rule (go-live)
If the casino confirms `IMPREST_TO_PAR`, PT may:
- adopt `par_total = last_verified_closing_inventory_total` **only if** that close is known to have been restored-to-par.

---

# 7. Shared rundown computation (both models)

PT uses the same table-games identity regardless of close model:

**table_win = closing_bankroll + credits + drop − opening_bankroll − fills**

Notes:
- Sign convention can be inverted (win vs loss), but the inputs are the same.
- Credits are included because they represent chips/cash returned to cage (value removed from table accountability).

---

# 8. Programmatic representation (TableContext)

## 8.1 Canonical config: `table_par_policy`

A policy row represents the *target* need/par for a table.

**Fields (suggested)**
- `casino_id` (uuid)
- `table_id` (uuid, nullable if casino-wide default)
- `game_type` (enum, optional)
- `table_bank_mode` (enum)
- `par_total` (numeric, nullable allowed in bootstrap)
- `effective_from_gaming_day` (date)
- `source` enum:
  - `imported`
  - `manual`
  - `inferred_unverified`
  - `inferred_from_imprest_close`
- `approved_by_staff_id` (uuid, nullable)
- `approved_at` (timestamptz, nullable)
- `notes` (text)

**Rules**
- Exactly one “active” policy per `(casino_id, table_id)` for a given `gaming_day`.
- Par changes are append-only (new effective rows), not edits-in-place.

## 8.2 Session binding
When a new `table_inventory_session` is opened:
- Resolve `active_policy = table_par_policy` by `(casino_id, table_id, gaming_day)`
- Set:
  - `session.table_bank_mode = active_policy.table_bank_mode`
  - `session.need_total = active_policy.par_total` (nullable)
  - Keep snapshots as facts: `opening_snapshot_total`, `closing_snapshot_total`

## 8.3 “Continue from old need” (seamless pickup)
PT should not require historic PT sessions to begin tracking. Instead:

- Start tracking at first PT-managed session `S0`.
- Import/adopt the current par policy (manual/import/inferred).
- From `S0` onward, PT has continuous operational truth; older pre-PT paper stays outside system.

---

# 9. Bootstrap mechanics (UNKNOWN → stable mode)

Because PT cannot know local operations by itself, onboarding must be explicit but minimal.

## 9.1 Bootstrap wizard (recommended)
Per casino (and optionally per table):
1) Ask: “Which close model do you use?”
   - Inventory Count
   - Imprest-to-Par
2) Ask: “What is the table par/need?”
   - import from existing par sheet (bulk)
   - manual entry (per table)
   - infer from last N sessions (PT will recommend; user approves)

## 9.2 Inference option (approval required)
If par isn’t provided, PT may compute a *candidate* par:

- `candidate_par = median(opening_inventory_total over last N sessions)`  
  or (if tables restore to par) median(closing totals).

Store as:
- `source = inferred_unverified`
- require explicit approval to become effective.

---

# 10. Dynamic par (historical volatility) — recommendation layer

PT should treat “dynamic par” as a **recommendation**, not an automatic mutation, because par is a control parameter.

## 10.1 What to measure (practical)
Use operational strain indicators PT already records:
- `fills_per_shift`
- `total_fills_amount_per_shift`
- `max_single_fill`
- frequency of “low chip” conditions (if you model alerts)
- optional segmentation: by day-of-week, by game type, by shift

## 10.2 Simple recommendation algorithm (MVP-safe)
Given a lookback window (e.g., last 14–28 gaming days):
- Compute:
  - `P90(fills_per_shift)` and `P90(max_single_fill)`
  - `avg_total_fills_per_shift` (do not net with credits)

Target:
- “P90 fills per shift ≤ 1” (tune per casino)

Adjustment rule:
- If `P90(fills_per_shift) > target`, recommend:
  - `recommended_par = current_par + step`
  - where `step = round_up(P90(max_single_fill) * safety_factor)`  
    (safety_factor ~ 0.5–1.0; tune)
- If fills are near zero for extended period and tray is consistently high, recommend a small decrease:
  - `recommended_par = current_par - small_step` (conservative)

## 10.3 Approval + effective date
Par changes become effective only when:
- supervisor approves
- a future `effective_from_gaming_day` is set
- PT writes a new `table_par_policy` row (append-only)

---

# 11. Pseudocode (session open)

```ts
function openTableSession({ casinoId, tableId, shiftId, gamingDay }) {
  const policy = resolveActivePolicy(casinoId, tableId, gamingDay);

  const session = insertTableInventorySession({
    casino_id: casinoId,
    table_id: tableId,
    shift_id: shiftId,
    gaming_day: gamingDay,
    table_bank_mode: policy?.table_bank_mode ?? 'UNKNOWN',
    need_total: policy?.par_total ?? null,
    opened_at: now(),
    opened_by: actorId(),
    status: 'OPENING',
  });

  return session;
}
```

---

# 12. Invariants & exceptions (both models)

- **No chip movement without a document trail** (fill/credit/transfer) where your jurisdiction requires it.
- Missing slips, mismatched totals, or unexpected par variance must create `reconciliation_exception` rows.
- Par policy changes must be auditable (who/when/why), append-only.

---

# 13. Implementation Notes (PT integration)

- You can deploy PT into an established workflow by:
  - importing par targets (preferred) and choosing bank mode,
  - starting sessions at go-live without attempting to backfill pre-PT history.
- PT’s success depends on capturing:
  - opening/closing snapshots,
  - fills/credits totals,
  - drop totals (ingested from count/soft count),
  - exceptions.

---

# 14. References (for later compliance alignment)

## Washington (WSGC)
- Washington Administrative Code (WAC) Title 230, Chapter 230-15 (Card game rules), including:
  - WAC 230-15-585 (Using drop boxes: drop box collects requests for fill/credit, fill/credit slips, table inventory forms, etc.)
  - WAC 230-15-515 (Requirements for request for fill/credit slips)
  - WAC 230-15-520 (Requirements for fill/credit slips; allows authorized computer-based numbering systems)
  - WAC 230-15-605 / 610 / 615 (Count room requirements; preparing/conducting the count; table-by-table counting/recording and evidence handling)
- WSGC “House-Banked Card Room Internal Controls Template” (GC2 series) — operational internal controls packet/template.

## Federal / Other jurisdictions (comparators)
- Nevada Gaming Control Board — Minimum Internal Control Standards (Table Games, Version 9)
- 25 CFR Part 542 — Minimum Internal Control Standards (tribal)
- Mississippi Gaming Commission — Regulations (Accounting Records): table game gross revenue identity
- Missouri Gaming Commission — Minimum Internal Control Standards: cross-fills prohibited, form controls/voiding
- Mississippi Gaming Commission — Minimum Bankroll Requirements instructions (fill history used in bankroll determinations)

