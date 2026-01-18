---
title: "ADR-027: Table Bank Mode (Visibility Slice, MVP)"
adr_id: "ADR-027"
status: "Accepted (MVP boundary)"
date: "2026-01-16"
owner: "TableContext"
decision_scope: "Table inventory lifecycle visibility + shift dashboard rundown"
amends: "SRM v4.0.0 (TableContext)"
depends_on: "ADR-028"
consumes: "GAP-TBL-RUNDOWN (table_buyin_telemetry)"
related:
  - "ADR-028-table-status-standardization.md"
  - "EXECUTION-SPEC-GAP-TBL-RUNDOWN_PATCHED_v0.2.0.md"
  - "PRD-TABLE-SESSION-LIFECYCLE-MVP"
  - "GAP-TABLE-ROLLOVER-UI"
  - "table-inventory-rundown-lifecycle.md"
  - "need-par-dual-policy.md"
---

# ADR-027: Table Bank Mode (Visibility Slice, MVP)

> **Contingency:** This ADR depends on [ADR-028: Table Status Standardization](./ADR-028-table-status-standardization.md). Both ADRs must be approved together—ADR-027 cannot be implemented without ADR-028.

## Context

PT-2 is being deployed into an established casino workflow where the **paper trail + soft count + accounting** remain the system of record. PT’s job (for MVP) is **operational visibility**: a consistent table lifecycle and running totals that stakeholders can read in the shift dashboards.

Casinos commonly operate table banks under one of two close models:

1) **Inventory Count**: at shift close, count and record the tray as-is (no restore-to-par requirement).  
2) **Imprest-to-Par**: if table banks are maintained on an imprest basis, a documented final fill/credit brings the tray back to par before close.

Both models share the same table-win identity:

```
table_win = closing_bankroll + credits + drop − opening_bankroll − fills
```

### Regulatory/controls basis (informative, not enforced by PT)

- **Tribal MICS (25 CFR 542.12)** explicitly allows either: record inventory on a table inventory form **or** (if imprest) make a final fill/credit to bring the bank back to par; and if final fills aren’t made, beginning/ending inventories are recorded for shift win calculation.  
- **Washington (WSGC / WAC 230-15-585)** requires drop boxes and explicitly includes requests for fills/credits, fill/credit slips, and table inventory forms as drop-box contents (paper evidence chain remains authoritative).  
- **Mississippi Gaming Commission (Accounting Records)** defines table gross revenue using the same identity (closing bankroll + credit slips returned to cage + drop − opening bankroll − fills).

PT aligns to these *shapes* but does not attempt to replace them.

---

## MVP Boundary: “Rundown Visibility Slice” (No unicorns)

### In-scope (MVP)
- A simple **table session lifecycle** (canonical enum): ACTIVE → (optional) RUNDOWN → CLOSED (OPEN is reserved; MVP may start sessions in ACTIVE)
- Capture **opening** and **closing** inventory totals (denoms optional)
- Capture (optional) **fills_total** and **credits_total** (either totals or event list)
- Capture **drop_total** when posted by accounting/soft-count entry/import
- Compute and display **table win/loss** using the identity above
- Explicitly show “pending” states (e.g., count not posted yet)
- Standardize table availability vs session lifecycle statuses (two systems; no merge)

### Out-of-scope (MVP)
- No variance tolerance engine (exact match vs $10 vs %)
- No blocking close, no enforced workflows, no signature/void/custody-chain modeling
- No par-history policy table, approvals, or “dynamic par” recommendation engine
- No attempt to replace accounting/soft-count master records

---

## Decision

### D1 — Keep a casino-wide `table_bank_mode` as informational labeling (default INVENTORY_COUNT)

Store `casino_settings.table_bank_mode` with default `INVENTORY_COUNT`.

**MVP usage:** UI labeling and explanation only (e.g., “Inventory Count” vs “Imprest-to-Par”).  
**Non-usage:** no enforcement, no blocking, no tolerance policy in MVP.

### D2 — Keep optional per-table `par_total_cents` as advisory data only

Store `gaming_table.par_total_cents` (nullable).

**MVP usage:** display “Par (if configured)” and optionally compute/display “variance from par” as informational.  
**Non-usage:** no policy history system; no approvals; rely on existing `audit_log` for change records if needed.

### D3 — Represent “count pending vs posted” without expanding session status enum

Do **not** add new values to `table_session_status` for count state.

Instead add one field to `table_session`:

- `drop_posted_at timestamptz null` (null = COUNT_PENDING; not-null = COUNT_POSTED)

This avoids enum churn and keeps lifecycle focused on operations.

### D4 — Standardize status meaning and add a single guardrail

Keep two separate status systems (do not merge):

- `gaming_table.status` (`inactive|active|closed`) = **availability**
- `table_session.status` (`OPEN|ACTIVE|RUNDOWN|CLOSED`) = **session phase**

MVP guardrail:
- `rpc_open_table_session` must require `gaming_table.status = 'active'` (sessions only open on available tables).
- If a table becomes inactive mid-session, the session may still close (no forced shutdown).

### D5 — Fix UI sign semantics to match the identity

In the rundown panel:
- **Fills** must be presented as subtractive in the formula (chips to table reduce win).
- **Credits** must be presented as additive in the formula (value returned to cage increases win).

If you want “green/red,” base it on *impact on table_win*, not “cashflow intuition.”

---

## Data Model (MVP)

### 1) Enum (existing in this ADR)
```sql
CREATE TYPE table_bank_mode AS ENUM ('INVENTORY_COUNT', 'IMPREST_TO_PAR');
```

### 2) `casino_settings`
```sql
ALTER TABLE casino_settings
ADD COLUMN table_bank_mode table_bank_mode NOT NULL DEFAULT 'INVENTORY_COUNT';
```

### 3) `gaming_table` (optional par)
```sql
ALTER TABLE gaming_table
ADD COLUMN par_total_cents INTEGER,
ADD COLUMN par_updated_at TIMESTAMPTZ,
ADD COLUMN par_updated_by UUID REFERENCES staff(id);
```

### 4) `table_session` (bind snapshots + count posting)
```sql
ALTER TABLE table_session
ADD COLUMN table_bank_mode table_bank_mode,
ADD COLUMN need_total_cents INTEGER,
ADD COLUMN drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.table_bank_mode IS
  'Snapshot of casino mode at session open. Informational in MVP.';
COMMENT ON COLUMN table_session.need_total_cents IS
  'Snapshot of table par at session open (nullable). Informational in MVP.';
COMMENT ON COLUMN table_session.drop_posted_at IS
  'Null = count pending; set timestamp = drop/count posted.';
```

---

## Service Layer (MVP)

### RPC: `rpc_open_table_session` (add table availability check + bind snapshots)

- Verify table availability:
```sql
SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'Table not found';
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'Cannot open session: table is not active';
END IF;
```

- Bind snapshots (mode + par) at open (same as prior ADR version), but treat them as informational.

### RPC: `rpc_close_table_session` (NO variance enforcement)

- Do not warn/block for imprest variance in MVP.
- Close simply records closing snapshot + sets session status to `CLOSED`.

### RPC: `rpc_post_table_drop_total` (new, tiny)

A minimal RPC to set drop/count totals and mark `drop_posted_at`.

### RPC: `rpc_compute_table_rundown` (compute identity for dashboard)

Return:
- opening_total, closing_total
- fills_total, credits_total
- drop_total (or null if pending)
- buyin_total (from telemetry — see Cross-Context Dependency below)
- table_win (null if drop pending, or compute partial with drop=0 but clearly labeled)
- optional: variance_from_par (if par configured)

---

## Cross-Context Dependency: GAP-TBL-RUNDOWN (Finance → Telemetry Bridge)

> **Critical:** `rpc_compute_table_rundown` MUST consume telemetry data created by the GAP-TBL-RUNDOWN bridge.

### Data Flow

```
┌─────────────────────────────────┐
│ player_financial_transaction    │  ← Pit boss records buy-in
│ (PlayerFinancialService)        │
└───────────────┬─────────────────┘
                │ AFTER INSERT trigger
                │ (direction='in' AND rating_slip_id IS NOT NULL)
                ▼
┌─────────────────────────────────┐
│ fn_bridge_finance_to_telemetry  │  ← GAP-TBL-RUNDOWN (already implemented)
│ (SECURITY DEFINER + Guardrails) │
└───────────────┬─────────────────┘
                │ INSERT with source='finance_bridge'
                ▼
┌─────────────────────────────────┐
│ table_buyin_telemetry           │  ← Telemetry rows accumulate here
│ (TableContext)                  │
└───────────────┬─────────────────┘
                │ SELECT SUM(amount_cents)
                ▼
┌─────────────────────────────────┐
│ rpc_compute_table_rundown       │  ← ADR-027 (this ADR)
│ Reads telemetry for buy-in total│
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│ Shift Dashboard                 │  ← Shows complete rundown
│ (buy-ins + fills + credits +    │
│  drop = table win/loss)         │
└─────────────────────────────────┘
```

### Implementation Requirement

When implementing `rpc_compute_table_rundown`, include this query:

```sql
-- Buy-in total from telemetry (populated by GAP-TBL-RUNDOWN bridge)
SELECT COALESCE(SUM(amount_cents), 0) INTO v_buyin_total
FROM table_buyin_telemetry
WHERE gaming_table_id = v_session.gaming_table_id
  AND gaming_day = v_session.gaming_day
  AND telemetry_kind = 'RATED_BUYIN';
```

### Why This Matters

| Without This Query | With This Query |
|--------------------|-----------------|
| Finance records $500 buy-in ✅ | Finance records $500 buy-in ✅ |
| Bridge creates telemetry row ✅ | Bridge creates telemetry row ✅ |
| Rundown RPC ignores telemetry ❌ | Rundown RPC reads telemetry ✅ |
| Dashboard shows $0 buy-ins ❌ | Dashboard shows $500 buy-ins ✅ |

### Related Artifacts

- **GAP-TBL-RUNDOWN EXEC-SPEC:** `docs/20-architecture/specs/GAP-TBL-RUNDOWN/EXECUTION-SPEC-GAP-TBL-RUNDOWN_PATCHED_v0.2.0.md`
- **Bridge Function:** `supabase/migrations/20260115000200_fn_bridge_finance_to_telemetry.sql`
- **Telemetry Table:** `table_buyin_telemetry` with `source` column for provenance

---

## UI (MVP)

### Terminology mapping (product words → DB enum)
To avoid “ACTIVE (with opening snapshot captured)/ACTIVE” drifting from the canonical enum:
- **In Play / Running** → `table_session.status = 'ACTIVE'`
- **Closing / Rundown** → `table_session.status = 'RUNDOWN'` (optional in MVP)
- **Closed** → `table_session.status = 'CLOSED'`
- “**Count Pending / Count Posted**” is *not* a session status; it is derived from `drop_posted_at` (null vs set).


- Table availability label mapping:
  - `gaming_table.status='active'` → “Available”
  - `gaming_table.status='inactive'` → “Offline/Idle”
  - `gaming_table.status='closed'` → “Decommissioned”

- Session lifecycle label mapping:
  - `ACTIVE` → “In Play”
  - `RUNDOWN` → “Closing”
  - `CLOSED` → “Closed”

- Rundown card:
  - Show “Count Pending” if `drop_posted_at is null`
  - Show formula components with correct signs per identity

---

## Consequences

### Positive
- Ships a reliable lifecycle + dashboard visibility without pretending to be accounting.
- Minimal schema changes; low blast radius.
- Avoids enum churn and workflow creep.

### Negative
- Does not “enforce” imprest-to-par behavior (by design).
- Par history/approval deferred; par is advisory in MVP.

---

## Deferred (post-MVP candidates)
- Variance tolerances and investigation workflows (if stakeholders actually ask for it)
- Par policy history table (append-only, effective dates)
- Per-table override of bank mode (if real casinos demand it)
- Full fill/credit workflow and restricted-form lifecycle (likely belongs in Cage/Finance context)

---

## Acceptance Criteria (MVP)

- [ ] `rpc_open_table_session` refuses to open if `gaming_table.status != 'active'`
- [ ] Opening and closing inventory totals can be captured per session
- [ ] Drop total can be posted later and the session reflects COUNT_POSTED via `drop_posted_at`
- [ ] Shift dashboards show per-table running totals and computed win/loss using:
      `closing + credits + drop − opening − fills`
- [ ] UI labels distinguish **Availability** vs **Session phase** (no “ACTIVE/active” confusion)
- [ ] No tolerance/blocking/policy-history requirements exist in MVP

---

## References (external)

- 25 CFR § 542.12(d) Table inventory forms (imprest-to-par vs inventory count): https://www.ecfr.gov/current/title-25/part-542/section-542.12
- WAC 230-15-585 Using drop boxes (includes fill/credit requests/slips + table inventory forms): https://app.leg.wa.gov/wac/default.aspx?cite=230-15-585
- Mississippi Gaming Commission Regulations Part 7 (Accounting Records) table gross revenue identity: https://www.msgamingcommission.com/images/uploads/MGC_RegsPart_7_Accounting_Records.pdf
- PostgreSQL ALTER TYPE (enum add/rename constraints): https://www.postgresql.org/docs/current/sql-altertype.html

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1.3 | 2026-01-16 | Added cross-context dependency on GAP-TBL-RUNDOWN; `rpc_compute_table_rundown` must consume telemetry |
| 0.1.2 | 2026-01-16 | Aligned lifecycle terminology to canonical session enum (ACTIVE/RUNDOWN/CLOSED) per status standardization ADR |
| 0.1.1 | 2026-01-16 | Patched ADR to MVP "visibility slice"; removed tolerance/blocking/history scope; aligned status contract and dashboard semantics |
| 0.1.0 | 2026-01-16 | Initial ADR — Table Bank Mode Dual Policy proposed |
