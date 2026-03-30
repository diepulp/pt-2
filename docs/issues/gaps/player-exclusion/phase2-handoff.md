---
name: Phase 2 Handoff — Player Exclusion + Dual-Boundary Finalization
description: Handoff context for completing player exclusion UI surface (P2K-26), wiring exclusion safety signal (Slice 2), and closing the dual-boundary/exclusion dependency gap
type: project
---

# Phase 2 Handoff — Player Exclusion + Dual-Boundary Finalization

**Date**: 2026-03-19
**Produced by**: Investigation + merge session
**Main HEAD**: `a73fbd2`

## Critical Discovery

PR #25 (`f12ae75`) merged the **entire** `feat/dual-bondary-tenancy` branch to main — not just Phase 1, but also **Phase 2 Slice 1** (PRD-051). The subsequent PR #27 cherry-pick of Phase 1 was redundant but harmless.

**Everything is on main now:**
- Phase 1: `casino.company_id` NOT NULL, `RLSContext.companyId`, fail-closed derivation
- Phase 2 Slice 1: Recognition RPCs, company-scoped RLS, activation, redemption
- Exclusion backend: `player_exclusion` table, RLS, enforcement RPC, service layer, API routes

## What's on Main (Verified 2026-03-19)

### Dual-Boundary Tenancy (Complete)
- Migration: `20260312155427_adr043_company_foundation.sql` (Phase 1)
- Migration: `20260313190519_prd051_company_scoped_recognition.sql` (Phase 2 Slice 1)
- `services/recognition/` — full service layer (crud, dtos, http, mappers, schemas, keys, tests)
- API routes: `app/api/v1/players/lookup-company/`, `activate-locally/`, `redeem-loyalty/`
- RPCs: `rpc_lookup_player_company`, `rpc_activate_player_locally`, `rpc_redeem_loyalty_locally`

### Player Exclusion Backend (Complete)
- `player_exclusion` table + RLS + indexes
- Enforcement RPC: `rpc_get_player_exclusion_status()`
- Visit enforcement: `rpc_start_or_resume_visit` checks exclusion status
- Service: `services/player/exclusion-*.ts` (schemas, dtos, mappers, crud, http)
- API: GET/POST exclusions, GET active, POST lift

### Exclusion Safety Signal (STUBBED)
- `rpc_lookup_player_company` returns `has_sister_exclusions` and `max_exclusion_severity` columns
- **Both are hardcoded to NULL** — not yet wired to actual `player_exclusion` data
- This is Phase 2 Slice 2

## Remaining Work (3 Tracks)

### Track A: Player Exclusion UI Surface (P2K-26) — 8 Gaps
**Jira**: P2K-26 (To Do)
**Spec**: `docs/issues/gaps/GAP-PLAYER-EXCLUSION-UI-SURFACE.md`
**No dependency on dual-boundary.**

**Phase 1 — Wire (P0):**
- GAP-6: Status API route handler (`GET /api/v1/players/[playerId]/exclusions/status`)
- GAP-7: React Query hooks (`useExclusionStatus`, `useExclusions`, `useActiveExclusions`, mutations)
- GAP-3: Fix `NewSlipModal` — it receives `exclusionWarning` from visit-start but never displays it

**Phase 2 — Display (P0):**
- GAP-1: Exclusion status badge in Player 360 header (red/amber/blue by severity)
- GAP-2: Exclusion panel in Player 360 right rail (Compliance tab)

**Phase 3 — CRUD (P1):**
- GAP-4: Create exclusion dialog (pit_boss/admin gated)
- GAP-5: Lift exclusion dialog (admin only, confirmation flow)

**Phase 4 — History (P2):**
- GAP-8: Exclusion history sheet panel

### Track B: Exclusion Safety Signal (Phase 2 Slice 2)
**Spec**: `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md`
**Depends on**: Exclusion backend (already on main)

Wire the `has_sister_exclusions` + `max_exclusion_severity` fields in `rpc_lookup_player_company`:
- SECURITY DEFINER scalar extraction from `player_exclusion` across company boundary
- Query: active exclusions at sister properties (same company, different casino_id)
- Return boolean + highest severity enum
- UI: Warning banner when recognizing player with sister-property exclusions (State B2)
- Activation block/escalation for excluded players

### Track C: GAP Doc ADR Decisions (Post-MVP)
**Spec**: `docs/issues/gaps/GAP-PLAYER-EXCLUSION-WATCHLIST.md` §10

5 decisions deferred to ADR:
1. Company-scope strategy — resolved by Phase 2 scalar extraction pattern
2. Enforcement layer split (DB vs app) — currently hybrid, needs formal freeze
3. Canonical active predicate — implemented but not formalized as reusable SQL fragment
4. Lift authority variation by exclusion type — MVP is admin-only
5. Auto-expiry vs manual review policy

## Worktree State

| Worktree | Branch | Status |
|----------|--------|--------|
| `.` (root) | `main` @ `a73fbd2` | Primary |
| `trees/admin-catalog` | `admin-catalog-vector-b` | Live work |
| `trees/feat/dual-bondary-tenancy` | `feat/dual-bondary-tenancy` | Fully merged — can be removed when ready |

## Recommended Execution Order

1. **Track A Phase 1 (Wire)** — GAP-6, GAP-7, GAP-3 — unblocks all UI work
2. **Track B (Exclusion Safety Signal)** — wire the NULLs in recognition RPC
3. **Track A Phase 2-4 (Display, CRUD, History)** — builds on Track A Phase 1
4. **Track C** — formalize ADR decisions after operational feedback

## Kanban Board Context

- **P2K-26**: Player Exclusion UI Surface — To Do (8 gaps)
- **P2K-22**: PRD-050 Dual-Boundary Phase 1 — Done
- **P2K-23/24/25**: Phase 1 workstreams — Done
- Exclusion safety signal has no Jira ticket yet — create when starting Track B
