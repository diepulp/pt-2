# Cross-Property Player Sharing — Addendum
**Date:** 2026-03-09  
**Status:** Addendum to Investigation  
**Parent Document:** `CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`  
**Purpose:** Clarify operational scope for cross-property patron lookup and local gaming activation under the same company umbrella.

---

## 1. Scope Clarification

This addendum narrows the immediate operational target for cross-property player sharing.

### In Scope
- **Manual patron lookup across sister properties** under the same company umbrella
- **Prompted local activation** at the selected property (**Option B**)
- **Local instantiation for gaming action** at the property where the patron is physically present

### Out of Scope
- Card scanner / card swipe interoperability
- Physical card credential unification across properties
- Automatic cross-property enrollment on first use
- Any cross-property mutation of another casino's live operational records

**Interpretation:**  
For the current phase, “the card should work across properties” does **not** mean scanner-level interoperability. It means the patron can be **manually found** across company-linked properties and then **activated locally** for gaming action at the current property.

---

## 2. Refined Business Workflow

The intended floor workflow is:

1. Staff at **Casino B** performs a **manual lookup** for the patron.
2. The system searches across all casinos under the same **company** and finds the global `player` record.
3. The system shows whether the patron already has a `player_casino` enrollment at **Casino B**.
4. If the patron is **already enrolled at Casino B**, staff may proceed with local gaming workflow.
5. If the patron is **not enrolled at Casino B**, staff is prompted to **activate the patron locally**.
6. Upon confirmation, the system creates the **Casino B** enrollment row in `player_casino`.
7. The system then creates **Casino B-scoped operational records** for gaming action (visit, rating context, etc.).

This preserves the governing principle:

> **Reads cross the company boundary. Writes never do.**

---

## 3. Meaning of “Local Instantiation”

To avoid ambiguity, **local instantiation** means:

- confirm or create **Casino B enrollment**
- create **Casino B visit / session context**
- create **Casino B operational rows** for gaming action
- optionally surface **company-level read-only summaries** for hosting context

It does **not** mean:

- mutating Casino A’s visit
- appending to Casino A’s rating slip
- reusing another property’s live operational rows as shared mutable state
- issuing or editing Casino A’s rewards / loyalty / compliance records

**Design consequence:**  
Cross-property visibility is a **recognition capability**. Gaming action remains a **local operational capability**.

---

## 4. Selected Enrollment Policy: Option B

The selected policy is:

## Option B — Prompted Local Activation

When a patron is found through company-scoped lookup but has no local enrollment at the current property, staff must explicitly confirm activation at that property before gaming action begins.

### Why Option B is the correct choice now
- It matches current operational reality: lookup is manual, not scanner-driven
- It avoids silent side effects during search
- It preserves a visible staff decision point
- It keeps local enrollment auditable
- It avoids premature automation before card credentialing and cross-property identity UX are solved

### Operational Rule
A patron discovered through company-scoped lookup is **not automatically playable** at the selected property until local activation is confirmed.

---

## 5. Architectural Interpretation

The investigation’s target model **does support** cross-property patron recognition and local gameplay activation, but only with the following boundary:

- **Global identity**
- **Company-scoped read access**
- **Casino-scoped local enrollment**
- **Casino-scoped operational writes**

That means the architecture should support:

- find global `player`
- inspect portfolio enrollment via `player_casino`
- prompt local activation if needed
- create local records only at the current casino

This is fully consistent with the investigation’s original taxonomy and guardrails.

---

## 6. Data Boundary Restatement for the Patron Workflow

### May inform local activation (read-only, company-scoped)
- player profile
- enrollment history
- prior property participation
- aggregated loyalty summary
- aggregated financial summary
- exclusion / banned status, if approved by policy

### Must remain local after activation
- visit rows
- rating slips
- local rewards actions
- property-specific telemetry
- compliance transaction rows
- property-specific staff notes / observations

This distinction matters because the user-facing experience may feel “cross-property,” but the system of record for live gaming action is still the **local casino**.

---

## 7. Product / UX Implications

The product flow should expose three distinct states during lookup:

### State A — Found and already active locally
- Patron found
- Existing `player_casino` row for current casino exists
- Staff may continue directly into local gaming workflow

### State B — Found across company, not active locally
- Patron found through company-scoped search
- No `player_casino` row exists for current casino
- UI presents **Activate at this property** action
- Confirmation creates local enrollment, then proceeds

### State C — Not found
- No matching global player
- Fall back to existing local/new patron onboarding path

This should be explicit in future PRD / UX work so the floor staff experience does not blur discovery and activation into a single opaque action.

---

## 8. Security and Audit Expectations

Because cross-property lookup expands visibility, local activation should be auditable as a first-class event.

Recommended minimum audit payload:
- actor staff ID
- home casino ID
- selected casino ID
- target player ID
- action type (`company_lookup`, `local_activation`)
- timestamp
- reason / trigger where applicable

This is especially important because Option B introduces a deliberate staff confirmation step that should leave an audit trail.

---

## 9. Implementation Consequence

This addendum does **not** change the main investigation’s conclusion:

- the model is technically viable
- the blockers are still company bootstrap, context derivation, staff tenancy shape, RLS, and service-layer casino hard-scoping
- scanner/card interoperability remains deferred

What this addendum does change is the **operational framing**:

The near-term goal is **manual cross-property lookup + prompted local activation**, not universal card credential portability.

---

## 10. Recommended Fold-In to Parent Investigation

This addendum should be folded into future ADR / PRD work as the canonical interpretation of the patron-sharing workflow:

1. **Manual lookup first**
2. **Prompted local activation (Option B)**
3. **Company-scoped reads**
4. **Casino-scoped writes**
5. **No scanner assumptions**
6. **No cross-property mutation of live operational rows**

---

## 11. Plain-English Summary

A patron from Casino A may be manually found by staff at Casino B if both casinos belong to the same company.  
If the patron is not yet active at Casino B, staff explicitly activates them there.  
Once activated, the patron can be logged for gaming action at Casino B — but all new gaming records belong to Casino B, not Casino A.

That is the correct meaning of “shared patron” for the current scope.

---

## 12. Future Scanner Implementation Caveats

Card scanner support is deferred and **not** required for the current manual-lookup rollout.  
However, the present design should avoid hard-coding assumptions that would make scanner adoption painful later.

### Core Principle
A scanner should be introduced later as **another lookup input**, not as a different business workflow.

That means the system should preserve a clean separation between:

1. **Patron identity resolution**
2. **Local property enrollment status**
3. **Local activation decision**
4. **Local gaming/session creation**

### Architectural Guidance

#### Keep lookup method separate from patron identity
The patron is the system identity.  
A card number, loyalty number, barcode, or token is only a **credential / lookup key**.

Do **not** design the system such that:
- card number becomes the canonical player identity
- scanner success bypasses identity resolution rules
- card credential lifecycle becomes entangled with player lifecycle

This matters because cards may be reissued, replaced, duplicated across time, or handled differently by each property.

#### Keep activation separate from lookup UI
Local activation should remain an explicit service/action, not a side effect buried inside the manual search screen.

This allows future scanner-based lookup to reuse the same downstream activation flow without introducing a parallel path.

#### Do not fuse discovery, activation, and gameplay start into one opaque action
The system should continue to treat these as distinct steps:

- resolve patron
- determine local status
- activate locally if required
- create local operational records

If these steps are fused now for manual convenience, scanner adoption later will require unwinding that coupling.

#### Preserve Option B semantics unless policy changes
Even if a scanner is introduced later, **scanner success should not automatically imply local play authorization**.

Unless business policy is deliberately changed, the selected rule remains:
- cross-property discovery may happen
- local activation at the current property is still a distinct decision point

This keeps the operational model consistent across manual and scanner-assisted workflows.

### UX / Product Guidance for Future Scanner Support

When scanner support is eventually introduced, it should feed into the same status model already defined in this addendum:

- **Found and active locally**
- **Found across company, not active locally**
- **Not found**

The scanner should only accelerate the first step of lookup.  
It should not redefine enrollment semantics or local write ownership.

### Developer Warning

Manual lookup is **not** a temporary hack if implemented correctly.  
It becomes technical debt only if the codebase assumes:

- lookup is always fuzzy manual search
- card credential equals patron identity
- activation only exists inside the manual-search component
- scanner introduction will be allowed to bypass current tenancy rules

To avoid that debt, future implementation should preserve an interface shape conceptually similar to:

- `resolvePatron(input)`
- `getLocalPatronStatus(playerId, casinoId)`
- `activatePatronLocally(playerId, casinoId, actorId)`
- `startLocalGamingSession(playerId, casinoId, ...)`

This is not a mandate for exact naming, only a reminder that **lookup source** should remain decoupled from **tenancy and operational write rules**.

### Practical Conclusion
Deferring scanner support does **not** create a problem by itself.

The real risk is letting manual lookup define the architecture too narrowly.  
If the system preserves identity resolution, local activation, and local record creation as separate concerns, scanner support can be added later with minimal disruption.

