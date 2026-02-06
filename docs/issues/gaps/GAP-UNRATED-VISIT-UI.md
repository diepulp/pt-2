---
title: "Gap Analysis: Visit Type UI Not Exposed"
doc_id: "GAP-UNRATED-VISIT-UI"
version: "0.5.0"
status: "draft"
date: "2026-02-05"
owner: "VisitService"
implementation_guides:
  ghost_unrated: "GHOST-GAMING-WIRING-PATCH.md"
  comp_reward: "ghost-gaming-comp-wiring/COMP-VISIT-WIRING-PATCH.md"
related_docs:
  - "services/visit/crud.ts"
  - "services/visit/dtos.ts"
  - "services/visit/schemas.ts"
  - "components/dashboard/new-slip-modal.tsx"
  - "components/pit-panels/activity-panel.tsx"
  - "docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md"
---

# Gap Analysis: Visit Type UI Not Exposed

## Executive Summary

The PT-2 system supports three visit types in the database and service layer, but the UI only exposes **rated visits** (`gaming_identified_rated`). The backend methods for all visit types exist and are fully functional, but there are no API endpoints or UI flows to create:

1. **Unrated/Ghost visits** (`gaming_ghost_unrated`) - Anonymous gaming for compliance
2. **Comp-only visits** (`reward_identified`) - Reward redemption without gaming

Additionally, **mid-session identity capture** is needed: when a patron starts as ghost and later agrees to identify, we must attach their identity to the existing visit without closing/reopening.

### Business Impact

- **Compliance Risk**: Cannot track anonymous gaming sessions for CTR/MTL reporting
- **Revenue Loss**: Cannot serve walk-up patrons wanting comps without forcing gaming session creation
- **Workflow Friction**: No way to convert a ghost or comp patron to rated without closing and reopening visits

---

## Implementation Guides

**Ghost/Unrated flows (GAP-1, GAP-4, GAP-5 unrated, GAP-6 unrated):**
See `GHOST-GAMING-WIRING-PATCH.md`

**Comp/Reward flows (GAP-2, GAP-3, GAP-5 comp, GAP-6 comp):**
See `ghost-gaming-comp-wiring/COMP-VISIT-WIRING-PATCH.md`

### Core Principle

**Ghost is a visit state, not a player record.**

- Start play as ghost visit (`visit_kind = gaming_ghost_unrated`, `visit.player_id = NULL`)
- If patron later identifies: attach **normal identified player** to existing visit
- No "ghost player" records (nullable names) - explicitly deferred

This preserves session continuity and avoids schema/RPC/validation cascades.

---

## Visit Types

| Visit Kind | Player Required | Gaming | Loyalty | Use Case |
|------------|-----------------|--------|---------|----------|
| `gaming_identified_rated` | Yes | Yes | Accrual | Standard rated play |
| `gaming_ghost_unrated` | No | Yes | None | CTR/MTL compliance when player declines ID |
| `reward_identified` | Yes | No | Redemption | Comps, vouchers, meal rewards |

---

## Implementation Status

| Layer | Rated | Ghost | Comp | Comp→Rated | Ghost→Rated |
|-------|-------|-------|------|------------|-------------|
| **Database** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Service CRUD** | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| **Service HTTP** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **API Route** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Zod Schema** | ✅ | ✅ | ✅ | ✅ | ❌ Missing |
| **UI Modal** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Activity Panel** | N/A | ❌ | ❌ | ❌ | ❌ |

---

## Gaps to Address

### GAP-1: Ghost Visit API (HIGH)

```
POST /api/v1/visits/ghost
Body: { table_id: string, notes?: string }
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

### GAP-2: Reward Visit API (HIGH)

```
POST /api/v1/visits/reward
Body: { player_id: string }
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

### GAP-3: Comp→Rated Conversion API (HIGH)

```
POST /api/v1/visits/{visitId}/convert-to-gaming
Body: {}
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

### GAP-4: Ghost→Rated Conversion API (HIGH)

```
POST /api/v1/visits/{visitId}/convert-ghost-to-rated
Body: { player_id: string }
Response: ServiceHttpResult<{ visit: VisitDTO }>
```

Service method: `convertGhostToRated(visit_id, player_id)`
- Validates visit is active and `gaming_ghost_unrated`
- Updates `player_id` AND `visit_kind` atomically
- Idempotent: same player_id → OK, different player_id → reject

### GAP-5: Start Session Modal (HIGH)

3-way selector: **Rated / Unrated / Comp**

| Selection | Player Search | Table Required | Notes Field |
|-----------|---------------|----------------|-------------|
| Rated | Required | Yes | No |
| Unrated (Ghost) | Hidden | Yes | Optional ("refused ID") |
| Comp Only | Required | No | No |

**Note:** Seat is captured on first `rating_slip`, not on `visit` (per patch).

### GAP-6: Activity Panel Enhancement (MEDIUM)

Visit type badges: RATED (green) / UNRATED (amber) / COMP (blue)

Row actions by type:
- **UNRATED**: "Identify & Enroll..." → opens enrollment modal → calls `convertGhostToRated()`
- **COMP**: "Seat at Table" → calls `convertRewardToGaming()` → creates slip

### GAP-7: Toolbar Button Rename (LOW)

"New Rating Slip" → "Start Session"

---

## Behavioral Rules (from patch)

### Loyalty Accrual Boundary

**Accrue loyalty only from conversion timestamp forward.**

Pre-conversion ghost segment is explicitly anonymous / not loyalty-eligible.

### Conversion Invariants

- MUST preserve same `visit_id` (no close/reopen)
- MUST write `audit_log` on ghost start and conversion
- MUST reject conversion if already rated to different `player_id`
- MUST derive context via RLS (no client-supplied `casino_id`)
- MUST be idempotent (same player_id → no-op success)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `services/visit/crud.ts` | Edit | Add `convertGhostToRated()` |
| `services/visit/schemas.ts` | Edit | Add `convertGhostToRatedSchema` |
| `services/visit/http.ts` | Edit | Add HTTP fetchers |
| `app/api/v1/visits/ghost/route.ts` | Create | Ghost visit API |
| `app/api/v1/visits/reward/route.ts` | Create | Reward visit API |
| `app/api/v1/visits/[visitId]/convert-to-gaming/route.ts` | Create | Comp→Rated API |
| `app/api/v1/visits/[visitId]/convert-ghost-to-rated/route.ts` | Create | Ghost→Rated API |
| `components/dashboard/new-slip-modal.tsx` | Edit | 3-way selector |
| `components/table/table-toolbar.tsx` | Edit | Rename button |
| `components/pit-panels/activity-panel.tsx` | Edit | Badges + actions |
| `hooks/dashboard/use-casino-active-players.ts` | Edit | Include `visit_kind` |

---

## Acceptance Criteria

### Backend
- [ ] `convertGhostToRated()` service method with idempotency/conflict guards
- [ ] All 4 API routes created
- [ ] All HTTP fetchers created
- [ ] `audit_log` entries on ghost start + conversion

### Frontend
- [ ] Start Session modal with 3-way selector
- [ ] Activity Panel with visit type badges
- [ ] "Identify & Enroll..." action on UNRATED rows
- [ ] "Seat at Table" action on COMP rows

### Testing
- [ ] E2E: start ghost → convert → verify same visit_id, player attached
- [ ] E2E: start comp → convert → verify seat + slip created
- [ ] Negative: convert rated to different player → rejected

---

## Explicitly Deferred (Non-goals)

Per `GHOST-GAMING-WIRING-PATCH.md`:

- Changing `player.first_name/last_name` to nullable
- Introducing `player_kind` / "ghost player" records
- Partial identity capture (nickname-only, etc.)
- Retroactive loyalty accrual for pre-conversion play
- Moving seat persistence onto `visit` (stays on `rating_slip`)

---

## Related ADRs

- **ADR-014:** Ghost Gaming Visits and Non-Loyalty Play Handling
- **ADR-024:** Authoritative Context Derivation (casino_id from RLS)
- **ADR-026:** Gaming-day-scoped visits
- **ADR-030:** Auth Pipeline Hardening (visit is critical table)

---

## Changelog

- **v0.5.0 (2026-02-05)**: Aligned with GHOST-GAMING-WIRING-PATCH v0.2; removed ghost player contingency (explicitly deferred)
- **v0.2.0 (2026-02-05)**: Expanded scope to include comp-only visits, visit conversion, and activity panel
- **v0.1.0 (2026-02-05)**: Initial gap analysis for unrated visits only
