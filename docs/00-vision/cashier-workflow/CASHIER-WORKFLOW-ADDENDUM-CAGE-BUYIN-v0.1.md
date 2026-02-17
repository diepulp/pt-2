# Cashier Workflow Addendum — Cage Buy-In / Chip Purchase Telemetry (MVP)

## Purpose

This addendum expands the **Cashier MVP Workflow** with clarity around:

- **Cage buy-ins / chip purchases** (player obtains chips at the cage, not at a table)
- Why this matters for **table inventory lifecycle**, **drop/hold accuracy**, and **shift explanations**
- A **minimal event model** that preserves Player Tracker scope without drifting into accounting software

---

## Core Concept

There are two different “buy-ins” that appear in real casino operations:

### A) Table Buy-In (Pit-visible)
Player walks up to a table and exchanges cash for chips on the layout.  
Dealer breaks cash, supervisor logs the buy-in.

This is the classic “buy-in” the pit can observe directly.

### B) Cage Chip Purchase / Chip Issuance (Cage-confirmed)
Player exchanges **cash (or other tender)** for **chips** at the cage and then walks to tables already holding chips.

To the pit, the player arrives **pre-loaded**. If you only track table buy-ins, you will frequently miss the bankroll source.

---

## Why Cage Chip Purchases Exist (Common Operational Drivers)

Exact procedures vary by jurisdiction and internal controls, but operationally cage issuance happens for reasons like:

1) **Efficiency & high denominations**  
   Large cash-to-chip conversions are centralized at the cage to reduce table disruption and standardize handling.

2) **Table-hopping**  
   Player buys chips once, then plays multiple tables. A single table buy-in log becomes incomplete or ambiguous.

3) **Chip exchanges / conversions**  
   Player may exchange many small chips for higher denominations (sometimes at the cage).

4) **Visibility & internal controls**  
   Some properties prefer cage confirmation for documentation, thresholds, or consistent “source-of-chips” evidence.

---

## Why PT-2 Needs This (Telemetry Value)

Player Tracker does **not** need cage balancing, GL, or accounting reconciliation.  
It *does* need a minimal **attestation**:

> “At time T, the cage issued chips valued at $X to Player P in exchange for tender Y.”

This single fact improves:
- **Shift narrative clarity** (“where did this bankroll come from?”)
- **Drop/hold trust** (reduces phantom bankroll disputes)
- **Cross-table consistency** when table buy-ins are missing or incomplete

---

## Examples (How This Shows Up on the Floor)

### Example 1 — “Phantom Bankroll”
- Player arrives at baccarat already holding ~$10k in chips.
- Pit logs table buy-in = $0 (none occurred at table).
- Player plays big, then cashes out later.

Without cage issuance telemetry: “Where did the chips come from?”  
With it: “Cage issued $10k at 7:12pm.”

### Example 2 — Multi-table session
- Cage purchase $5k
- Player plays blackjack → pai gow → baccarat
- Only one table buy-in is logged (or none)

Cage event provides a reliable “starting bankroll source” for the session.

### Example 3 — Chip exchange / color-up
- Player holds mixed small chips
- Cage exchanges into higher denominations

**MVP stance:** ignore net-zero exchanges unless the floor needs them for disputes.  
**Post-MVP:** add `CHIP_EXCHANGE_CONFIRMED` if your operations request it.

---

## MVP Modeling (Minimal + Non-Accounting)

### Event Type
Use either:
- `CAGE_CHIP_PURCHASE_CONFIRMED`, **or**
- reuse `BUY_IN_CONFIRMED` with a `source = 'cage'` field/tag

### Required Fields (MVP)
- `casino_id`
- `gaming_day`
- `player_id` *(nullable for anonymous/walk-in)*
- `amount`
- `tender_type` *(tight enum: cash, chips, etc.; expand later if needed)*
- `txn_type`
- `status` *(confirmed/voided; no silent edits)*
- `created_by` *(cashier staff id)*
- `created_at`

### Optional Fields (MVP)
- `external_ref` *(receipt # / ticket #)*
- `notes` *(short; for human context)*

### Corrections Policy
- No edits after confirmation.
- Fix mistakes via **void + replacement** with a reason.

This preserves audit integrity without turning into accounting.

---

## UI Surface (Cashier Console MVP)

Add a minimal action inside **Patron Transactions**:

- **Chip purchase (cage issuance)**  
  Search player (or anonymous) → enter amount + tender → confirm.

This should sit next to:
- Cash-out confirmation
- Buy-in confirmation (if you separate semantics)

---

## Scope Guardrails (What This Is NOT)

**Hard MVP boundaries:**
- No drawer balancing
- No denomination breakdown
- No GL codes / chart of accounts
- No bank deposits / reconciliation
- No “end-of-day cage close” workflow inside PT-2

**Allowed:**
- Confirm/void financial *events* for operational telemetry
- Attach receipt references
- Export later for accounting systems (optional post-MVP)

---

## Suggested Rollout Order (Pragmatic)

1) **Cash-out confirmed** (highest value for shift truth)
2) **Fill/Credit confirmed** (closes table inventory lifecycle loop)
3) **Cage chip purchase confirmed** (resolves “pre-loaded bankroll” gaps)
4) **Drop received stamp** (prevents ghost drop)

---

## Boundary Rule (One Sentence)

PT-2 records cashier events only when they impact pit telemetry:
**funding (chips issued), liquidation (cash-out), and inventory movement (fill/credit/drop received).**
Everything else stays in accounting systems.
