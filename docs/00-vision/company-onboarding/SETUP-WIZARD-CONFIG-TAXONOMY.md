---
title: Setup Wizard Configuration Taxonomy
doc_type: spec
version: v0.1
status: draft
last_updated: 2026-02-10
timezone: America/Los_Angeles
---

# Setup Wizard Configuration Taxonomy (Operational Casino Pit)

This document defines a **settings taxonomy** for “standing up an operational casino pit” via the **Setup Wizard (Wizard B)** — the minimum set of entities + configuration that must exist so a brand-new tenant is not trapped at `/setup`, and the pit can run tables.

It is based on the **gap analysis** describing the current posture (bootstrap creates the tenant, but key operational seeds + setup completion transition are missing).  

---

## 0) Taxonomy goals

1) **Unblock the tenant**: move `casino_settings.setup_status` → `ready` and stamp `setup_completed_at`.  
2) **Create an operable pit**: at least **one game configured** + **one table created**.  
3) **Keep MVP thin**: everything else is “post-setup settings” unless it blocks operations.

---

## 1) Taxonomy overview (by domain object)

Think of this as a “configuration tree” with hard dependencies.

### A) Tenant gate (must exist to leave onboarding)

**Entity:** `casino_settings` (plus the `casino` row created at bootstrap)

- **Purpose:** gating + global operational defaults for the property.
- **Hard requirements for Wizard B completion:**
  - `setup_status = 'ready'`
  - `setup_completed_at = now()`

**Wizard-editable (MVP):**
- `timezone` (prefilled from bootstrap)
- `gaming_day_start_time` (prefilled from bootstrap)
- `table_bank_mode` (needs an explicit choice even if defaults exist—this affects pit ops)

**Wizard-defer (Post-setup):**
- `watchlist_floor`
- `ctr_threshold`
- `alert_thresholds` (JSON; too heavy for wizard MVP)
- `promo_allow_anonymous_issuance`
- `promo_require_exact_match`

---

### B) Pit can’t function without games

**Entity:** `game_settings`

- **Purpose:** define game “templates” per casino (decisions/hr, house edge, seats, etc.).
- **Hard requirement (MVP):** at least **1** row created.

**Minimum fields to configure in Wizard B:**
- `game_type` (enum: blackjack | poker | roulette | baccarat)
- `name` (operator-friendly label like “Blackjack 6-Deck”)

**Defaults accepted (Wizard B can auto-fill):**
- `decisions_per_hour`
- `house_edge`
- `seats_available`

**Optional in Wizard B (nice, not blocking):**
- `min_bet`, `max_bet`

**Defer:**
- `point_multiplier`
- `points_conversion_rate`
- `rotation_interval_minutes`

---

### C) Pit can’t run without tables

**Entity:** `gaming_table`

- **Purpose:** represents physical tables on the floor.
- **Hard requirement (MVP):** at least **1** row created.

**Minimum fields to configure in Wizard B:**
- `label` (e.g., “BJ-01”)
- `type` (`game_type`)
- optional: `pit` (grouping label)

**Defaults / defer:**
- `status` default
- `par_total_cents` optional (if bank/par tracking is not Phase 1)

---

### D) Table overrides (post-setup unless your pit demands it day 1)

**Entity:** `gaming_table_settings`

- **Purpose:** overrides game defaults per table (speed, limits, etc.)
- **Wizard scope:** **Defer**
- **Reason:** game defaults + a table list are enough to operate initially.

---

### E) Floor layout (post-setup)

**Entities:** `floor_layout`, `floor_table_slot`

- **Purpose:** spatial placement / map view / “digital floor plan”
- **Wizard scope:** **Defer**
- **Reason:** operationally optional for MVP.

---

## 2) Dependency graph (minimum viable output)

Wizard B must produce at least:

1) `casino_settings` updated:
   - timezone + gaming day start time confirmed
   - table bank mode chosen
2) `game_settings` seeded:
   - ≥1 configured game type
3) `gaming_table` seeded:
   - ≥1 table, attached to one of the enabled game types
4) `casino_settings` completion:
   - `setup_status` → `ready`
   - `setup_completed_at` → `now()`

Everything else is “after you can walk.”

---

## 3) Wizard step mapping (taxonomy → UX steps)

### Step 1 — Property basics (global)

Confirm/edit:
- timezone
- gaming day start time

Choose:
- table bank mode

**Output:** updates `casino_settings`

---

### Step 2 — Games offered (seed templates)

- Select offered game types (checkbox list)
- For each selected:
  - name
  - accept defaults (DPH/edge/seats), optionally edit

**Output:** inserts `game_settings` rows

---

### Step 3 — Initial tables (seed floor inventory)

- Create at least 1 table per enabled type (or at least 1 total)
- Bulk creation option (BJ-01..BJ-05, etc.)
- Optional: pit assignment label

**Output:** inserts `gaming_table` rows

---

### Step 4 — Complete setup (gate flip)

Commit + mark ready:
- `setup_status = 'ready'`
- `setup_completed_at = now()`

**Output:** tenant becomes navigable (routes land in the real app)

---

### “Skip setup” (engineering escape hatch)

- Sets `setup_status = 'ready'` with **no seeding**
- Useful for dev/testing, but yields an empty operational environment

---

## 4) Checklist (MVP vs Post-setup)

### MVP (wizard must cover)

- `casino_settings`:
  - timezone
  - gaming_day_start_time
  - table_bank_mode
  - setup_status + setup_completed_at
- `game_settings`:
  - game_type, name, defaults accepted
- `gaming_table`:
  - label, type, optional pit

### Post-setup (settings screens later)

- `gaming_table_settings`
- `floor_layout`, `floor_table_slot`
- `casino_settings.alert_thresholds` JSON tuning
- promo toggles + watchlist/CTR thresholds tuning
