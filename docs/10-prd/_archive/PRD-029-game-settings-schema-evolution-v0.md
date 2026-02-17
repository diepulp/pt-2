---
prd_id: PRD-029
title: "Game Settings Schema Evolution — Wizard Template Support"
version: "0.1.4"
status: draft
owner: System Architect
created: 2026-02-10
last_updated: 2026-02-10
sdlc_categories: [DATA, API, SERVICE]
bounded_contexts: [CasinoService]
depends_on: [PRD-025]
blocks: [Setup Wizard B (game seeding step)]
---

# PRD-029 — Game Settings Schema Evolution

## 1. Overview

- **Owner:** System Architect
- **Status:** Draft
- **Summary:** The current `game_settings` table has a 4-value `game_type` enum (`blackjack|poker|roulette|baccarat`) and a unique constraint `(casino_id, game_type)` that limits each casino to one setting per category. The Setup Wizard (Wizard B, per SETUP-WIZARD-CONFIG-TAXONOMY) requires seeding multiple game variants from the SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE — 11 distinct game/variant combinations across 6+ game families. This PRD extends the `game_settings` schema to support variant-level granularity, adds missing metadata columns, introduces a side-bet catalog table, and provides a seed RPC for wizard template pre-loading. This is a prerequisite for the Setup Wizard Step 2 (Games Offered) implementation.

## 2. Problem & Goals

### 2.1 Problem

The Setup Wizard cannot seed the default game template because:

1. **Enum too narrow**: `game_type` only has 4 values. Games like Spanish 21, Pai Gow Poker, Ultimate Texas Hold 'Em, and High Card Flush have no appropriate category. Pai Gow is not "poker" in an operational sense; High Card Flush is a carnival game.
2. **Unique constraint blocks variants**: `ux_game_settings_casino_type(casino_id, game_type)` means a casino can have only ONE blackjack setting — no room for "6-deck shoe" AND "double deck" variants.
3. **Missing columns**: The template specifies `variant_name`, `decks`, `rating_edge_for_comp` (comp edge distinct from base house edge), and `notes/rule_assumptions` — none of which exist.
4. **No side-bet support**: Lucky Ladies, Emperor's Challenge side bet, Pai Gow Insurance, etc. have no storage model.
5. **No seed mechanism**: No RPC or service function to bulk-insert a template of game settings for a new casino.

### 2.2 Goals

1. A casino can configure **multiple game variants per game category** (e.g., 3 blackjack variants).
2. The `game_type` enum covers all games in the default template without forcing incorrect categorization.
3. Each game setting stores **variant name, deck count, comp-purpose edge, and rule notes**.
4. Side bets can be cataloged per game setting with edge and paytable metadata.
5. A seed RPC can bulk-insert a named template of game settings for a casino (used by Wizard B Step 2).

### 2.3 Non-Goals

- **Setup Wizard UI implementation** — separate PRD (uses this schema).
- **Side-bet financial tracking** — catalog only; no wagering/settlement logic.
- **Per-table setting overrides** — `gaming_table_settings` already exists, deferred.
- **Dynamic game-type management UI** — enum extension is DDL; admin UI for custom game types is future.
- **Rule calculator engine** — storing edges as configured values, not computing them.

## 3. Users & Use Cases

- **Primary users:** Casino administrators running Setup Wizard, pit bosses reviewing game configurations.

**Top Jobs:**
- As an admin running the Setup Wizard, I need to select from a pre-loaded template of common table games so that I can seed my pit configuration in minutes rather than entering every field manually.
- As an admin, I need to configure multiple variants of the same game category (e.g., 6-deck BJ and double-deck BJ) so that my floor reflects actual table diversity.
- As a pit boss, I need to see comp-purpose edge alongside base house edge so that I can correctly rate player theo.

## 4. Scope & Feature List

### In Scope

1. **Extend `game_type` enum** — add `pai_gow` and `carnival` values.
2. **Drop unique index** `ux_game_settings_casino_type(casino_id, game_type)`.
3. **Add `code` column + unique index** `UNIQUE(casino_id, code)` — stable machine identifier for idempotent seeding.
4. **Add columns** to `game_settings`:
   - `variant_name text` — sub-variant descriptor (e.g., "6-deck shoe", "commission-free")
   - `shoe_decks smallint` — shoe deck count for shoe games (blackjack/baccarat/spanish 21 style)
   - `deck_profile text` — deck composition for non-shoe games / special decks (e.g., `'standard_52'`, `'with_joker_53'`, `'spanish_48'`)
   - `rating_edge_for_comp numeric(6,3)` — comp/rating edge percentage (may differ from house_edge)
   - `notes text` — rule assumptions, paytable references
5. **Create `game_settings_side_bet` table** — side-bet catalog per game setting.
6. **Create `rpc_seed_game_settings_defaults`** — SECURITY DEFINER RPC that bulk-inserts a named template.
7. **Update CasinoService DTOs and schemas** — expose new fields.
8. **Regenerate TypeScript types** via `npm run db:types`.

### Out of Scope

- Setup Wizard UI components
- `gaming_table.type` enum synchronization — **posture clarification**:
  - `gaming_table.type` uses the **same Postgres enum type** `game_type` as `game_settings.game_type` (confirmed: `baseline_srm.sql` line 8, 100, 117). Extending the enum via `ALTER TYPE ADD VALUE` applies to both columns and there is **no separate migration**.
  - This PRD does not introduce a new table enum; it only defines the `game_settings` schema + seed RPC. Backfilling existing `gaming_table` rows (e.g., re-typing a table from `poker` to `pai_gow`) is an operational decision outside this PRD.
- Financial settlement for side bets
- Rule calculation engine

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: game_type enum extension**
- Extend `game_type` to cover the template without forcing incorrect categorization.
- Add the following enum values:
  - `'pai_gow'`
  - `'carnival'` *(renamed from `table_game` to reduce ambiguity; "carnival" matches common pit taxonomy for non-traditional table games like High Card Flush, UTH, etc.)*
- Existing values (`blackjack`, `poker`, `roulette`, `baccarat`) remain unchanged.
- No data migration needed — existing rows keep their current game_type.
- **Shared enum**: `gaming_table.type` references the same `game_type` enum (baseline_srm.sql line 8). The `ALTER TYPE ADD VALUE` DDL expands both columns automatically — no separate sync step required.

> Rationale: keeping "table_game" as a catch-all creates an ambiguous junk drawer. "carnival" is explicit and matches common pit taxonomy.

**FR-2: Canonical identifiers**
- Drop `ux_game_settings_casino_type`.
- Add `code text NOT NULL` to `game_settings`.
  - `code` is a **stable machine identifier** (examples: `bj_6d`, `bj_dd`, `spanish_21`, `players_edge_21`, `mini_baccarat`, `rising_phoenix_comm`, `rising_phoenix_comm_free`, `pai_gow`, `emperor_challenge_exposed`, `uth`, `high_card_flush`).
- Keep `name text NOT NULL` as the **operator-facing display label**.
- Add unique constraint:
  - `UNIQUE (casino_id, code)`
- `(casino_id, name)` may be kept for UX convenience but is **non-authoritative** (soft uniqueness) — do not use it for idempotent writes.

> Rationale: display labels change. Stable seeding cannot depend on them.

**FR-3: New columns**
- `variant_name text` — nullable, free-form variant descriptor (e.g., "6-deck shoe", "commission-free").
- `shoe_decks smallint NULL CHECK (shoe_decks IN (1,2,4,6,8))` — **shoe deck count** for shoe games (blackjack/baccarat/spanish 21 style).
- `deck_profile text NULL CHECK (deck_profile IN ('standard_52','with_joker_53','spanish_48'))` — **deck composition** for non-shoe games / special decks:
  - `'standard_52'` — standard 52-card deck
  - `'with_joker_53'` — 52 + Joker (Pai Gow Poker style)
  - `'spanish_48'` — Spanish 21 removes tens; 48-card decks per shoe
- `rating_edge_for_comp numeric(6,3)` — nullable, CHECK `rating_edge_for_comp >= 0 AND rating_edge_for_comp <= 100`. Explicit precision/scale stabilizes storage and downstream type generation.
- `notes text` — nullable, free-form rule assumptions and paytable references.

**Compatibility rule**: both `shoe_decks` and `deck_profile` may be set simultaneously (Spanish 21 commonly needs both dimensions — e.g., `shoe_decks = 6`, `deck_profile = 'spanish_48'`).

**Optional stricter rule (future)**: if you later want to ensure at least one of the two is set, add `CHECK (shoe_decks IS NOT NULL OR deck_profile IS NOT NULL)`. Do **not** require exactly-one; Spanish 21 breaks that.

> Why split: "53" is not a *deck count*; it is a *deck composition*. Spanish 21 uses 6-8 **Spanish (48-card) decks**, so we need both dimensions: how many decks in the shoe, and what kind of deck. Postgres CHECK constraints are boolean expressions evaluated on insert/update — constraints are explicit, not implied.

**FR-4: Side-bet catalog table**
```
game_settings_side_bet (
  id uuid PK default gen_random_uuid(),
  game_settings_id uuid NOT NULL FK → game_settings(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL FK → casino(id) ON DELETE CASCADE,
  side_bet_name text NOT NULL,
  house_edge numeric(6,3) NOT NULL CHECK (house_edge >= 0 AND house_edge <= 100),
  paytable_id text,
  enabled_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```
- RLS: same pattern as `game_settings` (casino_id scoped, pit_boss/admin write). Seeding is restricted to `admin`/`manager` via seed RPC allow-list; post-seed edits may be permitted to `pit_boss` per RLS.
- **Uniqueness** is enforced via an **expression UNIQUE INDEX** (because `COALESCE(...)` is not representable as a plain `UNIQUE (...)` constraint — it requires an index on expressions; ref: [Postgres indexes on expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)):
  - `CREATE UNIQUE INDEX game_settings_side_bet_uq`
    `ON game_settings_side_bet (game_settings_id, side_bet_name, COALESCE(paytable_id, 'default'));`
  - Do **not** rewrite this as a `UNIQUE` table constraint; it will fail on the `COALESCE` expression.
- **Tenancy integrity (Option C2 chosen)**: `casino_id` is **derived, not client-supplied**.
  - Client code MUST NOT supply `casino_id` for `game_settings_side_bet`.
  - A **BEFORE INSERT OR UPDATE** trigger MUST set `NEW.casino_id` from the parent `game_settings` row:
    - `NEW.casino_id := (SELECT casino_id FROM game_settings WHERE id = NEW.game_settings_id)`
  - If parent does not exist, raise an exception (defensive).
  - This ensures `casino_id` is always correct for RLS ergonomics and cannot drift.
  - Implementation note: Postgres trigger functions can directly replace values in `NEW` and return the modified `NEW`.
  - All insert APIs/DTOs omit `casino_id`; trigger populates it pre-constraint-check.
  - DoD must include a test proving: (a) inserts succeed without client-supplied `casino_id`, (b) attempted mismatch is overwritten correctly.

> This allows the same side bet (e.g., "Lucky Ladies") to exist with multiple pay tables without inventing fake names. Expression unique indexes can enforce constraints not definable as simple unique constraints.

**FR-5: Seed RPC — must self-establish context**
- `rpc_seed_game_settings_defaults(p_template text DEFAULT 'small_pit_starter')`.
- **SECURITY DEFINER** only if **explicitly guarded**:
  - Function must set `search_path = public, pg_temp`.
- **The seed RPC MUST be deterministic and must not rely on call ordering.**
  - `rpc_seed_game_settings_defaults(...)` MUST internally call the context setter (e.g., `set_rls_context_from_staff()`), and then validate:
    - `current_setting('app.casino_id', true)` is non-null
    - `current_setting('app.actor_id', true)` is non-null
    - actor role is in allow-list (`admin`, `manager`)
  - If context cannot be established, the RPC fails fast with a clear error.
- **RLS posture** — if the function is SECURITY DEFINER, you must explicitly choose:
    1. **RLS-respecting**: tables are `FORCE ROW LEVEL SECURITY` and policies apply even to table owners/definers, **or**
    2. **RLS-bypassing by design**: definer bypass is accepted, but the function must enforce tenancy via validated `casino_id` + allow-listed roles.
  - Ref: table owners and BYPASSRLS roles normally bypass RLS unless FORCE RLS is set.
- Inserts game settings rows matching the template.
- ON CONFLICT `(casino_id, code)` DO NOTHING — idempotent (keyed on stable `code`, not mutable display `name`).
- Returns count of inserted rows.
- Template `'small_pit_starter'` maps to the 11-row seed block in the default template doc.

**FR-6: Service layer updates**
- `GameSettingsDTO` updated with new fields.
- `GameSettingsSideBetDTO` created.
- Zod schemas updated for validation.
- CasinoService CRUD functions updated for new columns.

### 5.2 Non-Functional Requirements

- Migration must be backwards-compatible (all new columns nullable or with defaults).
- Seed RPC must complete within 500ms for the full template.
- No breaking changes to existing game_settings consumers (rating slip policy snapshot, table-settings defaults).

> Architecture details: see SRM v4.11.1 §CasinoService. RLS patterns: see ADR-015, ADR-024.

## 6. UX / Flow Overview

This PRD is backend-only. The consumer flow is:

1. **Wizard B Step 2** calls `rpc_seed_game_settings_defaults('small_pit_starter')`.
2. Game settings rows are pre-populated for the casino.
3. Wizard UI displays the seeded games; admin can edit/remove/add.
4. On "Next", the final game_settings state persists and the wizard advances to Step 3 (tables).

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-025** (bootstrap/onboarding) — must be merged (it is).
- **SETUP-WIZARD-CONFIG-TAXONOMY.md** — defines the wizard step flow.
- **SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md** — provides seed data.
- **ADR-024** — authoritative context derivation for the seed RPC.

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| `gaming_table.type` shares the `game_type` enum — DDL affects both tables | `gaming_table.type` and `game_settings.game_type` reference the same Postgres enum (confirmed in baseline). `ALTER TYPE ADD VALUE` expands both in one DDL — no separate migration. New tables can be created with `pai_gow` / `carnival` immediately. Existing table rows keep their current type; re-typing is operational and out of scope. |
| Existing consumers expect unique (casino_id, game_type) — one row per game_type assumption | Consumers MUST NOT query `game_settings` assuming one row per `game_type`. Selection should be by `code` (stable) or `id` (FK reference). Any helper like `getGameSettingsDefaults()` must be updated to return a list keyed by `code`, not a `.maybeSingle()` per `game_type`. |
| Side-bet table adds schema complexity | Table is optional for MVP wizard; can defer RLS/service layer to post-wizard if needed |
| Enum extension is DDL — values are effectively non-removable | Postgres supports adding values (optionally BEFORE/AFTER) and renaming values. Existing enum values **cannot be removed** (nor can ordering be changed) without dropping/recreating the type and migrating dependent columns. Treat enum evolution as: "add/rename is OK; remove is a migration event." UI/logic MUST NOT rely on enum **ordering**. |

## 8. Definition of Done (DoD)

**Functionality**
- [ ] `game_type` enum includes `pai_gow` and `carnival`
- [ ] `game_settings` table has `variant_name`, `shoe_decks`, `deck_profile`, `rating_edge_for_comp`, `notes` columns
- [ ] `game_settings.code` column added; `UNIQUE (casino_id, code)` enforced
- [ ] Old unique constraint `(casino_id, game_type)` dropped
- [ ] `game_settings_side_bet` table exists with RLS policies
- [ ] `rpc_seed_game_settings_defaults` inserts all 11 template rows for a casino
- [ ] Seed RPC is idempotent (re-run inserts 0 rows if already seeded)

**Data & Integrity**
- [ ] Existing game_settings rows unaffected by migration
- [ ] CHECK constraints on new columns prevent invalid data
- [ ] Foreign key cascade on side_bet → game_settings prevents orphans

**Security & Access**
- [ ] Side-bet table RLS mirrors game_settings (casino_id scoped, pit_boss/admin write)
- [ ] Seed RPC uses `set_rls_context_from_staff()` for authoritative context (ADR-024)
- [ ] Seed RPC is SECURITY DEFINER with `search_path = public, pg_temp`
- [ ] Seed RPC hard-validates `casino_id` is non-null and enforces role allow-list (`admin` / `manager`)
- [ ] RLS bypass posture is explicit: either `FORCE ROW LEVEL SECURITY` on target tables, or function compensates with explicit scoped writes

**Testing**
- [ ] Integration test: seed RPC creates expected rows for a casino
- [ ] Integration test: seed RPC idempotency (second call inserts 0)
- [ ] Integration test: new columns accept valid data, reject invalid
- [ ] Migration test: expression unique index exists and blocks duplicates where `paytable_id` is NULL vs `'default'` treated equivalently
- [ ] Migration test: `casino_id` cannot drift (either by removal or enforced match)
- [ ] Seed RPC uses `(casino_id, code)` for idempotency; re-running the seed is a no-op
- [ ] `shoe_decks` and `deck_profile` CHECK constraints exist exactly as specified
- [ ] Side-bet casino consistency trigger exists; mismatch attempts fail
- [ ] SECURITY DEFINER posture is explicitly chosen (FORCE RLS vs bypass-by-design) and verified in tests
- [ ] Percent fields use `numeric(6,3)` with 0..100 CHECK constraints
- [ ] Side-bet trigger derives `casino_id` by overwriting `NEW.casino_id` in a BEFORE trigger; inserts succeed without client-supplied `casino_id`
- [ ] Risk section explicitly states enum values cannot be removed without recreate, and ordering is not relied upon

**Operational Readiness**
- [ ] TypeScript types regenerated (`npm run db:types`)
- [ ] No type-check errors (`npm run type-check`)

**Documentation**
- [ ] SRM updated if needed (CasinoService already owns game_settings)
- [ ] Migration follows MIGRATION_NAMING_STANDARD

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/company-onboarding/SETUP-WIZARD-CONFIG-TAXONOMY.md`
- **Default Template:** `docs/00-vision/company-onboarding/SETUP-WIZARD-GAMESETTINGS-DEFAULT-TEMPLATE.md`
- **Gap Analysis:** `docs/issues/gaps/GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.11.1
- **RLS / Security:** ADR-015, ADR-024, `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Existing Migration:** `supabase/migrations/20251126131051_game_settings_theo_fields.sql`
- **Service Layer:** `services/casino/` (CasinoService owns game_settings)

---

## Appendix A: Template Mapping (game_type → template games)

| Template Game | game_type | code (stable, idempotent key) | name (display label) |
|---|---|---|---|
| Blackjack 6-deck | `blackjack` | `bj_6d` | "Blackjack — 6-Deck Shoe" |
| Blackjack double deck | `blackjack` | `bj_dd` | "Blackjack — Double Deck" |
| Spanish 21 | `blackjack` | `spanish_21` | "Spanish 21" |
| Player's Edge 21 | `blackjack` | `players_edge_21` | "Player's Edge 21 Progressive" |
| Mini Baccarat | `baccarat` | `mini_baccarat` | "Mini Baccarat" |
| Rising Phoenix (commission) | `baccarat` | `rising_phoenix_comm` | "Rising Phoenix Baccarat — Commission" |
| Rising Phoenix (comm-free) | `baccarat` | `rising_phoenix_comm_free` | "Rising Phoenix Baccarat — Commission-Free" |
| Pai Gow Poker | `pai_gow` | `pai_gow` | "Pai Gow Poker" |
| Emperor's Challenge | `pai_gow` | `emperor_challenge_exposed` | "Emperor's Challenge Exposed" |
| Ultimate Texas Hold 'Em | `carnival` *(or keep `poker` only if pit taxonomy insists)* | `uth` | "Ultimate Texas Hold 'Em" |
| High Card Flush | `carnival` | `high_card_flush` | "High Card Flush" |

**Code stability invariant:**
- `game_settings.code` is a **globally stable identifier** across casinos and over time.
- Templates, analytics, and migrations can rely on a given `code` meaning the same variant semantics (e.g., `rising_phoenix_comm_free` always means "Banker 3-card 7 push commission-free variant").

**Notes:**
- Rising Phoenix commission-free variant differs from standard baccarat: **winning Banker 3-card 7 pushes** on Banker wagers (commission-free mode).
- If UTH is kept under `poker`, document this as a *categorization compromise* and the UI should still render it under "Table Games / Carnival" using display grouping.

## Appendix B: Side-bet seed data (template)

| Parent Game Setting | Side Bet | House Edge | Paytable |
|---|---|---|---|
| Blackjack — 6-Deck Shoe | Lucky Ladies (Pay Table D) | 13.34% | D |
| Emperor's Challenge Exposed | Emperor's Challenge | 4.171% | — |
| Emperor's Challenge Exposed | Pai Gow Insurance | 7.35% | — |
