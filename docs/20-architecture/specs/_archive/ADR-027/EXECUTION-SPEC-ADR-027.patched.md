---
title: "EXECUTION-SPEC: ADR-027 Table Bank Mode (Visibility Slice, MVP)"
status: "PATCHED"
date: "2026-01-17"
owner_context: "TableContext"
inputs:
  - "ADR-027-table-bank-mode-dual-policy.patched.v0.1.2.md"
  - "ADR-028-table-status-standardization.md"
scope: "Rundown Visibility Slice (paper/soft-count/accounting remains authoritative)"
---

# EXECUTION-SPEC: ADR-027 Table Bank Mode (Visibility Slice, MVP) — PATCH

This is a scope-tight execution spec aligned to:
- **ADR-027 (v0.1.2)**: informational bank mode + rundown visibility, no enforcement.
- **ADR-028**: standardized table availability vs session lifecycle status, no enum churn.

It patches the prior spec’s two critical defects:
1) **Drop posting did not persist a drop amount** (only a timestamp).
2) **Rundown computed “win” while count was pending** (misleading output).

---

## 0) North-star boundary (non-negotiable)

- PT is **visibility**. Paper trail + soft count + accounting are authoritative.
- MVP must never “look final” when it isn’t final.

References (informative):
- 25 CFR 542.12 allows inventory-count close or (if imprest) restore-to-par close.
- WAC 230-15-585 includes table inventory forms and fill/credit slips in the drop box.
- Mississippi defines table gross revenue identity as closing + credits + drop − opening − fills.

(Links included at end.)

---

## 1) Status contract (from ADR-028)

**Do not merge these:**
- `gaming_table.status` (`inactive|active|closed`) = *availability*
- `table_session.status` (`OPEN|ACTIVE|RUNDOWN|CLOSED`) = *session phase*

MVP guardrail:
- can only open a session if `gaming_table.status = 'active'`
- a table can become inactive mid-session; session may still close

Count state is NOT a session phase:
- `drop_posted_at IS NULL` → Count Pending
- `drop_posted_at IS NOT NULL` → Count Posted

---

## 2) Schema changes (MVP-safe, low blast radius)

### 2.1 Add bank mode to casino_settings (informational)

```sql
CREATE TYPE table_bank_mode AS ENUM ('INVENTORY_COUNT', 'IMPREST_TO_PAR');

ALTER TABLE casino_settings
ADD COLUMN table_bank_mode table_bank_mode NOT NULL DEFAULT 'INVENTORY_COUNT';

COMMENT ON COLUMN casino_settings.table_bank_mode IS
  'Casino-wide bank close model. Informational in MVP.';
```

### 2.2 Optional par on gaming_table (advisory only)

```sql
ALTER TABLE gaming_table
ADD COLUMN par_total_cents INTEGER,
ADD COLUMN par_updated_at TIMESTAMPTZ,
ADD COLUMN par_updated_by UUID REFERENCES staff(id);
```

### 2.3 Bind snapshots + totals to table_session (visibility slice)

> NOTE: `drop_posted_at` already exists from ADR-028.

```sql
ALTER TABLE table_session
ADD COLUMN table_bank_mode table_bank_mode,
ADD COLUMN need_total_cents INTEGER,
ADD COLUMN fills_total_cents INTEGER NOT NULL DEFAULT 0,
ADD COLUMN credits_total_cents INTEGER NOT NULL DEFAULT 0,
ADD COLUMN drop_total_cents INTEGER;

COMMENT ON COLUMN table_session.table_bank_mode IS
  'Snapshot of casino bank mode at session open. Informational in MVP.';
COMMENT ON COLUMN table_session.need_total_cents IS
  'Snapshot of table par at session open (nullable). Informational in MVP.';
COMMENT ON COLUMN table_session.fills_total_cents IS
  'Operational total fills for the session (entered or bridged). Informational in MVP.';
COMMENT ON COLUMN table_session.credits_total_cents IS
  'Operational total credits for the session (entered or bridged). Informational in MVP.';
COMMENT ON COLUMN table_session.drop_total_cents IS
  'Drop total for the session (posted by accounting/soft-count entry/import).';
```

### 2.4 Inventory snapshot totals (avoid fragile JSON math)

If your `table_inventory_snapshot` table already stores `total_cents`, keep it.  
If it does not, add it so the system does not rely on JSON key casting:

```sql
ALTER TABLE table_inventory_snapshot
ADD COLUMN total_cents INTEGER;

COMMENT ON COLUMN table_inventory_snapshot.total_cents IS
  'Total tray value in cents for this snapshot. Stored to avoid denom casting pitfalls.';
```

---

## 3) RPCs (concrete SQL)

### 3.1 rpc_open_table_session — gate by availability + bind informational snapshots

**Key behaviors**
- Self-inject RLS context (ADR-024 pattern)
- Refuse to open if table is not available (`gaming_table.status != 'active'`)
- Snapshot bank mode + par into session fields (informational)

**Patch note:** if your existing `rpc_open_table_session` already exists, only add the availability gate and snapshot assignments.

```sql
-- PSEUDOPATCH BLOCK (insert into existing function)
PERFORM set_rls_context_from_staff();

v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
IF v_casino_id IS NULL THEN
  RAISE EXCEPTION 'Missing casino context';
END IF;

SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'Table not found';
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'Cannot open session: table is not active';
END IF;

SELECT table_bank_mode INTO v_bank_mode
FROM casino_settings
WHERE casino_id = v_casino_id;

SELECT par_total_cents INTO v_par_total
FROM gaming_table
WHERE id = p_table_id AND casino_id = v_casino_id;

-- When creating session row:
table_bank_mode := v_bank_mode;
need_total_cents := v_par_total;
```

---

### 3.2 rpc_post_table_drop_total — persist amount + mark posted

This replaces the broken “timestamp-only” post.

```sql
CREATE OR REPLACE FUNCTION public.rpc_post_table_drop_total(
  p_session_id uuid,
  p_drop_total_cents integer
) RETURNS public.table_session
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_session public.table_session;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Missing casino context';
  END IF;

  UPDATE public.table_session
     SET drop_total_cents = p_drop_total_cents,
         drop_posted_at = now()
   WHERE id = p_session_id
     AND casino_id = v_casino_id
   RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not in casino scope';
  END IF;

  RETURN v_session;
END;
$$;

COMMENT ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) IS
  'Posts the drop total for a table session and marks drop_posted_at. Visibility slice (ADR-027).';

GRANT EXECUTE ON FUNCTION public.rpc_post_table_drop_total(uuid, integer) TO authenticated;
```

---

### 3.3 rpc_compute_table_rundown — honest output (win is NULL while count pending)

Rules:
- If `drop_posted_at IS NULL` then `drop_total_cents` may be NULL and **table_win_cents MUST be NULL**.
- Do not “fake” drop as zero.
- Opening/closing totals come from `table_inventory_snapshot.total_cents`.

```sql
CREATE OR REPLACE FUNCTION public.rpc_compute_table_rundown(
  p_session_id uuid
) RETURNS TABLE(
  session_id uuid,
  opening_total_cents integer,
  closing_total_cents integer,
  fills_total_cents integer,
  credits_total_cents integer,
  drop_total_cents integer,
  table_win_cents integer,
  drop_posted_at timestamptz,
  table_bank_mode table_bank_mode,
  need_total_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_session public.table_session;
  v_opening integer;
  v_closing integer;
BEGIN
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Missing casino context';
  END IF;

  SELECT *
    INTO v_session
    FROM public.table_session
   WHERE id = p_session_id
     AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not in casino scope';
  END IF;

  SELECT total_cents INTO v_opening
    FROM public.table_inventory_snapshot
   WHERE session_id = p_session_id
     AND snapshot_type = 'OPENING'
   ORDER BY created_at DESC
   LIMIT 1;

  SELECT total_cents INTO v_closing
    FROM public.table_inventory_snapshot
   WHERE session_id = p_session_id
     AND snapshot_type = 'CLOSING'
   ORDER BY created_at DESC
   LIMIT 1;

  -- Return component totals (even if count pending)
  session_id := v_session.id;
  opening_total_cents := COALESCE(v_opening, 0);
  closing_total_cents := COALESCE(v_closing, 0);
  fills_total_cents := COALESCE(v_session.fills_total_cents, 0);
  credits_total_cents := COALESCE(v_session.credits_total_cents, 0);
  drop_total_cents := v_session.drop_total_cents;
  drop_posted_at := v_session.drop_posted_at;
  table_bank_mode := v_session.table_bank_mode;
  need_total_cents := v_session.need_total_cents;

  -- Honest win: only compute when count posted AND drop_total exists
  IF v_session.drop_posted_at IS NULL OR v_session.drop_total_cents IS NULL THEN
    table_win_cents := NULL;
  ELSE
    table_win_cents :=
      closing_total_cents
      + credits_total_cents
      + v_session.drop_total_cents
      - opening_total_cents
      - fills_total_cents;
  END IF;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rpc_compute_table_rundown(uuid) IS
  'Returns rundown components and win/loss when drop is posted. Visibility slice (ADR-027).';

GRANT EXECUTE ON FUNCTION public.rpc_compute_table_rundown(uuid) TO authenticated;
```

---

## 4) UI contract (dashboard truthfulness)

- If `drop_posted_at IS NULL`: show “Count Pending” and **do not show a final win/loss**.
- When posted: show the computed win/loss and components with correct signs:
  - Fills subtract from win
  - Credits add to win
  - Drop adds to win

---

## 5) Acceptance Criteria (MVP)

- [ ] Drop posting persists `drop_total_cents` and sets `drop_posted_at`
- [ ] Rundown RPC returns components always, but returns `table_win_cents = NULL` when count pending
- [ ] Table session cannot be opened unless `gaming_table.status = 'active'`
- [ ] Dashboards clearly distinguish Availability vs Session phase, and Count Pending vs Posted (derived from `drop_posted_at`)
- [ ] No tolerance/blocking/par-history workflows exist in MVP

---

## 6) References (external, informative)

- 25 CFR 542.12 (inventory-count vs imprest-to-par): https://www.ecfr.gov/current/title-25/chapter-III/subchapter-D/part-542/section-542.12
- WAC 230-15-585 (drop box contents include fill/credit requests/slips + table inventory forms): https://app.leg.wa.gov/wac/default.aspx?cite=230-15-585
- Mississippi Gaming Commission Regulations Part 7 (table gross revenue identity): https://www.msgamingcommission.com/images/uploads/MGC_RegsPart_7_Accounting_Records.pdf
- PostgreSQL ALTER TYPE (enum evolution constraints): https://www.postgresql.org/docs/current/sql-altertype.html

