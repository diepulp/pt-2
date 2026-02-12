# Cashier Workflow MVP — Operational Telemetry (Not Accounting) v0.1

## Why This Exists

Cashier workflows were deferred because **casino financials belong to Accounting**.  
But the floor keeps running into the same reality:

- **Table inventory lifecycle** depends on **fills/credits** being requested *and* confirmed.
- **Shift drop/hold** is distorted without **cashier-confirmed cash-outs** (and sometimes cage buy-ins).
- Pit can’t confidently explain big swings (“did they actually cash out?”) without a cage attestation.

This document defines a **minimal cashier workflow MVP** that supplies the telemetry the floor needs **without** turning PT-2 into accounting software.

---

## Guiding Principle

**PT-2 records cashier actions as *attestations of operational events*, not financial accounting.**

- Cashier is the **source of truth** for a small set of confirmed events.
- Corrections happen via **void + replacement**, not silent edits.
- No drawer balancing, no GL, no reconciliation, no “cage close” in PT-2.

Think: **“financial event confirmations that unlock accurate ops telemetry.”**

---

## MVP Goals

1) Close the **inventory loop**: request → fulfillment confirmation (fills/credits).  
2) Anchor **shift truth**: cashier-confirmed cash-outs (and optionally cage chip purchases).  
3) Prevent “ghost reality”: drop received acknowledgement, consistent audit trail.

---

## Explicit Non-Goals (Hard Guardrails)

PT-2 **will not** implement:

- Drawer balancing / till counts
- Denomination breakdowns
- Bank deposits / cash logistics
- GL accounts, chart of accounts, journal entries
- Reconciliation, cage variance reporting
- End-of-day “cage close” / shift balancing

---

## Actors & Responsibilities

### Cashier
- Confirms cage-side events (cash-out, optional chip purchase)
- Confirms fulfillment of fill/credit requests
- Acknowledges drop received (minimal stamp)

### Pit / Shift Staff
- Creates fill/credit requests
- Consumes cashier-confirmed events for shift narrative and inventory modeling
- Does **not** edit cashier confirmations

### Accounting (Out of system)
- Uses exports if needed (post-MVP)
- Owns true financial statements and reconciliation

---

## Core Cashier MVP Workflow

### 0) Cashier Session Start (Operational trace, not “open drawer”)
**Purpose:** ensure every attestation is attributable.

**Flow**
1. Cashier signs in (role = `cashier`).
2. System resolves `casino_id` and `gaming_day` (derived or selected).
3. Cashier Console opens.

**Output**
- All created events are stamped with `created_by`, `casino_id`, `gaming_day`, `created_at`.

---

### 1) Confirm Patron Cash-Out (MVP: REQUIRED)
**This is the single most valuable missing signal for shift truth.**

**Flow**
1. Search player (or select “Anonymous / Walk-in” if permitted).
2. Enter:
   - amount
   - tender type (tight enum; start with `cash` and expand as needed)
   - optional receipt/reference #
   - optional note
3. Submit → event becomes **CONFIRMED**.

**Telemetry unlocked**
- Shift can explain large wins/losses with cage-confirmed reality.
- Drop/hold estimates become less speculative.
- Player “net today” becomes credible even if table logs are imperfect.

---

### 2) Confirm Fill / Credit Fulfillment (MVP: REQUIRED)
This closes the operational loop for table inventory lifecycle.

#### Two-step model
- **Pit creates a request** (fill/credit request).
- **Cashier confirms fulfillment** (issued/received).

**Flow**
1. Cashier opens **Operational Confirmations** queue.
2. Selects a pending fill/credit request.
3. Confirms:
   - fulfilled amount
   - timestamp
   - optional discrepancy reason if amount differs
4. Submit → request becomes **CONFIRMED_FULFILLED** (or equivalent).

**Telemetry unlocked**
- Inventory model can trust that chips moved.
- Fills/credits can be reconciled against end-of-shift inventory counts.
- “Requested vs issued” discrepancies are visible as exceptions.

---

### 3) Drop Received Acknowledgement (MVP: REQUIRED)
You do not need full cage counting mechanics in PT-2 MVP.  
You **do** need: “the cage received the drop.”

**Flow**
1. Cashier opens **Drop Acknowledgements** list (by table and/or drop batch).
2. Marks “Received” with timestamp.
3. Optional (Phase 1.5): enter counted total if cage can provide it consistently.

**Telemetry unlocked**
- Prevents “ghost drop” ambiguity.
- Improves trust in shift reporting and table rundown closure.

---

### 4) Confirm Cage Buy-In / Chip Purchase (MVP: OPTIONAL BUT READY)
**Status:** Optional, but the model/UI should be ready to add quickly once cashier console exists.

**What it is**
Player exchanges **cash (or other tender)** for **chips** at the cage and walks to a table already holding chips.

**Why it matters**
- Explains “pre-loaded bankroll” (player appears at table with chips, no table buy-in recorded).
- Helps multi-table sessions where table buy-ins are incomplete.

**Flow**
1. Search player (or “Anonymous / Walk-in” if permitted).
2. Enter amount, tender type, optional receipt/reference.
3. Submit → event becomes **CONFIRMED**.

**MVP boundary**
- Ignore pure “net-zero” chip exchanges (color-ups) unless operations demand it later.

---

## UI Surface (Cashier Console MVP)

### Screen 1 — Patron Transactions
- Confirm **Cash-Out** (required)
- Confirm **Cage Chip Purchase / Buy-In** (optional but ready)
- Show recent transactions for quick verification (“did I already do this?”)

### Screen 2 — Operational Confirmations
- Queue of pending **Fill/Credit** requests
- “Confirm Fulfilled” action
- Discrepancy note if mismatch

### Screen 3 — Drop Acknowledgements
- Today’s tables / drop batches
- “Received” stamp + timestamp
- Optional counted total (Phase 1.5)

That’s it. No accounting dashboards.

---

## Minimal Data Model (Event Attestations)

Prefer a single canonical event table (or your existing `player_financial_transaction`) holding:

### Event Types (MVP)
- `CASH_OUT_CONFIRMED` (**required**)
- `FILL_CONFIRMED` (**required**) — cashier attests chips issued to a table/request
- `CREDIT_CONFIRMED` (**required**) — cashier attests chips received from a table/request
- `DROP_RECEIVED` (**required**) — acknowledgement stamp
- `CAGE_CHIP_PURCHASE_CONFIRMED` (**optional but ready**)

### Common Fields (MVP)
- `casino_id`
- `gaming_day`
- `txn_type` (enum)
- `amount` (nullable for `DROP_RECEIVED` if you only stamp receipt)
- `tender_type` (tight enum; expand later)
- `player_id` (nullable for anonymous/walk-in)
- `table_id` (nullable when not table-bound)
- `request_id` (for fill/credit linkage; nullable)
- `status` (`confirmed` | `voided`)
- `external_ref` (receipt/ticket; nullable)
- `notes` (short; nullable)
- `created_by` (staff id)
- `created_at`

### Corrections Policy
- No edits after confirmation.
- Fix mistakes via **void + replacement** with reason.
- Keep the original record for audit integrity.

---

## RLS & Permissions (Casino-scoped, Role-gated)

- All rows are scoped by `casino_id` (+ `gaming_day` where applicable).
- Only `staff_role in ('cashier', 'admin')` can create/void cashier-confirmed events.
- Pit roles can **read** events for reporting/telemetry, not write them.
- Use your standard `set_rls_context` mechanism to set `app.casino_id`, `app.actor_id`.

---

## Suggested Rollout Order (Pragmatic)

1) **Cash-out confirmed** (highest value for shift truth)
2) **Fill/Credit confirmed** (closes inventory lifecycle loop)
3) **Drop received stamp** (prevents ghost drop)
4) **Cage chip purchase confirmed** (optional, but quick add once console exists)

---

## Definition of Done (MVP)

- Cashier can confirm cash-outs with audit trail (create + void).
- Cashier can confirm fill/credit requests (fulfilled amount + discrepancy).
- Cashier can acknowledge drop received.
- Pit/shift views can consume these events for:
  - shift narrative (“did they cash out?”)
  - inventory loop closure (requested vs confirmed)
  - drop lifecycle status (received yes/no)
- No accounting features beyond the above attestations.

---

## Boundary Rule (One Sentence)

PT-2 records cashier events only when they impact pit telemetry:
**funding (optional chips issued), liquidation (cash-out), and inventory movement (fill/credit/drop received).**
Everything else remains in accounting systems.
