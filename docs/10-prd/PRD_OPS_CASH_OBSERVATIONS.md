---
title: "PRD — Operational Cash-Out Observations (Walk-With / Chips Taken)"
id: "PRD-OPS-CASH-OBS-001"
status: "Draft"
owner: "Pit Ops / Player Tracker"
created: "2026-01-05"
last_updated: "2026-01-05"
scope: "MVP patch (pre-production)"
related:
  - "SEC-005 v1.1.0 (Pit Boss financial txn constraints)"
  - "ADR-025 (MTL permissions)"
  - "Shift Dashboards PRD (dependency: cash-out telemetry)"
---

# 1. Executive summary

The current **“Chips Taken”** UI control is implemented as a **financial settlement cash-out** (`player_financial_transaction.direction='out'`), which is **blocked for Pit Bosses** by the existing PlayerFinancial policy (SEC-005). The failure is swallowed in the client, causing silent data loss and misleading dashboards.

This PRD introduces a **dedicated operational telemetry artifact** — **Operational Cash-Out Observations** — to record what pit bosses observe (estimate and/or cage-confirmed amounts) without conflating it with cage settlement or CTR workflows.

**Key outcome:** Pit bosses can reliably record “walk-with / chips taken” amounts (including sub-threshold amounts) for shift reporting and operational awareness, while the authoritative settlement ledger remains cage-owned.

---

# 2. Background & problem statement

## 2.1 Current failure mode
**Data flow today**
- Rating Slip Modal → “Chips Taken: [amount]”
- `use-close-with-financial.ts` attempts:
  - `createFinancialTransaction({ direction:'out', source:'pit', tender:'chips' })`
- `rpc_create_financial_txn` rejects for pit_boss unless `direction='in'`
- client `.catch(...)` swallows error → **no persisted record**

## 2.2 Root cause: conflated concepts v 
Three distinct concepts are currently collapsed into one:

1) **Operational observation (pit)**  
   “Player left the table with chips / walk-with initiated” (often an estimate)

2) **Settlement transaction (cage)**  
   Authoritative money-out event recorded by cashier/cage in the financial ledger

3) **Compliance log (MTL)**  
   Threshold-driven log/acknowledgement used for AML/CTR monitoring and accountability

The “Chips Taken” input is concept (1), but the implementation writes concept (2).

---

# 3. Goals and non-goals

## 3.1 Goals
- Provide a **first-class persistence model** for pit bosses to record:
  - cash-out *observations* (walk-with / chips taken)
  - amount estimates (required)
  - optional later cage-confirmed amounts (post-MVP integration hook)
- Ensure **sub-threshold observations** (e.g., $1,000+) can be captured for operational reporting.
- Preserve **separation of concerns**:
  - PlayerFinancial ledger remains authoritative (settlement)
  - Operational observations remain telemetry/supporting evidence
- Eliminate silent failure:
  - writes must succeed or fail visibly with actionable errors.

## 3.2 Non-goals (explicit)
- Do **not** grant Pit Boss permission to create financial ledger cash-outs (`direction='out'`) in MVP.
- Do **not** implement full cashier workflow (fills/drops/credits/front money/markers) in this patch.
- Do **not** turn RatingSlip into a financial ledger.
- Do **not** expand CTR filing workflow (identity collection, signatures, attachments).

---

# 4. Proposed solution

## 4.1 New domain artifact: `pit_cash_observation`
Create a dedicated table (name may vary, e.g., `cash_observation`, `pit_cash_observation`) representing **pit operational telemetry**.

### Core semantics
- **Observation ≠ settlement**
- Observations may be:
  - **estimate** (walk-with)
  - **cage_confirmed** (phone confirmation / follow-up)
- A patron may never cash out that day; the observation still stands as a pit record.

### Minimum fields
- `id` (uuid)
- `casino_id` (uuid)
- `gaming_day` (date) — derived via `compute_gaming_day`
- `player_id` (uuid)
- `visit_id` (uuid) — REQUIRED
- `rating_slip_id` (uuid, nullable) — convenience link
- `direction` (enum: `out` initially; optional `in` later)
- `amount` (numeric) — REQUIRED
- `amount_kind` (enum: `estimate` | `cage_confirmed`)
- `source` (enum: `walk_with` | `phone_confirmed` | `observed`)
- `observed_at` (timestamptz) — REQUIRED
- `created_by_staff_id` (uuid) — from auth/RLS context
- `note` (text, nullable)

### RLS / permissions (MVP)
- Pit Boss: `SELECT` + `INSERT` for casino scope
- Cashier/Admin: `SELECT` + `INSERT` (optionally `UPDATE` if you want reconciliation later)
- No cross-casino access; all scoped by `casino_id`.

## 4.2 UI changes (Rating Slip modal)
Replace current behavior:

- **Before:** “Chips Taken” → attempts financial cash-out txn
- **After:** “Chips Taken / Walk-with” → inserts `pit_cash_observation`:
  - `direction='out'`
  - `amount_kind='estimate'`
  - `source='walk_with'`
  - `amount` = entered amount
  - `observed_at = now()`

### Validation
- amount required and > 0
- show success confirmation
- failures are surfaced (toast/banner), no silent catch.

## 4.3 `/mtl` and shift dashboards consumption
- Shift dashboards and “daily pit insights” should read from `pit_cash_observation` for:
  - **sub-threshold cash-out telemetry**
  - “chips taken” totals
  - last-known disposition signals

MTL remains separate and threshold-driven; it may reference observations later, but does not need to be overloaded for operational telemetry.

---

# 5. Data & API contracts

## 5.1 Insert operation
Preferred interface:
- `rpc_create_pit_cash_observation(...)` (SECURITY DEFINER optional; must respect RLS context)

Alternate:
- direct insert via Supabase client with strict RLS policies.

**Idempotency**
- Optional for MVP (UI can prevent double submits), but recommended key:
  - `(casino_id, visit_id, observed_at, amount, source)` or a client-generated UUID.

## 5.2 Read models
Provide query patterns for:
- per visit: observation list ordered by `observed_at desc`
- per shift/gaming day: aggregated totals by player and day
- per player: last observation + totals

---

# 6. Acceptance criteria (Definition of Done)

## 6.1 Correctness
- Pit Boss can submit “Chips Taken” with amount estimate.
- A row is persisted in `pit_cash_observation`.
- No attempt is made to write `player_financial_transaction.direction='out'` for this action.
- Observations appear in shift dashboard aggregates.

## 6.2 UX
- On failure, user sees an error message with guidance (no silent failure).
- The rating slip can be closed without blocking on observation write, but the UI must clearly report if observation failed to save.

## 6.3 Security
- RLS prevents cross-casino reads/writes.
- `created_by_staff_id` is derived from authenticated context, not client-provided.

---

# 7. Risks & mitigations

- **Risk:** Stakeholders expect “cash-out” to mean settlement  
  **Mitigation:** UI labels explicitly say “Walk-with (estimate)” and “Cage-confirmed (reported)”. The table is named and documented as observation/telemetry.
- **Risk:** Duplicate observations  
  **Mitigation:** UI disables submit on in-flight; optional idempotency key.
- **Risk:** Future cage integration requires reconciliation  
  **Mitigation:** include `amount_kind` and optional future `linked_financial_txn_id` column.

---

# 8. Rollout plan (pre-production)

1) Add table + RLS policies + indexes
2) Update client flow to write `pit_cash_observation` instead of financial txn out
3) Update shift dashboard queries to include observations
4) Add tests:
   - RLS: pit boss can insert/select within casino
   - regression: closing slip no longer calls out-direction financial txn

---

# 9. Appendix — Why not “just grant pit boss cash-out in the ledger?”
Granting pit boss `direction='out'` in PlayerFinancial changes the control model (who can record money-out events) and drags in cage reconciliation concerns (fills/drops/credits). This PRD deliberately avoids that expansion while still delivering the stakeholder-visible metric the pit needs.
