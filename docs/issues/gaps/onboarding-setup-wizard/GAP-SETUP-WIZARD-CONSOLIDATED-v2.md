# GAP-SETUP-WIZARD-CONSOLIDATED-v2

**Created:** 2026-02-16
**Status:** Open (13 items)
**Severity:** P1 (UX gaps — wizard is functional but table creation step has structural problems)
**Related PRDs:** PRD-024 (Landing Page), PRD-025 (Onboarding), PRD-029 (Game Settings Schema), PRD-030 (Setup Wizard), PRD-037 (CSV Player Import)
**Bounded Context:** CasinoService, TableContext, PlayerImportService
**Commit Baseline:** `f5a1b12` (Merge PR #1 — `dev-onboarding-wizard`)
**Supersedes:** GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md, GAP-SEEDED-GAME-SETTINGS-ORPHANED.md, GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS.md

---

## Summary

The remaining open gaps center on **Step 2 (Create Tables)** — specifically the disconnect between game selection in Step 1 and table creation in Step 2, and the hardcoded bulk-add buttons that impose arbitrary table counts with poor UX. The three predecessor gap docs (listed above) covered blockers that have since been resolved and are superseded by this document.

### Scoping Decisions

- **Roulette: dropped from catalog scope.** Roulette is out of scope for small card rooms — the target market for the onboarding wizard. The `roulette` value in the `game_type` enum remains in the schema for future use but should not appear in the wizard catalog or bulk-add buttons.
- **Poker: templates deferred.** Poker "edge" is not a house-edge like blackjack/baccarat — it is rake (or time charge). The current `game_settings` schema models edge as a percentage advantage applied to bets (`house_edge`, `rating_edge_for_comp`), which is the wrong abstraction for poker. Poker templates require a **fee-model metadata** approach (rake percentage, rake cap, time-charge rate) that does not exist in the schema yet. Until that schema evolution ships, poker should remain available via custom game creation only, with no catalog templates. See OPEN-9.

---

## 1. Wizard Flow (Current State)

```
/bootstrap → casino_settings.setup_status = 'not_started'
           → /start gateway → redirects to /setup
           → SetupPage (SSR: fetches settings, games, tables, computes initialStep)
           → SetupWizard (client, 5 steps)

Step 0: Casino Basics     → timezone, gaming day start, bank mode
Step 1: Game Settings      → catalog selection + custom CRUD (create/edit/delete)
Step 2: Create Tables      → manual rows + bulk-add buttons + variant selector
Step 3: Par Targets        → per-table par_total_cents (skippable)
Step 4: Review & Complete  → summary → completeSetupAction → redirect /start
```

**Resume logic** (`page.tsx:15-28`): Deterministic step computed from server state — no timezone/bank_mode → Step 0, no games → Step 1, no tables → Step 2, else → Step 3.

---

## 2. Open Gaps

### OPEN-1: No Game-to-Table Mapping Guidance (P1)

**Location:** Step 1 → Step 2 transition
**Problem:** After selecting/configuring games in Step 1 (e.g., 4 blackjack variants, 3 baccarat variants), the user arrives at Step 2 with a blank table form. There is no:
- Summary of which games were configured in Step 1
- Auto-suggestion to create tables for each configured game
- Indicator showing which game types from Step 1 have zero tables assigned
- Recommended table count per game type

The variant selector in `table-row-form.tsx` provides the mechanism to link tables to games, but the user must manually discover and use it per row. The conceptual flow "I picked these games, now I need tables for them" has no UI affordance.

**Impact:** Users must mentally track their Step 1 selections while working in Step 2. For a casino with 11 game variants, this is error-prone and tedious.

**Recommended fix:** Add a **Configured Games Summary** banner at the top of Step 2 showing variants with zero tables assigned and tables missing variant links:
```
You configured: 4 Blackjack · 3 Baccarat · 2 Pai Gow · 2 Carnival
⚠ 3 variants have no tables yet
```
Add a **"Generate tables from games"** quick-action that creates one row per configured variant with auto-linked `game_settings_id` and auto-generated labels (`BJ-01`, `BC-01`, etc.). Must be idempotent — re-running does not create duplicates.

**Hardening rule:** Block Step 2 → Next if all tables have `game_settings_id = null` **and** multiple variants exist for any game type. This prevents silent theo ambiguity downstream.

### OPEN-2: Bulk-Add Buttons — Hardcoded Arbitrary Counts (P1)

**Location:** `app/(onboarding)/setup/steps/step-create-tables.tsx:160-224`
**Problem:** Six hardcoded bulk-add buttons impose fixed table counts:

| Button | Creates | Problem |
|--------|---------|---------|
| `+ 4 Blackjack` | 4 rows, type=blackjack | Casino with 1 BJ table must remove 3 rows manually |
| `+ 2 Baccarat` | 2 rows, type=baccarat | Arbitrary count |
| `+ 1 Pai Gow` | 1 row, type=pai_gow | Only sensible one — but still no variant linkage |
| `+ 2 Carnival` | 2 rows, type=carnival | Arbitrary count |
| `+ 2 Poker` | 2 rows, type=poker | **Deferred** — no templates; poker needs fee-model metadata, not house-edge (see OPEN-9) |
| `+ 2 Roulette` | 2 rows, type=roulette | **Remove** — roulette out of scope for small card rooms |

The counts are developer assumptions, not user-driven. A casino that needs 8 blackjack tables clicks the button twice and gets 8, but a casino that needs 1 clicks once and deletes 3.

**Recommended fix:** Remove all 6 bulk buttons. Keep two actions:
1. **`+ Add Table`** — already exists at line 165. Single row, user fills in details. No cleanup friction.
2. **`Generate from games`** — explicit fast path that reads `gameSettings` state and creates one table per configured variant with auto-generated labels and auto-linked `game_settings_id`. User can remove unwanted rows after generation.

Users should not have to delete what the product guessed.

### OPEN-3: Bulk-Add Creates Rows with game_settings_id = null (P1)

**Location:** `app/(onboarding)/setup/steps/step-create-tables.tsx:102-108`
**Problem:** The `addBulk()` function creates `TableFormRow` objects with `game_settings_id: null`:

```typescript
const newRows: TableFormRow[] = Array.from({ length: count }, (_, i) => ({
  id: nextRowId(),
  label: `${prefix}-${String(startNum + i).padStart(2, '0')}`,
  type: gameType,
  pit: '',
  game_settings_id: null,  // ← never assigned
}));
```

Even when there is exactly one game setting for the given `game_type`, the bulk-add does not auto-link it. The user must manually open each row's variant dropdown and select a variant for every bulk-added table.

**Impact:** Tables created via bulk-add are persisted without variant linkage. Downstream theo/comp calculations cannot use per-variant house edge or DPH for these tables.

**Recommended fix:** Primary mitigation is OPEN-2 (removal of bulk buttons). If any bulk generation remains:
- Auto-link `game_settings_id` when exactly **one** variant exists for the game type.
- When multiple variants exist, leave null but **surface it loudly**: badge + warning on the row.

**Hardening rule:** Block Step 2 → Next if any table row has `game_settings_id = null` for a game type with multiple configured variants. Unlinked tables for single-variant types are acceptable (the link is unambiguous). This prevents "successful" completion that produces ambiguous state for theo/comp calculations.

### OPEN-4: Phantom Bulk Buttons for Out-of-Scope / Unconfigured Types (P2)

**Location:** `app/(onboarding)/setup/steps/step-create-tables.tsx:209-223`
**Problem:** The `+ 2 Poker` and `+ 2 Roulette` buttons always render regardless of wizard state or scoping:

- **Roulette is out of scope** for the target market (small card rooms). The button should be removed entirely.
- **Poker has no catalog templates** and requires fee-model metadata that doesn't exist in the schema (see OPEN-9). The button should not appear unless the user added a custom poker game in Step 1.

Clicking either button creates tables for game types that have no game settings rows — the variant selector is empty and `game_settings_id` is null.

**Recommended fix:**
1. Remove the `+ 2 Roulette` button unconditionally.
2. Remove the `+ 2 Poker` button, or gate it behind the `gameSettings` prop:
```typescript
const activeGameTypes = new Set(gameSettings.map(gs => gs.game_type));
// Only show poker button if activeGameTypes.has('poker')
```
3. If adopting OPEN-2 (single-table standardization), all bulk buttons are removed and this gap resolves automatically.

### OPEN-5: Variant Selector Not Clearable (P2)

**Location:** `app/(onboarding)/setup/components/table-row-form.tsx:93-112`
**Problem:** The variant `Select` component shows `placeholder="Variant (optional)"` when no value is selected, but once a variant is chosen there is no option to reset back to null. The `SelectContent` only contains `SelectItem` entries for matching game settings — no "None" or empty option.

**Recommended fix:** Add a clear option and show the consequence:
```tsx
<SelectContent>
  <SelectItem value="">None</SelectItem>
  {variants.map((gs) => (
    <SelectItem key={gs.id} value={gs.id}>
      {gs.variant_name ?? gs.name}
    </SelectItem>
  ))}
</SelectContent>
```
When cleared back to null and multiple variants exist for the game type, display inline hint: *"Theo calculations require a variant link."* This pairs with the OPEN-3 hardening rule that blocks Next for ambiguous null links.

### OPEN-6: Par Targets Step Missing Variant Context (P3)

**Location:** `app/(onboarding)/setup/steps/step-par-targets.tsx`
**Problem:** The `ParEntryRow` component receives `tableLabel` and `gameType` but not the linked variant name. When a casino has multiple variants of the same game type (e.g., "6-deck shoe" vs "Double deck" blackjack), the par targets step shows both as "Blackjack" — the user can't distinguish which table has which variant.

**Recommended fix:** Pass `gameSettingsMap` (from the wizard's `games` state) to `StepParTargets` and resolve the variant name per table's `game_settings_id`. Display as `BJ-01 — Blackjack (Double Deck)` not just `BJ-01 — Blackjack`. Variant context should appear consistently anywhere a table references its game settings (par step, review step, future dashboard views).

### OPEN-7: No Step-Jump Navigation in Review (P3)

**Location:** `app/(onboarding)/setup/setup-wizard.tsx`
**Problem:** The `WizardStepper` component displays step labels but navigation is sequential only (Back/Next). From Step 4 (Review), the user must click Back 4 times to return to Step 0 to fix a timezone. This is friction-heavy for a review-and-correct workflow.

**Recommended fix:** Make completed steps clickable in the `WizardStepper`:
- Allow jumping **backward** to any step ≤ currentStep.
- Allow jumping **forward** only if the target step's prerequisites are satisfied (per step-level validation gates in OPEN-10).
- Mark Step 3 (Par Targets) as **"Optional"** in the stepper label — it is the only skippable step and the UI should reflect that.

### OPEN-8: Roulette Removal from Wizard Catalog and Bulk Buttons (P2)

**Location:** `app/(onboarding)/setup/steps/step-create-tables.tsx:215-223`, `app/(onboarding)/setup/components/table-row-form.tsx:19-26`
**Decision:** Roulette is out of scope for small card rooms — the target market for the onboarding wizard.

**Current state:**
- `DEFAULT_GAME_TEMPLATES` has no roulette entries (already correct)
- `+ 2 Roulette` bulk-add button exists in Step 2 (should be removed)
- `roulette` appears in `GAME_TYPES` array in `table-row-form.tsx` and `game-settings-form.tsx` (should be removed from wizard-specific type lists)
- The `game_type` enum in the database retains `roulette` for future use — no schema change needed

**Recommended fix:**
1. Remove the `+ 2 Roulette` bulk button from `step-create-tables.tsx`
2. Remove `roulette` from the `GAME_TYPES` constant in `table-row-form.tsx` and `GAME_TYPES` in `game-settings-form.tsx` (wizard-only scope; the enum stays in the DB)
3. Remove `roulette` from `GAME_TYPE_ORDER` and `GAME_TYPE_LABELS` in `step-game-seed.tsx` and `step-review-complete.tsx`

### OPEN-9: Poker Fee-Model Schema Gap — Templates Deferred (P2)

**Location:** `services/casino/game-settings-templates.ts`, `game_settings` table schema
**Decision:** Poker templates are deferred until the schema supports fee-model metadata.

**Problem:** The current `game_settings` schema models game economics as a **percentage house advantage applied to bets**:
- `house_edge` — mathematical edge (e.g., blackjack 0.28%, baccarat 1.06%)
- `rating_edge_for_comp` — softer edge used for comp/theo calculations

This model is correct for banked games (blackjack, baccarat, pai gow, carnival) where the casino takes a statistical edge on every wager. **Poker is fundamentally different** — the casino earns revenue through:
- **Rake:** a percentage of each pot (typically 5-10%, capped at $4-$8)
- **Time charge:** a fixed hourly fee per seat (common in higher-limit games)
- **Tournament fees:** entry fee structures (buy-in + fee split)

Storing a poker "house_edge" of 5.0% in the current schema would be misleading — it conflates rake percentage (applied to pots, not bets) with house advantage (applied to theoretical handle). This would corrupt theo calculations: a $100/hand player at a 5% rake table does NOT have $5/hand theoretical loss like they would at a 5% house-edge table game.

**What's needed (future PRD):**

New columns or a JSONB `fee_model` field on `game_settings` for poker-specific economics:

| Field | Type | Description |
|-------|------|-------------|
| `fee_type` | enum: `rake`, `time_charge`, `tournament` | Revenue model |
| `rake_percentage` | numeric(5,2) | Rake % of pot (rake model) |
| `rake_cap_cents` | integer | Maximum rake per hand in cents |
| `time_charge_cents` | integer | Hourly seat fee in cents (time charge model) |
| `tournament_fee_percentage` | numeric(5,2) | Fee % of buy-in (tournament model) |

Until this ships:
- Poker remains available via "Add Custom Game" for casinos that want to track poker tables
- Users can store rake info in the `notes` field as a workaround
- No poker templates should appear in the catalog to avoid encoding the wrong economic model
- The `+ 2 Poker` bulk-add button should be removed or gated behind having custom poker game settings (see OPEN-4)

### OPEN-10: Step-Level Validation Gates (P1)

**Location:** `app/(onboarding)/setup/setup-wizard.tsx`, `app/(onboarding)/setup/_actions.ts`
**Problem:** The wizard currently allows forward navigation with no server-side validation of step completeness. If the UI lets users proceed but the server would reject or produce invalid state later, the UI is lying. Each step must define a minimum valid state and enforce it before allowing Next.

**Step-level Definition of Done:**

| Step | Valid when |
|------|-----------|
| Step 0 | `timezone` + `gaming_day_start_time` + `table_bank_mode` all present |
| Step 1 | At least 1 `game_settings` row exists for the casino |
| Step 2 | At least 1 table exists; no table has `game_settings_id = null` for a game type with multiple configured variants (see OPEN-3 hardening rule) |
| Step 3 | Par values either saved **or** explicitly skipped (not silently empty) |
| Step 4 | Server-side audit passes — blockers list is empty |

**Recommended fix:** Add a `validateStep(step: number)` function to the wizard that runs client-side checks before `goNext()`. For Step 4 (complete), `completeSetupAction` should perform a final server-side audit and return any blockers. Reload/resume must always land the user on the earliest step with blockers.

### OPEN-11: Review Step as Audit, Not Recap (P2)

**Location:** `app/(onboarding)/setup/steps/step-review-complete.tsx`
**Problem:** Step 4 currently renders a static summary. It does not distinguish between complete configuration, warnings, and blockers. A user can click "Complete Setup" with 5 unlinked tables and no indication anything is wrong.

**Recommended fix:** Transform the review step into a validation audit that categorizes each item:
- **Complete** — configuration is valid
- **Warning** — non-blocking issue (e.g., "2 tables have no variant link — theo will use type-level defaults")
- **Blocker** — must fix before completion (e.g., "No tables configured")

Each warning/blocker should deep-link back to the fix location via step-jump navigation (OPEN-7). The "Complete Setup" button should be disabled while blockers exist.

### OPEN-12: Error UX Standardization (P2)

**Location:** `app/(onboarding)/setup/setup-wizard.tsx:302-306`
**Problem:** The wizard has a single `error` string rendered as a red banner at the top of the page. There is no:
- Inline field-level validation feedback
- Step-level error summary ("3 issues to fix")
- Error clearing when the user corrects the issue (errors persist until the next action)

**Recommended fix:** Standardize error display:
1. **Inline field errors** — show validation messages adjacent to the input that failed (e.g., "Table label is required").
2. **Step-level summary** — when multiple issues exist, show a count ("3 issues to fix") with a list.
3. **Auto-clear** — errors should clear immediately when the user corrects the input, not persist until the next server round-trip.

### OPEN-13: CSV Player Import Not Integrated into Onboarding Wizard (P1)

**Location:** Setup wizard (all steps) + standalone `/player-import` page
**Problem:** PRD-037 delivered a standalone CSV player import wizard at `/player-import` with full backend (RPCs, RLS, service layer, 6 API endpoints) and frontend (6-step wizard: file selection, column mapping, preview, staging upload, execute, report). However, this functionality exists only as a standalone page with no integration into the onboarding flow. Two gaps:

1. **No onboarding step for player import.** After completing table setup (Step 2) and par targets (Step 3), a natural next action is bulk-importing an existing player roster. The wizard currently goes straight to Review & Complete (Step 4) with no player import option. For casinos migrating from another system, this is the single most valuable onboarding action — importing their existing player database so pit bosses can start rating sessions immediately.

2. **No navigation to ad-hoc import.** After onboarding completes (`setup_status='ready'`), there is no sidebar link, dashboard card, or command palette entry to reach `/player-import`. The page exists but is only accessible via direct URL.

**Impact:** Casinos completing onboarding must discover the import page independently. The onboarding "done" state implies readiness, but without players in the system, pit bosses cannot start any real work (visits, rating slips, rewards all require player records).

**Recommended fix — two workstreams:**

**A. Onboarding integration (optional step between Step 3 and Review):**
- Add **Step 3.5: Import Players (Optional)** to the setup wizard
- Display after par targets, before review
- Two options: "Import from CSV" (opens the existing import wizard inline or as a modal) and "Skip — I'll add players later"
- If skipped, note it in the Review step as "Players: None imported (you can import later from Settings → Import Players)"
- If completed, show import report summary in Review step: "Players: 47 imported (3 conflicts skipped)"
- The underlying API endpoints and wizard components from PRD-037 are already built — this is a UI wiring task

**B. Ad-hoc access (post-onboarding):**
- Add sidebar nav entry under a "Players" or "Settings" group: "Import Players" → `/player-import`
- Add dashboard card or quick-action on the main dashboard: "Import Players from CSV"
- Register in command palette (Ctrl/Cmd+K): "Import Players"
- All three entry points navigate to the existing `/player-import` page

**Dependencies:** PRD-037 (complete — all 7 workstreams shipped), OPEN-7 (step-jump navigation)

**Files to create/modify:**
- `app/(onboarding)/setup/setup-wizard.tsx` — add optional player import step
- `app/(onboarding)/setup/steps/step-import-players.tsx` — new step component (wraps or embeds existing `import-wizard.tsx`)
- `app/(protected)/layout.tsx` or sidebar component — add nav entry for `/player-import`
- Dashboard page — add quick-action card

---

## 3. Priority Matrix

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| **P1** | OPEN-2: Replace bulk-add with `+ Add Table` + `Generate from games` | Medium | High — eliminates cleanup friction |
| **P1** | OPEN-10: Step-level validation gates | Medium | High — prevents invalid completion state |
| **P1** | OPEN-1: Game-to-table mapping guidance + banner | Medium | High — bridges Step 1→2 cognitive gap |
| **P1** | OPEN-3: Null `game_settings_id` hardening | Low | High — blocks silent theo ambiguity |
| **P2** | OPEN-8: Remove roulette from wizard | Low | Medium — scope alignment for small card rooms |
| **P2** | OPEN-4: Remove/gate phantom bulk buttons (poker, roulette) | Low | Medium — prevents creating orphan tables |
| **P2** | OPEN-11: Review step as audit (blockers vs warnings) | Medium | Medium — prevents "successful" completion with bad state |
| **P2** | OPEN-12: Error UX standardization | Medium | Medium — inline errors + auto-clear |
| **P2** | OPEN-5: Variant selector clearable + consequence hint | Low | Medium — standard select UX |
| **P2** | OPEN-9: Poker fee-model schema gap (deferred) | N/A | Medium — blocks poker templates; workaround via custom game + notes |
| **P3** | OPEN-6: Par targets variant context | Low | Low — consistent variant display |
| **P3** | OPEN-7: Step-jump navigation + Optional labeling | Medium | Low — review-and-correct workflow |
| **P1** | OPEN-13: CSV player import integration (onboarding + ad-hoc nav) | Medium | High — bridges onboarding to operational readiness |

**Recommended implementation order:**

```
Phase 1 — Table creation overhaul:  OPEN-2 → OPEN-8 → OPEN-4 → OPEN-3 → OPEN-1
Phase 2 — Wizard hardening:         OPEN-10 → OPEN-11 → OPEN-12 → OPEN-5
Phase 3 — Player import integration: OPEN-13 (onboarding step + sidebar/dashboard/cmd-K)
Phase 4 — Polish:                   OPEN-6 → OPEN-7
Deferred:                           OPEN-9 (future PRD — poker fee-model schema)
```

Rationale: Phase 1 replaces bulk-add (OPEN-2), which eliminates OPEN-3 and OPEN-4 as side effects, then adds the game→table bridge (OPEN-1). Phase 2 adds the validation and error infrastructure that makes the wizard robust. Phase 3 wires the CSV player import (PRD-037) into the onboarding flow and adds ad-hoc navigation — no new backend work, purely UI integration. Phase 4 is cosmetic polish. OPEN-9 is a schema evolution that requires its own PRD.

---

## 4. Acceptance Criteria (Ship Gate)

- No path exists where the wizard completes while leaving required configuration missing or ambiguous links that corrupt downstream theo/comp calculations.
- "Generate from games" is idempotent — re-running does not create duplicate tables.
- Reload/resume always lands the user on the earliest step with blockers.
- Review step enumerates blockers with deep-links to the fix location.
- Inline field errors clear immediately when corrected.
- Roulette does not appear anywhere in the wizard UI.
- Poker tables can only be created if a custom poker game setting exists.

---

## 5. File Inventory

| File | Step | Purpose |
|------|------|---------|
| `app/(onboarding)/setup/page.tsx` | Entry | SSR data fetch, resume-step computation |
| `app/(onboarding)/setup/setup-wizard.tsx` | Shell | State management, step rendering, action handlers |
| `app/(onboarding)/setup/_actions.ts` | Backend | 8 server actions (complete, settings, seed, CRUD, table, par) |
| `app/(onboarding)/setup/steps/step-casino-basics.tsx` | Step 0 | Timezone, gaming day, bank mode |
| `app/(onboarding)/setup/steps/step-game-seed.tsx` | Step 1 | Catalog selection, custom game CRUD, edit/delete |
| `app/(onboarding)/setup/steps/step-create-tables.tsx` | Step 2 | Table creation rows, bulk-add buttons |
| `app/(onboarding)/setup/steps/step-par-targets.tsx` | Step 3 | Per-table par amount input |
| `app/(onboarding)/setup/steps/step-review-complete.tsx` | Step 4 | Summary review, complete action |
| `app/(onboarding)/setup/components/table-row-form.tsx` | Step 2 | Single table row: label, type, variant, pit |
| `app/(onboarding)/setup/components/game-settings-form.tsx` | Step 1 | 13-field game settings create/edit form |
| `app/(onboarding)/setup/components/bank-mode-selector.tsx` | Step 0 | Card-based bank mode picker |
| `app/(onboarding)/setup/components/par-entry-row.tsx` | Step 3 | Single table par input row |
| `app/(onboarding)/setup/components/wizard-stepper.tsx` | Shell | Step indicator bar |
| `services/casino/game-settings-templates.ts` | Step 1 | 11 default game templates |
| `supabase/migrations/20260212210814_add_gaming_table_game_settings_fk.sql` | Schema | game_settings_id FK + casino validation trigger |

---

## 6. Predecessor Documents (Superseded)

The following documents are superseded by this consolidated report.

| Document | Was | Disposition |
|----------|-----|-------------|
| `GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` | P0 | Resolved — 5-step wizard + completion RPC implemented |
| `GAP-SEEDED-GAME-SETTINGS-ORPHANED.md` | P1 | Resolved — selectable catalog + FK linkage implemented |
| `GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS.md` | P1 | Resolved — full CRUD server actions + UI form implemented |
| `GAP-SETUP-WIZARD-HARDENING-COMPLEMENT-v1.md` | Draft | Absorbed — hardening rules merged into OPEN items + OPEN-10/11/12 |
