
# Scope Alignment Inset — Cross-Property Player Recognition (Non-Operational)

**Purpose**

This inset clarifies the intended scope of the cross-property player recognition effort and prevents directional drift toward multi-casino staff operational capabilities. The current initiative is strictly about **patron recognition across properties under the same company**, not about enabling staff to operate in multiple casinos.

---

## Core Objective

The objective of this effort is:

> **Allow staff at Casino B to recognize and view limited information about a player enrolled at Casino A when both casinos belong to the same company.**

This capability supports:
- patron recognition
- host service context
- loyalty awareness
- visit history awareness

It **does not** enable staff to operate in another casino's operational context.

---

## Architectural Principle

Recognition crosses the company boundary.  
Operations do not.

Cross-property capability applies **only to read-only recognition workflows**.

Operational activities remain strictly **casino-scoped**.

---

## Explicit Non-Goals

The following capabilities are **out of scope for this effort**:

### 1. Multi-Casino Staff Operations

The system will **not** support:

- staff switching active casino context
- staff operating as another property
- tenant switching UI
- multi-casino operational sessions
- staff performing operational actions on behalf of another casino

Any such functionality would require a **separate architectural effort** and is **not part of the current player recognition initiative**.

---

### 2. Cross-Property Operational Writes

No operational record belonging to another casino may be modified.

Examples of prohibited cross-property actions:

- issuing rewards at another casino
- modifying another casino's loyalty ledger
- editing rating slips from another property
- mutating another casino's visit records
- performing AML / MTL actions for another casino

All mutations remain **strictly casino-scoped**.

---

### 3. Shared Operational State

The system will **not** reuse or share operational rows across casinos.

Examples:

- rating slips remain casino-specific
- loyalty ledger entries remain casino-specific
- visits remain casino-specific
- gaming telemetry remains casino-specific

Cross-property visibility will surface **summaries only**, not shared operational state.

---

## Intended Workflow

staff at Casino B  
      │  
      │ lookup patron  
      ▼  
company-scoped recognition  
      │  
      ├─ A: player active locally → proceed normally  
      │  
      ├─ B: player exists elsewhere → prompt local activation  
      │  
      └─ C: player not found → new patron onboarding  

Local gaming activity **always begins with local enrollment or confirmation**.

This preserves casino-scoped operational ownership.

---

## Staff Context Remains Single-Casino

During this effort:

staff  
  └─ operates only within their assigned casino

Staff context derivation remains:

app.casino_id = staff.casino_id

No tenant switching mechanism is introduced.

---

## Rationale

Separating **recognition** from **operations** prevents unnecessary architectural complexity and preserves the security model.

Cross-property recognition only requires:

- company-scoped read paths
- global player identity lookup
- controlled local activation

It **does not require** multi-casino staff tenancy or operational context switching.

Maintaining this boundary significantly reduces:

- RLS complexity
- tenancy ambiguity
- audit surface
- operational risk

---

## Future Work (Explicitly Deferred)

The following capabilities may be explored in future initiatives but are **not part of the current effort**:

- staff multi-casino operational access
- tenant switching interfaces
- company-level operational dashboards
- cross-property operational reporting
- shared staff roles across properties

If such capabilities are pursued, they will require a **separate ADR and security review**.

---

## Scope Integrity Rule

All implementation work must satisfy the following invariant:

> **Cross-property functionality must expand recognition only.  
> It must not expand operational authority.**

Any proposed change that enables staff to **act as another casino** is considered **out of scope** and must be escalated for architectural review.

---

## Implementation Guardrail

If a feature proposal requires:

- switching `app.casino_id`
- staff accessing another casino's operational records
- cross-casino mutation capabilities

then the proposal **violates the scope of this initiative** and must be deferred to a separate architectural effort.

---

## Summary

This effort introduces **cross-property player recognition**, not **multi-casino staff operation**.

The system will support:

- company-scoped player discovery
- cross-property visibility of limited player information
- prompted local activation at the current property

The system will **not** support staff acting as another casino.

Maintaining this boundary preserves the casino-scoped operational model while enabling improved patron service across sister properties.
