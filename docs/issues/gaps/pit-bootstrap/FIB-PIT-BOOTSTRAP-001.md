# FIB-H — Pit Bootstrap (Onboarding) — Pilot Slice

## A. Feature Identity

| Field    | Value                              |
| -------- | ---------------------------------- |
| Name     | Pit Bootstrap (Onboarding)         |
| ID       | `FIB-PIT-BOOTSTRAP-001`            |
| Owner    | TableContext Domain                |
| Status   | Proposed                           |
| Priority | **P0 — pilot unblock**             |

---

## B. Operator Problem

After onboarding, the admin pit configuration panel is empty.

- Setup collects pit names via free-text input per table (`gaming_table.pit`)
- These values are NOT materialized into the first-class layout model
- The admin panel reads only canonical layout (`floor_pit`, `floor_table_slot`)
- Result: pits appear “lost” after onboarding

---

## C. Pilot Fit

This slice is required to:

- Make PRD-067 usable immediately after onboarding
- Preserve operator expectation that configured pits persist
- Avoid manual re-entry of pit data

---

## D. Actor / Moment

- **Actor:** Casino admin / pit manager  
- **Moment:** Immediately after onboarding completion  
- **Expectation:**  
  _“The pits I entered during setup exist and I can assign tables to them.”_

---

## E. Containment Loop

**Input**

- `gaming_table.pit` values collected during onboarding

**Transformation**

- Create one `floor_pit` per distinct pit name
- Create `floor_table_slot` per table with:
  - `pit_id` FK
  - `preferred_table_id` set

**Output**

- Active layout with pits and table assignments
- Admin panel renders populated state

---

## F. Required Outcomes

1. Pits entered during onboarding appear in admin panel
2. Tables are assignable to those pits
3. No data loss from onboarding input
4. Admin panel is immediately usable

---

## G. Explicit Exclusions (NON-NEGOTIABLE)

- ❌ No canonicalization effort
- ❌ No migration of existing readers
- ❌ No removal of `gaming_table.pit`
- ❌ No CI rules, linting, governance, or inventory systems
- ❌ No new services or architectural layers
- ❌ No layout designer / multi-version logic

---

## H. Adjacent Rejected Ideas

- ❌ “Single source of truth” enforcement in this slice
- ❌ Legacy retirement
- ❌ Bidirectional sync between models
- ❌ System-wide topology rewrite

---

## I. Dependencies / Assumptions

- Setup already writes `gaming_table.pit`
- PRD-067 admin panel reads canonical layout only
- No existing canonical layout is created during setup

---

## J. Likely Next (DEFERRED)

- Canonicalization (legacy retirement)
- Layout designer (PRD-068)
- Advanced topology management

---

## K. Expansion Trigger Rule

Expand ONLY if:

- Operators need to create new pits outside onboarding
- OR multi-layout/versioning becomes required

---

## L. Scope Authority

This feature is complete when:

- A new casino completes onboarding
- Admin panel shows pits derived from setup input
- Tables are assignable without additional setup

AND:

- No existing functionality was removed to achieve this

---

## SUCCESS TEST (MANDATORY)

> On a fresh casino:
> - Enter pit name "Main" during setup
> - Complete onboarding
> - Open admin pit panel
> - See "Main" with tables present
> - Assign table → pit successfully

If any step fails → feature is NOT complete
