# GAP: Player Exclusion UI Surface

**Status**: Investigation Complete
**Date**: 2026-03-14
**Foundation Commit**: `836f0ec9` (Merge PR #23 — `player-exclusion` branch)
**EXEC-050**: All 7 workstreams delivered (WS1–WS7)
**ADR-042**: Player Exclusion Architecture — Property-Scoped MVP

---

## 1. Problem Statement

Commit `836f0ec9` delivered the complete **backend foundation** for player exclusion: database schema, RLS policies, service layer, API route handlers, enforcement RPCs, and tests. However, **zero UI surface** exists. Staff cannot create, view, or lift exclusions through the application. The visit-start enforcement (hard_block rejection, soft_alert warning) functions at the database layer but the `exclusionWarning` field returned by `rpc_start_or_resume_visit` is **silently dropped** by the `NewSlipModal` component.

---

## 2. What Exists (Backend Foundation Inventory)

### Database Layer
| Artifact | Migration | Purpose |
|----------|-----------|---------|
| `player_exclusion` table | `20260310003435` | 15-column schema with immutability trigger |
| RLS policies | `20260310003709` | Pattern C SELECT, session-var INSERT/UPDATE, DELETE denied |
| Enforcement RPC | `20260310004409` | `rpc_get_player_exclusion_status()` + visit-start integration |
| Helper functions | `20260310003435` | `is_exclusion_active()`, `get_player_exclusion_status()` |

### Service Layer (`services/player/exclusion-*.ts`)
| File | Contents |
|------|----------|
| `exclusion-dtos.ts` | `PlayerExclusionDTO`, `CreateExclusionInput`, `LiftExclusionInput`, `ExclusionStatusDTO` |
| `exclusion-schemas.ts` | Zod validators for create, lift, route params |
| `exclusion-mappers.ts` | Row → DTO transformations |
| `exclusion-selects.ts` | Column projection constants |
| `exclusion-keys.ts` | React Query key factory (`exclusionKeys.root/list/active/detail/status`) |
| `exclusion-crud.ts` | CRUD operations (create, lift, list, active, status via RPC) |
| `exclusion-http.ts` | Client-side fetchers (5 functions) |
| `exclusion.ts` | Service factory + interface |

### API Route Handlers
| Endpoint | Method | File |
|----------|--------|------|
| `/api/v1/players/[playerId]/exclusions` | GET, POST | `app/api/v1/players/[playerId]/exclusions/route.ts` |
| `/api/v1/players/[playerId]/exclusions/active` | GET | `.../exclusions/active/route.ts` |
| `/api/v1/players/[playerId]/exclusions/[exclusionId]/lift` | POST | `.../exclusions/[exclusionId]/lift/route.ts` |

### Cross-Context Enforcement
- `rpc_start_or_resume_visit` → Step 2.5 checks exclusion status
- `hard_block` → RAISE EXCEPTION (non-bypassable)
- `soft_alert` → Returns `exclusion_warning` text
- `monitor` → Returns null (no warning)
- Visit DTO: `StartVisitResultDTO.exclusionWarning: string | null`

### Tests
- Schema validation tests (`exclusion-schemas.test.ts`)
- Mapper unit tests (`exclusion-mappers.test.ts`)
- HTTP contract tests (`exclusion-http-contract.test.ts`)

---

## 3. What's Missing (UI Gap Analysis)

### GAP-1: Exclusion Status Badge in Player 360 Header (P0)

**Location**: `components/player-360/header/player-360-header-content.tsx`

The header shows enrollment status badge but has **no exclusion status indicator**. A player with an active `hard_block` or `soft_alert` exclusion appears identical to a clear player.

**Requirement**: Fetch `getExclusionStatus(playerId)` and render a status badge next to the enrollment badge. Color mapping:
- `blocked` → red/destructive (`bg-red-500/10 text-red-400 border-red-500/30`)
- `alert` → amber/warning (`bg-amber-500/10 text-amber-400 border-amber-500/30`)
- `watchlist` → blue/info (`bg-blue-500/10 text-blue-400 border-blue-500/30`)
- `clear` → no badge (don't clutter)

**Dependency**: GAP-6 (status route handler must exist first).

### GAP-2: Exclusion Panel in Player 360 Right Rail (P0)

**Location**: `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx`

The right rail has two tabs: Notes (placeholder) and Compliance. There is **no exclusion tab or section**. Active exclusions should be visible when viewing a player.

**Options** (pick one):
- **Option A**: Add "Exclusion" as a third tab in the right rail (alongside Notes, Compliance)
- **Option B**: Embed exclusion status as a section within the Compliance tab (since exclusion is a compliance concern)
- **Option C**: Add exclusion as a collapsible section in the left rail (near filter tiles)

**Recommendation**: Option B — embed within Compliance tab. Exclusion is a compliance obligation. Avoids adding a third tab that increases cognitive load. Follows the pattern of `CompliancePanel` with `CtrProgressTile` + `MtlSummary`.

**Contents**:
- Collapsed status tile (blocked/alert/watchlist/clear) with enforcement level
- List of active exclusions (type, enforcement, effective dates, reason preview)
- "View History" button → full exclusion history
- "Add Exclusion" button → create dialog (role-gated: pit_boss/admin)

### GAP-3: Exclusion Warning in Visit Start Flow (P0)

**Location**: `components/dashboard/new-slip-modal.tsx:209-218`

The `startVisit()` call returns `visitResult.exclusionWarning` but the component **never reads or displays it**. When a `soft_alert` player starts a visit, the warning is silently swallowed.

**Fix**: After the `visitResult.resumed` toast block (line 218), add:
```typescript
if (visitResult.exclusionWarning) {
  toast.warning('Exclusion Alert', {
    description: visitResult.exclusionWarning,
    icon: <AlertTriangle className="h-4 w-4" />,
    duration: 10_000, // Long duration for compliance visibility
  });
}
```

**Hard block handling**: When `startVisit()` throws (hard_block RAISE EXCEPTION), the catch block at line 246 handles it generically. Should detect exclusion-specific errors and show a distinct UI:
```typescript
if (isFetchError(err) && err.code === 'PLAYER_EXCLUDED') {
  setError('This player has an active exclusion and cannot be seated.');
  return;
}
```

### GAP-4: Create Exclusion Dialog (P1)

**No component exists.**

**Requirement**: Dialog form for creating an exclusion, triggered from the Player 360 view.

**Form fields** (from `createExclusionSchema`):
- `exclusion_type` — Select: self_exclusion, trespass, regulatory, internal_ban, watchlist
- `enforcement` — Select: hard_block, soft_alert, monitor
- `effective_from` — Date picker (defaults to now)
- `effective_until` — Optional date picker (null = indefinite)
- `reason` — Textarea (1–1000 chars, required)
- `review_date` — Optional date picker
- `jurisdiction` — Optional text (1–100 chars)
- `external_ref` — Optional text (1–200 chars)

**Role gate**: Only `pit_boss` and `admin` can create (enforced by RLS INSERT policy). UI should hide the button for `dealer` role.

**Pattern**: Follow `PlayerEditModal` pattern — Dialog with React Hook Form + Zod resolver.

**Mutation**: Call `createExclusion(playerId, input)` from `exclusion-http.ts`. Invalidate `exclusionKeys.list(playerId)`, `exclusionKeys.active(playerId)`, `exclusionKeys.status(playerId)`.

### GAP-5: Lift Exclusion Dialog (P1)

**No component exists.**

**Requirement**: Confirmation dialog for lifting (soft-deleting) an exclusion. Admin-only per ADR-042 D5.

**Form fields** (from `liftExclusionSchema`):
- `lift_reason` — Textarea (1–1000 chars, required)

**Role gate**: Only `admin` can lift (enforced by RLS UPDATE policy). Button hidden for non-admin.

**Mutation**: Call `liftExclusion(playerId, exclusionId, input)`. Invalidate same keys as GAP-4.

### GAP-6: Exclusion Status API Route (P0)

**Location**: `services/player/exclusion-http.ts:83-87`

The `getExclusionStatus()` HTTP fetcher calls `GET /api/v1/players/[playerId]/exclusions/status` but **no route handler exists** for this endpoint. The HTTP contract test (`exclusion-http-contract.test.ts`) flags this as "route not yet implemented."

**Fix**: Create `app/api/v1/players/[playerId]/exclusions/status/route.ts` — GET handler that calls `exclusionService.getExclusionStatus(playerId)`.

### GAP-7: Exclusion React Query Hooks (P1)

**No hooks exist in `hooks/player/` for exclusion.**

Required hooks:
- `useExclusionStatus(playerId)` — Fetches collapsed status (blocked/alert/watchlist/clear)
- `useExclusions(playerId)` — Fetches full exclusion list
- `useActiveExclusions(playerId)` — Fetches active exclusions only
- `useCreateExclusion()` — Mutation hook
- `useLiftExclusion()` — Mutation hook

**Pattern**: Follow `hooks/player/use-player.ts` — TanStack Query with key factory from `exclusion-keys.ts`.

### GAP-8: Exclusion History View (P2)

**No dedicated view exists.**

When a user clicks "View History" from the exclusion panel, there's nowhere to go. Options:
- **Option A**: Sheet/slide-over panel with full exclusion table (follows collaboration panel pattern)
- **Option B**: Full-page route (`/players/[playerId]/exclusions`)
- **Option C**: Expandable section within the compliance panel

**Recommendation**: Option A — Sheet panel. Consistent with the Player 360 single-page philosophy. Shows all exclusions (active + lifted) in a table with columns: Type, Enforcement, Status (Active/Lifted), Effective From, Effective Until, Reason, Created By, Created At.

---

## 4. Exclusion Warning Gap in NewSlipModal (Detail)

The visit-start flow in `new-slip-modal.tsx` has two code paths:

### Path A: Active visit exists (line 199–207)
```typescript
const activeVisitResponse = await getActiveVisit(selectedPlayer.id);
if (activeVisitResponse.has_active_visit && activeVisitResponse.visit) {
  visitId = activeVisitResponse.visit.id;
}
```
**Gap**: No exclusion check at all. If a player has an existing visit from earlier in the gaming day and a `hard_block` exclusion was added after the visit started, the player can still get a new rating slip. The `getActiveVisit` path bypasses the exclusion enforcement entirely.

**Mitigation**: This is a **known design decision** per ADR-042 D2 — enforcement happens at visit creation, not rating slip creation. However, a supplementary check could be added: fetch `getExclusionStatus(playerId)` when an active visit exists and warn/block accordingly.

### Path B: No active visit → startVisit (line 208–228)
```typescript
const visitResult = await startVisit(selectedPlayer.id);
// exclusionWarning available but NEVER consumed
```
**Gap**: `visitResult.exclusionWarning` is available but ignored. Fix described in GAP-3.

---

## 5. Implementation Priority & Dependencies

```
P0 (Must-have for operational safety):
  GAP-6  Status route handler          → no UI dependencies
  GAP-3  Visit-start warning display   → no dependencies
  GAP-1  Header status badge           → depends on GAP-6, GAP-7

P1 (Core CRUD surfaces):
  GAP-7  React Query hooks             → depends on GAP-6
  GAP-2  Right rail exclusion panel    → depends on GAP-7
  GAP-4  Create exclusion dialog       → depends on GAP-7
  GAP-5  Lift exclusion dialog         → depends on GAP-7

P2 (History & polish):
  GAP-8  Exclusion history sheet       → depends on GAP-7
```

### Suggested Build Order

```
Phase 1 — Wire (3 items, no UI):
  1. GAP-6: Create status route handler
  2. GAP-7: Create exclusion hooks
  3. GAP-3: Fix exclusionWarning consumption in NewSlipModal

Phase 2 — Display (2 items):
  4. GAP-1: Header exclusion status badge
  5. GAP-2: Compliance panel exclusion section

Phase 3 — CRUD (2 items):
  6. GAP-4: Create exclusion dialog
  7. GAP-5: Lift exclusion dialog

Phase 4 — History (1 item):
  8. GAP-8: Exclusion history sheet
```

---

## 6. UI Pattern Alignment

All UI surfaces should follow established Player 360 patterns:

| Pattern | Source | Reuse For |
|---------|--------|-----------|
| Badge variants | `player-360-header-content.tsx` (enrollment badge) | Exclusion status badge |
| Panel + PanelHeader | `components/player-360/layout.tsx` | Exclusion panel in right rail |
| CompliancePanel | `components/player-360/compliance/panel.tsx` | Embed exclusion tiles |
| Dialog form | `components/player-dashboard/player-edit-modal.tsx` | Create/Lift dialogs |
| Toast notifications | `sonner` (`toast.warning`, `toast.error`) | Exclusion warnings |
| Table rows | `components/ui/table.tsx` | Exclusion history list |
| Sheet | `components/ui/sheet.tsx` | History slide-over |

---

## 7. Security & Role Considerations

| Action | Minimum Role | Enforcement Layer |
|--------|-------------|-------------------|
| View exclusion status | Any authenticated | RLS SELECT (Pattern C hybrid) |
| View exclusion list | Any authenticated | RLS SELECT (Pattern C hybrid) |
| Create exclusion | pit_boss, admin | RLS INSERT policy |
| Lift exclusion | admin only | RLS UPDATE policy |

**UI role gating**: Hide create button for non-pit_boss. Hide lift button for non-admin. Use `useAuth()` hook to check `staff_role`.

**ADR-030 compliance**: `player_exclusion` is a critical table. Write-path RLS uses session-var-only for `casino_id`. The UI never passes casino_id — it's derived server-side via `set_rls_context_from_staff()`.

---

## 8. Estimated Scope

| Phase | Items | New Files | Modified Files |
|-------|-------|-----------|----------------|
| Phase 1 (Wire) | 3 | 2 (route, hooks) | 1 (NewSlipModal) |
| Phase 2 (Display) | 2 | 1 (exclusion section component) | 2 (header, compliance wrapper) |
| Phase 3 (CRUD) | 2 | 2 (create dialog, lift dialog) | 1 (exclusion panel) |
| Phase 4 (History) | 1 | 1 (history sheet) | 1 (exclusion panel) |
| **Total** | **8** | **6** | **5** |
