## PRD-067 Gap: Floor Layout Activation is Unreachable

**Root cause.** PRD-067 assumes an active floor layout exists, but nothing creates one — and no UI activates one. A fresh casino has zero `floor_layout` rows, so the panel correctly short-circuits to the empty state.

### Where `floor_layout_status` is configured

- **Schema**: `supabase/migrations/20251108223004_create_floor_layout_service.sql` — enum `floor_layout_version_status` = `draft | pending_activation | active | retired`. Default on `floor_layout.status` is `'draft'` (line 24). "Active" is resolved via `floor_layout_activation` rows where `deactivated_at IS NULL`, not the status column.
- **Activation mechanism**: `rpc_activate_floor_layout(...)` (migration lines 103–120) is wired to `POST /api/v1/floor-layout-activations` (`app/api/v1/floor-layout-activations/route.ts:32-84`). **No UI invokes it.**
- **Error surfacing**: `components/admin/pit-configuration-panel.tsx:99-117` → `usePitAssignmentState` → `getPitAssignmentStateHttp` → `services/floor-layout/crud.ts:300-315` (`is('deactivated_at', null)`). Returns null when no activation exists.

### Bootstrap gap

`rpc_bootstrap_casino` (`supabase/migrations/20260402002623_prd060_amend_rpc_bootstrap_casino.sql:24-134`) creates casino + settings + admin staff. It does **not** insert any `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, or `floor_layout_activation`. Seed files likewise have no inserts.

### PRD-067 scope is silent on the gap

`docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md`:
- §2.3 Non-Goals explicitly excludes the designer (lines 48-49).
- §7.1 assumes "Pit definitions and slots exist before this feature is used — this slice does not create or manage them" (line 199).
- §7.2 **Risk R1** (line 206): "Pilot pit/slot bootstrap coverage must be verified before build" — flagged but unresolved.
- §11.2 defers the full layout management surface.

So activation was knowingly deferred; R1 was not closed.

### Remediation options (pick one)

1. **Bootstrap seeder** — extend `rpc_bootstrap_casino` to insert a default `floor_layout` + v1 `floor_layout_version` (status `draft`). Still leaves activation manual.
2. **Quick-activate affordance in PRD-067 panel** — when exactly one draft version exists, render an "Activate" button that POSTs to `/api/v1/floor-layout-activations`. Smallest path to unblock admins.
3. **PRD-068** — scoped layout/version CRUD + activation UI. Correct long-term, but heavier.

My recommendation: **#1 + #2 together**. Bootstrap guarantees a draft layout exists; the existing panel grows a one-click activate when it detects the draft. That closes R1 without building the full designer PRD-067 deferred.

Want me to draft an EXEC-SPEC for that combined remediation, or scope it as PRD-068?

You're right — I was wrong. Correction based on re-reading the wizard + DEC-001 mirror:

### What actually happens

**Setup Wizard Step 3 (`StepCreateTables` → `createGamingTableAction`)** writes `gaming_table.pit` as plain text that the admin types in (`app/(onboarding)/setup/_actions.ts:424`). So a freshly bootstrapped casino that completes the wizard does have tables with pit assignments — via the **legacy** `gaming_table.pit` text column.

**Pit terminal** (`/pit`) reads `rpc_get_dashboard_tables_with_counts`, which selects `gt.pit` (e.g., `20251228012528_dashboard_tables_batch_rpc.sql:68`). That's why it shows tables grouped by pit.

### Two disjoint pit models, and the mirror is one-way

- **Legacy** (`gaming_table.pit` text): written by the wizard, read by the pit terminal and shift metrics.
- **New first-class** (`floor_pit` + `floor_table_slot`): PRD-067's admin settings panel reads from here.

`rpc_assign_or_move_table_to_slot` mirrors **new → legacy** (line 177-181: `UPDATE public.gaming_table SET pit = v_pit_label`). There is **no reverse mirror**: nothing lifts existing `gaming_table.pit` text values into `floor_pit` rows + `floor_table_slot` entries.

### The actual gap

A wizard-completed casino has:
- ✅ `gaming_table` rows with `.pit = 'Pit A'/'Pit B'/...` (legacy)
- ❌ 0 `floor_layout` / `floor_layout_version` / `floor_pit` / `floor_table_slot` / `floor_layout_activation`

Pit terminal works. Admin settings panel is empty because it queries the new model that the wizard never populates.

### To verify on your remote casino

I need to authenticate with the Supabase MCP first (OAuth flow). If you want the live confirmation, say the word and I'll kick off auth. Alternatively the expected rows on your casino would be:

```sql
-- Should return rows:
SELECT id, label, pit FROM gaming_table WHERE casino_id = '<your casino>';
-- Should return ZERO rows:
SELECT * FROM floor_layout WHERE casino_id = '<your casino>';
SELECT * FROM floor_layout_activation WHERE casino_id = '<your casino>';
```

### Remediation (revised)

Since the legacy data exists and the user expectation is that "the wizard set up my pits," the cleanest fix is a **back-mirror on wizard completion** or on first admin-panel load:

1. On `rpc_complete_casino_setup`, create `floor_layout` + v1 `floor_layout_version` + `floor_pit` rows (one per distinct `gaming_table.pit` value) + `floor_table_slot` rows (one per table with `preferred_table_id` set + `pit_id` FK) + activate it.
2. Alternative: a one-shot "Import pits from legacy layout" button on the admin settings panel when it detects `gaming_table.pit` populated but no active layout.

Option 1 is better — it closes the gap invisibly at setup time, matches user expectation, and keeps the admin panel as an edit surface rather than a bootstrap surface.

Want me to authenticate and verify on your casino, or go straight to drafting the back-mirror migration?