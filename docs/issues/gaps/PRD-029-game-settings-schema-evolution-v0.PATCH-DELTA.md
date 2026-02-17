---
prd_id: PRD-029
title: "PRD-029 Patch Delta — Fix P0 Issues (Enums, Deck Semantics, Side-bets, RLS Posture)"
version: "0.1.1-delta"
status: proposed_patch
created: 2026-02-10
last_updated: 2026-02-10
---

# How to apply

This file is a **delta patch** for `PRD-029-game-settings-schema-evolution-v0.md`.  
Apply by **replacing the referenced sections verbatim**.

External factual anchors used in this patch:
- Spanish 21 deck composition (48-card “Spanish” deck)   
- Rising Phoenix commission-free rule (Banker 3-card 7 push) citeturn0search0turn0search7  
- Wizard of Odds comp/DPH table exists and is used for rating players citeturn0search2  
- Postgres RLS bypass rules + FORCE RLS nuance citeturn0search3  

---

## PATCH 1 — Section 4: Scope corrections (enum/table contradiction)

### Replace **Section 4 → Out of Scope** last bullet with:

- `gaming_table.type` enum synchronization — **clarify posture**:
  - If `gaming_table.type` uses the **same Postgres enum type** as `game_settings.game_type`, then extending the enum applies to both and there is **no separate migration**.
  - If it uses a **different enum** (or is text), then **Wizard Step 3 must map** from `game_settings.game_type`/`game_settings.id` to the table record without relying on enum expansion.  
  - **This PRD does not introduce a new table enum**; it only defines the `game_settings` schema + seed RPC. Any `gaming_table` enum changes must be scoped in a separate PRD.

---

## PATCH 2 — FR-1: game_type extension strategy (avoid “junk drawer” semantics)

### Replace **FR-1** with:

**FR-1: game_type enum extension**
- Extend `game_type` to cover the template without forcing incorrect categorization.
- Add the following enum values:
  - `'pai_gow'`
  - `'carnival'` *(rename from `table_game` to reduce ambiguity; “carnival” matches the operational category)*
- Existing values (`blackjack`, `poker`, `roulette`, `baccarat`) remain unchanged.
- No data migration needed — existing rows keep current `game_type`.

> Rationale: keeping “table_game” as a catch-all creates an ambiguous junk drawer. “carnival” is explicit and matches common pit taxonomy.

---

## PATCH 3 — FR-3: Fix “decks <= 53” semantic bug (shoe decks vs deck composition)

### Replace **FR-3** with:

**FR-3: New columns**
- `variant_name text` — nullable, free-form variant descriptor (e.g., “6-deck shoe”, “commission-free”).
- `shoe_decks smallint` — nullable; **shoe deck count** for shoe games (blackjack/baccarat/spanish 21 style), with CHECK:
  - `shoe_decks IN (1,2,4,6,8)`
- `deck_profile text` — nullable; **deck composition** for non-shoe games / special decks. Allowed values (enforced via CHECK or enum later):
  - `'standard_52'`
  - `'with_joker_53'` (Pai Gow style) citeturn0search3
  - `'spanish_48'` (Spanish 21 removes tens; 48-card decks) 
- `rating_edge_for_comp numeric` — nullable, CHECK `rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100`.
- `notes text` — nullable, free-form rule assumptions and paytable references.

> Why: “53” is not a *deck count*; it is a *deck composition*. Spanish 21 is not “1 deck”; it’s typically 6–8 **Spanish (48-card) decks**, so we need both dimensions. 

### Also update **Section 4 → In Scope (columns list)** to match FR-3:
- Replace `decks` with `shoe_decks` + `deck_profile`.

---

## PATCH 4 — FR-4: Side-bet uniqueness (support multiple paytables per name)

### Replace the **FR-4 Unique** line with:

- Unique: `(game_settings_id, side_bet_name, COALESCE(paytable_id, 'default'))`.

> This allows “Lucky Ladies” or similar side bets to exist with multiple pay tables, without inventing fake names.

---

## PATCH 5 — FR-5: Seed RPC security posture (avoid silent tenancy bypass)

### Replace **FR-5** with:

**FR-5: Seed RPC**
- `rpc_seed_game_settings_defaults(p_template text DEFAULT 'small_pit_starter')`.
- **SECURITY DEFINER** only if **explicitly guarded**:
  - Function must set `search_path = public, pg_temp`.
  - Function must read `casino_id` from authoritative context (ADR-024) and **hard-validate** it (non-null).
  - Function must enforce role allow-list (e.g., only `admin` / `manager` staff roles) before writing.
- **RLS posture MUST be explicit**:
  - Either (A) tables are set to `FORCE ROW LEVEL SECURITY` so owner/definer does not silently bypass policies, **or**
  - (B) function intentionally bypasses RLS and compensates with explicit checks + writes scoped to the validated `casino_id`.  
  Postgres notes that table owners and BYPASSRLS roles normally bypass RLS unless `FORCE ROW LEVEL SECURITY` is used. citeturn0search3
- Inserts game settings rows matching the template.
- ON CONFLICT `(casino_id, name)` DO NOTHING — idempotent.
- Returns count of inserted rows.

---

## PATCH 6 — Section 7.2 Risk table: fix the contradiction

### Replace the first Risk row with:

| Risk | Mitigation |
|------|------------|
| `gaming_table.type` availability for new categories is unclear (shared enum vs separate type) | Clarify enum coupling (see Scope patch). If shared enum, no extra migration. If separate, Wizard Step 3 maps without requiring `gaming_table.type` to expand in this PRD. |

---

## PATCH 7 — Appendix A: taxonomy corrections (carnival + UTH classification)

### Replace the **Appendix A** rows for UTH + High Card Flush with:

| Template Game | game_type | name (unique per casino) |
|---|---|---|
| Ultimate Texas Hold 'Em | `carnival` *(or keep `poker` only if your pit taxonomy insists)* | "Ultimate Texas Hold 'Em" |
| High Card Flush | `carnival` | "High Card Flush" |

> If you keep UTH under `poker`, document that this is a *categorization compromise* and the UI should still render it under “Table Games/Carnival” using display grouping.

---

## PATCH 8 — Appendix A: Rising Phoenix rule note (supporting citation)

### Add this note under the Rising Phoenix entries:

- Commission-free Rising Phoenix variant differs from standard baccarat: **winning Banker 3-card 7 pushes** on Banker wagers (commission-free mode). citeturn0search0turn0search7  

---

# Net effect of the patch

- Removes the **P0 semantic bug** (`decks <= 53`) by separating shoe deck count vs deck composition.
- Fixes the **table enum contradiction** by forcing an explicit posture.
- Makes side-bets **multi-paytable capable**.
- Makes SECURITY DEFINER **non-hand-wavy** (explicit RLS posture per Postgres rules). citeturn0search3
- Improves categorization clarity by replacing `table_game` with `carnival`.

