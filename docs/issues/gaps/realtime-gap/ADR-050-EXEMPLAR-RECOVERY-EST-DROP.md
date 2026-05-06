# ADR-050 Exemplar Recovery — Shift Dashboard / Est. Drop / Rated Buy-In

## 1. Identity

**Feature Name:** ADR-050 Exemplar Recovery — Est. Drop Freshness  
**Surface:** Shift Dashboard → Est. Drop panel  
**Scope Type:** Exemplar (single-surface containment)  
**Objective:** Restore alignment between governance (ADR-050 LIVE SLA) and runtime behavior

---

## 2. Problem Statement

The system currently claims a **LIVE freshness contract (≤2s SLA)** for rated buy-in propagation to the Shift Dashboard.

In reality:
- Data pipeline is correct
- Realtime infrastructure is active
- UI does not receive events due to unauthenticated socket
- Panel updates only via polling (~30s)

This creates a **governance-runtime mismatch**:
> The system claims realtime, but behaves as eventual consistency.

---

## 3. Containment Strategy

This effort is intentionally constrained to a **single surface**:

### Included Surface
- Shift Dashboard → Est. Drop panel
- Event: rated buy-in (table_buyin_telemetry INSERT)
- Consumer: existing Shift Dashboard hook

### Explicit Exclusions
- Other dashboard panels (Win/Loss, Fills, Credits)
- Other domains (MTL, session custody, pit approvals)
- ADR-004 full realtime infrastructure (registry, scheduler)
- INT-002 event expansion
- Global hook standardization
- CI/system-wide enforcement

---

## 4. Core Invariant (Newly Enforced)

> **All realtime subscriptions MUST operate under an authenticated socket matching the data-access role.**

Implication:
- Browser realtime must propagate JWT into socket
- Absence of auth → silent event drop under RLS
- This invariant is now treated as **surface-critical**

---

## 5. Implementation Slice

### 5.1 Browser Auth → Realtime Bridge

Add to client factory:

- Initial hydration: push token from restored session
- Auth state change: push updated token
- Token refresh: ensure continuity

```ts
realtime.setAuth(token)
```

This is:
- centralized (factory-level)
- not hook-specific
- required for all consumers implicitly

---

### 5.2 Consumer Behavior (No Expansion)

- Keep existing hook
- No abstraction rewrite
- No registry introduction
- Only ensure:
  - events are received
  - query invalidation fires
  - UI reflects change

---

### 5.3 Event Scope

Only:
- table_buyin_telemetry
- INSERT events
- Rated buy-in commits

No expansion beyond this.

---

## 6. Proof of Correctness

### Required Verification Path

Must be executed under **Mode B (browser-authenticated)**:

1. Open `/shift-dashboard`
2. Capture baseline Est. Drop
3. Execute real RPC (authenticated)
4. Observe panel update

### Acceptance Criteria

- Update occurs within ≤5s (target ≤2s)
- No page reload required
- No reliance on polling fallback
- Removing auth bridge causes failure

---

## 7. Test Hardening (Minimal)

Add one E2E condition:

> Test must fail if `realtime.setAuth` is removed.

Rationale:
- Prevent regression of silent failure class
- Current tests cannot detect this

---

## 8. Non-Goals

This slice does NOT attempt to:

- Implement ADR-004 architecture
- Solve all realtime inconsistencies
- Normalize all hooks
- Address DEV_AUTH_BYPASS behavior
- Enforce CI-wide authenticated-role testing

---

## 9. Outcome Definition

Success is defined as:

> The Est. Drop panel reflects rated buy-in commits in near realtime, in a live browser session, matching the declared ADR-050 SLA.

Not:
- “Realtime system implemented”
- “All panels live”
- “Architecture aligned”

---

## 10. Follow-Up Trigger Rule

Expansion beyond this slice is allowed ONLY if:

- A second surface requires identical auth→realtime behavior
- A third surface confirms repetition

At that point:
→ Extract shared infrastructure (ADR-004 subset)

Until then:
→ Keep implementation localized

---

## 11. Summary

This effort is not a platform initiative.

It is a **truth-reconciliation wedge**:

> Repair one surface where governance claims realtime but runtime does not deliver.

By enforcing the auth→realtime invariant at the client boundary, this slice restores integrity between:
- data
- transport
- UI behavior
- declared SLA

Everything else is deferred.
