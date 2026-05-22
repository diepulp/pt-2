# Feature Intake Brief

## A. Feature identity
- Feature name: Admin Operations Pit Configuration
- Feature ID / shorthand: FIB-PIT-CONFIG-001
- Related wedge / phase / slice: Admin settings operations surface / table-pit assignment gap
- Requester / owner: Vladimir Ivanov
- Date opened: 2026-04-19
- Priority: P1
- Target decision horizon: Current admin operations configuration slice

## B. Operator problem statement
An admin or operations lead can create gaming tables during casino setup, but after bootstrap there is no admin capability to assign, correct, or relocate existing tables into the desired pit mapping. When a table moves, a pit is reorganized, or optional bootstrap pit data was left blank, operators cannot make the system match the live floor, which makes pit-scoped reporting and operational filtering unreliable.

## C. Pilot-fit / current-slice justification
This belongs in the current admin operations slice because the setup wizard intentionally makes initial pit assignment optional, yet the post-setup admin surface does not provide a correction path. Without it, pilot operators who defer table-to-pit mapping during bootstrap, or who change floor placement after launch, cannot complete the basic operations configuration loop from `/admin/settings/operations`.

## D. Primary actor and operator moment
- Primary actor: casino admin / operations lead
- When does this happen? During post-bootstrap casino operations setup, floor reconfiguration, or table relocation
- Primary surface: `/admin/settings/operations`
- Trigger event: an existing gaming table needs to be assigned, reassigned, or cleared from a pit mapping after initial setup

## E. Feature Containment Loop
1. Admin opens Casino Operations settings -> system shows current pit configuration alongside existing operations settings.
2. Admin reviews existing pits, slots, and tables -> system shows which tables are assigned, unassigned, or already mapped to another active slot.
3. Admin selects an existing table for a target slot within an existing pit -> system validates that the table belongs to the current casino and is eligible for assignment.
4. Admin saves the assignment -> system persists the table-to-slot mapping and refreshes the displayed configuration.
5. Admin relocates a table from one slot or pit to another -> system moves the table out of the previous active slot and into the new slot without duplicate assignment.
6. Admin clears an assignment for a table that is no longer mapped to a pit slot -> system leaves the table available for later reassignment.
7. Admin returns to pit-scoped operational or reporting views -> system resolves pit-level table membership through the updated canonical mapping.

## F. Required outcomes
- Existing tables can be assigned to a slot within an existing pit after casino bootstrap.
- Existing table-to-pit-slot assignments can be changed from the admin operations surface.
- A table cannot end up assigned to multiple slots in the same active mapping.
- Unassigned tables are visible so operators can complete deferred bootstrap configuration.
- Pit-scoped reporting and filtering use the updated canonical assignment after save.
- The feature stays inside the existing admin settings operations surface.
- Edit authority is admin-only for this slice.

## G. Explicit exclusions
- Creating a new top-level floor-layout designer.
- Drawing, dragging, or visually editing a full casino floor map.
- Creating new gaming tables from this surface.
- Creating, editing, ordering, deleting, or otherwise managing pit definitions.
- Changing game variants, par targets, table status, dealer rotation, or table session lifecycle.
- Cross-property or multi-casino pit assignment.
- External notifications, approvals, or shift handoff workflows.
- Rebuilding measurement widgets or dashboard reports beyond consuming the updated mapping.
- Broad migration of all legacy `gaming_table.pit` behavior unless required for compatibility.
- Pit boss edit access.

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Full floor-plan editor | Pit mapping naturally relates to floor layout and table placement | The operator need is assignment correction, not spatial design or review workflow |
| Add table creation to operations settings | Operators may notice missing tables while assigning pits | Table creation already belongs to onboarding/table setup; mixing it into this slice expands the workflow |
| Use only free-text `gaming_table.pit` | Bootstrap currently captures an optional pit text field | Pit-scoped measurement already resolves through canonical slot assignments, so text-only updates would not satisfy the reporting outcome |
| Approval workflow for pit changes | Floor changes may be operationally sensitive | This slice is an admin correction/configuration path, not a governance workflow |
| Rebuild dashboards around pit IDs | Updated assignments affect pit-scoped reporting | Report UI redesign is not needed for the assignment workflow itself |
| Minimal pit creation in this surface | Some casinos may not have usable pit definitions yet | Even minimal creation introduces naming, uniqueness, ordering, deletion, and cleanup semantics; this slice is assignment correction only |
| Pit boss edit permissions | Pit bosses are operations users and may notice table placement issues first | Edit permissions would add auth and policy churn; pilot-safe scope is admin edit only |

## I. Dependencies and assumptions
- `/admin/settings/operations` already exists and currently renders casino operations settings.
- Gaming tables already exist before this feature is used.
- The setup wizard can leave pit assignment blank and still create valid tables.
- The system has a canonical pit/table mapping path through floor layout pit and table slot records.
- The first implementation assigns existing tables to specific active slots, not directly to pits.
- Pit definitions and slots already exist before this feature is used.
- Downstream planning must verify that pilot casinos have sufficient pit and slot bootstrap coverage before implementation begins; if not, a separate antecedent slice is required.
- Existing pit-scoped measurement/reporting paths resolve table membership through the canonical mapping, not only free-text table labels.
- The current actor is casino-scoped and authorized as an admin to administer operations settings.
- Any compatibility update to `gaming_table.pit` must be secondary to the canonical mapping and must not become the source of truth for new behavior.
- Downstream views must consume the updated canonical mapping after save.

## J. Out-of-scope but likely next
- A fuller floor layout management surface for designing pits, slots, and spatial placement.
- A controlled workflow for creating, decommissioning, or changing table inventory after onboarding.
- Audit/history review of pit assignment changes if operations policy requires it.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes a new top-level admin page, a visual floor-map editor, table creation/decommissioning, pit-definition management, dealer assignment, session lifecycle changes, cross-casino assignment, approval workflow, external notification path, pit boss edit permissions, or reporting/dashboard redesign beyond consuming the updated table-to-pit-slot mapping.

Feature-specific amendment trigger: amend this brief if downstream design changes the source-of-truth decision away from the canonical pit/table mapping path, or if it treats free-text `gaming_table.pit` as the only persisted assignment.

## L. Scope authority block
- Intake version: v0
- Frozen for downstream design: Yes
- Downstream expansion allowed without amendment: No
- Open questions allowed to remain unresolved at scaffold stage:
  - whether compatibility mirroring to `gaming_table.pit` is required for legacy dashboard filters
  - whether pit_boss users receive read-only visibility later; pilot default is admin-only panel visibility
- Human approval / sign-off: Vladimir Ivanov / 2026-04-19
