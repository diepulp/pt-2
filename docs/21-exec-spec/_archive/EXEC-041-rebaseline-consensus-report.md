---
report: EXEC-041-REBASELINE
title: "Consensus Report: Stale RPC Signature Rebaseline"
date: 2026-03-03
investigators: 5 RLS-expert agents (parallel swarm)
canonical_source: "20251231072655_adr024_security_definer_rpc_remediation.sql"
legacy_drop: "20251231093000_drop_legacy_adr024_rpc_signatures.sql"
phantom_drop: "20260302230020_drop_sec007_p0_phantom_overloads.sql"
verdict: "8 of 12 RPCs have stale old-signature tables; 4 have correct param counts but wrong source migration references"
---

# EXEC-041 Rebaseline Consensus Report

## Executive Summary

The EXEC-041 spec models RPC "old signatures" from their **original creation migrations**,
but the canonical ADR-024 remediation migration (`20251231072655`) already removed actor
parameters (`p_actor_id`, `p_created_by`, `p_activated_by`, `p_removed_by`, `p_counted_by`,
`p_requested_by`, `p_authorized_by`) from all 12 RPCs — leaving **only `p_casino_id`** as the
remaining identity parameter to remove.

**Impact**: Following EXEC-041 literally creates phantom overloads on 8 of 12 RPCs because the
`DROP FUNCTION IF EXISTS` targets a signature that no longer exists (silently succeeds), then
`CREATE OR REPLACE` creates a new function alongside the real current one.

## Migration Chain (chronological)

| # | Migration | Effect |
|---|-----------|--------|
| 1 | Various creation migrations (2025-11/12) | Original RPCs with actor params |
| 2 | `20251231072655_adr024_security_definer_rpc_remediation.sql` | **Canonical**: Removed actor params, kept `p_casino_id`, used `CREATE OR REPLACE` |
| 3 | `20251231093000_drop_legacy_adr024_rpc_signatures.sql` | Dropped old overloads with actor params |
| 4 | `20260114022828_add_seat_number_validation.sql` | Re-created `rpc_move_player` (same params as canonical) |
| 5 | `20260129100000_perf005_close_rpc_inline_duration.sql` | Re-created `rpc_close_rating_slip` (same params as canonical) |
| 6 | `20260217074827_prd033_update_request_rpcs_status.sql` | Re-created `rpc_request_table_fill`, `rpc_request_table_credit` (same params) |
| 7 | `20260224123752_prd038_modify_fill_credit_rpcs.sql` | Re-created `rpc_request_table_fill`, `rpc_request_table_credit` (same params) |
| 8 | `20260302230020_drop_sec007_p0_phantom_overloads.sql` | Dropped phantom `rpc_update_table_status(uuid,uuid,table_status,uuid)` |

**Current DB state**: All 12 RPCs have exactly ONE overload each, with `p_casino_id` as the
only identity parameter. No actor params remain.

---

## Category A: STALE Signatures (8 RPCs) — Phantom Overload Risk

These RPCs have old-signature tables in EXEC-041 that include actor params already removed.

### A1. `rpc_pause_rating_slip` (WS2)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id UUID, p_rating_slip_id UUID, p_actor_id UUID)` | `(p_casino_id uuid, p_rating_slip_id uuid)` |
| **Param Count** | 3 | 2 |
| **Removed by canonical** | `p_actor_id` | — |

```sql
-- CORRECT DROP (current signature)
DROP FUNCTION IF EXISTS public.rpc_pause_rating_slip(uuid, uuid);

-- CORRECT NEW (remove p_casino_id)
CREATE OR REPLACE FUNCTION public.rpc_pause_rating_slip(
  p_rating_slip_id uuid
) RETURNS rating_slip ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, uuid, uuid)` — no such function exists.
Silent no-op. CREATE then produces a second overload `(uuid)` alongside the real `(uuid, uuid)`.

---

### A2. `rpc_resume_rating_slip` (WS2)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id UUID, p_rating_slip_id UUID, p_actor_id UUID)` | `(p_casino_id uuid, p_rating_slip_id uuid)` |
| **Param Count** | 3 | 2 |
| **Removed by canonical** | `p_actor_id` | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_resume_rating_slip(uuid, uuid);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_resume_rating_slip(
  p_rating_slip_id uuid
) RETURNS rating_slip ...
```

**Phantom risk**: Same as A1 — DROP misses, phantom `(uuid)` created alongside `(uuid, uuid)`.

---

### A3. `rpc_close_rating_slip` (WS2)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id UUID, p_rating_slip_id UUID, p_actor_id UUID, p_average_bet NUMERIC DEFAULT NULL)` | `(p_casino_id uuid, p_rating_slip_id uuid, p_average_bet numeric DEFAULT NULL)` |
| **Param Count** | 4 | 3 |
| **Removed by canonical** | `p_actor_id` | — |
| **Latest re-creation** | — | `20260129100000_perf005_close_rpc_inline_duration.sql` (same params) |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_close_rating_slip(uuid, uuid, numeric);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_close_rating_slip(
  p_rating_slip_id uuid,
  p_average_bet numeric DEFAULT NULL
) RETURNS TABLE(slip rating_slip, duration_seconds integer) ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, uuid, uuid, numeric)` — doesn't exist.
Phantom `(uuid, numeric)` created alongside real `(uuid, uuid, numeric)`.

---

### A4. `rpc_move_player` (WS2)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id UUID, p_actor_id UUID, p_slip_id UUID, p_new_table_id UUID, ...)` | `(p_casino_id uuid, p_slip_id uuid, p_new_table_id uuid, p_new_seat_number text DEFAULT NULL, p_average_bet numeric DEFAULT NULL)` |
| **Param Count** | 6 (with actor) | 5 |
| **Removed by canonical** | `p_actor_id` | — |
| **Latest re-creation** | — | `20260114022828_add_seat_number_validation.sql` (same params) |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_move_player(uuid, uuid, uuid, text, numeric);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_move_player(
  p_slip_id uuid,
  p_new_table_id uuid,
  p_new_seat_number text DEFAULT NULL,
  p_average_bet numeric DEFAULT NULL
) RETURNS jsonb ...
```

**Phantom risk**: EXEC-041 DROP targets 6-param signature with `p_actor_id` — doesn't exist.
Phantom 4-param version created alongside real 5-param version.

---

### A5. `rpc_create_player` (WS4)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id uuid, p_actor_id uuid, p_first_name text, p_last_name text, p_birth_date date DEFAULT NULL)` | `(p_casino_id uuid, p_first_name text, p_last_name text, p_birth_date date DEFAULT NULL)` |
| **Param Count** | 5 | 4 |
| **Removed by canonical** | `p_actor_id` | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_create_player(uuid, text, text, date);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_create_player(
  p_first_name text,
  p_last_name text,
  p_birth_date date DEFAULT NULL
) RETURNS jsonb ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, uuid, text, text, date)` — doesn't exist.
Phantom `(text, text, date)` created alongside real `(uuid, text, text, date)`.

---

### A6. `rpc_update_table_status` (WS3)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Params** | `(p_casino_id, p_table_id, p_new_status, p_actor_id)` — 4 params | `(p_casino_id uuid, p_table_id uuid, p_new_status table_status)` — 3 params |
| **Removed by canonical** | `p_actor_id` | — |
| **Old overload cleaned** | — | `20260302230020_drop_sec007_p0_phantom_overloads.sql` dropped `(uuid,uuid,table_status,uuid)` |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_update_table_status(
  p_table_id uuid,
  p_new_status table_status
) RETURNS gaming_table ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, uuid, table_status, uuid)` — already dropped
by phantom cleanup migration. Silent no-op. Phantom `(uuid, table_status)` created alongside
real `(uuid, uuid, table_status)`.

---

### A7. `rpc_create_floor_layout` (WS5)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id uuid, p_name text, p_description text, p_created_by uuid)` | `(p_casino_id uuid, p_name text, p_description text)` |
| **Param Count** | 4 | 3 |
| **Removed by canonical** | `p_created_by` | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_create_floor_layout(uuid, text, text);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_create_floor_layout(
  p_name text,
  p_description text
) RETURNS floor_layout ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, text, text, uuid)` — doesn't exist.
Phantom `(text, text)` created alongside real `(uuid, text, text)`.

---

### A8. `rpc_activate_floor_layout` (WS5)

| Field | EXEC-041 Claims (STALE) | Actual Current |
|-------|------------------------|----------------|
| **Old Signature** | `(p_casino_id uuid, p_layout_version_id uuid, p_activated_by uuid, p_request_id text)` | `(p_casino_id uuid, p_layout_version_id uuid, p_request_id text)` |
| **Param Count** | 4 | 3 |
| **Removed by canonical** | `p_activated_by` | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_activate_floor_layout(uuid, uuid, text);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_activate_floor_layout(
  p_layout_version_id uuid,
  p_request_id text
) RETURNS floor_layout_activation ...
```

**Phantom risk**: EXEC-041 DROP targets `(uuid, uuid, uuid, text)` — doesn't exist.
Phantom `(uuid, text)` created alongside real `(uuid, uuid, text)`.

---

## Category B: Correct Param Counts, Wrong Source Reference (4 RPCs)

These RPCs have param counts in EXEC-041 that match the current canonical state, but the
spec references the **original creation migration** as the source instead of the canonical one.
The DROP will succeed, but the source reference may confuse implementors reading the spec.

### B1. `rpc_log_table_drop` (WS3)

| Field | EXEC-041 Claims | Actual Current | Match? |
|-------|----------------|----------------|--------|
| **Param Count** | 11 | 11 | YES |
| **Source Migration** | `20251221173716_prd015_ws3_table_mgmt_rpcs_self_injection.sql` | `20251231072655_adr024_security_definer_rpc_remediation.sql` | NO |
| **Removed by canonical** | `p_removed_by` (original had 12 params) | — | — |

```sql
-- CORRECT DROP (matches EXEC-041 intent)
DROP FUNCTION IF EXISTS public.rpc_log_table_drop(
  uuid, uuid, text, text, uuid, timestamptz, timestamptz, timestamptz, date, integer, text
);

-- CORRECT NEW (remove p_casino_id)
CREATE OR REPLACE FUNCTION public.rpc_log_table_drop(
  p_table_id uuid,
  p_drop_box_id text,
  p_seal_no text,
  p_witnessed_by uuid,
  p_removed_at timestamptz DEFAULT now(),
  p_delivered_at timestamptz DEFAULT NULL,
  p_delivered_scan_at timestamptz DEFAULT NULL,
  p_gaming_day date DEFAULT NULL,
  p_seq_no integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS table_drop_event ...
```

**Risk**: Low — param counts match, DROP will succeed. Source migration reference is misleading
(original had `p_removed_by` making it 12 params; canonical already removed it to 11).

---

### B2. `rpc_log_table_inventory_snapshot` (WS3)

| Field | EXEC-041 Claims | Actual Current | Match? |
|-------|----------------|----------------|--------|
| **Param Count** | 7 | 7 | YES |
| **Source Migration** | `20251221173716_...` | `20251231072655_...` | NO |
| **Removed by canonical** | `p_counted_by` (original had 8 params) | — | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_log_table_inventory_snapshot(
  uuid, uuid, text, jsonb, uuid, integer, text
);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_log_table_inventory_snapshot(
  p_table_id uuid,
  p_snapshot_type text,
  p_chipset jsonb,
  p_verified_by uuid DEFAULT NULL,
  p_discrepancy_cents integer DEFAULT 0,
  p_note text DEFAULT NULL
) RETURNS table_inventory_snapshot ...
```

**Risk**: Low — param counts match. Source reference misleading (original had `p_counted_by`).

---

### B3. `rpc_request_table_credit` (WS3)

| Field | EXEC-041 Claims | Actual Current | Match? |
|-------|----------------|----------------|--------|
| **Param Count** | 8 | 8 | YES |
| **Source Migration** | `20251221173716_...` | `20260224123752_prd038_modify_fill_credit_rpcs.sql` (latest re-creation) | NO |
| **Removed by canonical** | `p_authorized_by` (original had 9 params) | — | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_request_table_credit(
  uuid, uuid, jsonb, integer, uuid, uuid, text, text
);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_request_table_credit(
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_sent_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_credit ...
```

**Risk**: Low — param counts match. Source reference outdated (2 subsequent re-creations exist).

---

### B4. `rpc_request_table_fill` (WS3)

| Field | EXEC-041 Claims | Actual Current | Match? |
|-------|----------------|----------------|--------|
| **Param Count** | 8 | 8 | YES |
| **Source Migration** | `20251221173716_...` | `20260224123752_prd038_modify_fill_credit_rpcs.sql` (latest re-creation) | NO |
| **Removed by canonical** | `p_requested_by` (original had 9 params) | — | — |

```sql
-- CORRECT DROP
DROP FUNCTION IF EXISTS public.rpc_request_table_fill(
  uuid, uuid, jsonb, integer, uuid, uuid, text, text
);

-- CORRECT NEW
CREATE OR REPLACE FUNCTION public.rpc_request_table_fill(
  p_table_id uuid,
  p_chipset jsonb,
  p_amount_cents integer,
  p_delivered_by uuid,
  p_received_by uuid,
  p_slip_no text,
  p_request_id text
) RETURNS table_fill ...
```

**Risk**: Low — param counts match. Source reference outdated.

---

## TS Callsite Impact Update

The EXEC-041 spec's TS callsite tables also need correction. Since actor params were already
removed from TS callsites by the canonical migration, the only remaining TS change is removing
`p_casino_id` — the spec's callsite counts remain valid but the "Change" column should NOT
reference any actor param removal.

**Confirmed**: Production TS files (`services/`, `app/`) have zero `p_actor_id`/`p_created_by`/
`p_activated_by` references for the 12 in-scope RPCs. Only `p_casino_id` remains to be removed.

---

## Rebaseline Summary Table

| # | RPC | WS | Category | EXEC-041 Old Params | Actual Current Params | Correct Target Params | Risk |
|---|-----|----|----------|--------------------|-----------------------|----------------------|------|
| 1 | `rpc_pause_rating_slip` | WS2 | A (STALE) | 3 (casino, slip, actor) | 2 (casino, slip) | 1 (slip) | PHANTOM |
| 2 | `rpc_resume_rating_slip` | WS2 | A (STALE) | 3 (casino, slip, actor) | 2 (casino, slip) | 1 (slip) | PHANTOM |
| 3 | `rpc_close_rating_slip` | WS2 | A (STALE) | 4 (casino, slip, actor, avg_bet) | 3 (casino, slip, avg_bet) | 2 (slip, avg_bet) | PHANTOM |
| 4 | `rpc_move_player` | WS2 | A (STALE) | 6 (casino, actor, slip, table, seat, bet) | 5 (casino, slip, table, seat, bet) | 4 (slip, table, seat, bet) | PHANTOM |
| 5 | `rpc_update_table_status` | WS3 | A (STALE) | 4 (casino, table, status, actor) | 3 (casino, table, status) | 2 (table, status) | PHANTOM |
| 6 | `rpc_create_player` | WS4 | A (STALE) | 5 (casino, actor, first, last, birth) | 4 (casino, first, last, birth) | 3 (first, last, birth) | PHANTOM |
| 7 | `rpc_create_floor_layout` | WS5 | A (STALE) | 4 (casino, name, desc, created_by) | 3 (casino, name, desc) | 2 (name, desc) | PHANTOM |
| 8 | `rpc_activate_floor_layout` | WS5 | A (STALE) | 4 (casino, layout_ver, activated_by, req) | 3 (casino, layout_ver, req) | 2 (layout_ver, req) | PHANTOM |
| 9 | `rpc_log_table_drop` | WS3 | B (OK) | 11 | 11 | 10 | LOW |
| 10 | `rpc_log_table_inventory_snapshot` | WS3 | B (OK) | 7 | 7 | 6 | LOW |
| 11 | `rpc_request_table_credit` | WS3 | B (OK) | 8 | 8 | 7 | LOW |
| 12 | `rpc_request_table_fill` | WS3 | B (OK) | 8 | 8 | 7 | LOW |

---

## Recommendations

### R1. Rebaseline WS2–WS5 Old Signature Tables (CRITICAL)
Replace all "Old Signature" and "Old Params" columns with the exact current canonical
signatures from `20251231072655_adr024_security_definer_rpc_remediation.sql` (or later
re-creation migrations where applicable).

### R2. Update Source Migration References
For all 12 RPCs, change the "Source Migration" reference from the original creation migration
to the **latest migration that defines the current function**:

| RPC | Correct Source Migration |
|-----|------------------------|
| `rpc_pause_rating_slip` | `20251231072655_adr024_security_definer_rpc_remediation.sql:843` |
| `rpc_resume_rating_slip` | `20251231072655_adr024_security_definer_rpc_remediation.sql:1126` |
| `rpc_close_rating_slip` | `20260129100000_perf005_close_rpc_inline_duration.sql:12` |
| `rpc_move_player` | `20260114022828_add_seat_number_validation.sql:22` |
| `rpc_create_player` | `20251231072655_adr024_security_definer_rpc_remediation.sql:308` |
| `rpc_update_table_status` | `20251231072655_adr024_security_definer_rpc_remediation.sql:1237` |
| `rpc_log_table_drop` | `20251231072655_adr024_security_definer_rpc_remediation.sql:431` |
| `rpc_log_table_inventory_snapshot` | `20251231072655_adr024_security_definer_rpc_remediation.sql:528` |
| `rpc_request_table_credit` | `20260224123752_prd038_modify_fill_credit_rpcs.sql:162` |
| `rpc_request_table_fill` | `20260224123752_prd038_modify_fill_credit_rpcs.sql:18` |
| `rpc_create_floor_layout` | `20251231072655_adr024_security_definer_rpc_remediation.sql:242` |
| `rpc_activate_floor_layout` | `20251231072655_adr024_security_definer_rpc_remediation.sql:39` |

### R3. Remove Stale Actor Params from EXEC-041 New Signature Tables
The "New Signature" column in EXEC-041 already omits actor params (correctly), but since the
old signature also lacks them, the "Removed" column should say `p_casino_id` only — not any
actor params.

### R4. Update EXEC-041 Overview/Scope
Change "Remove `p_casino_id` validate-pattern parameters from 12 RPCs" to accurately reflect
that these RPCs currently have only `p_casino_id` as identity param (actor params were already
removed in the ADR-024 canonical migration of 2025-12-31).

### R5. Add Migration Chain Awareness
Add a note to EXEC-041 acknowledging the intermediate canonical migration and legacy cleanup,
so implementors know the current baseline is NOT the original creation migrations.

---

## Consensus Verdict

**All 5 investigators confirm**: EXEC-041 old-signature tables are stale for 8 of 12 RPCs.
Following the spec literally will create phantom overloads. The spec must be rebaselined
against the current canonical state before execution.

**Safe to proceed with Category B RPCs** (log_table_drop, inventory_snapshot, request_credit,
request_fill) — their param counts match current state, though source references should be
corrected for documentation accuracy.
