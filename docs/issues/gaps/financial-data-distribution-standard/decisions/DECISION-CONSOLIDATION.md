# DECISION CONSOLIDATION — Financial Domain (PT-2 Pilot)

---

status: PROPOSED (pre-ADR consolidation)
date: 2026-04-23
purpose: Stabilize architectural decisions before ADR finalization
scope: Pit-only financial telemetry
-----------------------------------

# 1. Context

The system exhibits:

* repeated split-brain between PFT and TBT
* ambiguity around grind (unrated buy-ins)
* drift into accounting concerns (drop, reconciliation)
* UI surfaces misrepresenting authority and completeness

Recent audits and traces revealed:

* financial events are not purely player-centric
* grind is financially real but unattributed
* the system is not the source of financial truth
* most issues are semantic, not computational

---

# 2. Decision Set

---

## D1 — Financial Model = Dual-Layer (ACCEPTED DIRECTION)

### Decision

The system models **two distinct financial fact classes**:

1. **Ledger Financial Facts (Authoritative)**

   * stored in PFT
   * player-attributed
   * auditable

2. **Operational Financial Facts (Observed)**

   * grind (unrated buy-ins)
   * table-level
   * unattributed
   * non-authoritative

---

### Rationale

* simulation shows player attribution is not always possible
* grind cannot be safely merged into ledger
* real-world operations distinguish between recorded vs observed

---

### Consequences

* no single “financial truth” inside the system
* downstream consumers must respect authority boundaries
* dual-truth awareness becomes explicit

---

## D2 — Event Anchoring = Table-First (ACCEPTED DIRECTION)

### Decision

All financial events are:

> **anchored to a table, optionally attributed to a player**

---

### Rationale

* all simulated flows require table context
* player attribution is conditional
* player-first model caused TBT shadow system

---

### Consequences

* schema evolution required (later phase)
* projections become table-centric
* removes need for fake player attribution

---

## D3 — System Scope = Operational Telemetry (HARD BOUNDARY)

### Decision

The system:

> **does NOT compute or declare financial truth (drop, totals, reconciliation)**

It provides:

* structured operational financial activity
* attribution where possible
* visibility into completeness

---

### Rationale

* financial truth originates from custody (count room, inventory)
* system does not observe full cash lifecycle
* attempting reconstruction leads to incorrect totals

---

### Consequences

* no “Total Drop” as authoritative output
* reconciliation is external domain
* system must expose partial visibility explicitly

---

## D4 — TBT Reclassification (ACCEPTED DIRECTION)

### Decision

`table_buyin_telemetry` is reclassified into:

1. **Grind (Operational Fact)**

   * primary input
   * not derived
   * not ledger

2. **Rated (Projection)**

   * derived from PFT
   * redundant but useful

---

### Rationale

* TBT existed due to missing expressiveness in PFT
* grind is not derivable from ledger
* mixing both caused shadow ledger behavior

---

### Consequences

* TBT is NOT a ledger
* no dual-write allowed
* projection vs observation must be explicit

---

## D5 — Reconciliation Responsibility (OUT OF SCOPE FOR PILOT)

### Decision

The system:

> **does not reconcile ledger vs reality**

Instead:

* exposes data for reconciliation
* does not perform reconciliation

---

### Rationale

* reconciliation requires external inputs (drop, inventory)
* outside system visibility
* introduces accounting domain complexity

---

### Consequences

* no internal “final totals”
* no variance resolution logic
* future integration point defined

---

## D6 — Surface Truthfulness (ENFORCEMENT DECISION)

### Decision

All financial surfaces MUST:

* declare source (Actual / Estimated / Observed)
* declare authority
* declare completeness when partial

---

### Rationale

* audit shows mislabeling is primary failure
* numbers are correct but misleading
* user interpretation is the real risk

---

### Consequences

* Surface Rendering Contract becomes mandatory
* UI changes required, backend mostly stable
* eliminates semantic ambiguity

---

# 3. Open Questions (DO NOT RESOLVE YET)

* Should PFT schema expand to support table-only events?
* Should grind remain fully separate or partially normalized?
* Is a future reconciliation layer required or optional?

---

# 4. Rejected Directions

---

## ❌ Single Unified Ledger (PFT absorbs grind)

Rejected because:

* violates attribution constraints
* contaminates ledger semantics
* breaks compliance alignment

---

## ❌ Full Accounting Reconstruction

Rejected because:

* system lacks custody inputs
* introduces false authority
* out of pilot scope

---

## ❌ TBT as Ledger

Rejected because:

* duplicates financial truth
* creates split-brain
* lacks auditability

---

# 5. Stability Assessment

| Decision                   | Stability |
| -------------------------- | --------- |
| D1 — Dual-layer model      | HIGH      |
| D2 — Table-first anchoring | HIGH      |
| D3 — Scope boundary        | HIGH      |
| D4 — TBT reclassification  | MEDIUM    |
| D5 — Reconciliation scope  | HIGH      |
| D6 — Surface truthfulness  | HIGH      |

---

# 6. Next Step

Once consensus is reached:

→ Convert each decision into **separate ADRs**
→ Freeze them (no patching, only superseding)

---

# 7. Closing Statement

This document is not an ADR.

It is the **last mutable artifact before architectural commitment**.

> ADRs will not define these decisions.
> ADRs will record that these decisions were made.

---
