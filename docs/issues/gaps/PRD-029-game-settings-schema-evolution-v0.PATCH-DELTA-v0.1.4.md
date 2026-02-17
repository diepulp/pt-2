---
prd_id: PRD-029
title: "PRD-029 Polish Patch Delta — v0.1.4 (Numeric precision, derived casino_id semantics, clearer enum risk, consumer guidance, code stability note)"
version: "0.1.4-delta"
status: proposed_patch
created: 2026-02-10
last_updated: 2026-02-10
---

# Intent

This delta is *polish-only*: no new features, just spec hygiene to prevent:
- precision drift in percent fields,
- confusion around side-bet `casino_id` (derived vs supplied),
- ambiguity in enum lifecycle risk language,
- lingering consumer assumptions (“one row per game_type”),
- and unstated stability guarantees for the new `code` identifier.

References:
- `numeric(p,s)` precision/scale (Postgres docs): https://www.postgresql.org/docs/current/datatype-numeric.html citeturn0search0  
- Triggers can modify `NEW` row values in BEFORE triggers (Postgres docs): https://www.postgresql.org/docs/current/plpgsql-trigger.html citeturn0search12  
- Enum add value placement BEFORE/AFTER (Postgres docs): https://www.postgresql.org/docs/current/sql-altertype.html citeturn0search2  
- Enums cannot remove values without recreate (Postgres docs): https://www.postgresql.org/docs/current/datatype-enum.html citeturn0search7  

---

## PATCH 1 — Numeric precision/scale (percent fields)

### Update FR-3 and FR-4 column type declarations to use explicit precision:

- `rating_edge_for_comp numeric(6,3) NULL CHECK (rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100)`
- `game_settings_side_bet.house_edge numeric(6,3) NOT NULL CHECK (house_edge >= 0 AND house_edge <= 100)`

**Rationale**: `numeric(p,s)` declares maximum precision and scale; it stabilizes storage and downstream type generation. citeturn0search0  

---

## PATCH 2 — Side-bet `casino_id` semantics (derived, not client-supplied)

### In FR-4 (side-bet table), replace any ambiguous wording with:

**casino_id is derived**
- Client code MUST NOT supply `casino_id` for `game_settings_side_bet`.
- A **BEFORE INSERT OR UPDATE** trigger MUST set `NEW.casino_id` from the parent `game_settings` row:
  - `NEW.casino_id := (SELECT casino_id FROM game_settings WHERE id = NEW.game_settings_id)`
- If parent does not exist, raise an exception (defensive).
- This ensures `casino_id` is always correct for RLS ergonomics and cannot drift.

**Implementation note**: Postgres trigger functions can directly replace values in `NEW` and return the modified `NEW`. citeturn0search12  

---

## PATCH 3 — Enum lifecycle risk wording (accurate + actionable)

### In the Risk section, replace “append-only” wording with:

- **Enum values are effectively non-removable** in place.
  - Postgres supports adding values (optionally BEFORE/AFTER), and renaming values. citeturn0search2  
  - Existing enum values **cannot be removed** (nor can ordering be changed) without dropping/recreating the type and migrating dependent columns. citeturn0search7  
- Therefore treat enum evolution as:
  - “Add/rename is OK; remove is a migration event.”

Also add:
- UI/logic MUST NOT rely on enum **ordering**.

---

## PATCH 4 — Consumer guidance (stop assuming one row per game_type)

### Add this to Section “Consumer Updates / Risks”:

- Consumers MUST NOT query `game_settings` assuming **one row per `game_type`**.
- Selection should be by:
  - `code` (stable), or
  - `id` (FK reference), depending on use case.
- Any helper like `getGameSettingsDefaults()` must be updated to return a list keyed by `code`, not a `.maybeSingle()` per `game_type`.

---

## PATCH 5 — Appendix note: `code` stability guarantee (explicit)

### Add to Appendix A (or wherever template mappings are defined):

**Code stability invariant**
- `game_settings.code` is a **globally stable identifier** across casinos and over time.
- Templates, analytics, and migrations can rely on a given `code` meaning the same variant semantics (e.g., `rising_phoenix_comm_free` always means “Banker 3-card 7 push commission-free variant”).

---

## PATCH 6 — DoD additions (polish-level verifications)

Add the following checks to DoD:

- [ ] Migration sets percent fields to `numeric(6,3)` with 0..100 CHECK constraints. citeturn0search0  
- [ ] Side-bet trigger derives `casino_id` by overwriting `NEW.casino_id` in a BEFORE trigger; inserts succeed without client-supplied casino_id. citeturn0search12  
- [ ] Risk section explicitly states enum values cannot be removed without recreate, and ordering is not relied upon. citeturn0search2turn0search7  

