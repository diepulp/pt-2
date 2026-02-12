---
spec_id: GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS
title: "Custom Game Settings for Setup Wizard Step 2"
source: docs/issues/gaps/onboarding-setup-wizard/GAP-SETUP-WIZARD-CUSTOM-GAME-SETTINGS.md
related_prds: [PRD-029, PRD-030]
bounded_context: CasinoService
tables_affected: [game_settings]
new_tables: []
new_migrations: false
new_rls_policies: false
status: approved
created: 2026-02-12

workstreams:
  WS1:
    name: Delete CRUD Function
    type: service-layer
    bounded_context: CasinoService
    executor: backend-service-builder
    dependencies: []
    gate: type-check

  WS2:
    name: Game Settings Server Actions (Create/Update/Delete)
    type: service-layer
    bounded_context: CasinoService
    executor: backend-service-builder
    dependencies: [WS1]
    gate: type-check

  WS3:
    name: Step 2 Game Management UI
    type: react-components
    bounded_context: CasinoService
    executor: frontend-design-pt-2
    dependencies: [WS2]
    gate: build

  WS4:
    name: Service Layer Unit Tests
    type: unit-tests
    bounded_context: CasinoService
    executor: backend-service-builder
    dependencies: [WS1, WS2]
    gate: test-pass

execution_phases:
  phase_1:
    name: Service Layer Extension
    workstreams: [WS1]
    gate: type-check
  phase_2:
    name: Server Actions
    workstreams: [WS2]
    gate: type-check
  phase_3:
    name: UI & Tests
    workstreams: [WS3, WS4]
    parallel: true
    gate: build
---

# EXECUTION-SPEC: Custom Game Settings for Setup Wizard Step 2

## Summary

The Setup Wizard (PRD-030) Step 2 currently provides **no UI surface** for creating, editing, or deleting **custom** `game_settings`. The underlying service layer already exists (`services/casino/game-settings-crud.ts`) with DTOs, Zod schemas, mappers, and DB-side constraints. This spec adds the missing **server actions + UI wiring** so the wizard can manage game settings during onboarding.

**Scope**: Phase 1 only (within PRD-030 scope adjustment). **No new tables, migrations, or RLS policies** in this workstream.

### Assumptions (explicit)
- **RLS already enforces** that only authorized roles (admin for onboarding) can mutate `public.game_settings` within the current `casino_id`.
- Server actions still perform **defense-in-depth** checks (role + casino scoping) and must never trust client-supplied `casino_id`.

### Decisions (to avoid ambiguity)
- **Seed button visibility**: the “Seed Default Games” button remains available as an **idempotent** action to populate missing defaults. We do **not** attempt to infer a “seeded/not seeded” boolean in Phase 1 (no wizard-state table changes).
- **Create validation**: client payload must NOT include `casino_id`. Server action injects `casino_id` from `ctx.rlsContext` *before* validation/insert.
- **Update validation**: updates must include **at least one mutable field** (no `{}` no-op updates).

---

## WS1: Delete CRUD Function

**Executor**: `backend-service-builder`
**File**: `services/casino/game-settings-crud.ts` (edit — append function)
**Dependencies**: none

### Specification

Add `deleteGameSettings()` to the existing CRUD file. Pattern:

- **Hard delete** (no `soft_deleted_at` column exists on `game_settings`)
- RLS handles casino scoping — no explicit `casino_id` filter needed
- Follow existing CRUD function signatures: `(supabase: SupabaseClient<Database>, id: string)`
- Throw `DomainError('NOT_FOUND')` if row doesn't exist (`PGRST116`)
- Throw `DomainError('INTERNAL_ERROR')` for other errors
- Return `void` (delete has no meaningful return value)
- `game_settings_side_bet` has `ON DELETE CASCADE` — no FK concerns

### Function Signature

```typescript
export async function deleteGameSettings(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void>
```

### Error Handling

| Postgres Code | DomainError Code | Message |
|---------------|------------------|---------|
| `PGRST116` | `NOT_FOUND` | Game setting not found |
| Other | `INTERNAL_ERROR` | Forward `error.message` |

---

## WS2: Game Settings Server Actions (Create/Update/Delete)

**Executor**: `backend-service-builder`
**File**: `app/(onboarding)/setup/_actions.ts` (edit — append 3 new actions)
**Dependencies**: WS1

### Pattern

Follow the exact `withServerAction()` middleware pattern from the 5 existing actions:

- Admin role enforcement: `ctx.rlsContext?.staffRole !== 'admin'` -> `forbidden()`
- `casino_id` from `ctx.rlsContext!.casinoId` (ADR-024, never from user input)
- `ServiceResult<T>` return type
- Zod validation via existing schemas
- Domain/action metadata for observability

### Actions

#### 1. `createCustomGameSettingsAction`

```
Input:        { game_type, code, name, variant_name?, shoe_decks?, deck_profile?,
                house_edge, rating_edge_for_comp?, decisions_per_hour, seats_available,
                min_bet?, max_bet?, notes? }
Validation:   createGameSettingsSchema (casino_id injected from ctx, not user input)
CRUD call:    createGameSettings(supabase, { ...validated, casino_id: ctx.rlsContext!.casinoId })
Returns:      ServiceResult<GameSettingsDTO>
Domain/Action: { domain: 'casino', action: 'create-game-settings' }
```

**Note**: The `createGameSettingsSchema` includes `casino_id` as a required field. The server action must inject `casino_id` from `ctx.rlsContext!.casinoId` after parsing the user-provided fields separately, or parse with casino_id included.

#### 2. `updateGameSettingsAction`

```
Input:        { id: string, ...updateFields }
Validation:   updateGameSettingsSchema for update fields; z.string().uuid() for id
CRUD call:    updateGameSettings(supabase, id, validated)
Returns:      ServiceResult<GameSettingsDTO>
Domain/Action: { domain: 'casino', action: 'update-game-settings' }
```

**Note**: `id` passed separately (immutable field, not in update schema). RLS scopes to casino.

#### 3. `deleteGameSettingsAction`

```
Input:        { id: string }
Validation:   z.object({ id: z.string().uuid() })
CRUD call:    deleteGameSettings(supabase, validated.id)
Returns:      ServiceResult<{ deleted: true }>
Domain/Action: { domain: 'casino', action: 'delete-game-settings' }
```

### Imports to Add

```typescript
import { createGameSettings, updateGameSettings, deleteGameSettings } from '@/services/casino/game-settings-crud';
import { createGameSettingsSchema, updateGameSettingsSchema } from '@/services/casino/game-settings-schemas';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
```

---

## WS3: Step 2 Game Management UI

**Executor**: `frontend-design-pt-2`
**Dependencies**: WS2

### Files

| File | Action | Description |
|------|--------|-------------|
| `app/(onboarding)/setup/steps/step-game-seed.tsx` | Rewrite | Extend with game list, add/edit/delete capabilities |
| `app/(onboarding)/setup/components/game-settings-form.tsx` | Create | Reusable form for create/edit game settings (13 fields) |
| `app/(onboarding)/setup/setup-wizard.tsx` | Edit | Upgrade type from `GameSettingsSummary` to `GameSettingsDTO`, add CRUD handlers |
| `app/(onboarding)/setup/page.tsx` | Edit | Fetch full game settings via `listGameSettings()` instead of summary |

### Patterns

- React 19: `useTransition` for all async operations (already used in `setup-wizard.tsx`)
- shadcn/ui form controls: Input, Select, Textarea, Button, Badge, Table, AlertDialog
- Tailwind CSS v4 styling
- No `useEffect` sync patterns — key-based reset for edit form
- No manual loading states — parent provides `isPending` via `useTransition`
- DTOs consumed from `services/casino/game-settings-dtos.ts` (`GameSettingsDTO`)

### UI States

| State | Behavior |
|-------|----------|
| No games | Show "Seed Default Games" button (existing) + "Add Custom Game" button |
| Has games | Show game list table + "Add Custom Game" button + "Seed Default Games" (secondary / idempotent) |
| Adding | Show game form (create mode) below list |
| Editing | Show game form (edit mode) pre-filled with selected game data |

### Game List Table

- **Columns**: name, game_type, variant_name, house_edge, decisions_per_hour, seats_available
- **Row actions**: Edit, Delete
- **Delete confirmation**: shadcn `AlertDialog`

### Game Settings Form Fields

| UI Field | DB Column | Input Type | Required | Default |
|----------|-----------|------------|:--------:|---------|
| Game Category | `game_type` | Select (6 enum values) | Yes | — |
| Game Code | `code` | Text input | Yes | Auto-suggest from name |
| Game Name | `name` | Text input | Yes | — |
| Variant | `variant_name` | Text input | No | — |
| Shoe Decks | `shoe_decks` | Select (1/2/4/6/8) | No | — |
| Deck Profile | `deck_profile` | Select (3 values) | No | — |
| House Edge (%) | `house_edge` | Number (0-100) | Yes | 1.5 |
| Rating Edge (%) | `rating_edge_for_comp` | Number (0-100) | No | — |
| Decisions/Hour | `decisions_per_hour` | Number | Yes | 70 |
| Seats | `seats_available` | Number | Yes | 7 |
| Min Bet ($) | `min_bet` | Number | No | — |
| Max Bet ($) | `max_bet` | Number | No | — |
| Notes | `notes` | Textarea | No | — |

### Setup Wizard Changes

1. Replace `GameSettingsSummary` type with full `GameSettingsDTO` from `services/casino/game-settings-dtos.ts`
2. Server `page.tsx` must fetch full game settings via `listGameSettings()` (import from CRUD)
3. Add `handleCreateGame`, `handleUpdateGame`, `handleDeleteGame` handlers wrapping the new server actions
4. Update `games` state array after each mutation
5. Wire new handlers as props to `StepGameSeed`

---

## WS4: Service Layer Unit Tests

**Executor**: `backend-service-builder`
**File**: `services/casino/__tests__/game-settings.test.ts` (edit — append new describe block)
**Dependencies**: WS1, WS2

### Test Specifications

#### `deleteGameSettings` CRUD Tests

| Test Case | Expectation |
|-----------|-------------|
| Calls `supabase.from('game_settings').delete().eq('id', id)` | Supabase chain constructed correctly |
| Throws `DomainError('NOT_FOUND')` on `PGRST116` | Error mapping correct |
| Throws `DomainError('INTERNAL_ERROR')` on other DB errors | Generic error handling |
| Does not require `casino_id` parameter | RLS handles scoping |

### Gate

```bash
npm test services/casino/__tests__/game-settings.test.ts
```

---

## Execution Phases

```
Phase 1: [WS1] Service Layer Extension
  Gate: npm run type-check

Phase 2: [WS2] Server Actions
  Gate: npm run type-check

Phase 3: [WS3, WS4] UI & Tests (parallel)
  Gate: npm run build && npm test
```

---

## Definition of Done

- CI gate runs **build + tests** for this work (no “green build / red tests” allowed).


- [ ] `deleteGameSettings()` added to `game-settings-crud.ts`
- [ ] 3 server actions added to `_actions.ts` (create, update, delete)
- [ ] Step 2 UI shows game list with edit/delete capabilities
- [ ] Custom game creation form with all 13 fields
- [ ] Unit tests pass for delete CRUD function
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes (warnings OK)
- [ ] `npm run build` passes
- [ ] No `as any` in new code
- [ ] No `console.*` in new code
- [ ] `casino_id` derived from context only (ADR-024 compliant)
- [ ] Admin role enforcement on all server actions
