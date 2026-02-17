# GAP-SEEDED-GAME-SETTINGS-ORPHANED

**Created:** 2026-02-12
**Status:** Open
**Severity:** P1 (Functional gap — seeded data unused by wizard)
**Related PRDs:** PRD-029 (Game Settings Schema Evolution), PRD-030 (Setup Wizard)
**Bounded Context:** CasinoService
**Source Document:** `docs/00-vision/company-onboarding/SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md`
**Origin:** Investigation of PRD-030 setup wizard vs. default template alignment
**References:** `GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` (implemented — config taxonomy baseline)

---

## Summary

`rpc_seed_game_settings_defaults('small_pit_starter')` (PRD-029) correctly seeds all 11 game variants and 3 side bets from the Default Template document into `game_settings`. However, the PRD-030 Setup Wizard **does not surface, configure, or link this data** to the tables it creates. The seeded game metadata (house edge, DPH, seats, deck profiles, rating edges, side bets) is orphaned — it exists in the database but has no consumer in the application.

---

## What the RPC Seeds (Verified in DB)

| Code | Game | Variant | House Edge | DPH | Seats |
|------|------|---------|:-:|:-:|:-:|
| `bj_6d` | Blackjack | 6-deck shoe | 0.28% | 70 | 7 |
| `bj_dd` | Blackjack | Double deck | 1.50% | 70 | 7 |
| `spanish_21` | Spanish 21 | H17, no re-doubling | 0.76% | 75 | 7 |
| `players_edge_21` | Player's Edge 21 | with progressive | 0.27% | 75 | 7 |
| `mini_baccarat` | Mini Baccarat | standard | 1.06% | 72 | 7 |
| `rising_phoenix_comm` | Rising Phoenix Baccarat | commission | 1.06% | 72 | 7 |
| `rising_phoenix_comm_free` | Rising Phoenix Baccarat | commission-free | 1.02% | 72 | 7 |
| `pai_gow` | Pai Gow Poker | standard | 1.46% | 30 | 6 |
| `emperor_challenge_exposed` | Emperor's Challenge Exposed | commission-free | 1.46% | 30 | 6 |
| `uth` | Ultimate Texas Hold 'Em | standard | 2.19% | 30 | 7 |
| `high_card_flush` | High Card Flush | optimal baseline | 2.64% | 50 | 7 |

**Side bets seeded:** Lucky Ladies (Pay Table D) on `bj_6d`, Emperor's Challenge + Pai Gow Insurance on `emperor_challenge_exposed`.

All 11 games and 3 side bets match the template document 1:1.

### Template Document Discrepancy: `bj_dd` house_edge

The template document (`SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md`) specifies `base_house_edge: null` for Blackjack Double Deck with the note: *"Compute from exact rules (H17/S17, DAS, RSA, etc.)."* This is a **template authoring error** — the document suggested a null value for a column that cannot accept null:

- **DB constraint:** `game_settings.house_edge` is `NOT NULL DEFAULT 1.5` with CHECK `house_edge >= 0 AND house_edge <= 100`
- **RPC behavior:** Correctly provisions `bj_dd` with `house_edge = 1.500` (the column default), since null would violate the NOT NULL constraint
- **Principle:** No game should be provisioned with a null house edge. Every seeded game must have a numeric value, even if it is a conservative placeholder that the property is expected to refine for their specific rules.

The template document's intent — that double-deck BJ house edge is highly rule-dependent (H17 vs S17, DAS, RSA, surrender rules all shift it) — is valid context, but the solution is a reasonable default (1.50%) with a `notes` field prompting refinement, which is exactly what the RPC does. The template doc should be corrected to use `1.50` instead of `null`, with the rule-dependency note preserved in the `notes` field as the RPC already implements.

### Data Completeness: `rating_edge_for_comp` NULL for 2 Carnival Games

Full audit of all 11 seeded games confirms **no other `house_edge` null discrepancies** — all 11 games have non-null `house_edge` values. However, the audit revealed 2 games seeded with `rating_edge_for_comp = NULL`:

| Code | Game | `house_edge` | `rating_edge_for_comp` | Template YAML |
|------|------|:-:|:-:|:-:|
| `bj_6d` | Blackjack — 6-Deck Shoe | 0.280 | 0.750 | 0.75 |
| `bj_dd` | Blackjack — Double Deck | 1.500 | 0.750 | 0.75 |
| `spanish_21` | Spanish 21 | 0.760 | 2.200 | 2.2 |
| `players_edge_21` | Player's Edge 21 | 0.270 | 2.200 | 2.2 |
| `mini_baccarat` | Mini Baccarat | 1.060 | 1.200 | 1.2 |
| `rising_phoenix_comm` | Rising Phoenix — Commission | 1.060 | 1.200 | 1.2 |
| `rising_phoenix_comm_free` | Rising Phoenix — Comm-Free | 1.020 | 1.200 | 1.2 |
| `pai_gow` | Pai Gow Poker | 1.460 | 1.960 | 1.96 |
| `emperor_challenge_exposed` | Emperor's Challenge Exposed | 1.460 | 1.960 | 1.96 |
| **`uth`** | **Ultimate Texas Hold 'Em** | 2.190 | **NULL** | **field absent** |
| **`high_card_flush`** | **High Card Flush** | 2.640 | **NULL** | **field absent** |

**Why these two are null:** The template document sources `rating_edge_for_comp` from the "Wizard of Odds — Hands per Hour, House Edge for Comp Purposes" table — a classic Strip casino executive reference used for rating players. That table covers traditional pit games (blackjack, baccarat, pai gow) but **does not include UTH or High Card Flush**, which are newer carnival/proprietary games. No authoritative comp-purpose edge was available at research time, so the template YAML omits the field entirely and the RPC seeds `NULL`.

**Schema validity:** The DB column `rating_edge_for_comp` is `NULLABLE` with CHECK `rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100`. NULL is schema-valid — this is not a constraint violation.

**Downstream impact:** `rating_edge_for_comp` is the edge used for player comp/theoretical-win calculations (distinct from the base `house_edge` used for hold analysis). If the system computes comp-eligible theo for a player at a UTH or HCF table:
- If the comp formula uses `rating_edge_for_comp` and it's NULL, the result is either zero comp credit or a runtime error, depending on implementation
- If the formula falls back to `house_edge`, the player gets rated at the full mathematical edge (2.19% / 2.64%) rather than a softer comp edge — this **over-rates** the player and inflates comp liability
- 9 of 11 games have the comp/base edge distinction (e.g., BJ 6D: base 0.28% vs comp 0.75%), making the fallback inconsistent across game types

**Recommended resolution:**
1. **Populate `rating_edge_for_comp` for UTH and HCF** — industry practice is to use the base house edge as the comp edge for carnival games since there is no published "comp purposes" edge. Reasonable defaults: `uth` → 2.19 (same as house edge), `high_card_flush` → 2.64 (same as house edge). Document in `notes` that these are base-edge defaults pending property-specific calibration.
2. **Update the template doc** to include `rating_edge_for_comp` for both games with the same values and a note explaining the source.
3. **Update the RPC seed data** in `20260210081120_prd029_rpc_seed_game_settings_defaults.sql` to replace `NULL::numeric` with the values for these two rows.

---

## What the Wizard Does With This Data

| Wizard Step | Behavior | Uses Seeded `game_settings`? |
|-------------|----------|:-:|
| **Step 2 (Game Seed)** | Single "Seed Default Games" button. Calls RPC, shows badge: `"{count} games seeded"`. No game names, no variants, no per-game configuration. | Fire-and-forget only |
| **Step 3 (Create Tables)** | Manual table creation. Type dropdown uses `game_type` enum (6 categories: blackjack, poker, roulette, baccarat, pai_gow, carnival). No variant selector. No FK to `game_settings.id`. | **No** |
| **Step 5 (Review)** | Shows `"{gameCount} games configured"` badge. No game names listed. | Count only |

---

## Root Cause

EXECUTION-SPEC-PRD-030 explicitly deferred variant selection:

> *"Variant selection (e.g., 'BJ 6D Lucky Ladies') is out of scope for v0 — would require gaming_table.game_settings_id FK."*

This means `gaming_table.type` stores a broad category (`'blackjack'`), but there is no way to know which of the 4 blackjack variants (6D, DD, Spanish 21, Player's Edge 21) a specific table runs. The seeded metadata (house edge, DPH, seats, deck profiles, side bets) has no consumer.

---

## Specific UI Gaps

1. **Step 2 shows no game list** — after seeding, the user sees a count badge but cannot review what was seeded (game names, house edges, variants)
2. **Step 3 type dropdown is category-level** — 6 `game_type` enum values, not 11 game variants. A "Blackjack" table could be 6-deck shoe, double deck, Spanish 21, or Player's Edge 21 — the wizard doesn't distinguish
3. **No `gaming_table.game_settings_id` FK** — tables are not linked to their specific game settings row, so theo calculations, rating edges, and DPH values are not table-specific
4. **Bulk-add buttons are incomplete** — only `+4 Blackjack`, `+2 Poker`, `+2 Roulette` offered. Missing: baccarat, pai_gow, carnival
5. **Template document's floor plan ignored** — the template specifies "2 Blackjack 6D, 1 Blackjack DD, 1 Spanish 21, 2 Mini Baccarat, 1 Pai Gow, 1 Emperor's Challenge, 1 UTH, 1 High Card Flush" as the starter pit. The wizard has no preset that creates this layout

---

## Downstream Impact

| Consumer | Impact |
|----------|--------|
| **Theo calculation** | Cannot use per-variant house edge/DPH — must fall back to generic `game_type` defaults or ignore `game_settings` entirely |
| **Rating slips** | `decisions_per_hour` and `house_edge` from `game_settings` cannot be looked up per-table without the FK |
| **Comp calculation** | `rating_edge_for_comp` is seeded but unreachable from a `gaming_table` row |
| **Side bets** | 3 side bets seeded with house edges but no way to associate them with specific tables |

---

## Recommended Resolution (Future PRD)

1. **Add `gaming_table.game_settings_id` FK** (nullable) — links each table to its specific game variant
2. **Wizard Step 2**: Display the seeded game list with names, house edges, and DPH. Allow toggling individual games on/off.
3. **Wizard Step 3**: When creating a table, offer a variant selector (filtered by `game_type`) instead of just the broad category dropdown
4. **Add missing bulk-add buttons**: baccarat, pai_gow, carnival
5. **Template-based floor preset**: "Apply Small Pit Starter" button that creates the full 10-12 table layout from the template document
6. **Fix template doc**: Correct `SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md` to use `base_house_edge: 1.50` for Blackjack Double Deck instead of `null` — aligns with `NOT NULL` constraint and RPC behavior
7. **Populate `rating_edge_for_comp` for UTH and HCF**: Set `uth` → 2.19, `high_card_flush` → 2.64 (base edge as comp edge — standard carnival game practice). Requires RPC seed data update + template doc update

---

## Evidence

| Artifact | Location |
|----------|----------|
| RPC source | `supabase/migrations/20260210081120_prd029_rpc_seed_game_settings_defaults.sql` |
| Template doc | `docs/00-vision/company-onboarding/SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md` |
| Wizard Step 2 | `app/(onboarding)/setup/steps/step-game-seed.tsx` (fire-and-forget, no game list) |
| Wizard Step 3 | `app/(onboarding)/setup/steps/step-create-tables.tsx` (enum-only dropdown) |
| Table row form | `app/(onboarding)/setup/components/table-row-form.tsx` (6 `game_type` categories, not 11 variants) |
| EXEC-SPEC deferral | `docs/20-architecture/specs/PRD-030/EXECUTION-SPEC-PRD-030.md` (WS2 `seedGameSettingsAction` notes) |
| DB verification | 17 `game_settings` rows across 3 casinos (11 PRD-029 seeded + 6 legacy pre-PRD-029) |

---

## Related Issues

| Issue | Relationship |
|-------|-------------|
| `GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` | Implemented config taxonomy baseline — this gap was discovered during post-implementation investigation |
| `GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS.md` | Sibling gap — no custom game creation UI. This gap covers seeded data being invisible; that gap covers missing custom game input |
| `ISSUE-SETUP-WIZARD-SEED-TEMPLATE-MISMATCH.md` | Template name mismatch (remediated). Shows fragility of template-only approach |
