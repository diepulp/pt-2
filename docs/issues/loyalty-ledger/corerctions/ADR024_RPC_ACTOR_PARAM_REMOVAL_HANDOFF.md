---
title: "Session Handoff: ADR-024 RPC Actor Param Removal"
date: 2025-12-29
status: in-progress
scope: PT-2
---

# Session Handoff: ADR-024 RPC Actor Param Removal

## Goal
Remove client-supplied actor parameters from ADR-024 SECURITY DEFINER RPCs and update all code call sites to use derived context (`set_rls_context_from_staff()`), then regenerate types.

## What was updated (code call sites)
- `app/api/v1/floor-layouts/route.ts`: removed `p_created_by` from `rpc_create_floor_layout` call.
- `app/api/v1/floor-layout-activations/route.ts`: removed `p_activated_by` from `rpc_activate_floor_layout` call.
- `app/api/v1/rating-slips/[id]/move/route.ts`: removed `actorId` usage for `rpc_move_player` wrapper.
- `services/rating-slip-modal/rpc.ts`: removed `actorId` param; updated RPC args + docstring example.
- `services/rating-slip/crud.ts`: removed actor args from pause/resume/close RPC calls; updated `move()` to call `close()` without actor.
- `services/rating-slip/index.ts`: updated interface + factory signatures for pause/resume/close (actorId removed).
- `services/table-context/chip-custody.ts`: removed actor params from `rpc_log_table_inventory_snapshot`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop`.
- `app/api/v1/table-context/inventory-snapshots/route.ts`: removed `countedBy` mapping.
- `app/api/v1/table-context/fills/route.ts`: removed `requestedBy` mapping.
- `app/api/v1/table-context/credits/route.ts`: removed `authorizedBy` mapping.
- `app/api/v1/table-context/drop-events/route.ts`: removed `removedBy` mapping.
- Tests updated:
  - `services/rating-slip/__tests__/rating-slip.service.test.ts`
  - `services/rating-slip/__tests__/rating-slip-move-pooling.test.ts`
  - `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` (close/pause/resume rpc args)
  - `services/visit/__tests__/visit-continuation.integration.test.ts` (close rpc args)

## What was updated (schemas/DTOs)
- `services/floor-layout/schemas.ts`: removed `created_by`, `activated_by` fields.
- `services/table-context/schemas.ts`: removed `counted_by`, `requested_by`, `authorized_by`, `removed_by` fields.
- `services/player/dtos.ts`: removed `actor_id` from `CreatePlayerWithContextDTO`.
- `services/player/crud.ts`: removed `p_actor_id` from `rpc_create_player` call.
- `services/player/index.ts`: docstring updated (casino_id only).
- `services/floor-layout/dtos.ts`: removed `created_by` from `CreateFloorLayoutDTO`.

## Migration signature changes (already applied)
- `supabase/migrations/20251231072655_adr024_security_definer_rpc_remediation.sql`: removed actor params from signatures and comments for:
  - `rpc_activate_floor_layout`, `rpc_close_rating_slip`, `rpc_create_floor_layout`, `rpc_create_player`,
    `rpc_log_table_drop`, `rpc_log_table_inventory_snapshot`, `rpc_move_player`,
    `rpc_pause_rating_slip`, `rpc_request_table_credit`, `rpc_request_table_fill`,
    `rpc_resume_rating_slip`, `rpc_update_table_status`.

## Type files (edited but will be regenerated)
- `types/database.types.ts`: partially updated to remove actor args for the changed RPCs.
- `types/remote/database.types.ts`: not yet updated (should be regenerated, or manually adjusted if needed before regen).

## Remaining work
1) Update any remaining call sites that pass actor ids (if any remain after regen). Quick scan suggests the remaining `p_actor_id` uses are for other RPCs (e.g., `rpc_start_rating_slip`, `set_rls_context`) which are unchanged.
2) Regenerate `types/database.types.ts` and `types/remote/database.types.ts` after the migration is finalized.
3) Optional: update docs/specs/README examples that mention actor params (not required for functionality).

## Suggested verification
- Run tests covering rating slip and table-context flows (if available).
- Smoke test RPC calls without actor ids in local dev or staging.
