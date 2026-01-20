---
title: "Implementation Plan: Table Bank Mode & Par Policy"
doc_id: "IMPL-PLAN-TABLE-BANK-MODE"
version: "0.1.0"
status: "draft"
date: "2026-01-16"
owner: "TableContext"
implements: "ADR-027"
related_docs:
  - "docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md"
  - "docs/00-vision/table-context-read-model/need-par-dual-policy.md"
  - "docs/00-vision/table-context-read-model/table-inventory-rundown-lifecycle.md"
  - "docs/issues/gaps/GAP-TABLE-ROLLOVER-UI.md"
---

# Implementation Plan: Table Bank Mode & Par Policy

## Executive Summary

Extend the table session lifecycle with **Need/Par policy support** to enable full inventory accountability. The implementation uses a **casino-level default** (`INVENTORY_COUNT`) with admin-configurable alternative (`IMPREST_TO_PAR`).

---

## Design Decisions

### D1: Casino-Level Mode (Not Per-Table)

**Decision:** `table_bank_mode` is a casino-level setting, not per-table policy.

**Rationale:**
- Casinos typically operate all tables under the same control model
- Simplifies bootstrap (no per-table configuration wizard needed)
- Admin can toggle via dashboard settings
- Per-table overrides can be added later if needed

### D2: Default to INVENTORY_COUNT

**Decision:** Default mode is `INVENTORY_COUNT` (count-and-record).

**Rationale:**
- Most common operational model
- Lower barrier to adoption (no par values required upfront)
- `IMPREST_TO_PAR` requires established par values before meaningful use

### D3: Par Values Stored Per-Table

**Decision:** Par/need values stored in `gaming_table` or `table_settings`, not in casino_settings.

**Rationale:**
- Par values vary by table (high-limit vs standard)
- Even in INVENTORY_COUNT mode, par serves as advisory target
- Session captures `need_total` at open time (snapshot, not live reference)

### D4: Status Contract (Two Orthogonal Systems)

**Decision:** Keep `table_status` (availability) and `table_session_status` (lifecycle) as separate enums.

**Key Rules:**
- `gaming_table.status = 'active'` required to open session (enforced in RPC)
- Session can close even if table becomes `inactive` mid-session
- TypeScript uses `TableAvailability` and `SessionPhase` type aliases
- UI labels disambiguate: "Available/Idle/Decommissioned" vs "In Play/Rundown/Closed"
- `OPEN` state deprecated in MVP (sessions start in `ACTIVE`)
- Count posting tracked via `drop_posted_at` timestamp, not session status

---

## Implementation Phases

### Phase 1: Schema Foundation

**1.1 Add `table_bank_mode` to casino_settings**

```sql
-- Migration: YYYYMMDDHHMMSS_add_table_bank_mode.sql
CREATE TYPE table_bank_mode AS ENUM ('INVENTORY_COUNT', 'IMPREST_TO_PAR');

ALTER TABLE casino_settings
ADD COLUMN table_bank_mode table_bank_mode NOT NULL DEFAULT 'INVENTORY_COUNT';

COMMENT ON COLUMN casino_settings.table_bank_mode IS
  'Table inventory close model: INVENTORY_COUNT (count as-is) or IMPREST_TO_PAR (restore to par before close)';
```

**1.2 Add `par_total` to gaming_table (or table_settings)**

```sql
-- Option A: Add to gaming_table directly
ALTER TABLE gaming_table
ADD COLUMN par_total NUMERIC(12,2),
ADD COLUMN par_updated_at TIMESTAMPTZ,
ADD COLUMN par_updated_by UUID REFERENCES staff(id);

COMMENT ON COLUMN gaming_table.par_total IS
  'Target bankroll (need/par) in cents. Advisory in INVENTORY_COUNT mode, enforced in IMPREST_TO_PAR mode.';
```

**1.3 Extend table_session with mode binding**

```sql
ALTER TABLE table_session
ADD COLUMN table_bank_mode table_bank_mode,
ADD COLUMN need_total NUMERIC(12,2),
ADD COLUMN drop_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN table_session.table_bank_mode IS
  'Snapshot of casino mode at session open. Immutable once set.';
COMMENT ON COLUMN table_session.need_total IS
  'Snapshot of table par at session open. Used for variance detection.';
COMMENT ON COLUMN table_session.drop_posted_at IS
  'When soft count was posted. NULL = pending, SET = posted. Orthogonal to session status.';
```

---

### Phase 2: RPC Modifications

**2.0 Add Availability Gate to `rpc_open_table_session`**

Enforce `gaming_table.status = 'active'` before allowing session creation:

```sql
-- Inside rpc_open_table_session, BEFORE creating session:

SELECT status INTO v_table_status
FROM gaming_table
WHERE id = p_gaming_table_id AND casino_id = v_casino_id;

IF v_table_status IS NULL THEN
  RAISE EXCEPTION 'Table not found';
ELSIF v_table_status <> 'active' THEN
  RAISE EXCEPTION 'Cannot open session: table status is %, expected active', v_table_status;
END IF;
```

**2.1 Modify `rpc_open_table_session`**

Bind mode and par at session creation:

```sql
-- Inside rpc_open_table_session, after creating session:

-- Resolve mode from casino settings
SELECT table_bank_mode INTO v_bank_mode
FROM casino_settings
WHERE casino_id = v_casino_id;

-- Resolve par from gaming_table
SELECT par_total INTO v_par_total
FROM gaming_table
WHERE id = p_gaming_table_id;

-- Bind to session (snapshot, not live reference)
UPDATE table_session
SET table_bank_mode = COALESCE(v_bank_mode, 'INVENTORY_COUNT'),
    need_total = v_par_total
WHERE id = v_session_id;
```

**2.2 Modify `rpc_close_table_session`**

Add mode-aware validation:

```sql
-- Inside rpc_close_table_session:

-- For IMPREST_TO_PAR mode, validate closing inventory matches par
IF v_session.table_bank_mode = 'IMPREST_TO_PAR'
   AND p_closing_inventory_snapshot_id IS NOT NULL
   AND v_session.need_total IS NOT NULL THEN

  SELECT SUM((value->>'count')::int * (key::int))
  INTO v_closing_total
  FROM table_inventory_snapshot, jsonb_each(chipset)
  WHERE id = p_closing_inventory_snapshot_id;

  -- Check variance tolerance (configurable, default 0)
  IF ABS(v_closing_total - v_session.need_total) > v_tolerance THEN
    -- Create exception record or block close
    RAISE WARNING 'Closing inventory % does not match par %. Consider final fill/credit.',
      v_closing_total, v_session.need_total;
  END IF;
END IF;
```

**2.3 New RPC: `rpc_compute_table_rundown`**

```sql
CREATE OR REPLACE FUNCTION rpc_compute_table_rundown(
  p_session_id UUID
) RETURNS TABLE(
  session_id UUID,
  opening_total NUMERIC,
  closing_total NUMERIC,
  fills_total NUMERIC,
  credits_total NUMERIC,
  drop_total NUMERIC,
  table_win NUMERIC,
  need_total NUMERIC,
  variance_from_par NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session table_session%ROWTYPE;
  v_opening NUMERIC := 0;
  v_closing NUMERIC := 0;
  v_fills NUMERIC := 0;
  v_credits NUMERIC := 0;
  v_drop NUMERIC := 0;
BEGIN
  -- Get session
  SELECT * INTO v_session FROM table_session WHERE id = p_session_id;

  -- Opening snapshot total
  SELECT COALESCE(SUM((value->>'count')::int * (key::int)), 0)
  INTO v_opening
  FROM table_inventory_snapshot s, jsonb_each(s.chipset)
  WHERE s.id = v_session.opening_inventory_snapshot_id;

  -- Closing snapshot total
  SELECT COALESCE(SUM((value->>'count')::int * (key::int)), 0)
  INTO v_closing
  FROM table_inventory_snapshot s, jsonb_each(s.chipset)
  WHERE s.id = v_session.closing_inventory_snapshot_id;

  -- Fills total (verified only)
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_fills
  FROM table_fill
  WHERE table_id = v_session.gaming_table_id
    AND created_at BETWEEN v_session.opened_at AND COALESCE(v_session.closed_at, now());

  -- Credits total (verified only)
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_credits
  FROM table_credit
  WHERE table_id = v_session.gaming_table_id
    AND created_at BETWEEN v_session.opened_at AND COALESCE(v_session.closed_at, now());

  -- Drop total (from soft count or drop event)
  -- Note: Full soft count integration deferred; use 0 for MVP
  v_drop := 0;

  -- Return computed values
  RETURN QUERY SELECT
    p_session_id,
    v_opening,
    v_closing,
    v_fills,
    v_credits,
    v_drop,
    (v_closing + v_credits + v_drop - v_opening - v_fills) AS table_win,
    v_session.need_total,
    CASE WHEN v_session.need_total IS NOT NULL
         THEN v_closing - v_session.need_total
         ELSE NULL END AS variance_from_par;
END;
$$;
```

---

### Phase 3: Service Layer Updates

**3.1 Update casino settings DTO**

```typescript
// services/casino/dtos.ts

export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | "id"
  | "casino_id"
  | "gaming_day_start_time"
  | "timezone"
  | "watchlist_floor"
  | "ctr_threshold"
  | "table_bank_mode"  // ADD
>;

export type UpdateCasinoSettingsDTO = Partial<
  Pick<
    CasinoSettingsUpdate,
    | "gaming_day_start_time"
    | "timezone"
    | "watchlist_floor"
    | "ctr_threshold"
    | "table_bank_mode"  // ADD
  >
>;
```

**3.2 Update table session DTO**

```typescript
// services/table-context/dtos.ts

export type TableSessionDTO = {
  // ... existing fields
  table_bank_mode: 'INVENTORY_COUNT' | 'IMPREST_TO_PAR' | null;
  need_total: number | null;  // cents
};

export type TableRundownDTO = {
  session_id: string;
  opening_total: number;
  closing_total: number;
  fills_total: number;
  credits_total: number;
  drop_total: number;
  table_win: number;
  need_total: number | null;
  variance_from_par: number | null;
};
```

**3.3 Add rundown service**

```typescript
// services/table-context/rundown.ts

export async function computeTableRundown(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<TableRundownDTO> {
  const { data, error } = await supabase
    .rpc('rpc_compute_table_rundown', { p_session_id: sessionId })
    .single();

  if (error) throw mapSupabaseError(error);
  return mapToRundownDTO(data);
}
```

---

### Phase 4: UI Components

**4.1 Admin Settings: Table Bank Mode Toggle**

Location: Admin dashboard settings page (new or existing)

```tsx
// components/admin/table-bank-mode-setting.tsx

export function TableBankModeSetting({
  currentMode,
  onUpdate
}: {
  currentMode: 'INVENTORY_COUNT' | 'IMPREST_TO_PAR';
  onUpdate: (mode: 'INVENTORY_COUNT' | 'IMPREST_TO_PAR') => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Table Bank Mode</CardTitle>
        <CardDescription>
          How tables are closed at end of shift
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={currentMode} onValueChange={onUpdate}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="INVENTORY_COUNT" id="inventory" />
            <Label htmlFor="inventory">
              <span className="font-medium">Inventory Count</span>
              <span className="text-muted-foreground block text-sm">
                Count and record tray as-is at shift close (default)
              </span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="IMPREST_TO_PAR" id="imprest" />
            <Label htmlFor="imprest">
              <span className="font-medium">Imprest to Par</span>
              <span className="text-muted-foreground block text-sm">
                Restore tray to par via final fill/credit before close
              </span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
```

**4.2 Table Par Configuration**

Location: Table management or table detail page

```tsx
// components/table/table-par-setting.tsx

export function TableParSetting({
  tableId,
  currentPar,
  onUpdate
}: {
  tableId: string;
  currentPar: number | null;
  onUpdate: (parCents: number) => void;
}) {
  // Currency input for par value
  // Show last updated timestamp
  // Admin-only edit capability
}
```

**4.3 Session Status Banner Enhancement**

Show mode and par on active session:

```tsx
// components/table/session-status-banner.tsx (enhance)

{session.table_bank_mode && (
  <Badge variant="outline">
    {session.table_bank_mode === 'IMPREST_TO_PAR' ? 'Imprest' : 'Inventory'}
  </Badge>
)}
{session.need_total && (
  <span className="text-muted-foreground text-sm">
    Par: {formatCurrency(session.need_total)}
  </span>
)}
```

**4.4 Close Session Dialog Enhancement**

For IMPREST_TO_PAR mode, add variance warning:

```tsx
// components/table/close-session-dialog.tsx (enhance)

{session.table_bank_mode === 'IMPREST_TO_PAR' && closingTotal !== session.need_total && (
  <Alert variant="warning">
    <AlertDescription>
      Closing inventory ({formatCurrency(closingTotal)}) does not match
      par ({formatCurrency(session.need_total)}).
      Consider a final fill/credit to restore to par.
    </AlertDescription>
  </Alert>
)}
```

**4.5 Rundown Summary Panel (New)**

```tsx
// components/table/rundown-summary-panel.tsx

export function RundownSummaryPanel({ sessionId }: { sessionId: string }) {
  const { data: rundown } = useTableRundown(sessionId);

  if (!rundown) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Rundown</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground text-sm">Opening</dt>
            <dd>{formatCurrency(rundown.opening_total)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Closing</dt>
            <dd>{formatCurrency(rundown.closing_total)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Fills</dt>
            <dd className="text-green-600">+{formatCurrency(rundown.fills_total)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Credits</dt>
            <dd className="text-red-600">-{formatCurrency(rundown.credits_total)}</dd>
          </div>
          <div className="col-span-2 border-t pt-4">
            <dt className="text-muted-foreground text-sm">Table Win/Loss</dt>
            <dd className={cn(
              "text-2xl font-bold",
              rundown.table_win >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {formatCurrency(rundown.table_win)}
            </dd>
          </div>
          {rundown.variance_from_par !== null && (
            <div className="col-span-2">
              <dt className="text-muted-foreground text-sm">Variance from Par</dt>
              <dd className={cn(
                rundown.variance_from_par !== 0 && "text-amber-600"
              )}>
                {formatCurrency(rundown.variance_from_par)}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
```

---

### Phase 5: Hooks

**5.1 useTableRundown**

```typescript
// hooks/table-context/use-table-rundown.ts

export function useTableRundown(sessionId: string | null) {
  return useQuery({
    queryKey: ['table-rundown', sessionId],
    queryFn: () => fetchTableRundown(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
```

**5.2 useCasinoSettings (enhance)**

Ensure `table_bank_mode` is included in the query and mutation.

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/migrations/YYYYMMDD_add_table_bank_mode.sql` | New | Schema changes |
| `types/database.types.ts` | Regenerate | Run `npm run db:types` |
| `services/casino/dtos.ts` | Modify | Add table_bank_mode to DTOs |
| `services/casino/selects.ts` | Modify | Add to SELECT projection |
| `services/casino/crud.ts` | Modify | Handle in update function |
| `app/api/v1/casino/settings/route.ts` | Modify | Add to SELECT |
| `services/table-context/dtos.ts` | Modify | Add mode/par to session DTO |
| `services/table-context/rundown.ts` | New | Rundown computation service |
| `services/table-context/http.ts` | Modify | Add rundown fetcher |
| `hooks/table-context/use-table-rundown.ts` | New | React Query hook |
| `components/admin/table-bank-mode-setting.tsx` | New | Admin UI |
| `components/table/table-par-setting.tsx` | New | Par configuration |
| `components/table/rundown-summary-panel.tsx` | New | Win/loss display |
| `components/table/session-status-banner.tsx` | Modify | Show mode/par |
| `components/table/close-session-dialog.tsx` | Modify | Variance warning |

---

## Definition of Done

- [ ] Migration applied, types regenerated
- [ ] Admin can toggle table_bank_mode in settings
- [ ] Par values configurable per table
- [ ] Session captures mode and par at open
- [ ] Close dialog shows variance warning for IMPREST mode
- [ ] Rundown computation works with formula
- [ ] Rundown summary panel displays win/loss

---

## Out of Scope (Future)

- Per-table mode overrides
- Dynamic par recommendations
- Full soft count integration (drop total)
- Fill/credit multi-step workflows (cage integration)
- Exception tracking system
- Bootstrap wizard for par inference
