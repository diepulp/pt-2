---
title: "MTL Reverse-Bridge Remediation"
doc_type: "engineering-note"
project: "PT-2 Casino Player Tracker"
status: "draft"
version: "v0.1"
date: "2026-01-20"
owner: "Compliance/Finance Integration"
---

# Problem Statement
The compliance dashboard can create/edit **`mtl_entry`** records that represent buy-ins. However, the rating slip’s buy-in totals are derived from **`player_financial_transaction`** (PFT). When an MTL entry is created/edited without a proper linkage to a visit/finance transaction, **the rating slip becomes stale**, causing regressions in financial tracking.

## Observed Failure Chain (Current)
- Compliance Dashboard opens **`MtlEntryForm`** **without** `visitId`.
- Form inserts `mtl_entry` with `visit_id = NULL`.
- Reverse bridge trigger has `WHEN (NEW.visit_id IS NOT NULL ...)` → **does not fire**.
- No PFT row is created → rating slip totals (derived from PFT) remain unchanged.

# Core Diagnosis
You didn’t make a *logic* mistake; you made an **architecture decision** without enforcing a **single source of truth**.

Right now there are two competing write paths:

- **Finance path (healthy):** `player_financial_transaction` (canonical) → derived `mtl_entry` (forward bridge)
- **Compliance path (problematic):** editable `mtl_entry` → sometimes derived `player_financial_transaction` (reverse bridge)

Once `mtl_entry` becomes editable, you either:
1) **Commit to full bidirectional consistency** (including updates + stable linking + audit semantics), or
2) **Make finance canonical** and treat MTL as a derived compliance representation.

# Recommended Resolution: Make Finance Canonical
If you want rating slip totals to never lie, **`player_financial_transaction` must be canonical** for cash in/out.

**Rule:**
> All buy-ins create/update finance first. MTL is derived.

This turns the “reverse bridge” into something you can mostly delete (or reduce to validation).

## Why this works
- Rating slip totals are derived from PFT → no drift.
- Compliance UI becomes an alternate front-end for creating finance transactions.
- MTL remains a compliance view/log, not a competing ledger.

# Implementation Plan (Ship-Ready, Minimal Scope)

## 1) Stop writing `mtl_entry` directly for buy-ins
Change the Compliance Dashboard flow so the MTL form **creates a financial transaction** (via RPC), and the **existing forward bridge** derives/updates MTL.

**New flow:**
1. Patron selected in Compliance Dashboard
2. Resolve patron’s **active `visit_id`** (or block)
3. Submit form → call `rpc_create_financial_txn(...)` (or a dedicated `rpc_create_mtl_buyin(...)` that *internally* creates PFT)
4. Forward bridge derives `mtl_entry` with correct `visit_id`

**Immediate wins:**
- No more `visit_id = NULL` buy-in entries
- No more “MTL edited, rating slip stale” drift (because buy-in edits don’t target MTL directly)

## 2) Enforce “no orphan buy-in MTL” at the DB boundary
Your current system permits nonsense rows: “buy-in MTL” with `visit_id = NULL`.

Add guardrails:

- **UI guard:** disable submit if no `visitId` for entries that affect totals
- **DB guard:** a constraint (or RPC validation) such as:
  - `CHECK (entry_type != 'buy_in' OR visit_id IS NOT NULL)`

If you truly need MTL entries without a visit (e.g., a cashier/compliance note), that’s fine — but those must be explicitly **non-deriving** and not expected to sync rating slip totals.

## 3) Fix the dashboard to pass `visitId`
Your data-flow analysis is correct: the Compliance Dashboard must resolve the active visit and pass it.

Practical options:
- **Best:** include `active_visit_id` in the GamingDaySummary RPC payload (one round trip)
- **Also fine:** fetch active visit on patron select (`handlePatronClick`)
- **Must-have:** block “buy-in MTL” creation when no active visit exists

# If You Insist on Editable MTL that Syncs Backward
If you want MTL edits to propagate into finance, you must build a *real* reverse bridge.

## Required Mechanics

### A) Add a stable link: `mtl_entry` → `player_financial_transaction`
- Add `mtl_entry.financial_txn_id uuid` (FK)
- Forward bridge populates it for derived rows
- Add uniqueness if it’s a 1:1 mapping (e.g., `UNIQUE (financial_txn_id)`)

### B) Bridge **updates**, not just inserts
- Trigger must be `AFTER INSERT OR UPDATE`, not insert-only
- On UPDATE:
  - Update linked PFT **or** create an adjustment PFT record

### C) Don’t overwrite for compliance: use amendments/adjustments
Overwriting amounts is where auditability and reconciliation go to die.

Preferred:
- Create **adjustment transactions** (delta) with a reason code
- Optionally store MTL amendments as separate rows (`mtl_entry_amendment`) rather than mutating the original

Result:
- Rating slip remains correct because totals derive from the transaction stream.

# Verdict: Was Making MTL Editable a Mistake?
- Editable **as overwrite**: yes — it invites drift unless you implement full bidirectional consistency + audit semantics.
- Editable **as amendment/adjustment**: reasonable and consistent with audit expectations.

# Minimal Remediation Checklist (No Unicorn Hunting)
- [ ] Compliance Dashboard resolves and passes `visitId` (or blocks “buy-in MTL”)
- [ ] `MtlEntryForm` requires `visitId` for entries that impact totals
- [ ] Create buy-ins via finance RPC, not via direct `mtl_entry` insert
- [ ] DB constraint: no “buy-in” MTL row with NULL `visit_id`
- [ ] (Optional) If keeping edits: implement amendment/adjustment pattern (avoid overwrites)

# Notes / Naming
- **Forward bridge:** PFT → MTL derivation (already working)
- **Reverse bridge:** MTL → PFT derivation (currently brittle; don’t keep it half-built)

