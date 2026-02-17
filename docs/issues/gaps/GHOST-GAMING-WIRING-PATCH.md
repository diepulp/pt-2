---
title: "Ghost Gaming Wiring Patch"
doc_kind: "patch"
version: "v0.2"
date: "2026-02-05"
status: "proposed"
applies_to:
  - "GAP-UNRATED-VISIT-UI.md"
related_docs:
  - "GAP-GHOST-PLAYER-ENROLLMENT.md" # deferred by this patch (see Non-goals)
owner: "PT-2"
tags:
  - ghost-visit
  - unrated-visit
  - enrollment
  - loyalty
  - minimal-db-change
---

# Goal

Support **ghost gaming** (patron refuses identification) while enabling a low-friction **mid-session upgrade** to identified + loyalty enrollment when the patron changes their mind — with **minimal DB changes** and minimal UI/API surface area.

This patch intentionally **defers “ghost player”** (nullable player names / `player_kind`) and instead treats “ghost” as a **visit state**, not a player record.

# Principle

**Do not create “ghost players.”**

Instead:

1. Start play as a **ghost visit** (`visit_kind = gaming_ghost_unrated`, `visit.player_id = NULL`).
2. If the patron later agrees to identify/enroll:
   - create/find a **normal identified player** (existing enrollment flow)
   - enroll to casino (if needed)
   - **attach that player to the existing visit** and flip the visit_kind to rated

This preserves session continuity and avoids schema/RPC/validation cascades.

# Current system assumptions (from the GAP docs)

- Ghost visits are already expected as first-class:
  - `visit_kind = gaming_ghost_unrated`
  - `visit.player_id = NULL`
- The Start Session UI gap calls for a **3-way** choice: **Rated / Unrated / Comp**.
- The Activity Panel should show visit-type discrimination (RATED / UNRATED / COMP).
- The ghost visit creation shape is expected to be minimal (e.g. `{ table_id, notes? }`).

# Proposed changes (minimal, surgical)

## Database

**No schema migration required** (preferred).

This patch assumes:
- `visit.player_id` is nullable (required for ghost visits)
- `visit.visit_kind` already supports `gaming_ghost_unrated` and `gaming_identified_rated`

### Compliance instrumentation (no schema change; RECOMMENDED)

Write `audit_log` entries:
- On ghost start: “Patron refused ID at start” (and any staff notes)
- On conversion: “Identity captured; visit converted to rated”

These entries are the authoritative timestamps for “identity captured” in v0.2.

## Seat handling contract (ambiguity resolved)

The GAP UI mentions “seat selector + notes”, but the minimal ghost visit creation DTO may not include a seat field.

This patch adopts the **minimal-DB contract**:

- **Seat does NOT live on `visit`** for ghost creation.
- Seat is captured and persisted on the **first `rating_slip` / telemetry artifact** created for the session (where seat is already expected to exist in the rating flow).

Implications:
- “Unrated (Ghost)” Start Session requires **table** (and optionally notes) to create the visit.
- If the operator must record seat immediately, the UI should capture it at **slip start** (or the first telemetry interaction), not on the visit row.

(If you later decide seat must be on `visit`, that becomes a schema/DTO change and is explicitly out-of-scope for this patch.)

## Backend / Service Layer

Add one method and one route that mirror the pattern of existing conversion mechanics (e.g., reward→gaming), but scoped to ghost→rated.

### New service operation

`convertGhostToRated(visit_id, player_id)`:

1. Validate visit exists, is active, and `visit_kind = gaming_ghost_unrated`.
2. Update atomically:
   - `visit.player_id = player_id`
   - `visit.visit_kind = gaming_identified_rated`
3. Idempotency / conflict:
   - If already rated and same `player_id` → return success (no-op).
   - If already rated and different `player_id` → reject (and audit).
4. Write an `audit_log` entry for the conversion (RECOMMENDED).

### New API route

`POST /api/v1/visits/{visitId}/convert-ghost-to-rated`
- body: `{ "player_id": "<uuid>" }`
- MUST derive casino/actor context via the existing RLS/session context pattern.
- MUST NOT accept `casino_id` (or `actor_id`) from the client in the payload.

### HTTP + validation layer hooks (make this implementation-proof)

Add/align with the GAP doc’s enumerated pieces:

- Zod schema: `convertGhostToRatedSchema` expecting `{ player_id }`
- HTTP client wrapper: `convertGhostToRated(visitId, playerId)` in the visit http module
- Service method: `convertGhostToRated()` in the visit service layer
- Route handler: calls service, returns standard `ServiceHttpResult` shape

## Frontend UX

### Start Session modal

Implement the selector:
- **Rated** → show player search
- **Unrated (Ghost)** → hide player search; require table; notes optional (“refused ID”)
- **Comp** → comp flow

Notes:
- Seat capture is handled per “Seat handling contract” above (slip/telemetry layer).

### Activity Panel

For sessions marked UNRATED/GHOST:
- show a **UNRATED/GHOST badge**
- add a single row action: **Identify & Enroll…**
  - opens existing enrollment modal/search
  - on success calls `convertGhostToRated(visitId, playerId)`
  - UI transitions into normal rated behavior (slips, loyalty, etc.)

No new screens are required; the ghost workflow stays flat.

# Conversion invariants (hard requirements)

- MUST preserve the **same `visit_id`** (no close/reopen to “upgrade”).
- MUST write an **audit_log** entry on ghost start and on conversion (or equivalent immutable event log).
- MUST reject conversion if the visit is already rated to a **different** `player_id`.
- MUST derive casino/actor context via RLS/session context; MUST NOT accept client-supplied `casino_id`.
- MUST be safe under retries (idempotent when converting to the same `player_id`).

# Behavioral rules (to prevent disputes and report pollution)

## Loyalty accrual boundary

Rule:
- **Accrue loyalty only from the moment of conversion forward.**

Timestamp anchor:
- “Moment of conversion” = the server timestamp of the successful `convertGhostToRated` update (captured via the conversion `audit_log` row in v0.2).

Rationale:
- The pre-conversion segment was explicitly anonymous / not eligible.
- Avoids retroactive “why didn’t I get a matchplay?” disputes and staff time sink.

## Compliance continuity (CTR/MTL)

Keep continuity by:
- preserving the same visit/session record (table/seat timeline stays intact)
- attaching identity later with an audit trail entry

# Gotchas / validations to check

- Any joins/views/rollups that assume `visit.player_id NOT NULL` must tolerate nulls (they already should if ghost visits exist).
- Ensure ghost sessions can still create slips/telemetry if your compliance model expects it.
- Ensure conversion does not break downstream logic that “expects player_id at birth.”

# Implementation checklist

## Backend
- [ ] Add `convertGhostToRated()` to Visit service.
- [ ] Add `POST /api/v1/visits/:visitId/convert-ghost-to-rated` route.
- [ ] Add `convertGhostToRatedSchema` (Zod) for request validation.
- [ ] Add visit HTTP client wrapper `convertGhostToRated(visitId, playerId)`.
- [ ] Write `audit_log` on ghost start + conversion (recommended).
- [ ] Add idempotency + conflict guards.

## Frontend
- [ ] Start Session modal: Rated / Unrated / Comp selector.
- [ ] Ghost start: create visit with `{ table_id, notes? }`.
- [ ] Seat capture: ensure seat is collected on slip/telemetry creation if required.
- [ ] Activity Panel: badge + “Identify & Enroll…” action for UNRATED.
- [ ] After conversion: refresh visit + player context; re-render as rated.

## Tests
- [ ] e2e: start ghost → convert → verify same visit id, `visit_kind` changed, `player_id` set, UI updates.
- [ ] negative: convert already-rated to different player_id → rejected + audited.
- [ ] retry: repeated convert calls with same player_id → idempotent success.

# Non-goals (explicitly deferred)

- Changing `player.first_name/last_name` to nullable
- Introducing `player_kind` / “ghost player” records
- Partial identity capture (nickname-only, etc.)
- Retroactive loyalty accrual for pre-conversion play
- Moving seat persistence onto `visit` (schema/DTO changes)


## Codex audit: 
• Audit Findings

  - Both artifacts lock ghost support to the visit layer (start ghost with visit_kind = gaming_ghost_unrated + NULL player_id, then attach a normal player on conversion) and explicitly outlaw “ghost player”
    records, keeping session continuity intact. docs/issues/gaps/GHOST-GAMING-WIRING-PATCH(1).md:20-38, docs/issues/gaps/GAP-UNRATED-VISIT-UI.md:18-50
  - Conversion mechanics match end-to-end: they require the same API route (POST /api/v1/visits/{visitId}/convert-ghost-to-rated), Zod schema, visit service method, HTTP wrapper, and Activity Panel action that
    launches the Identify & Enroll workflow, plus idempotency/audit invariants and loyalty accrual boundaries anchored to the conversion timestamp. GHOST-GAMING-WIRING-PATCH(1).md:82-159, GAP-UNRATED-VISIT-
    UI.md:63-157
  - UI expectations line up: Start Session must expose Rated / Unrated (Ghost) / Comp, with table required for Rated + Unrated, notes optional for Ghost, player search hidden for Ghost, and seat capture deferred
    to the first rating slip per the shared “seat lives on slip” contract. GHOST-GAMING-WIRING-PATCH(1).md:115-136, GAP-UNRATED-VISIT-UI.md:116-136

  Incongruities / Risks

  - The gap doc lists comp-only flows (reward visits and comp→rated conversion) as in-scope, but the cited wiring patch is silent on reward visit DTOs, routes, or UI. Unless another spec governs comp behavior,
    the comp-related requirements in GAP-UNRATED-VISIT-UI currently lack a referenced implementation guide. GAP-UNRATED-VISIT-UI.md:77-139
  - There are duplicate patch files (GHOST-GAMING-WIRING-PATCH.md and GHOST-GAMING-WIRING-PATCH(1).md) with identical contents; GAP-UNRATED-VISIT-UI points to the non-suffixed filename, while the user and
    applies_to metadata reference the suffixed variant. Consolidating to a single canonical path would prevent accidental drift. docs/issues/gaps/

  Suggested Next Steps

  1. Confirm whether comp visit coverage has its own patch/ADR; if not, extend the Ghost Gaming Wiring Patch (or author a sibling patch) so GAP-UNRATED-VISIT-UI’s comp requirements cite an explicit source.
  2. Remove or alias the duplicate patch filename so downstream tooling and humans reference one canonical doc.
