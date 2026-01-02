---
title: "Audit: ADR-024 SECURITY DEFINER RPC Remediation (Full Pass)"
date: 2025-12-29
status: audit
scope: PT-2
tags:
  - adr-024
  - rpc
  - rls
  - security-definer
  - rbac
---

# Audit: ADR-024 SECURITY DEFINER RPC Remediation (Full Pass)

This audit reviews the migration `supabase/migrations/20251231072655_adr024_security_definer_rpc_remediation.sql` against the rating-slip snippet audit and current security/RBAC guidance.

---

## Scope

- Migration: `20251231072655_adr024_security_definer_rpc_remediation.sql`
- RPCs: 12 SECURITY DEFINER functions updated to use `set_rls_context_from_staff()`
- Reference: `RPC_CLOSE_RATING_SLIP_SNIPPET_AUDIT.md`
- RBAC taxonomy: `docs/30-security/SEC-003-rbac-matrix.md` (note: **not updated for ADR-024**; useful but incomplete for role allowlists)

---

# Executive verdict

✅ The migration successfully replaces deprecated context injection with `set_rls_context_from_staff()`.  
⛔ The full set of RPCs still contains **policy mismatches** from the snippet audit: missing staff-role authorization in most RPCs and continued reliance on client-supplied actor ids.

The migration does **not** require full redaction, but **does require targeted remediation** across multiple RPCs.

---

# Cross-cutting findings

## 1) Missing staff-role authorization checks (P0 where role gating is required)

Most RPCs extract `v_context_staff_role` but never enforce it. Under SECURITY DEFINER, this shifts authorization entirely into function logic; without role checks, any authenticated staff member in a casino could execute privileged actions.

**Affected RPCs:**
- rpc_activate_floor_layout
- rpc_close_rating_slip
- rpc_create_floor_layout
- rpc_log_table_drop
- rpc_log_table_inventory_snapshot
- rpc_move_player
- rpc_pause_rating_slip
- rpc_request_table_credit
- rpc_request_table_fill
- rpc_resume_rating_slip
- rpc_update_table_status

**Notable exception:** `rpc_create_player` has a role allowlist check.

**Required fix:** add explicit allowlist checks in each RPC (align with `SEC-003` and domain policy).  
**Note:** `SEC-003` does not yet reflect ADR-024; treat it as a starting point only.

---

## 2) Client-supplied actor ids still in signatures (P0)

All 12 RPCs accept client-supplied actor identifiers (e.g., `p_actor_id`, `p_created_by`, `p_removed_by`) and validate them against the context.

