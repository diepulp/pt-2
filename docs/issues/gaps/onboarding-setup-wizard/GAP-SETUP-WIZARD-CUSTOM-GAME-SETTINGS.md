# GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS

**Created:** 2026-02-12
**Status:** Open
**Severity:** P1 (Functional gap — custom game configuration impossible during onboarding)
**Related PRDs:** PRD-029 (Game Settings Schema), PRD-030 (Setup Wizard)
**Bounded Context:** CasinoService
**Depends On:** GAP-8 in `GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` (orphaned seeded metadata)

---

## Summary

The Setup Wizard (PRD-030) provides no UI surface for creating custom game settings. Step 2 offers only a single "Seed Default Games" button that bulk-inserts the `small_pit_starter` template (11 hardcoded variants). A casino that runs games not in the default template — or wants to customize house edges, DPH, seats, deck configurations, or side bets for their specific rules — has no way to do so during onboarding.

The backend infrastructure for custom game creation is **fully built** (CRUD functions, DTOs, Zod schemas, CHECK constraints). There is simply no server action and no UI that exposes it.

---

## What Exists (Backend — Ready)

### Service Layer (`services/casino/`)

| Artifact | Status | Purpose |
|----------|--------|---------|
| `game-settings-crud.ts` | Deployed | `createGameSettings()`, `updateGameSettings()`, `listGameSettings()`, `getGameSettingsByCode()`, `getGameSettingsById()` |
| `game-settings-dtos.ts` | Deployed | `CreateGameSettingsDTO`, `UpdateGameSettingsDTO`, `GameSettingsDTO`, `GameSettingsListFilters` |
| `game-settings-schemas.ts` | Deployed | `createGameSettingsSchema`, `updateGameSettingsSchema` with full field validation |
| `game-settings-side-bet-dtos.ts` | Deployed | `CreateGameSettingsSideBetDTO`, `UpdateGameSettingsSideBetDTO` |
| `game-settings-mappers.ts` | Deployed | Row-to-DTO transformations |

### Zod Schema (`createGameSettingsSchema`) — Full Field Coverage

```
game_type:            enum (blackjack, poker, roulette, baccarat, pai_gow, carnival)
code:                 text, min 1, max 100 (unique per casino)
name:                 text, min 1, max 255
variant_name:         text, max 255 (nullable)
shoe_decks:           1 | 2 | 4 | 6 | 8 (nullable)
deck_profile:         standard_52 | with_joker_53 | spanish_48 (nullable)
house_edge:           numeric 0..100 (required)
rating_edge_for_comp: numeric 0..100 (nullable)
decisions_per_hour:   int, positive (required)
seats_available:      int, positive (required)
min_bet:              numeric >= 0 (nullable)
max_bet:              numeric >= 0 (nullable)
notes:                text, max 2000 (nullable)
```

### Database Constraints (Verified)

| Constraint | Definition |
|------------|------------|
| `chk_house_edge_range` | `house_edge >= 0 AND house_edge <= 100` |
| `chk_rating_edge_for_comp` | `rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100` |
| `chk_decisions_positive` | `decisions_per_hour > 0` |
| `chk_seats_positive` | `seats_available > 0` |
| `chk_shoe_decks` | `shoe_decks IN (1, 2, 4, 6, 8)` |
| `chk_deck_profile` | `deck_profile IN ('standard_52', 'with_joker_53', 'spanish_48')` |
| `chk_game_bet_range` | `min_bet IS NULL OR max_bet IS NULL OR min_bet <= max_bet` |

---

## What Is Missing

### 1. Server Action: `createGameSettingsAction` (not implemented)

The 5 existing server actions in `app/(onboarding)/setup/_actions.ts` are:

| Action | Purpose | Custom Game Support |
|--------|---------|:-:|
| `completeSetupAction` | Step 5: mark setup ready | N/A |
| `updateCasinoSettingsAction` | Step 1: casino basics | N/A |
| `seedGameSettingsAction` | Step 2: bulk-seed defaults | Template-only, no custom input |
| `createGamingTableAction` | Step 3: create tables | N/A |
| `updateTableParAction` | Step 4: par targets | N/A |

**Missing:** A `createCustomGameSettingsAction` (or `upsertGameSettingsAction`) that accepts the full `CreateGameSettingsDTO` fields, validates via `createGameSettingsSchema`, and inserts into `game_settings`. The CRUD function `createGameSettings()` is ready — it just needs a server action wrapper with `withServerAction()` middleware and admin role enforcement.

### 2. UI: Custom Game Form (not implemented)

Step 2 (`step-game-seed.tsx`) has two states:
- **Not seeded:** Shows a "Seed Default Games" button
- **Seeded:** Shows a badge with count + "Games are already configured. You can proceed."

There is no:
- "Add Custom Game" button or expandable form
- Input fields for any `game_settings` column
- Ability to edit a seeded game's values (e.g., adjust house edge for local rules)
- Ability to delete a seeded game that the casino doesn't offer
- List view showing individual game names, variants, or metadata

### 3. UI: Custom Game Form Field Mapping

The form should expose these fields, mapped to `game_settings` columns:

| UI Field | DB Column | Input Type | Required | Notes |
|----------|-----------|------------|:-:|-------|
| Game Category | `game_type` | Select (6 enum values) | Yes | blackjack, poker, roulette, baccarat, pai_gow, carnival |
| Game Code | `code` | Text input | Yes | Unique identifier (e.g., "three_card_poker"). Auto-generate from name as suggestion. |
| Game Name | `name` | Text input | Yes | Display name (e.g., "Three Card Poker") |
| Variant | `variant_name` | Text input | No | e.g., "6-deck shoe", "commission-free" |
| Shoe Decks | `shoe_decks` | Select (1/2/4/6/8) | No | Only relevant for shoe games |
| Deck Profile | `deck_profile` | Select (standard_52 / with_joker_53 / spanish_48) | No | Deck composition |
| House Edge (%) | `house_edge` | Number input (0-100) | Yes | Default: 1.5 |
| Rating Edge for Comp (%) | `rating_edge_for_comp` | Number input (0-100) | No | Used for comp/theo calculations |
| Decisions per Hour | `decisions_per_hour` | Number input | Yes | Default: 70 |
| Seats | `seats_available` | Number input | Yes | Default: 7 |
| Min Bet ($) | `min_bet` | Number input | No | Table minimum |
| Max Bet ($) | `max_bet` | Number input | No | Table maximum (must be >= min) |
| Notes | `notes` | Textarea | No | Rule assumptions, paytable references |

### 4. UI: Edit/Delete Seeded Games (not implemented)

After seeding, users should be able to:
- **View** the full list of 11 seeded games with their metadata
- **Edit** values that don't match their property's rules (e.g., house edge, DPH)
- **Delete** games they don't offer (e.g., remove Rising Phoenix if not licensed)
- The `updateGameSettings()` CRUD function and `updateGameSettingsSchema` already exist

### 5. Server Action: `updateGameSettingsAction` (not implemented)

Needed to support editing seeded game values. The CRUD function `updateGameSettings()` exists.

### 6. Server Action: `deleteGameSettingsAction` (not implemented)

Needed to let users remove games they don't offer. No delete CRUD function exists yet — would need to be added to `game-settings-crud.ts`.

---

## Use Cases Not Covered

| Scenario | Current Behavior | Expected Behavior |
|----------|-----------------|-------------------|
| Casino runs Three Card Poker | No way to add it during setup | "Add Custom Game" form with game_type=carnival, custom house edge/DPH |
| Casino runs Blackjack with H17 at 0.64% edge | Seeded 6D BJ uses 0.28% — no way to edit | Edit button on seeded game, update house_edge field |
| Casino doesn't offer Rising Phoenix | Two Rising Phoenix variants seeded, can't remove | Delete button per game row |
| Casino runs a proprietary game (e.g., "Casino War") | Cannot add non-template games | Custom game form with all fields |
| Casino needs different DPH than defaults | Seeded DPH is fixed — no way to change | Edit DPH per game via inline form |
| Casino has specific bet limits per game | `min_bet`/`max_bet` not configurable | Number inputs for bet range |

---

## Recommended Resolution

### Phase 1: Minimal (within PRD-030 scope adjustment)

1. **Add `createCustomGameSettingsAction`** server action to `_actions.ts`
   - Wraps `createGameSettings()` from `game-settings-crud.ts`
   - Validates via `createGameSettingsSchema`
   - Admin role enforcement via `withServerAction()` middleware
   - `casino_id` from context (ADR-024), `code` auto-generated or user-provided

2. **Extend Step 2 UI** (`step-game-seed.tsx`):
   - After seeding, show the full game list (name, game_type, house_edge, DPH, seats)
   - Add an "Add Custom Game" button that opens an inline form
   - Form fields mapped per the table in section 3 above
   - Conditional fields: `shoe_decks` only shown when `game_type` is shoe-based; `deck_profile` shown for all

3. **Add `updateGameSettingsAction`** server action
   - Wraps `updateGameSettings()` from `game-settings-crud.ts`
   - Enables editing seeded game values

### Phase 2: Full (separate PRD)

4. Add `deleteGameSettingsAction` + delete CRUD function
5. Side bet management UI (create/edit/delete per game)
6. Conditional field logic (shoe_decks visibility tied to game_type)
7. Import/export game settings (CSV/JSON)
8. Game settings templates beyond `small_pit_starter`

---

## Architectural Notes

- **No new tables required** — `game_settings` schema is complete
- **No migration needed** — all columns and constraints already exist
- **CRUD layer is ready** — `createGameSettings()`, `updateGameSettings()`, `listGameSettings()` all functional with DTOs and mappers
- **Zod validation is ready** — `createGameSettingsSchema` and `updateGameSettingsSchema` cover all CHECK constraints
- **RLS is in place** — `game_settings` has casino-scoped RLS policies; `casino_id` derived from context
- **Side bet CRUD is ready** — `createSideBet()`, `updateSideBet()`, `listSideBets()` exist but are not exposed in wizard

---

## Evidence

| Artifact | Location | Relevance |
|----------|----------|-----------|
| CRUD functions (ready) | `services/casino/game-settings-crud.ts` | `createGameSettings()` at line 116, `updateGameSettings()` at line 163 |
| Zod schemas (ready) | `services/casino/game-settings-schemas.ts` | `createGameSettingsSchema` at line 37, `updateGameSettingsSchema` at line 66 |
| DTOs (ready) | `services/casino/game-settings-dtos.ts` | `CreateGameSettingsDTO`, `UpdateGameSettingsDTO` |
| Server actions (gap) | `app/(onboarding)/setup/_actions.ts` | 5 actions exist, none for custom game create/update/delete |
| Wizard Step 2 UI (gap) | `app/(onboarding)/setup/steps/step-game-seed.tsx` | Fire-and-forget seed button only, no game list or custom form |
| DB constraints | `game_settings` table | 7 CHECK constraints validating all numeric fields and enum values |
| Side bet CRUD (ready) | `services/casino/game-settings-crud.ts:237` | `createSideBet()`, `updateSideBet()` exist but unwired |
| Template doc | `docs/00-vision/company-onboarding/SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md` | Defines field taxonomy including side bets |

---

## Related Issues

| Issue | Relationship |
|-------|-------------|
| GAP-8 (Seeded game_settings orphaned) | Parent gap — seeded data not surfaced in wizard. This issue extends it: even if surfaced, users can't add custom games. |
| `ISSUE-SETUP-WIZARD-SEED-TEMPLATE-MISMATCH.md` | Template name mismatch (remediated). Shows fragility of template-only approach. |
| `GAP-DEV-AUTH-BYPASS-SETUP-WIZARD.md` | Dev bypass gap — complicates testing of any new wizard functionality. |
