---
prd_id: PRD-029
title: "PRD-029 Micro Patch Delta — v0.1.3 (Stable identifiers, deck constraints, deterministic seed context, side-bet tenancy choice)"
version: "0.1.3-delta"
status: proposed_patch
created: 2026-02-10
last_updated: 2026-02-10
---

# Intent

This delta locks the remaining ambiguous points from Audit #3:

1) Add a **stable identifier** (`code`) so idempotent seeding does not depend on mutable display names.  
2) Make **deck constraints** explicit (including the Spanish-21 “both shoe_decks + deck_profile” case).  
3) Make seed RPC **deterministic** about RLS context (no “maybe” preconditions).  
4) Choose one side-bet tenancy integrity strategy (avoid “pick later” drift).

**Primary references**
- CHECK constraints are boolean expressions (Postgres docs): https://www.postgresql.org/docs/current/ddl-constraints.html  
- Unique indexes (Postgres docs): https://www.postgresql.org/docs/current/indexes-unique.html  
- Row security bypass + FORCE RLS (Postgres docs): https://www.postgresql.org/docs/current/ddl-rowsecurity.html  
- ALTER TYPE / enum add value semantics (Postgres docs): https://www.postgresql.org/docs/current/sql-altertype.html  

---

## PATCH 1 — FR-2: Stable identifiers for game settings

### Replace FR-2 “unique key” language with:

**FR-2: Canonical identifiers**
- Add `code text NOT NULL` to `game_settings`.
  - `code` is a **stable machine identifier** (examples: `bj_6d`, `bj_dd`, `spanish_21`, `players_edge_21`, `mini_baccarat`, `rising_phoenix_comm`, `rising_phoenix_comm_free`, `pai_gow`, `emperor_challenge_exposed`, `uth`, `high_card_flush`).
- Keep `name text NOT NULL` as the **operator-facing display label**.
- Add unique constraint:
  - `UNIQUE (casino_id, code)`
- Remove (or de-emphasize) `UNIQUE (casino_id, name)` if it currently exists as the primary key.
  - If you must keep `(casino_id, name)` for UX convenience, declare it **non-authoritative** (soft uniqueness) and do not use it for idempotent writes.

**Rationale**
- Display labels change. Stable seeding cannot depend on them.

---

## PATCH 2 — FR-3: Deck constraint rules (explicit CHECKs)

### Replace FR-3 constraint bullets with:

**FR-3: Shoe deck count + deck composition**
- `shoe_decks smallint NULL CHECK (shoe_decks IN (1,2,4,6,8))`
- `deck_profile text NULL CHECK (deck_profile IN ('standard_52','with_joker_53','spanish_48'))`

**Compatibility rule**
- Allow both to be set (Spanish 21 commonly needs both dimensions):
  - Example: `shoe_decks = 6`, `deck_profile = 'spanish_48'`

**Optional stricter rule (future)**
- If you later want to ensure at least one of the two is set, add:
  - `CHECK (shoe_decks IS NOT NULL OR deck_profile IS NOT NULL)`
- Do **not** require exactly-one; Spanish 21 breaks that.

**Why explicit CHECKs**
- Postgres CHECK constraints are boolean expressions evaluated on insert/update (avoid “implied” constraints).  
  Ref: https://www.postgresql.org/docs/current/ddl-constraints.html

---

## PATCH 3 — FR-5: Deterministic seed RPC context strategy

### Replace the FR-5 “context precondition” paragraph with:

**FR-5: Seed RPC must self-establish context**
- The seed RPC MUST be deterministic and must not rely on call ordering.
- Therefore, `rpc_seed_game_settings_defaults(...)` MUST internally call the context setter (e.g., `set_rls_context_from_staff()`), and then validate:
  - `current_setting('app.casino_id', true)` is non-null
  - `current_setting('app.actor_id', true)` is non-null
  - actor role is in allow-list (`admin`, `manager`)
- If context cannot be established, the RPC fails fast with a clear error.

**RLS posture**
- If the function is SECURITY DEFINER, you must explicitly choose:
  1) Tables are `FORCE ROW LEVEL SECURITY` and policies apply even to table owners/definers, OR  
  2) Function bypasses RLS by design and enforces tenancy via validated `casino_id` + allow-listed roles.

Ref: table owners and BYPASSRLS roles normally bypass RLS unless FORCE RLS is set.  
https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## PATCH 4 — FR-5: Idempotency key moves from (casino_id, name) to (casino_id, code)

### Replace the ON CONFLICT example in FR-5 with:

- `ON CONFLICT (casino_id, code) DO NOTHING`

---

## PATCH 5 — FR-4: Choose side-bet tenancy integrity strategy (C2)

This patch chooses **Option C2** (keep `casino_id` on side-bets for simple RLS, but enforce consistency).

### Add to FR-4:

**Tenancy integrity**
- `game_settings_side_bet.casino_id` is required for RLS ergonomics, but **must equal** the parent `game_settings.casino_id`.
- Enforce via a BEFORE INSERT/UPDATE trigger:
  - Set `NEW.casino_id := (SELECT casino_id FROM game_settings WHERE id = NEW.game_settings_id)`
  - Raise exception if parent not found (defensive)
- DoD must include a test proving attempted mismatch is rejected.

---

## PATCH 6 — DoD additions (tests that prevent regressions)

Add the following to the DoD checklist:

- [ ] Migration adds `game_settings.code` and enforces `UNIQUE (casino_id, code)`.  
- [ ] Seed RPC uses `(casino_id, code)` for idempotency; re-running the seed is a no-op.  
- [ ] `shoe_decks` and `deck_profile` CHECK constraints exist exactly as specified.  
- [ ] Side-bet casino consistency trigger exists; mismatch attempts fail.  
- [ ] SECURITY DEFINER posture is explicitly chosen (FORCE RLS vs bypass-by-design) and verified in tests.

---

# Notes (non-normative)

- Enum extension remains append-only; do not rely on enum ordering in UI logic.  
  Ref: https://www.postgresql.org/docs/current/sql-altertype.html

