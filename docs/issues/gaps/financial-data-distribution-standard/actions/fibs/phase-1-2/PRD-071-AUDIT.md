# PRD-071 AUDIT — Phase 1.2 Overengineering Guardrail Alignment

date: 2026-04-24  
status: AUDIT — SCOPE CONTAINMENT REQUIRED  
applies_to:
- PRD-071 Financial Telemetry Wave 1 Phase 1.2
- OVERENGINEERING_GUARDRAIL_FIN_TELEMETRY.md

---

# 1. Executive Verdict

```text
PRD-071 is directionally correct, but exceeds Phase 1.2 scope boundaries.
```

It currently bundles:

- API envelope stabilization ✔ (correct)
- Unit canonicalization ❌ (out of scope)
- UI migration ❌ (out of scope)
- Full test enforcement ❌ (premature)
- Broad surface rollout ❌ (over-scoped)

---

# 2. What Is Correct (Keep)

- API envelope pass-through discipline
- Route layer as transport only (no re-authoring)
- FinancialValue propagation to wire
- OpenAPI single component usage
- Removal of tenant-scoped leakage (`casino_id`)

These align with:

```text
Make the API stop lying.
```

---

# 3. Overengineering Vectors

## 3.1 Canonicalization Leakage

PRD-071 introduces:

- `/100` removal
- integer cents enforcement
- UI migration to `formatCents`

### Problem

This is NOT API envelope work.

This is:

```text
unit normalization + semantic change
```

Belongs to:

```text
Phase 1.2B (Canonicalization), not Phase 1.2A (Transport)
```

### Risk

- Reintroduces 070 failure mode
- Creates atomic dependency across layers
- Violates decomposability

---

## 3.2 Atomic Commit Requirement

```text
“must land in one atomic commit”
```

### Problem

Indicates:

- cross-layer coupling
- non-decomposable slice

### Rule

```text
If it cannot be staged, it is over-scoped.
```

---

## 3.3 Surface Explosion (34 Routes)

Scope includes:

- all route families
- full OpenAPI authoring
- deprecation strategy
- contract validation

### Problem

This is not a phase — it is a program.

### Risk

- rollout stall
- coordination overhead
- inconsistent execution

---

## 3.4 Test Overreach

Includes:

- full contract matrix
- UI component tests
- OpenAPI validation
- deprecation observability

### Problem

```text
Build + enforce + validate in same phase
```

Violates guardrail sequencing.

---

## 3.5 UI Coupling

Includes:

- `formatCents` migration
- UI rendering assumptions
- component testing

### Problem

```text
Phase 1.2 = API layer only
```

UI belongs to Phase 1.3.

---

## 3.6 Governance Density

- Multiple rules
- Multi-context application
- Broad enforcement surface

### Risk

```text
Cognitive overload → agent drift → fallback to canonical defaults
```

---

# 4. Root Cause

```text
Phase 1.2 is attempting to finalize the system instead of stabilizing the transport layer.
```

---

# 5. Correct Scope Definition

## Phase 1.2A — API Envelope Stabilization

Allowed:

- Pass FinancialValue unchanged to API
- Reference shared OpenAPI component
- Minimal contract validation (shape only)
- Deprecate raw totals where trivial

---

## Explicitly Forbidden

- `/100` removal
- Unit normalization
- Integer cents enforcement
- Mapper rewrites
- DTO ownership refactor
- UI formatting changes
- Cross-context semantic alignment

---

# 6. Deferred Work

## Phase 1.2B — Canonicalization

- Normalize units to cents
- Remove `/100`
- Align mapper logic
- Standardize DTO semantics

---

## Phase 1.3 — UI Alignment

- `formatCents` migration
- UI rendering correctness
- UI contract validation

---

## Phase 1.4 — Enforcement

- Full test matrix
- CI contract enforcement
- Deprecation observability
- Coverage guarantees

---

# 7. Execution Adjustment

## Replace Big-Bang Rollout

With:

```text
1–2 routes per family
→ validate pattern
→ expand incrementally
```

---

## Reduce Tests To

```text
shape validation + pass-through correctness only
```

---

# 8. Final Directive

```text
Phase 1.2 must not fix the system.
It must only expose the system truthfully at the API boundary.
```

---

# 9. One-Line Invariant

```text
If Phase 1.2 requires UI changes or unit changes, it is out of scope.
```
