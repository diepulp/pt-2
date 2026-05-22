---
id: FIB-PTC-001
name: Pit Topology Canonicalization
status: Proposed
priority: P0
owner: Platform / TableContext Domain
related:
  - docs/issues/gaps/pit-topology-canonization/FLOOR-LAYOUT-GAP.md
  - docs/issues/gaps/pit-topology-canonization/fib-s-pit-canonization.json
  - docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md
---

# FIB-H — Pit Topology Canonicalization & Legacy Pit Retirement

## A. Feature Identity

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| Name     | Pit Topology Canonicalization            |
| ID       | `FIB-PTC-001`                            |
| Owner    | Platform / TableContext Domain           |
| Status   | Proposed                                 |
| Priority | **P0** — pilot integrity                 |

## B. Operator Problem

After onboarding, the system presents an inconsistent pit topology:

- The pit terminal and dashboards function on `gaming_table.pit` (legacy text column).
- The admin pit-configuration panel (PRD-067) reads first-class layout entities
  (`floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`).
- Result: the admin surface renders an empty state even though pits were
  configured during setup.

Consequences:

- **Loss of operator trust** — "the system forgot my pits."
- **Hidden dual-model behavior** across read paths.
- **Unsafe evolution** of pit-management features while two sources of truth
  coexist.

## C. Pilot Fit

This feature is required to:

- Make PRD-067 usable without manual pit re-entry.
- Preserve the onboarding expectation that configured pits persist.
- Eliminate ambiguity in pit ownership before expanding layout capabilities.

Without it, the pilot ships with contradictory system state.

## D. Actor / Moment

- **Actor:** Casino admin / pit manager
- **Moment:** Immediately after onboarding, OR first access to the admin pit
  configuration panel.
- **Expected behavior:** _"The pits I configured during setup are visible and
  editable in the admin panel."_

## E. Containment Loop

**Input**

- Existing `gaming_table.pit` values (legacy text).

**Transformation**

One-time import into:

- `floor_layout`
- `floor_layout_version`
- `floor_pit` (one per distinct `gaming_table.pit` value)
- `floor_table_slot` (one per table, with `pit_id` FK and `preferred_table_id` set)

**Output**

- An **activated** first-class layout (row in `floor_layout_activation` with
  `deactivated_at IS NULL`).
- System reads pit topology exclusively from the first-class model.

## F. Required Outcomes

1. **Single source of truth** — first-class floor-layout model is canonical.
2. **Seamless continuity** — no visible loss of pits after onboarding.
3. **PRD-067 unblocked** — admin panel loads with populated pits.
4. **Operational consistency** — pit terminal and other readers use the same
   topology source.

## G. Explicit Exclusions

- Full layout designer (PRD-068).
- Multi-version layout editing UX.
- Complex layout-versioning workflows.
- Historical reconciliation of pit changes.

## H. Adjacent Rejected Ideas

- ❌ **Persistent bidirectional mirroring** — creates permanent split-brain.
- ❌ **Manual admin bootstrap requirement** — violates onboarding expectation.
- ❌ **Keeping both models as co-equal sources** — unbounded inconsistency.

## I. Dependencies / Assumptions

- Wizard Step 3 (`createGamingTableAction`) currently populates `gaming_table.pit`
  (see `app/(onboarding)/setup/_actions.ts:424`).
- Fresh casinos have zero first-class layout rows after `rpc_bootstrap_casino`
  and `rpc_complete_casino_setup`.
- PRD-067 reads first-class layout exclusively
  (`components/admin/pit-configuration-panel.tsx` → `services/floor-layout/crud.ts`).
- Pit terminal and dashboard batch RPC currently read the legacy field
  (`20251228012528_dashboard_tables_batch_rpc.sql:68`) — must migrate as part
  of the canonicalization arc.
- `rpc_complete_casino_setup`
  (`20260211184700_create_rpc_complete_casino_setup.sql`) is the canonical
  setup-completion write point and the intended hook for the one-time import.

## J. Likely Next

- Layout designer (PRD-068).
- Advanced pit-management workflows.
- Version-controlled layout changes.

## K. Expansion Trigger Rule

Expand scope **only if**:

- Multiple layouts per casino become required, **OR**
- Operators need historical layout tracking.

## L. Scope Authority

This feature is complete when a newly onboarded casino:

- Has an active first-class layout.
- Sees its pits in the admin panel without manual intervention.
- Uses one consistent topology model across all surfaces.

**AND**

- No product workflow depends on `gaming_table.pit` as a source of truth
  (legacy column retained only as a temporary first-class → legacy projection
  for backward compatibility; deprecation tracked separately).
