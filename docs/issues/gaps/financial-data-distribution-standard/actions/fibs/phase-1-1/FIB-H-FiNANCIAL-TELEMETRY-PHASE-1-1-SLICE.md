# FIB-H — Financial Telemetry Phase 1.1 Completion Slice (Visit Surfaces)

status: DRAFT — ALIGNMENT REPLACEMENT FOR DRIFTED PRD-072  
date: 2026-04-24  
owner: Financial Telemetry (Cross-context)  

parent:
- PRD-070 — Financial Telemetry Wave 1 Phase 1.1 (Service DTO Envelope)
- ROLLOUT-ROADMAP.md (Wave 1 — Surface Contract Rollout)

---

# A. Identity

**Feature Name:**  
Phase 1.1 Completion — Visit-Anchored Envelope Coverage

**Intent:**  
Complete FinancialValue envelope coverage for visit-anchored surfaces that were deferred from PRD-070, without expanding scope or altering system behavior.

---

# B. Operator Problem

Certain visit-facing financial surfaces remain **semantically ambiguous** because they still return unlabeled numeric values.

This creates:
- ambiguity between actual vs estimated values
- lack of source attribution
- inability to assess completeness

Operators cannot reliably interpret values, even if numerically correct.

---

# C. Pilot Fit

This feature is REQUIRED for pilot because:

- It closes the last gap in **surface-level truthfulness**
- It does NOT introduce:
  - schema changes
  - architectural changes
  - new workflows
- It aligns directly with Wave 1 objective:
  > make the system **honest before making it correct**

---

# D. Actor / Moment

**Actors:**
- Pit boss
- Floor supervisor
- Operator reviewing session continuation / live view

**Moments:**
- Viewing recent sessions
- Selecting “start from previous”
- Viewing live visit state

---

# E. Containment Loop

## Entry
- Existing visit and rating-slip surfaces returning numeric financial values

## Transformation
- Wrap values in `FinancialValue` envelope at service boundary

## Exit
- UI renders labeled values with:
  - authority (actual / estimated / observed)
  - source
  - completeness

## Feedback Loop
- None introduced in this phase (read-only semantic correction)

---

# F. Required Outcomes

## MUST

- All in-scope financial values are wrapped in `FinancialValue`
- Each value explicitly includes:
  - `type`
  - `source`
  - `completeness.status`
- No unlabeled currency values remain on affected surfaces
- Existing numeric values remain unchanged in:
  - magnitude
  - unit
  - derivation

---

## MUST NOT

- Change value units (cents ↔ dollars)
- Remove or alter existing conversion logic
- Recompute or normalize financial values
- Introduce new aggregation logic
- Modify schema, RPCs, or database
- Expand surface scope beyond identified consumers

---

# G. Explicit Exclusions

This feature explicitly excludes:

- Cents canonicalization
- Removal of `/100` conversions
- DTO ownership refactors
- Cross-context normalization
- UI standardization beyond labeling
- New reusable financial components
- Test expansion beyond envelope validation
- Any Wave 2 concerns (outbox, projections)

---

# H. Adjacent Rejected Ideas

| Idea | Reason Rejected |
|------|----------------|
| Normalize all values to cents | Phase 1.2 concern |
| Remove `/100` conversions | Alters semantics |
| Fix DTO inconsistencies | Structural, not semantic |
| Rewrite mappers for correctness | Out of scope |
| Expand test coverage broadly | Premature for unstable structure |

---

# I. Dependencies / Assumptions

## Dependencies
- PRD-070 envelope contract (FinancialValue)
- Classification rules for authority/source
- Existing service DTO structure

## Assumptions
- Existing values are “good enough” numerically for pilot
- Interpretation correctness is higher priority than data correctness

---

# J. Likely Next

This feature enables:

## Phase 1.2 (separate PRD)
- Financial data canonicalization
- Unit standardization
- Mapper normalization
- DTO boundary clarification

## Wave 2
- Outbox
- Dual-layer authoring
- Projection separation

---

# K. Expansion Trigger Rule

Expansion is allowed ONLY if:

- A surface remains unlabeled after Phase 1.1 completion

Expansion is NOT allowed for:

- fixing incorrect values
- normalizing units
- improving internal consistency

Those trigger a **new FIB**, not expansion of this one

---

# L. Scope Authority Block

## Governing Rule
This feature may ONLY describe financial values.
It may NOT change them.


## Hard Constraints

- No transformation of value semantics
- No unit changes
- No structural refactors
- No cross-context expansion

## Rejection Criteria

Reject implementation if it:

- modifies `/100` logic
- introduces new value computation
- changes DTO ownership
- expands beyond identified surfaces

---

## One-line invariant
If this feature makes the system more correct, it is out of scope.
If it makes the system more honest, it is in scope.

---