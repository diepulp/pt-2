---
title: "Comp/Reward Visit Wiring Patch"
doc_kind: "patch"
version: "v0.1"
date: "2026-02-05"
status: "proposed"
applies_to:
  - "GAP-UNRATED-VISIT-UI.md"
companion_to:
  - "GHOST-GAMING-WIRING-PATCH.md"
owner: "PT-2"
tags:
  - reward-visit
  - comp-only
  - visit-conversion
  - minimal-api-surface
---

# Goal

Wire the existing `reward_identified` visit backend (service CRUD, DTOs, Zod schemas) through API routes, HTTP client fetchers, and UI flows so that pit operators can:

1. **Start a comp-only visit** for an identified player (no gaming, redemption only).
2. **Convert a comp visit to rated gaming** when the player decides to sit down and play.

This patch is the **companion** to `GHOST-GAMING-WIRING-PATCH.md`, which covers ghost-to-rated flows. Together the two patches close all seven GAPs in `GAP-UNRATED-VISIT-UI.md`.

# Scope boundary

| In scope (this patch) | Out of scope (ghost patch or deferred) |
|-----------------------|----------------------------------------|
| GAP-2: Reward visit API route | GAP-1: Ghost visit API route |
| GAP-3: Comp-to-gaming conversion API route | GAP-4: Ghost-to-rated conversion |
| GAP-5: "Comp" branch of 3-way Start Session modal | GAP-5: "Unrated" branch of Start Session modal |
| GAP-6: "Seat at Table" action on COMP rows in Activity Panel | GAP-6: "Identify & Enroll" action on UNRATED rows |
| HTTP fetchers for reward creation + conversion | HTTP fetchers for ghost creation + conversion |
| Audit log entries for comp start + conversion | Audit log for ghost start + conversion |

GAP-7 (toolbar rename) and shared UI scaffolding (3-way selector, visit-type badges) are split work owned by whichever patch lands first; the second patch extends what exists.

# Current system state (verified 2026-02-05)

## What EXISTS

| Artifact | Location | Status |
|----------|----------|--------|
| `createRewardVisit()` | `services/visit/crud.ts:292-335` | Functional. Inserts `visit_kind = 'reward_identified'`. Idempotent (returns existing active visit). |
| `convertRewardToGaming()` | `services/visit/crud.ts:412-465` | Functional. Validates visit is active + `reward_identified`, updates to `gaming_identified_rated`. Handles concurrent close. |
| `CreateRewardVisitDTO` | `services/visit/dtos.ts:77` | `Pick<VisitInsert, 'player_id'>` |
| `ConvertRewardToGamingDTO` | `services/visit/dtos.ts:114-117` | `{ visit_id: string }` |
| `createRewardVisitSchema` | `services/visit/schemas.ts:53-56` | `z.object({ player_id: uuidSchema })` |
| `convertRewardToGamingSchema` | `services/visit/schemas.ts:104-107` | `z.object({ visit_id: uuidSchema })` |
| `VisitServiceInterface` | `services/visit/index.ts:101,135` | Both methods on interface + factory wiring |
| DB CHECK constraint | Migration `20251205032602` | `chk_visit_kind_player_presence`: reward visits require `player_id IS NOT NULL` |

## What is MISSING

| Artifact | Status |
|----------|--------|
| `POST /api/v1/visits/reward` route | Not created |
| `POST /api/v1/visits/{visitId}/convert-to-gaming` route | Not created |
| HTTP fetcher `createRewardVisit()` in `services/visit/http.ts` | Not created |
| HTTP fetcher `convertRewardToGaming()` in `services/visit/http.ts` | Not created |
| "Comp" branch in Start Session modal | Not created (modal is rated-only) |
| "Seat at Table" action in Activity Panel | Not created (panel has no visit_kind awareness) |
| Audit log entries for comp start / conversion | Not created |

# Proposed changes

## 1. API routes

### 1a. Create reward visit

```
POST /api/v1/visits/reward
Body: { "player_id": "<uuid>" }
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

Route handler pattern:
1. Parse body with `createRewardVisitSchema`.
2. Derive `casino_id` from RLS context (ADR-024). MUST NOT accept from client.
3. Call `visitService.createRewardVisit(playerId, casinoId)`.
4. Write `audit_log` entry: `domain = 'visit'`, `action = 'reward_visit_started'`.
5. Return `{ visit }` with `201 Created` (new) or `200 OK` (idempotent existing).

File: `app/api/v1/visits/reward/route.ts`

### 1b. Convert reward to gaming

```
POST /api/v1/visits/{visitId}/convert-to-gaming
Body: {} (empty - visit already has player_id)
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

Route handler pattern:
1. Parse route param `visitId` with `visitRouteParamsSchema`.
2. Derive context from RLS (ADR-024).
3. Call `visitService.convertRewardToGaming(visitId)`.
4. Write `audit_log` entry: `domain = 'visit'`, `action = 'reward_converted_to_gaming'`, `details = { visit_id, player_id }`.
5. Return `{ visit }` with `200 OK`.

File: `app/api/v1/visits/[visitId]/convert-to-gaming/route.ts`

## 2. HTTP client fetchers

Add to `services/visit/http.ts`:

```ts
/** Create a reward-only visit (comp, voucher, customer care). */
export async function createRewardVisit(
  playerId: string,
): Promise<VisitDTO> { ... }

/** Convert a reward visit to gaming (player decides to play). */
export async function convertRewardToGaming(
  visitId: string,
): Promise<VisitDTO> { ... }
```

Both follow existing patterns in `http.ts`: `fetchJSON`, `IDEMPOTENCY_HEADER`, `content-type: application/json`.

## 3. Audit log entries

Write `audit_log` rows for:

| Event | `domain` | `action` | `details` (JSONB) |
|-------|----------|----------|-------------------|
| Comp visit started | `visit` | `reward_visit_started` | `{ visit_id, player_id }` |
| Comp converted to gaming | `visit` | `reward_converted_to_gaming` | `{ visit_id, player_id, converted_at }` |

The `audit_log` table schema (`audit_log.action`, `audit_log.domain`, `audit_log.details`) supports this without migration.

Implementation: insert `audit_log` row in the route handler after the service call succeeds, using the same Supabase client (same RLS context / transaction scope).

## 4. Frontend: Start Session modal (comp branch)

Modify `components/dashboard/new-slip-modal.tsx`:

The 3-way selector scaffolding (Rated / Unrated / Comp toggle) is **shared work** between this patch and the ghost patch. Whichever lands first creates the selector; the other extends it.

### Comp flow behavior

| Element | Behavior |
|---------|----------|
| Player search | **Required** (same as rated) |
| Table selector | **Hidden** (comp visits have no table context) |
| Seat selector | **Hidden** (no gaming, no seat) |
| Notes field | **Hidden** (not needed for comp) |
| Submit action | Call `createRewardVisit(playerId)` |
| Success toast | "Comp session started for {playerName}" |

### Form state by selection

| Selection | Player Search | Table Required | Seat Required | Submit calls |
|-----------|---------------|----------------|---------------|-------------|
| Rated | Required | Yes | Yes | `startVisit()` then `startRatingSlip()` |
| Unrated (Ghost) | Hidden | Yes | No | `createGhostGamingVisit()` *(ghost patch)* |
| Comp Only | Required | No | No | `createRewardVisit()` |

## 5. Frontend: Activity Panel (comp actions)

### Prerequisite: visit_kind in panel data

The `useCasinoActivePlayers` hook currently returns slip-level data without `visit_kind`. The Activity Panel needs `visit_kind` to render badges and determine available actions.

Options (in order of preference):
1. **Extend the existing dashboard RPC** to include `visit_kind` in its response (minimal change).
2. Join `visit.visit_kind` in the hook's query.

### Visit-type badges

| Visit Kind | Badge | Color |
|------------|-------|-------|
| `gaming_identified_rated` | RATED | Green (`emerald-500`) |
| `gaming_ghost_unrated` | UNRATED | Amber (`amber-500`) |
| `reward_identified` | COMP | Blue (`blue-500`) |

Badge placement: inline after player name in the Name column.

### COMP row action: "Seat at Table"

For rows with `visit_kind = 'reward_identified'`:

1. Show action button/menu item: **"Seat at Table"**
2. On click: open a mini-modal or inline form to select table + seat.
3. On submit:
   a. Call `convertRewardToGaming(visitId)` to flip visit kind.
   b. Call `startRatingSlip({ visit_id, table_id, seat_number })` to create first slip.
4. On success: row transitions to RATED badge, normal slip behavior.

This is a two-step operation (convert + create slip) that should be presented to the operator as a single action.

# Conversion invariants

These mirror the ghost patch invariants adapted for comp-to-gaming:

- MUST preserve the **same `visit_id`** (no close/reopen).
- MUST write an **`audit_log`** entry on comp start and on conversion.
- MUST validate visit is **active** and **`reward_identified`** before conversion.
- MUST derive casino/actor context via **RLS/session context**; MUST NOT accept client-supplied `casino_id`.
- MUST be **idempotent**: converting an already-converted visit (now `gaming_identified_rated`, same `player_id`) should succeed silently or return the current state.

Note: `convertRewardToGaming()` in `crud.ts:430` currently **rejects** if visit_kind is not `reward_identified`. This means converting an already-converted visit throws `VISIT_INVALID_CONVERSION`. This is acceptable (strict mode) but the route handler should catch this and return `200 OK` with the current visit state for idempotency at the HTTP level.

# Behavioral rules

## Loyalty accrual

- Comp visits (`reward_identified`) earn **no loyalty points** (no gaming).
- After conversion to `gaming_identified_rated`, loyalty accrual begins from the **conversion timestamp forward** (same rule as ghost-to-rated in the companion patch).
- Pre-conversion comp activity (rewards redeemed) is not retroactively scored.

## Reward redemption continuity

- Rewards redeemed during the comp phase of the visit **remain valid** after conversion.
- The visit_id is preserved, so all reward transactions linked to the visit carry over.

# Gotchas / validations

1. **Idempotency gap in `createRewardVisit()`**: The service method returns any existing active visit regardless of `visit_kind`. If a player already has an active `gaming_identified_rated` visit and the operator tries to start a comp visit, the gaming visit is returned silently. This is correct behavior (prevents duplicate visits) but the UI should show a warning: "Player already has an active gaming session."

2. **No table/seat on comp creation**: The comp flow deliberately skips table and seat selection. The table association only happens at conversion time via the "Seat at Table" action. The Activity Panel must handle rows without table/seat data gracefully (show "---" or "Lobby").

3. **Two-step "Seat at Table" operation**: The convert + create-slip sequence is not atomic. If conversion succeeds but slip creation fails, the visit is now `gaming_identified_rated` without a slip. The UI must handle this gracefully and allow retrying the slip creation separately.

# Implementation checklist

## Backend (Phase 1)

- [ ] Create `app/api/v1/visits/reward/route.ts` (POST handler)
- [ ] Create `app/api/v1/visits/[visitId]/convert-to-gaming/route.ts` (POST handler)
- [ ] Add `audit_log` writes in both route handlers
- [ ] Add idempotency wrapper in convert-to-gaming route (catch `VISIT_INVALID_CONVERSION`, return current visit)

## HTTP Client (Phase 2)

- [ ] Add `createRewardVisit(playerId)` to `services/visit/http.ts`
- [ ] Add `convertRewardToGaming(visitId)` to `services/visit/http.ts`

## Frontend (Phase 3)

- [ ] Add 3-way selector to Start Session modal (shared with ghost patch)
- [ ] Implement "Comp Only" branch: player search, no table/seat, calls `createRewardVisit()`
- [ ] Extend `useCasinoActivePlayers` hook or backing RPC to include `visit_kind`
- [ ] Add visit-type badges (RATED / UNRATED / COMP) to Activity Panel
- [ ] Add "Seat at Table" row action on COMP rows: table/seat selection + `convertRewardToGaming()` + `startRatingSlip()`
- [ ] Handle "already has active session" warning in comp creation flow

## Tests

- [ ] e2e: start comp visit -> verify `visit_kind = 'reward_identified'`, no table association
- [ ] e2e: "Seat at Table" -> convert + create slip -> verify `visit_kind = 'gaming_identified_rated'`, slip exists
- [ ] negative: convert already-gaming visit -> idempotent 200 OK (route-level)
- [ ] negative: start comp for player with existing active visit -> returns existing visit + UI warning
- [ ] audit: verify `audit_log` entries for comp start and conversion

# Dependency on ghost patch

The following artifacts are **shared** between this patch and the ghost patch. Implementation order determines who creates vs extends:

| Shared artifact | First-mover creates | Second-mover extends |
|----------------|--------------------|--------------------|
| 3-way selector component in Start Session modal | Selector with 3 options + routing logic | Already exists, add branch-specific behavior |
| Visit-type badges in Activity Panel | Badge component + `visit_kind` data pipeline | Already exists, badges render automatically |
| `visit_kind` in `useCasinoActivePlayers` data | RPC/query extension | Already available |
| Toolbar button rename ("Start Session") | Rename | No change needed |

**Recommended order**: Land either patch first (both are self-contained at the backend level). For frontend, the ghost patch is the harder UI lift (hiding player search, handling null player); landing comp first provides simpler scaffolding that the ghost patch can extend.

# Non-goals (explicitly deferred)

- Reward-specific DTOs beyond visit creation (loyalty redemption records, comp tracking)
- "Downgrade" from gaming to comp (closing gaming visit and opening comp)
- Batch comp operations (multiple players at once)
- Comp visit duration limits or auto-close policies
- Comp-specific reporting or analytics views

# Related documents

- **GAP-UNRATED-VISIT-UI.md** - Parent gap analysis (GAP-2, GAP-3, GAP-5 comp, GAP-6 comp)
- **GHOST-GAMING-WIRING-PATCH.md** - Companion patch for ghost/unrated flows
- **ADR-014** - Ghost Gaming Visits and Non-Loyalty Play Handling
- **ADR-024** - Authoritative Context Derivation (casino_id from RLS)
- **ADR-026** - Gaming-day-scoped visits
- **EXEC-VSE-001** - Visit Service Evolution (WS-2 DTOs, WS-3 typed creation)
