Here's what I found. The problem is deeper than label naming.

---

## Two Audiences, One Surface, No Separation

### The Roles

The system defines three staff roles (`baseline_srm.sql:6`): `dealer`, `pit_boss`, `admin`. But the UI makes no meaningful distinction between what a pit boss sees and what an admin sees on the table surface:

- **Dashboard RPC** (`rpc_get_dashboard_tables_with_counts`, line 64-82): `FROM gaming_table gt WHERE gt.casino_id = v_casino_id` — **no status filter**. Every table — active, inactive, closed — is returned to every authenticated user.

- **Pit panel auto-select** (`pit-panels-client.tsx:210`): `tables.find((t) => t.status === 'active')` — prefers active tables but doesn't hide the rest.

- **Pit-map-selector**: Lists all tables in the dropdown, including inactive and closed, with colored dots.

- **No admin table catalog exists** — `/admin/` has alerts, loyalty, settings, reports. No `/admin/tables`. Table lifecycle API routes exist (`/api/v1/tables/[tableId]/activate|deactivate|close`) and server actions exist (`app/actions/table-context/`), but **no UI surface invokes them**.

### What This Means

`gaming_table.status` encodes two orthogonal concerns in a single column, and the system renders both to all users on one surface:

| Concern | Who owns it | Change frequency | Current values |
|---|---|---|---|
| **Floor presence** (administrative) | Admin / casino manager | Rarely — new table setup, physical removal, regulatory action | `inactive` → `active` → `closed` |
| **Operational state** (daily ops) | Pit boss / shift manager | Multiple times per shift — open session, close session, rundown | `OPEN` → `ACTIVE` → `RUNDOWN` → `CLOSED` (session) |

The `gaming_table.status` column serves the **administrative** axis. The `table_session.status` column serves the **operational** axis. But the operator display (D6.1) mashes them together into one badge, and the dashboard returns everything unfiltered, so the pit boss sees admin-state labels (`IDLE`, `DECOMMISSIONED`) interspersed with operational ones (`IN_PLAY`, `RUNDOWN`, `AVAILABLE`).

### Why "Decommissioned" Shouldn't Be on the Pit Dashboard

You're right to question this. A `closed` table is a **permanent administrative removal** — the table has been physically taken off the floor or retired from the system. There is zero operational value in showing it to a pit boss:

- The pit boss cannot reactivate it (`closed` is terminal — `VALID_TRANSITIONS['closed'] = []` in `table-lifecycle.ts:26`)
- No session can be opened on it
- No players can be seated at it
- It occupies visual real estate that distracts from the 30 tables the pit boss is actually monitoring

The same argument applies to `inactive` tables, but less absolutely — a pit boss might need to bring a maintenance table back online mid-shift. Even so, that's a **management action** (find the table, flip it active), not a **monitoring need** (scan the floor for revenue state).

### The Triple Collision Revisited

With clear admin/operator surface separation, the collision dissolves:

| Word "Closed" | Surface | Meaning | Collision? |
|---|---|---|---|
| `gaming_table.status = 'closed'` | **Admin catalog only** | Decommissioned / removed from inventory | No — pit boss never sees it |
| `table_session.status = 'CLOSED'` | **Neither** — filtered from current-session queries | Historical session record | No — appears as `null` session |
| Operator display for null-session | **Pit dashboard** | "Not open for business right now" | **No collision** — the only "Closed" the pit boss encounters |

The triple collision only exists because all three meanings share the same rendering surface. Separate the surfaces, and "Closed" becomes the natural, unambiguous operator label for a table with no active session.

### What the Separated Model Looks Like

**Pit Dashboard (operational surface — pit_boss, shift_manager)**
- Shows only `gaming_table.status = 'active'` tables
- Operator display states collapse to session-derived only:

| State | Condition | Label | Color | Signal |
|---|---|---|---|---|
| `IN_PLAY` | session `ACTIVE` | "In Play" | Emerald + pulse | Revenue generating |
| `RUNDOWN` | session `RUNDOWN` | "Rundown" | Amber | Accounting in progress, play continues |
| `OPEN` | session `OPEN` | "Open" | Blue | Session starting |
| `CLOSED` | session `null` | "Closed" | Zinc/gray | Not open for business |

No `IDLE`. No `DECOMMISSIONED`. Those are admin concerns.

**Admin Catalog (administrative surface — admin only)**
- Shows all tables, all statuses
- Table availability states use their own vocabulary:

| State | Label | Actions available |
|---|---|---|
| `inactive` | "Offline" or "Out of Service" | Activate, Decommission |
| `active` | "On Floor" or "In Service" | Deactivate, Decommission |
| `closed` | "Decommissioned" | None (terminal) |

### The Dashboard RPC Change

The simplest immediate fix: add `AND gt.status = 'active'` to the dashboard RPC's WHERE clause, or add a client-side default filter in `useDashboardTables`. The RPC currently returns everything — this is the root cause of admin state leaking onto the operational surface.

However, this is a **behavioral change** that should be deliberate, not accidental. A pit boss who currently sees inactive tables in the dropdown would lose that visibility. If the pit boss needs to flip a table active mid-shift, that action should flow through either:
- A dedicated "Bring Online" button in the toolbar (new UI, scoped)
- The admin catalog (existing route, needs table management page)

### Summary

The label problem (`IDLE`, `AVAILABLE`, `DECOMMISSIONED`) is a symptom. The root cause is that `gaming_table.status` — an administrative axis — leaks into the operational surface without boundary enforcement. Fix the boundary, and the naming collision resolves naturally:
- **Admin surface** gets its own vocabulary (Offline / On Floor / Decommissioned)
- **Pit surface** uses "Closed" for null-session tables — no collision because admin states are filtered out
- The word "Closed" stops doing triple duty because each surface only encounters it once