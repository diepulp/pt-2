# Loyalty Pilot Slice Boundary
**Project:** Casino Player Tracker  
**Status:** Pilot containment artifact  
**Purpose:** Bound loyalty scope to a pilot-safe, operator-complete reward loop covering all instrument-backed rewards required for pilot: match play, meal comps, free play, and other floor comps.
**Reference/ supporting artifact** docs/00-vision/loyalty-service-extension/LOYALTY-SYSTEM-POSTURE-PRECIS.md

---

## Why this document exists

The loyalty domain is a perfect example of the current project pathology:

- substantial infrastructure exists
- operator/admin gaps remain
- multiple downstream needs converge on the same upstream plumbing
- every adjacent requirement starts sounding “vital”
- the scope quietly mutates from “make one reward flow work” into “finish loyalty”

This document exists to stop that.

It defines the **broad loyalty pilot boundary** and then carves out the **concrete pilot reward instrument scope** — the set of instrument-backed rewards the floor actually needs for pilot, and the minimal print standard required to fulfill them.

---

## Document structure

This artifact intentionally combines three levels:

1. **Loyalty Pilot Slice Boundary**
   Defines what loyalty means for pilot in general terms.

2. **Pilot Reward Instruments Scope**
   Defines the concrete instrument-backed rewards that must actually work in pilot: match play, meal comps, free play, and other floor comps.

3. **Pilot Reward Instrument Print Standard**
   Defines the minimal print capability required to fulfill instrument-backed rewards used in pilot. Not a print platform. A print standard.

These should live together, not as separate competing artifacts.

### Rationale
If they are split apart, one of two stupid things happens:

- the broad loyalty boundary becomes too abstract and quietly omits the physical artifacts the floor actually needs
- the instrument scope becomes over-specialized around one reward type and pretends the floor only issues match play

Keeping them together preserves both truths:

- loyalty is larger than the pilot instrument set
- pilot needs a bounded but real set of operator-complete reward loops, not just one

---

## Pilot loyalty principle

For pilot, loyalty is **not** “the entire reward ecosystem.”

For pilot, loyalty means:

> Admin can configure a narrow reward catalog, and pit operations can issue a usable reward from that catalog through a trustworthy, auditable, operator-complete workflow.

The word **usable** matters.

If the reward has no real operational value until a physical artifact exists, then printing is part of that reward’s pilot workflow.

That does **not** make printing a universal requirement for all loyalty activity.
It makes printing required for **instrument-backed pilot rewards**.

For this pilot, those instrument-backed rewards are: **match play, meal comps, free play, and other floor comps**. All of them require a printed artifact to have operational value on the floor. The system currently has zero printing infrastructure.

---

# 1. Loyalty Pilot Slice Boundary

## Goal

Enable a narrow, controlled reward loop that allows:

- admin configuration of pilot-eligible rewards
- pit boss issuance of configured rewards to a player
- trustworthy persistence of reward issuance
- enough visibility to support and audit the transaction

## Pilot loyalty success condition

Loyalty is pilot-ready when a real operator can:

1. identify a player
2. see a valid reward option
3. issue that reward
4. create the usable outcome required by the floor
5. leave behind a trustworthy record that support/admin can inspect

---

## In scope — broad loyalty pilot boundary

### Admin configuration
- create reward catalog entries needed for pilot
- edit pilot reward metadata
- activate / deactivate rewards
- set points cost or entitlement basis required for pilot
- set only the minimum eligibility configuration needed for pilot behavior

### Operator issuance
- view available pilot rewards in player context
- issue an eligible reward
- receive understandable success/failure feedback
- access recent issuance history or enough support visibility to confirm what happened

### System behavior
- validate that the reward is currently issuable
- persist issuance consistently
- update the appropriate loyalty records
- expose enough history/audit trace to support troubleshooting
- fulfill the reward if fulfillment is required for real-world use

### Supportability
- issuance can be inspected after the fact
- known operator failures have readable outcomes
- there is a minimal manual recovery/reconciliation path

---

## Out of scope — broad loyalty pilot boundary

The following are explicitly deferred unless the pilot literally dies without them:

- fully generalized loyalty platform completion
- all reward families operationalized at once
- advanced promo campaign systems
- broad liability measurement refinement
- generalized coupon/instrument orchestration
- universal reward-limit engine
- broad tier-policy sophistication
- phase-2 multi-property behavior expansion
- comprehensive analytics or executive reporting surfaces
- abstraction work not tied to a pilot blocker

---

## Broad loyalty pilot acceptance criteria

### Admin
- admin can create or update pilot reward definitions
- admin can activate and deactivate pilot rewards
- required pilot pricing / entitlement fields are configurable

### Operator
- pit boss can view pilot reward options in player context
- pit boss can issue a pilot reward through a normal workflow
- the system prevents obviously invalid issuance states
- the operator gets clear feedback on success or failure

### System
- issuance produces a persisted record
- reward history can be inspected
- the pilot reward becomes usable in the way the floor requires
- failures are diagnosable enough for support

---

# 2. Pilot Reward Instruments Scope

## Why pilot rewards need printing

Match play, meal comps, free play, and other floor comps are not just “reward entries.”

They are **instrument-backed rewards**.
Their operational value does not exist merely because the database says they were issued.

If the floor requires a printed coupon, printed comp slip, or printed match play artifact, then:

> issuance without printing is theater.

That means printing is in scope for **all instrument-backed pilot reward workflows**.

This does **not** mean a generic print platform is in scope for the whole loyalty domain. It means a **pilot reward instrument print standard** must exist — the smallest print surface that can fulfill the concrete reward types the pilot uses.

---

## Pilot reward instruments

The following instrument-backed rewards are in scope for pilot:

| Instrument | Family | Why pilot needs it | Print required |
|------------|--------|-------------------|----------------|
| **Match play** | entitlement | Floor staple. Player presents printed coupon at table for matched wager. | Yes |
| **Meal comp** | points_comp | Most common comp issued by pit boss. Player presents printed slip at restaurant/cage. | Yes |
| **Free play** | entitlement | Tier-based slot credit. Player presents printed voucher at slot host or cage. | Yes |
| **Other comps** | points_comp | Beverage, miscellaneous, retail. Issued from catalog at pit boss discretion. | Yes |

All four share the same structural need: issuance produces a record, printing produces a usable floor artifact.

---

## Pilot reward instruments goal

Enable a pit boss to issue any pilot-eligible reward to a player and immediately produce the printable instrument required for the floor to honor it, with auditable persistence and basic re-checkability.

---

## Pilot reward instruments workflow

### Admin loop
1. Configure pilot reward definitions (match play, meal comp, free play, other comps)
2. Set the minimal entitlement / pricing / activation rules needed for each
3. Make those rewards available for issuance

### Pit boss loop
1. Open player context
2. View available pilot rewards for this player
3. Select reward and trigger issuance
4. Produce the printable instrument
5. Confirm issuance succeeded
6. Verify the issued item exists in history/support view

### Support loop
1. Inspect whether issuance occurred
2. Confirm what was issued and what was printed
3. Reconcile obvious failure states
4. Reprint only if pilot truly requires it

---

## In scope — pilot reward instruments

### Admin
- define the pilot reward catalog entries (match play, meal comp, free play, other comps)
- activate / deactivate reward eligibility for pilot use
- set the minimal configuration that determines what can be issued (points cost, entitlement basis, tier mapping)

### Issuance path
- direct reward issuance from operator workflow (per-instrument or unified issue drawer)
- validation of basic eligibility / active state
- creation of the issuance record
- update of the relevant loyalty state (ledger debit for comps, coupon creation for entitlements)

### Printing / fulfillment
- a pilot reward instrument print standard sufficient to render all pilot instrument types
- one print trigger per issuance flow
- one operator-complete path from issuance decision to printable artifact per instrument type
- minimal reprint support only if operationally necessary for pilot survival

### Audit / support
- issued rewards are visible in history, log, or audit surface sufficient for support
- failed issuance or failed print returns understandable feedback
- enough metadata exists to diagnose what happened

---

## Out of scope — pilot reward instruments

The following are explicitly banned unless a real pilot blocker proves otherwise:

- generic print framework beyond the pilot instrument print standard
- universal coupon rendering engine
- template registry for non-pilot reward types
- full promo platform completion
- all reward types unified under one perfect fulfillment abstraction
- advanced reprint lifecycle controls
- printer fleet management sophistication
- multi-property template/version policy
- generalized campaign issuance
- large loyalty refactors for elegance

---

## Pilot Reward Instrument Print Standard

### What this is

A minimal, bounded print capability sufficient to fulfill instrument-backed rewards used in pilot. It is defined here as a standard, not a platform.

The system currently has **zero printing infrastructure**. This standard defines what must be built and where to stop.

### Principle

> Build the smallest print surface that makes every pilot instrument type usable on the floor. Stop there.

### Print standard requirements

1. **One rendering path** — a single mechanism (e.g., hidden iframe + HTML template) that can produce a printable artifact from issuance data
2. **Per-instrument templates** — each pilot instrument type gets its own template with the fields the floor requires (not a generalized template engine; just the templates the pilot uses)
3. **Common fields** — all pilot instrument prints share: casino name, player name, issued date/time, validation number or reference, issued-by staff, expiry if applicable
4. **Instrument-specific fields**:
   - Match play: face value, required match wager, table game designation
   - Meal comp: comp value, points redeemed, post-balance
   - Free play: face value, tier basis, slot designation if applicable
   - Other comps: comp type, value, points redeemed if applicable
5. **Print trigger** — each issuance flow includes a print action that invokes the rendering path with the correct template
6. **Print feedback** — the operator receives clear success/failure indication after print attempt
7. **Reprint** — minimal reprint capability only if pilot survival requires it (manual workaround acceptable)

### What the print standard is NOT

- It is not a document management system
- It is not a template registry with versioning
- It is not a printer fleet abstraction
- It is not a generic rendering engine for arbitrary reward types
- It is not designed for extensibility beyond the pilot instrument set

If a post-pilot reward type needs printing, it earns its own bounded assessment. The print standard does not pre-authorize it.

---

## Pilot reward instruments acceptance criteria

### Admin acceptance criteria
- admin can configure each pilot reward type (match play, meal comp, free play, other comps)
- admin can activate/deactivate each for pilot use
- the minimum configuration required for issuance exists and is editable per instrument type

### Operator acceptance criteria
- pit boss can see which pilot rewards are available for a player
- pit boss can issue any pilot reward without leaving the intended workflow
- pit boss can print the resulting instrument immediately after issuance
- the operator receives clear confirmation when issuance and print succeed
- the operator receives clear failure feedback when issuance or print fails

### Persistence acceptance criteria
- issuance creates a durable record per instrument type
- the record is inspectable after the fact
- enough information exists to determine whether a print-backed reward was actually issued

### Print standard acceptance criteria
- each pilot instrument type has a printable template that the floor accepts
- the print output contains sufficient information for the floor to honor the reward
- the print mechanism works on the pilot environment's available hardware (standard browser print)

### Pilot reality acceptance criteria
- a floor user can complete the process for any pilot instrument type without developer intervention
- the printed output is sufficient for the pilot environment to honor the reward
- the workflow is usable even if the underlying implementation is not yet generalized

---

# 3. Guardrails Against Scope Creep

## Guardrail 1 — Pilot reward loops, not loyalty completion
The objective is not to “finish loyalty.”

The objective is to make the **pilot reward instrument set** real and usable: match play, meal comps, free play, and other floor comps.

If a proposed task does not help admin configure, operator issue, system persist, print fulfill, or floor honor one of the pilot reward instruments, defer it.

---

## Guardrail 2 — Printing is pilot-instrument-complete, not domain-universal
For pilot reward instruments, printing is in scope because these workflows are incomplete without a physical artifact the floor can honor.

The **pilot reward instrument print standard** exists to fulfill the concrete pilot set: match play, meal comps, free play, and other comps.

This must **not** be reinterpreted as:

- all future loyalty rewards automatically inherit print support
- loyalty service must become a generic document platform
- the print standard must be designed for extensibility beyond the pilot set

Printing is required **for the pilot instrument types that need it**, governed by the print standard defined in Section 2. Post-pilot reward types earn their own print assessment.

---

## Guardrail 3 — Pilot instrument set is frozen
The pilot instrument set is: **match play, meal comps, free play, and other floor comps**.

This set was established because pilot evidence confirms operators need all of them to run a real shift. The set is now frozen.

Do not pull in additional reward types, fulfillment modes, or instrument families beyond this set unless a real pilot blocker proves otherwise. If a new instrument type must be added, it gets its own bounded slice review before entering scope.

---

## Guardrail 4 — Per-instrument templates, one rendering path, one ugly truth
The pilot needs:

- one print rendering mechanism (e.g., hidden iframe + browser print)
- one template per pilot instrument type (match play, meal comp, free play, other comp)
- one issuance-to-print path per instrument type

It does not need:
- a reusable print engine with template registration
- a generalized fulfillment abstraction
- an elegant document domain model
- a shared template framework across instrument types

Per-instrument templates that share a rendering path is the correct granularity. Use the ugly, direct implementation that survives pilot.

---

## Guardrail 5 — No architecture cleanup without blocker linkage
No refactor, re-abstraction, or service redesign may be justified by “future reward types” unless tied to a present pilot blocker.

Every technical change must answer:

> What exact pilot failure does this fix?

If it does not fix one, it does not belong now.

---

## Guardrail 6 — Manual workaround beats premature platform
If a function can be handled manually for 4 weeks, prefer the workaround over building permanent infrastructure in panic.

Examples:
- limited admin setup steps
- narrow reprint procedure
- manual reconciliation notes
- constrained operator instructions

A pilot workaround is cheaper than a platform detour.

---

## Guardrail 7 — No downstream convergence bundling beyond the frozen set
The following argument is banned:

> “Since the pilot instruments, couponing, promo inventory, liability measurement, and print all converge here, we should solve them together.”

No.

The pilot instrument set (match play, meal comp, free play, other comps) was admitted because pilot evidence proved operators need them concurrently. That decision is made. The set is frozen.

Any further convergence argument — “while we're building print, let's also handle X” — must prove that X is in the frozen pilot set. If it is not, convergence is scope creep dressing itself up as coherence.

---

# 4. Decision Filter for Any New Loyalty Work

Before approving a new loyalty task, answer all of these:

1. Does this directly unblock admin configuration for a pilot reward instrument?
2. Does this directly unblock pit boss issuance for a pilot reward instrument?
3. Does this directly unblock the printable/usable outcome required by the floor for a pilot instrument?
4. Does this directly improve persistence, auditability, or supportability of a pilot reward instrument?
5. Does this introduce a reward type outside the frozen pilot set (match play, meal comp, free play, other comps)?
6. Does this introduce a fulfillment mode beyond the pilot reward instrument print standard?
7. Does this generalize beyond the pilot instrument set?

## Decision rule
- If the answer is **yes** to 1–4, it may be in scope
- If the answer is **yes** to 5–7, default = defer or ban

---

# 5. Recommended Implementation Sequence

## Phase A — Admin configuration minimum
- make all pilot reward instruments (match play, meal comp, free play, other comps) definable and activatable in the reward catalog
- ensure the minimum entitlement/pricing fields exist and are usable per instrument type
- establish the minimum tier-to-entitlement mapping needed for entitlement instruments

## Phase B — Operator issuance minimum
- expose pilot reward availability in player context (unified issue surface or per-type triggers)
- wire issuance actions through the intended operator flow for each pilot instrument type
- persist the resulting issuance correctly (ledger debit for comps, coupon creation for entitlements)

## Phase C — Print-backed completion (Pilot Reward Instrument Print Standard)
- build the single rendering mechanism (hidden iframe + browser print)
- create per-instrument templates for each pilot reward type
- wire print trigger into each issuance flow
- return understandable print success/failure outcomes

## Phase D — Supportability minimum
- expose enough history/log visibility to inspect issuance across all pilot instrument types
- add only the minimum reprint/reconciliation path needed for pilot survival

---

# 6. Explicit Deferred Ledger

These are not “forgotten.” They are intentionally deferred.

## Deferred until after pilot
- generic loyalty fulfillment abstraction beyond the pilot instrument set
- reward types outside the frozen set (non-pilot instruments)
- generalized coupon engine
- richer reward-limit enforcement beyond basic pilot guardrails
- advanced eligibility policy rules
- liability refinement and measurement expansion
- generalized print services beyond the pilot instrument print standard
- sophisticated reprint lifecycle
- multi-property fulfillment complexity
- broad loyalty reporting surfaces
- template versioning or registry system
- print audit trail beyond basic metadata

## Banned during this pilot slice
- “finish loyalty”
- “build a printing platform”
- “solve all instrument-backed rewards, including non-pilot types”
- “refactor loyalty for future extensibility”
- “unify all reward issuance patterns before shipping”
- “make the print standard extensible for future reward types”

---

# 7. Final Boundary Statement

This pilot slice is approved only as the following:

> A narrow loyalty pilot that allows admin configuration of a bounded set of pilot reward instruments and allows pit operations to issue and fulfill each through a real, usable, auditable, print-backed workflow.

For the current pilot, those concrete workflows are:

> **Match play, meal comp, free play, and other floor comp issuance — each with immediate printable fulfillment via the pilot reward instrument print standard.**

The print standard exists to serve these four instrument types. It is not a platform. It is not extensible by default. It does not authorize printing for non-pilot reward types.

Nothing in this artifact authorizes expansion into:
- full loyalty completion
- full reward platform completion
- universal printing beyond the pilot instrument print standard
- fulfillment architecture for non-pilot reward types
- broad promo system rollout
- print template versioning or registry systems

Ship the pilot instrument loops.
Do not build the kingdom that your nervous system keeps hallucinating around them.
