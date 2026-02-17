---
id: PRD-012
title: Table Betting Limits Management
owner: Engineering
status: Draft
affects: [ARCH-SRM, PRD-007, SEC-001]
created: 2025-12-21
last_review: 2025-12-21
phase: Phase 2 (Table Operations)
pattern: B
http_boundary: true
---

# PRD-012 — Table Betting Limits Management

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Enable pit bosses to view and modify table betting limits (min_bet/max_bet) directly from the TableLayoutTerminal component. The `gaming_table_settings` table already exists with the required columns, so this PRD focuses on exposing that data through the service layer, API, and UI. Real-time limit adjustments are critical for responding to table demand and player activity.

---

## 2. Problem & Goals

### 2.1 Problem

Pit bosses currently cannot view or modify table betting limits from the terminal interface. When table conditions change (high roller arrives, table gets busy, shift change), supervisors must use external systems or database access to adjust limits. This creates operational friction and delays in responding to floor conditions.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Display current limits | Min/max bet visible in TableLayoutTerminal header within 1s of load |
| **G2**: Enable limit editing | Pit boss can update limits via modal dialog with < 3 clicks |
| **G3**: Real-time feedback | UI reflects new limits immediately after successful save |
| **G4**: Validation | System prevents invalid limit combinations (min > max) |

### 2.3 Non-Goals

- **Limit history/audit trail** — Future PRD (post-MVP table_limit_change table per SRM addendum)
- **Approval workflow** — No supervisor sign-off required for MVP
- **Scheduled limit changes** — Using `active_from`/`active_to` scheduling is out of scope
- **Null limits** — Limits are always required; system uses `game_settings` defaults when needed

---

## 3. Users & Use Cases

- **Primary users:** Pit Bosses, Floor Supervisors

**Top Jobs:**

- As a **Pit Boss**, I need to see current table limits at a glance so that I can quickly assess table configuration.
- As a **Pit Boss**, I need to raise the max bet limit when a high roller sits down so that we can accommodate their play.
- As a **Floor Supervisor**, I need to lower table limits during slow periods so that we attract more casual players.
- As a **Pit Boss**, I need validation feedback if I enter invalid limits so that I don't misconfigure a table.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Display:**
- Show min/max bet in TableLayoutTerminal header (full variant)
- Format as currency: "$25 – $500"
- Limits are always present (never null)

**Default Initialization:**
- When table settings don't exist, auto-create from `game_settings` defaults for the table's game type
- `game_settings` provides casino-level default min_bet/max_bet per game type (blackjack, poker, roulette, baccarat)

**Editing:**
- Edit button (pencil icon) opens TableLimitsDialog
- Two numeric inputs for min_bet and max_bet
- Quick increment buttons (+25, +100, +500)
- Client-side validation (min ≤ max, non-negative)
- Loading state during save
- Toast notification on success/error

**API:**
- `GET /api/v1/tables/[tableId]/settings` — Retrieve current settings
- `PATCH /api/v1/tables/[tableId]/settings` — Update limits (idempotency required)

### 4.2 Out of Scope

- Bulk limit updates across multiple tables
- Limit change history/audit log
- Scheduled limit changes (time-based activation)
- Role-based limit restrictions (all pit_boss+ can edit)
- Compact variant display (limits only shown in full variant)

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR1**: TableLayoutTerminal displays min_bet and max_bet from `gaming_table_settings`
- **FR2**: If no `gaming_table_settings` row exists, GET creates one using defaults from `game_settings` (by casino + game_type)
- **FR3**: Edit dialog allows updating min_bet and/or max_bet independently
- **FR4**: Validation rejects min_bet > max_bet with clear error message
- **FR5**: Validation rejects negative values and null values
- **FR6**: API returns updated settings after successful PATCH
- **FR7**: UI invalidates cache and re-fetches after mutation success

### 5.2 Non-Functional Requirements

- **NFR1**: API response < 200ms for GET, < 500ms for PATCH
- **NFR2**: RLS enforces casino scope (pit boss can only edit their casino's tables)
- **NFR3**: Idempotency key required for PATCH to prevent duplicate updates

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §307-342 (TableContextService)

---

## 6. UX / Flow Overview

**Flow 1: View Table Limits**
1. Pit boss opens TableLayoutTerminal (full variant)
2. Component fetches settings via `useTableSettings(tableId)`
3. If no settings exist, API auto-creates from `game_settings` defaults
4. Header displays "Limits: $25 – $500" badge (always populated)

**Flow 2: Edit Table Limits**
1. Pit boss clicks pencil icon next to limits badge
2. TableLimitsDialog opens with current values pre-filled
3. User modifies min and/or max using inputs or quick buttons
4. User clicks "Save" button
5. System validates min ≤ max
6. On success: dialog closes, toast shows "Limits updated", UI refreshes
7. On error: inline error message, dialog stays open

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-007 (TableContextService)** — Service must be implemented (✅ complete)
- **Schema** — `gaming_table_settings` table exists (✅ verified)
- **Schema** — `game_settings` table exists with default min_bet/max_bet per game type (✅ verified)
- **RLS policies** — Must enforce casino scope on `gaming_table_settings`

### 7.2 Risks & Open Questions

- **RLS coverage** — Verify `gaming_table_settings` has RLS policies; add if missing
- **Missing game_settings defaults** — If casino has no `game_settings` row for a game type, use system fallback (min=25, max=10000)

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Limits display in TableLayoutTerminal header (full variant)
- [ ] Edit dialog opens, pre-fills current values, and saves successfully
- [ ] Validation prevents min > max and negative values

**Data & Integrity**
- [ ] Settings row auto-created from `game_settings` defaults when missing
- [ ] Limits are never null (required fields with defaults)
- [ ] Casino scope enforced (cannot edit other casino's tables)

**Security & Access**
- [ ] RLS policy on `gaming_table_settings` enforces `casino_id` match
- [ ] Idempotency key required for PATCH endpoint

**Testing**
- [ ] Unit tests for `updateTableLimitsSchema` validation
- [ ] Integration test for GET/PATCH settings endpoints
- [ ] React Query hook tests for `useTableSettings` and `useUpdateTableLimits`

**Operational Readiness**
- [ ] Error codes follow ERROR_TAXONOMY (VALIDATION_ERROR, NOT_FOUND)
- [ ] Toast notifications for success/error states

**Documentation**
- [ ] DTOs documented in `services/table-context/dtos.ts`
- [ ] API contract matches ServiceHttpResult pattern

---

## 9. Related Documents

- **Vision / Strategy**: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §307-342
- **Schema / Types**: `types/database.types.ts` (gaming_table_settings)
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Post-MVP Extensions**: `docs/20-architecture/SRM_Addendum_TableContext_PostMVP.md`
- **Prerequisite PRDs**: PRD-007 (TableContextService)

---

## Appendix A: Schema Reference

```sql
-- Casino-level game type defaults (source for new table settings)
CREATE TABLE game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  game_type game_type NOT NULL,  -- blackjack, poker, roulette, baccarat
  min_bet numeric,
  max_bet numeric,
  rotation_interval_minutes int,
  CONSTRAINT chk_game_bet_range CHECK (
    min_bet IS NULL OR max_bet IS NULL OR min_bet <= max_bet
  )
);

-- Table-specific settings (created from game_settings defaults)
CREATE TABLE gaming_table_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES gaming_table(id) ON DELETE CASCADE,
  active_from timestamptz NOT NULL DEFAULT now(),
  active_to timestamptz,
  min_bet numeric NOT NULL,  -- Required (from game_settings or system default)
  max_bet numeric NOT NULL,  -- Required (from game_settings or system default)
  rotation_interval_minutes int,
  CONSTRAINT chk_table_bet_range CHECK (min_bet <= max_bet)
);

-- System fallback defaults when game_settings not configured
-- min_bet: 25, max_bet: 10000
```

---

## Appendix B: Implementation Plan

### WS1: Backend Service Layer (P0)

**Files to modify:**
- `services/table-context/dtos.ts` — Add `TableSettingsDTO`, `UpdateTableLimitsDTO`
- `services/table-context/schemas.ts` — Add `updateTableLimitsSchema`
- `services/table-context/crud.ts` — Add `getTableSettings`, `updateTableLimits`
- `services/table-context/index.ts` — Export new interface methods
- `services/table-context/keys.ts` — Add `settings` query key
- `services/table-context/http.ts` — Add `fetchTableSettings`, `patchTableLimits`

**Tasks:**
- [ ] Add `TableSettingsDTO` using Pick from database types
- [ ] Add `UpdateTableLimitsDTO` with required min_bet/max_bet (not optional)
- [ ] Add Zod schema with refine for min ≤ max validation (no nulls allowed)
- [ ] Implement `getTableSettings` CRUD function with auto-create from `game_settings` defaults
- [ ] Implement `getGameSettingsDefaults(casinoId, gameType)` helper to fetch defaults
- [ ] Implement `updateTableLimits` with upsert logic
- [ ] Add mapper function `toTableSettingsDTO`
- [ ] Export from service interface

### WS2: API Route Handler (P0)

**Files to create:**
- `app/api/v1/tables/[tableId]/settings/route.ts`

**Tasks:**
- [ ] Implement GET handler with RLS context
- [ ] Implement PATCH handler with idempotency
- [ ] Add request validation using Zod schema
- [ ] Return ServiceHttpResult response format

### WS3: Frontend React Query (P0)

**Files to create:**
- `hooks/table-context/use-table-settings.ts`

**Tasks:**
- [ ] Create `useTableSettings` query hook
- [ ] Create `useUpdateTableLimits` mutation hook
- [ ] Configure cache invalidation on success

### WS4: Frontend UI Components (P0)

**Files to create:**
- `components/table/table-limits-dialog.tsx`

**Files to modify:**
- `components/table/table-layout-terminal.tsx`

**Tasks:**
- [ ] Add `minBet`, `maxBet`, `onEditLimits` props to TableLayoutTerminal
- [ ] Add limits display badge in header section
- [ ] Create TableLimitsDialog with form inputs
- [ ] Add increment quick-buttons (+25, +100, +500)
- [ ] Add validation error display
- [ ] Add loading/success/error states with toast

---

## Appendix C: Error Codes

Per ERROR_TAXONOMY:

**TableContext Domain**
- `VALIDATION_ERROR` (400) — min_bet > max_bet or negative values
- `TABLE_NOT_FOUND` (404) — Invalid table_id
- `FORBIDDEN` (403) — Casino scope mismatch

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-21 | Claude | Initial draft |
| 1.1.0 | 2025-12-21 | Claude | Null limits not allowed; defaults from game_settings |
