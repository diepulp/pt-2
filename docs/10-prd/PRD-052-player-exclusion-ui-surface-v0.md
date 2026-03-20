---
id: PRD-052
title: Player Exclusion UI Surface
owner: Product
status: Draft
affects: [ADR-042, ADR-041, SEC-001, ARCH-SRM, P2K-26]
created: 2026-03-19
last_review: 2026-03-19
phase: Phase 5 (Compliance Surfaces)
pattern: B
http_boundary: true
---

# PRD-052 — Player Exclusion UI Surface

## 1. Overview

- **Owner:** Product
- **Status:** Draft
- **Jira:** P2K-26
- **Summary:** Wire the complete player exclusion backend (table, RLS, enforcement RPC, service layer, API routes — all on main since `836f0ec9`) to UI surfaces within Player 360. Delivers exclusion status visibility, compliance-panel integration, CRUD dialogs for create/lift workflows, and exclusion-aware visit-start enforcement display. No new database work — this is a status route handler plus client-side wiring and component creation on top of existing `services/player/exclusion-*.ts`.
- **Release boundary:** This PRD ships Phases 1–3 (P0 + P1). Phase 4 (History / P2) is scoped as deferred follow-on work — documented here for continuity but **not required for Done**.

## 2. Problem & Goals

### Problem

Commit `836f0ec9` delivered the full backend foundation for player exclusion: schema, RLS, enforcement RPCs, service layer, and API routes. However, **zero UI surface exists**. Staff cannot create, view, or lift exclusions through the application. A player with an active `hard_block` exclusion appears identical to a clear player in the Player 360 header. The `exclusionWarning` field returned by `rpc_start_or_resume_visit` is silently dropped by `NewSlipModal`. Pit bosses must rely on external systems (paper logs, separate databases) to check exclusion status — defeating the purpose of the database enforcement layer.

### Goals

1. **Exclusion status is visible at a glance** — a status badge in the Player 360 header makes it immediately obvious whether a player is blocked, on alert, on a watchlist, or clear
2. **Visit-start enforcement is surfaced** — `soft_alert` warnings and `hard_block` rejections are displayed to the user, not silently swallowed
3. **Staff can create and lift exclusions in-app** — role-gated dialogs (pit_boss+ for create, admin-only for lift) replace manual external processes
4. **Exclusion history is accessible** (Phase 4 / P2, deferred follow-on) — full audit trail of active and lifted exclusions is viewable within Player 360. Not required for this release.

### Non-Goals

- **No new database schema** — `player_exclusion` table, RLS policies, and enforcement RPC are complete on main
- **No cross-property exclusion signals** — sister-property exclusion visibility is Track B (Phase 2 Slice 2), not this PRD
- **No automated expiry/review workflows** — deferred to Track C ADR decisions (post-MVP)
- **No bulk exclusion import** — single-player CRUD only for MVP
- **No modification of existing exclusions** — exclusions are immutable per ADR-042 D3; they can only be lifted

## 3. Users & Use Cases

### Primary Users

| User | Role | Key Jobs |
|------|------|----------|
| **Pit Boss** | `pit_boss` | Seats players, monitors tables, checks exclusion status before seating, creates exclusions for disruptive players |
| **Floor Supervisor** | `admin` | Manages all exclusions, lifts exclusions when appropriate, reviews exclusion history for compliance audits |
| **Dealer** | `dealer` | Views exclusion status indicators (read-only), receives visit-start warnings |

### Use Cases

1. **Pit Boss checks player status before seating** — opens Player 360, sees red "Blocked" badge in header, knows not to seat the player
2. **Dealer starts a visit for a soft-alert player** — `NewSlipModal` shows a warning toast with the exclusion reason; dealer proceeds with awareness
3. **Dealer attempts to seat a hard-blocked player** — `NewSlipModal` shows a distinct error explaining the player is excluded; visit creation is rejected
4. **Pit Boss creates a trespass exclusion** — opens create dialog from Player 360, fills in type/enforcement/reason, submits; badge updates immediately
5. **Admin lifts an expired self-exclusion** — opens active exclusion in compliance panel, clicks "Lift", provides lift reason, confirms; status recalculates
6. **Admin reviews exclusion history** — opens history sheet from compliance panel, sees full audit trail with active and lifted entries

## 4. Scope & Feature List

### Phase 1 — Wire (P0, no net-new reusable UI components)

- [ ] **GAP-6**: Create `GET /api/v1/players/[playerId]/exclusions/status` route handler calling `exclusionService.getExclusionStatus(playerId)`
- [ ] **GAP-7 (query hooks)**: Create React Query query hooks in `hooks/player/use-exclusions.ts`: `useExclusionStatus`, `useExclusions`, `useActiveExclusions`
- [ ] **GAP-3**: Wire `exclusionWarning` display in `NewSlipModal` — toast for `soft_alert`, distinct error for `hard_block` rejection (branches on `PLAYER_EXCLUDED` error code)

### Phase 2 — Display (P0, read-only surfaces)

- [ ] **GAP-1**: Exclusion status badge in Player 360 header — severity-colored badge (`blocked`=red, `alert`=amber, `watchlist`=blue, `clear`=hidden)
- [ ] **GAP-2**: Exclusion section in compliance panel — collapsed status tile, active exclusion list (read-only; no Add or View History buttons until their target surfaces land in Phase 3–4)

### Phase 3 — CRUD (P1, write surfaces)

- [ ] **GAP-7 (mutation hooks)**: Create React Query mutation hooks in `hooks/player/use-exclusions.ts`: `useCreateExclusion`, `useLiftExclusion` (consumers land in this phase)
- [ ] **GAP-4**: Create exclusion dialog — form with `exclusion_type`, `enforcement`, `effective_from`, `effective_until`, `reason`, optional fields; role-gated to `pit_boss`/`admin`. Adds "Add Exclusion" trigger button to compliance panel.
- [ ] **GAP-5**: Lift exclusion dialog — confirmation dialog with `lift_reason` textarea; role-gated to `admin` only

### Phase 4 — History (P2, deferred follow-on — not required for this release)

- [ ] **GAP-8**: Exclusion history sheet — slide-over panel showing all exclusions (active + lifted) in a table with type, enforcement, status, dates, reason, created-by. Adds "View History" trigger button to compliance panel.

## 5. Requirements

### Functional

| ID | Requirement | GAP | Priority |
|----|-------------|-----|----------|
| F-1 | Status route returns `ExclusionStatusDTO` (`blocked`/`alert`/`watchlist`/`clear`) | GAP-6 | P0 |
| F-2 | `useExclusionStatus(playerId)` fetches and caches status with `exclusionKeys.status()` | GAP-7 | P0 |
| F-3 | `useExclusions(playerId)` fetches full exclusion list | GAP-7 | P0 |
| F-4 | `useActiveExclusions(playerId)` fetches active-only list | GAP-7 | P0 |
| F-5 | `useCreateExclusion()` mutation invalidates `list`, `active`, `status` keys | GAP-7 | P1 |
| F-6 | `useLiftExclusion()` mutation invalidates `list`, `active`, `status` keys | GAP-7 | P1 |
| F-7 | `NewSlipModal` displays `exclusionWarning` as a 10-second warning toast | GAP-3 | P0 |
| F-8 | `NewSlipModal` detects `hard_block` rejection by branching on the `PLAYER_EXCLUDED` error code (registered in `lib/errors/domain-errors.ts`, emitted by `rpc_start_or_resume_visit` via `RAISE EXCEPTION 'PLAYER_EXCLUDED: ...'`) and renders a distinct exclusion rejection message | GAP-3 | P0 |
| F-8a | If a player already has an active visit and a new exclusion is created afterward, the system does **not** block rating-slip continuation or retroactively invalidate the visit. The compliance panel may show a passive informational indicator, but no modal enforcement action is taken. (Per ADR-042 D2: enforcement at visit creation only.) | — | P0 |
| F-9 | Header badge renders severity-colored indicator for non-`clear` status | GAP-1 | P0 |
| F-10 | Header badge is hidden when status is `clear` (no visual clutter) | GAP-1 | P0 |
| F-11 | Compliance panel shows exclusion tile with enforcement level and active count (read-only in Phase 2 — no Add or View History buttons) | GAP-2 | P0 |
| F-12 | Compliance panel lists active exclusions with type, enforcement, dates, reason preview | GAP-2 | P0 |
| F-12a | "Add Exclusion" button added to compliance panel when GAP-4 (Phase 3) lands — not before | GAP-4 | P1 |
| F-12b | "View History" button added to compliance panel when GAP-8 (Phase 4) lands — not before (**deferred follow-on**) | GAP-8 | P2 |
| F-13 | Create dialog validates input against `createExclusionSchema` (Zod) | GAP-4 | P1 |
| F-14 | Create dialog is hidden for `dealer` role (UI role gate via `useAuth`) | GAP-4 | P1 |
| F-15 | Lift dialog requires `lift_reason` (1–1000 chars) and shows confirmation step | GAP-5 | P1 |
| F-16 | Lift dialog is hidden for non-`admin` roles | GAP-5 | P1 |
| F-17 | History sheet shows all exclusions (active + lifted) in a sortable table (**deferred follow-on — not required for this release**) | GAP-8 | P2 |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF-1 | Exclusion status query must complete in < 200ms (single-row RPC via index) |
| NF-2 | All mutations include `Idempotency-Key` header (ADR-021, already in `exclusion-http.ts`) |
| NF-3 | No `casino_id` passed from client — derived server-side via `set_rls_context_from_staff()` (ADR-024) |
| NF-4 | Badge color contrast meets WCAG 2.1 AA against dark background |
| NF-5 | Dialog forms use React Hook Form + Zod resolver (consistent with `PlayerEditModal` pattern) |

### Surface Classification (ADR-041 D1 Compliance)

#### Rendering Delivery: **Client Shell**

The Player 360 view is already a client-rendered shell (`'use client'` directives on all panels). Exclusion data is user-specific, mutable during a session (exclusions can be created or lifted at any time), and must be fresh at interaction time. Client Shell with React Query polling/invalidation is the correct pattern.

#### Data Aggregation: **Client-side Fetch**

React Query hooks fetch from existing REST API endpoints (`/api/v1/players/{playerId}/exclusions/*`). Exclusion data is a single-context concern (player_exclusion table only) requiring no cross-context joins or server-side aggregation. This follows the Admin Settings exemplar from ADR-041 D2.

#### Rejected Patterns

| Pattern | Axis | Rejection Rationale |
|---------|------|---------------------|
| RSC Prefetch + Hydration | Rendering | Player 360 is already client-rendered; exclusion state is mutable during the session (create/lift at any time), making prefetched data immediately stale. Mixing RSC into the existing Client Shell would create a rendering pattern mismatch within the same page. |
| BFF RPC Aggregation | Aggregation | Single-table concern with simple queries. No cross-context aggregation needed — status is a scalar from one RPC, lists are filtered SELECTs on one table. GOV-PAT-003 overhead (dedicated RPC, DTO projection) is unnecessary for this data shape. |
| BFF Summary Endpoint | Aggregation | No aggregation or computation required. Exclusion status is a categorical enum from `rpc_get_player_exclusion_status`, not a computed summary. Raw records suffice. |

#### Metric Provenance

Exclusion status (`blocked`/`alert`/`watchlist`/`clear`) is an **operational state indicator**, not a truth-bearing metric. It is a categorical enum derived from a single-table active-record check (analogous to enrollment status), not a calculated measurement. No MEAS-ID registration is required.

If future compliance reporting surfaces exclusion counts as a reportable metric (e.g., "active exclusions per property per month"), a MEAS-ID would be required at that point — this is explicitly out of scope for this PRD.

## 6. UX / Flow Overview

### Visit-Start Flow (GAP-3)

1. Staff selects a player and opens `NewSlipModal`
2. If no active visit exists → `startVisit()` is called
3. If visit starts successfully with `exclusionWarning` → **warning toast** appears (amber, 10-second duration, AlertTriangle icon) showing the exclusion reason
4. If visit is rejected with `hard_block` → **error message** replaces the form with "This player has an active exclusion and cannot be seated"
5. If player has an existing active visit → no exclusion re-check (per ADR-042 D2: enforcement at visit creation only)

### Player 360 Status Flow (GAP-1, GAP-2)

1. Staff opens Player 360 for a player
2. Header shows enrollment badge AND exclusion status badge (if non-clear)
3. Compliance panel (right rail) shows exclusion tile at the top of the panel, above CTR progress
4. Active exclusions are listed with type, enforcement, effective dates, and truncated reason
5. Phase 2 is read-only; "Add Exclusion" button arrives with Phase 3 (GAP-4), "View History" arrives with Phase 4 (GAP-8)

### Create Exclusion Flow (GAP-4)

1. Staff clicks "Add Exclusion" from compliance panel
2. Dialog opens with form fields from `createExclusionSchema`
3. Staff fills required fields (type, enforcement, reason) and optional fields
4. On submit → mutation fires → dialog closes → badge/panel refresh via key invalidation

### Lift Exclusion Flow (GAP-5)

1. Admin clicks "Lift" on an active exclusion row in the compliance panel
2. Confirmation dialog opens with exclusion details and `lift_reason` textarea
3. Admin enters reason and confirms → mutation fires → exclusion marked as lifted → UI refreshes

### History Flow (GAP-8)

1. Staff clicks "View History" from compliance panel
2. Sheet panel slides in from the right
3. Table shows all exclusions (active + lifted) with columns: Type, Enforcement, Status, Effective From, Effective Until, Reason, Created By, Created At
4. Active rows are visually distinct from lifted rows (muted styling for lifted)

## 7. Dependencies & Risks

### Prerequisites (All Met)

| Dependency | Status | Location |
|------------|--------|----------|
| `player_exclusion` table + RLS | On main | `20260310003435`, `20260310003709` |
| Enforcement RPC | On main | `rpc_get_player_exclusion_status()` |
| Service layer | On main | `services/player/exclusion-*.ts` (8 files) |
| API routes (GET/POST exclusions, GET active, POST lift) | On main | `app/api/v1/players/[playerId]/exclusions/` |
| HTTP fetchers | On main | `exclusion-http.ts` (5 functions) |
| React Query key factory | On main | `exclusion-keys.ts` |
| Zod schemas | On main | `exclusion-schemas.ts` |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Status route (GAP-6) not implemented → all display surfaces blocked | High | Phase 1 delivers this first; it's a thin wrapper over existing `exclusionService.getExclusionStatus()` |
| `NewSlipModal` error detection for `hard_block` relies on stable error code | Low | **Frozen**: `PLAYER_EXCLUDED` is a registered domain error code (`lib/errors/domain-errors.ts:285`) and the RPC emits `RAISE EXCEPTION 'PLAYER_EXCLUDED: ...'` (`20260310004409_player_exclusion_enforcement.sql:111`). UI branches on this code, not message text. |
| Role-gating accuracy depends on `useAuth()` returning correct `staff_role` | Low | Already proven by existing role-gated surfaces (admin settings, shift dashboard actions) |

### Frozen Rules

1. **Active visit + post-hoc exclusion (ADR-042 D2)**: If a player already has an active visit and a new exclusion is created afterward, the system does **not** block rating-slip continuation or retroactively invalidate the visit. The compliance panel may show a **passive informational indicator** (e.g., "Exclusion added during active visit"), but no modal enforcement action is taken. Enforcement occurs at visit creation only.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `GET /api/v1/players/{playerId}/exclusions/status` returns correct `ExclusionStatusDTO` for all 4 statuses
- [ ] All 5 React Query hooks work end-to-end (`useExclusionStatus`, `useExclusions`, `useActiveExclusions`, `useCreateExclusion`, `useLiftExclusion`)
- [ ] `NewSlipModal` displays `exclusionWarning` toast for `soft_alert` visits
- [ ] `NewSlipModal` displays distinct error for `hard_block` rejection
- [ ] Header badge renders correct color for `blocked`/`alert`/`watchlist` and is hidden for `clear`
- [ ] Compliance panel shows exclusion tile and active exclusion list
- [ ] Create exclusion dialog submits valid input and refreshes status
- [ ] Lift exclusion dialog requires reason and refreshes status

**Security & Access**
- [ ] Create button hidden for `dealer` role
- [ ] Lift button hidden for non-`admin` roles
- [ ] No `casino_id` parameter exposed to client — server-side derivation only (ADR-024)

**Testing**
- [ ] Integration test for the status route handler (`GET .../exclusions/status`)
- [ ] Integration test for one representative query hook (e.g., `useExclusionStatus`)
- [ ] Integration test for one representative mutation hook (e.g., `useCreateExclusion`)
- [ ] Component test for header badge rendering across all 4 statuses
- [ ] Component test for `NewSlipModal` soft-alert toast and hard-block rejection surface

**Surface Governance (ADR-041)**
- [ ] Surface classification declared: Client Shell + Client-side Fetch
- [ ] Rejected patterns documented with rationale
- [ ] Metric provenance assessed: no MEAS-ID required (operational state indicator)

**Operational Readiness**
- [ ] Error states handled in all hooks (loading, error, empty)
- [ ] Toast notifications use appropriate severity levels and durations

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| **V&S** | Phase 2 Handoff (`docs/issues/gaps/player-exclusion-ui/phase2-handoff.md`) | Track A context, 3-track decomposition |
| **ARCH** | SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`) | Player bounded context, `player_exclusion` ownership |
| **ADR** | ADR-042 Player Exclusion Architecture (`docs/80-adrs/ADR-042-player-exclusion-architecture.md`) | Property-scoped MVP, immutability, enforcement semantics |
| **ADR** | ADR-041 Surface Governance Standard (`docs/80-adrs/ADR-041-surface-governance-standard.md`) | Surface classification requirement, proven pattern palette |
| **GOV/SURF** | Surface Classification Standard (`docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`) | Mandatory declaration fields, compliance format |
| **GOV/PROV** | Metric Provenance Matrix (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`) | MEAS-ID registry, truth class definitions |
| **SEC** | SEC-001 RLS Policy Matrix (`docs/30-security/SEC-001-rls-policy-matrix.md`) | `player_exclusion` RLS policies |
| **SEC** | ADR-024 Authoritative Context Derivation | `set_rls_context_from_staff()` — no spoofable parameters |
| **GAP** | GAP-PLAYER-EXCLUSION-UI-SURFACE (`docs/issues/gaps/player-exclusion-ui/GAP-PLAYER-EXCLUSION-UI-SURFACE.md`) | Detailed gap analysis (8 gaps, 4 phases) |

---

## Appendix A: Existing Backend Inventory

All backend artifacts are on main and verified as of `a73fbd2`:

| Layer | Files | Key Exports |
|-------|-------|-------------|
| DTOs | `exclusion-dtos.ts` | `PlayerExclusionDTO`, `CreateExclusionInput`, `LiftExclusionInput`, `ExclusionStatusDTO` |
| Schemas | `exclusion-schemas.ts` | `createExclusionSchema`, `liftExclusionSchema`, `exclusionRouteParamsSchema` |
| Keys | `exclusion-keys.ts` | `exclusionKeys.root`, `.list()`, `.active()`, `.detail()`, `.status()` |
| HTTP | `exclusion-http.ts` | `listExclusions()`, `getActiveExclusions()`, `createExclusion()`, `liftExclusion()`, `getExclusionStatus()` |
| CRUD | `exclusion-crud.ts` | `createExclusion()`, `liftExclusion()`, `listExclusions()`, `getActiveExclusions()`, `getExclusionStatus()` |
| Service | `exclusion.ts` | `createExclusionService()`, `ExclusionServiceInterface` |

## Appendix B: Implementation Plan

```
Phase 1 — Wire (P0, 3 workstreams, no net-new reusable UI components):
  WS-1: Status route handler (GAP-6)
         New: app/api/v1/players/[playerId]/exclusions/status/route.ts
  WS-2: React Query query hooks (GAP-7 partial)
         New: hooks/player/use-exclusions.ts
         Scope: useExclusionStatus, useExclusions, useActiveExclusions (query only)
         Mutation hooks (useCreateExclusion, useLiftExclusion) deferred to Phase 3
  WS-3: NewSlipModal exclusion warning (GAP-3)
         Modified: components/dashboard/new-slip-modal.tsx
         Branches on PLAYER_EXCLUDED error code (already registered)

Phase 2 — Display (P0, 2 workstreams, read-only):
  WS-4: Header exclusion badge (GAP-1)
         New: components/player-360/header/exclusion-status-badge.tsx
         Modified: components/player-360/header/player-360-header-content.tsx
  WS-5: Compliance panel exclusion section (GAP-2)
         New: components/player-360/compliance/exclusion-tile.tsx
         Modified: components/player-360/compliance/panel.tsx
         NOTE: No Add or View History buttons — those arrive in Phase 3/4

Phase 3 — CRUD (P1, 3 workstreams):
  WS-6a: Mutation hooks (GAP-7 partial)
          Modified: hooks/player/use-exclusions.ts
          Scope: useCreateExclusion, useLiftExclusion (consumers land here)
  WS-6b: Create exclusion dialog + "Add Exclusion" button (GAP-4)
          New: components/player-360/compliance/create-exclusion-dialog.tsx
          Modified: components/player-360/compliance/exclusion-tile.tsx (add trigger)
  WS-7: Lift exclusion dialog (GAP-5)
         New: components/player-360/compliance/lift-exclusion-dialog.tsx

Phase 4 — History (P2, deferred follow-on, 1 workstream):
  WS-8: Exclusion history sheet + "View History" button (GAP-8)
         New: components/player-360/compliance/exclusion-history-sheet.tsx
         Modified: components/player-360/compliance/exclusion-tile.tsx (add trigger)
         NOTE: Not required for this release's Definition of Done
```

## Appendix C: Badge Color Mapping

| Status | Background | Text | Border | Icon |
|--------|-----------|------|--------|------|
| `blocked` | `bg-red-500/10` | `text-red-400` | `border-red-500/30` | `ShieldX` or `Ban` |
| `alert` | `bg-amber-500/10` | `text-amber-400` | `border-amber-500/30` | `AlertTriangle` |
| `watchlist` | `bg-blue-500/10` | `text-blue-400` | `border-blue-500/30` | `Eye` |
| `clear` | — | — | — | No badge rendered |

Follows the color convention established by `CtrProgressTile` in the compliance panel (red for triggered, amber for near-threshold).

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-03-19 | Product | Initial draft from GAP analysis |
| v0.1 | 2026-03-19 | Product | Audit delta corrections: phase-honest button placement, frozen active-visit rule (F-8a), frozen PLAYER_EXCLUDED error contract, outcome-based testing DoD, Phase 1 wording fix |
| v0.2 | 2026-03-19 | Product | Release boundary fix: ship = P0+P1 (Phases 1–3), Phase 4 (History) marked deferred follow-on. Mutation hooks (F-5, F-6) downgraded to P1 with their CRUD consumers. Overview prose corrected (includes server route handler). |
