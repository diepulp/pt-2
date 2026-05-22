# OVERENGINEERING GUARDRAIL — Financial Telemetry (Wave 1)

date: 2026-04-24  
status: ACTIVE — PILOT PROTECTION  
applies_to:
- Financial Telemetry rollout (Wave 1)
- PRD-070 / PRD-072
- DTO governance
- Any follow-up canonicalization or outbox work

---

# 1. Purpose

Prevent unnecessary architectural expansion and system destabilization during pilot delivery.

This guardrail exists to stop:

> turning a localized semantic inconsistency into a full system refoundation.

---

# 2. System Reality Check

The system is NOT broken.

What is unstable:

- Financial interpretation layer
- Unit ambiguity (cents vs dollars)
- DTO semantic clarity
- Ownership boundaries (visit / rating-slip / finance)

What is stable:

- Core workflows
- Session lifecycle
- Operational surfaces
- Data persistence
- User-facing functionality

---

# 3. Risk Assessment

## Primary Risk

> Over-hardening the system before pilot.

### Manifestation

- Expanding Phase 1.1 into full data canonicalization
- Introducing architectural layers (outbox, projections) prematurely
- Refactoring DTO ownership across bounded contexts
- Rewriting mapper logic for “correctness”

---

## Secondary Risk

> Confusing semantic cleanup with system correctness.

### Manifestation

- Treating unit inconsistency as a blocking defect
- Attempting to normalize all values before labeling
- Enforcing canonical DTO shapes mid-migration

---

## False Risk (DO NOT ACT ON)

> “The system is fundamentally flawed and must be rebuilt”

This is incorrect.

The system is functionally viable and pilot-capable.

---

# 4. Guardrail Principles

## 4.1 Bridge, Don’t Rebuild

Solve the seam.  
Do not rebuild the system.

---

## 4.2 Label Before Fixing

Truth → Consistency → Architecture

Do not skip steps.

---

## 4.3 Contain the Blast Radius

If a change affects:

- multiple bounded contexts
- DTO ownership
- unit semantics
- UI + service + route simultaneously

→ it is NOT a Phase 1 change

---

## 4.4 Defer Structural Correctness

Structural correctness belongs to:

- Phase 1.2 (canonicalization)
- Wave 2 (outbox / event-driven)

NOT Phase 1.1

---

## 4.5 Preserve Working Behavior

If it works today, do not “fix” it in Phase 1.1.

---

# 5. Explicit Anti-Patterns

Reject any work that attempts:

- Removing `/100` conversions in Phase 1.1
- Converting all values to integer cents prematurely
- Introducing canonical DTO shapes mid-slice
- Reassigning DTO ownership across services
- Building event outbox before semantic stabilization
- Expanding test matrix beyond envelope validation

---

# 6. Allowed Work (Phase 1.1 Only)

- Wrap values in FinancialValue
- Add:
  - type
  - source
  - completeness
- Render labels in UI
- Preserve all existing numeric behavior

---

# 7. Pilot Protection Rule

The goal is not to make the system perfect.  
The goal is to make the system understandable.

---

# 8. Decision Gate

Before implementing any change:

Does this change alter value semantics?

YES → Out of scope (Phase 1.2+)  
NO  → Allowed (Phase 1.1)

---

# 9. Outbox Timing Rule

Do not build event-driven architecture on semantic ambiguity.

Prerequisites for outbox:

- Labeled values everywhere
- Stable DTO meaning
- Canonical unit strategy

---

# 10. Final Directive

Do not let discomfort with inconsistency trigger reconstruction.  
This is a bridge phase.

---

## One-line invariant

If this work makes the system bigger, it is probably wrong.  
If it makes the system clearer, it is probably right.
