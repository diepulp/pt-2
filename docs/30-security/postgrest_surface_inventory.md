# PostgREST Surface Inventory

**Status:** Active
**Date:** 2026-03-02
**References:** SEC-007 (Gap D), ADR-018, ADR-024

---

## Purpose

This document tracks the complete inventory of `rpc_*` functions exposed through PostgREST, including their security posture (DEFINER/INVOKER), granted roles, parameter signatures, and any anomalies (PUBLIC EXECUTE, multiple overloads, identity parameters).

The inventory serves as the baseline for regression detection. Any drift from the expected state should be investigated immediately.

---

## How to Regenerate

Run the inventory script against a local Supabase instance with all migrations applied:

```bash
# Option 1: After supabase db reset (local dev)
supabase db reset
psql -h localhost -p 54322 -U postgres -d postgres \
  -f supabase/scripts/postgrest_surface_inventory.sql

# Option 2: Direct psql (if already running)
psql -h localhost -p 54322 -U postgres -d postgres \
  -f supabase/scripts/postgrest_surface_inventory.sql
```

The script lives at: `supabase/scripts/postgrest_surface_inventory.sql`

---

## When to Regenerate

Regenerate this inventory after any migration that:

- Adds a new `rpc_*` function
- Modifies an existing `rpc_*` function signature (params, return type)
- Changes GRANT/REVOKE on `rpc_*` functions
- Changes SECURITY DEFINER/INVOKER on any function
- Drops an `rpc_*` function or overload

As a rule of thumb: if your migration touches `CREATE OR REPLACE FUNCTION rpc_*`, `DROP FUNCTION rpc_*`, `GRANT`, or `REVOKE`, regenerate the inventory.

---

## What the Script Reports

The script produces five result sets:

1. **Full RPC Inventory** -- Every `rpc_*` function with: name, arg count, arg types, default arg count, security type (DEFINER/INVOKER), volatility, and EXECUTE grants per role (public, anon, authenticated, service_role).

2. **PUBLIC EXECUTE warnings** -- Functions where `public` role has EXECUTE. Expected: 0 rows, or only allowlisted auth-flow functions (`rpc_bootstrap_casino`, `rpc_accept_staff_invite`). See `ROLE_GATING_CANON.md`.

3. **Multiple overload warnings** -- Functions with more than one overload (different param counts). Expected: 0 rows. Multiple overloads create PostgREST named-arg ambiguity and are banned per SEC-007.

4. **SECURITY DEFINER inventory** -- All DEFINER functions with their PUBLIC EXECUTE status and identity parameter status. DEFINER functions must comply with ADR-018 governance.

5. **Identity parameter warnings** -- Functions that accept `p_actor_id`. Expected: 0 rows per ADR-024 INV-8.

---

## Current Inventory

<!-- Paste the output of postgrest_surface_inventory.sql below this line. -->
<!-- Last regenerated: YYYY-MM-DD -->

_Inventory not yet captured. Run the script above and paste output here._

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| `docs/30-security/ROLE_GATING_CANON.md` | Canonical grant patterns and exception rules |
| `docs/30-security/templates/RLS_RPC_SECURITY_REVIEW_CHECKLIST.md` | PR review checklist |
| `docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md` | Full audit findings and CI gate specs |
| `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER rules |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation |
| `supabase/scripts/postgrest_surface_inventory.sql` | The inventory generation script |
