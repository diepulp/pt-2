# MTL (Pit Cash) MVP — User‑Story Contract
*Version:* v1.0 (scope lock)  
*Last updated:* 2026-01-05  
*Purpose:* Remove ambiguity about what is being built for PT‑2 MTL in MVP.

---

## 1) Problem statement

Pit bosses need a **daily workflow** to observe and record **pit cash activity** by patron, with enough structure for:
- real-time operational awareness (approaching thresholds),
- accountability (who saw/recorded/corrected what),
- and later auditability.

This is **not** a CTR filing system.

---

## 2) Definitions

### 2.1 Gaming day
A casino-defined “gaming day” is the aggregation boundary for daily totals and threshold states.

### 2.2 Cash-in vs cash-out (telemetry semantics)
We track **two separate directional totals**:
- **cash_in_total_currency**
- **cash_out_total_currency**

Directional totals are **never offset** against each other.

### 2.3 MTL vs CTR (scope boundary)
- **MTL (this MVP):** operational logging + alerts + accountability for pit cash activity.
- **CTR (explicitly out of scope):** identity collection (SSN/DOB/address), signatures, attachments, filing artifacts/case management.

---

## 3) System scope (MVP)

### 3.1 In scope
- Derive MTL entries **from pit cash financial transactions** (source-of-truth).
- Persist and surface **threshold states** (e.g., approaching / crossed).
- Provide **/mtl** UI route for:
  - aggregates (per patron/day),
  - list of derived entries,
  - creation of **manual MTL entries** (with required note).
- Accountability: created_by, timestamps, and audit trail for changes/corrections.

### 3.2 Out of scope
- CTR workflows (identity/signature/attachments/final reports).
- Cashier instruments (wire/check/currency exchange/front money/safekeeping cage operations).
- Distributed event bus / consumer services.

---

## 4) Domain ownership & trigger contract

### 4.1 Source of truth
**PlayerFinancial / Finance** owns `player_financial_transaction`.

### 4.2 Trigger
**Trigger source = financial transactions**.

- When a new eligible `player_financial_transaction` is inserted, the system derives:
  1) a `mtl_entry` (derived), and
  2) an updated threshold state/alert.

### 4.3 Rating slip linkage (context only)
- Financial transactions may be **entered via the rating slip UI**, but:
  - the rating slip is **not the trigger**,
  - it is a **link/context reference** only.

---

## 5) Data contracts

### 5.1 `player_financial_transaction` (MVP requirements)
**Required**
- `visit_id` (always present; rated, non-rated, or ghost visit)
- `player_id`
- `casino_id`
- `occurred_at` (txn timestamp)
- `amount` (currency)
- `channel = 'pit'` (or equivalent origin marker)
- `is_currency = true`
- `txn_type` (min set: `chip_purchase`, `chip_redemption`)

**Optional**
- `rating_slip_id` (context link)

### 5.2 `mtl_entry`
Fields (conceptual; align to your canonical schema):
- `casino_id`
- `gaming_day`
- `player_id`
- `visit_id` (required)
- `occurred_at`
- `amount`
- `direction` (`cash_in` | `cash_out`)
- `source` (`derived` | `manual`)
- `created_by_staff_id`
- `note` (required for manual)
- `source_financial_txn_id` (required for derived)
- `idempotency_key` (derived = `fin:<source_financial_txn_id>`)

### 5.3 Idempotency invariants
- **Invariant:** exactly **one derived `mtl_entry` per eligible financial txn**.
- Enforced by a unique DB constraint, e.g. `(casino_id, idempotency_key)`.

---

## 6) Business rules

### 6.1 Eligibility filter (pit cash only)
A financial txn produces a derived MTL entry if:
- `channel == 'pit'`
- `is_currency == true`
- `txn_type` maps to:
  - `chip_purchase` → `cash_in`
  - `chip_redemption` → `cash_out`

Everything else is ignored by MTL derivation in MVP.

### 6.2 Aggregation rule (no offset)
- Maintain **separate** running totals for cash-in and cash-out.
- Never subtract cash-out from cash-in (or vice versa) in totals.

### 6.3 Threshold states (server-side)
Thresholds are evaluated **server-side**, persisted, and then displayed.

**Default thresholds (configurable):**
- `approaching_pct = 0.90`
- `crossed_amount = 10000`

States per direction:
- `none`
- `approaching` (>= approaching_pct * crossed_amount)
- `crossed` (> crossed_amount)

### 6.4 Manual entries (allowed)
Pit boss may create manual entries when:
- telemetry is late/missing, or
- supervisor wants an explicit note trail.

Manual entry requirements:
- Must select `player_id` + `visit_id`
- Must include `note`
- Must include `amount`, `direction`, `occurred_at` (defaults to “now”)
- Must record `created_by_staff_id`

### 6.5 Corrections
MVP default:
- Prefer **append-only corrections** (new entry referencing prior entry) vs mutating derived entries.
- If edits are allowed, they must be audited.

---

## 7) User stories & acceptance criteria

### Epic A — Automatic MTL derivation from pit cash txns

#### Story A1 — Derive entry on buy-in (cash-in)
**As a** pit boss  
**I want** an MTL entry to appear automatically when a pit cash buy-in is recorded  
**So that** I don’t manually re-enter the same transaction.

**Acceptance criteria**
- Given an inserted financial txn with `txn_type=chip_purchase`, `channel=pit`, `is_currency=true`  
  → a derived `mtl_entry` exists with `direction=cash_in`, correct amount, player_id, visit_id, occurred_at.
- Re-inserting/retrying the same txn (same id) does **not** create duplicates (idempotency holds).

#### Story A2 — Derive entry on cash-out (cash-out)
Same as A1 but `txn_type=chip_redemption` → `direction=cash_out`.

---

### Epic B — Threshold awareness & notifications

#### Story B1 — Approaching threshold alert
**As a** pit boss  
**I want** the system to notify me when a patron approaches the daily threshold  
**So that** I can respond operationally and keep accountability.

**Acceptance criteria**
- When a patron’s **directional** total crosses `approaching_pct * crossed_amount`, the server persists a state/alert:
  - for **cash_in** and/or **cash_out** independently.
- The UI shows the alert within the refresh window (polling) or near-real-time (subscription).
- Alert is emitted once per patron/day/direction/state transition (no spam).

#### Story B2 — Crossed threshold state
**Acceptance criteria**
- When total exceeds `crossed_amount`, state becomes `crossed`.
- The UI reflects `crossed` and continues to record subsequent eligible txns.

---

### Epic C — MTL workspace UI at `/mtl`

#### Story C1 — Pit boss can review the MTL daybook
**As a** pit boss  
**I want** an `/mtl` route showing today’s patrons with totals and entries  
**So that** I can manage the shift without hunting across screens.

**Acceptance criteria**
- `/mtl` shows:
  - per patron: cash_in_total, cash_out_total, threshold state(s), last activity time
  - derived entry list (drill-down per patron)
- Filtering:
  - by gaming day (default = current)
  - by threshold state (optional MVP)
- Data shown is consistent across staff (server-side derivation).

#### Story C2 — Manual MTL entry
**As a** pit boss  
**I want** to create a manual MTL entry with a note  
**So that** missing telemetry can be captured with accountability.

**Acceptance criteria**
- Manual entry requires: player, visit, direction, amount, note.
- Entry is tagged `source=manual` and displays in the patron’s daybook.

---

## 8) Worked examples (how increments appear)

### Example 1 — Patron buys in 2,500 then 1,000
- T1: `chip_purchase` 2,500 → derived entry #1 (cash_in)
- T2: `chip_purchase` 1,000 → derived entry #2 (cash_in)
- Running cash_in_total = 3,500
- UI representation:
  - **Entries are rows** (each txn is its own line with its own time).
  - UI may optionally *render columns* visually, but **data remains row-based**.

### Example 2 — Patron buys in 4,000 once
- T1: `chip_purchase` 4,000 → derived entry #1
- Running cash_in_total = 4,000

---

## 9) Non-functional requirements (MVP)

- **Correctness > realtime**  
  Realtime delivery is optional; server-side correctness is mandatory.
- **RLS-aligned attribution**  
  `created_by_staff_id` must come from authenticated context.
- **Performance**  
  Daybook queries must be paginated/limited; aggregates should be index-friendly.

---

## 10) References (semantics only)
URLs included for portability:

```text
31 CFR § 1021.311 (casino cash-in/cash-out examples; >$10,000 threshold)
https://www.law.cornell.edu/cfr/text/31/1021.311

FinCEN casino FAQ: cash-in and cash-out aggregated separately; must not be offset
https://www.fincen.gov/resources/statutes-regulations/guidance/frequently-asked-questions-casino-recordkeeping-reporting

Missouri MICS Chapter K (example of internal MTL thresholds like $3,000 and incremental logging thresholds like $500)
https://www.mgc.dps.mo.gov/RulesNRegs/MICS/MICS_K_2015-02-28.pdf
```
