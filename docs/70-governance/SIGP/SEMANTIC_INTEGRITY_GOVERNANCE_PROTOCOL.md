# Semantic Integrity Governance Protocol

**Document type:** Governance protocol  
**Status:** Proposed canonical protocol  
**Date:** 2026-05-17  
**Applies to:** PT-2 bounded contexts, feature pipeline, architectural audits, PRD/EXEC review, projection and propagation slices  
**Purpose:** Provide a repeatable diagnostic protocol for surfacing semantic drift, split-brain behavior, authority ambiguity, projection confusion, and bounded-context incoherence before implementation hardens the fracture.

---

## 1. Purpose

The Semantic Integrity Governance Protocol exists to answer one question:

> Is this domain still semantically coherent under real operational use, propagation, projection, and surface rendering?

This protocol is not a replacement for ADRs, PRDs, EXEC specs, RLS audits, implementation tests, or feature intake briefs.

It is a diagnostic layer that runs before or alongside those artifacts when a domain shows signs that its concepts, authority boundaries, lifecycle ownership, or rendered meanings are drifting.

The protocol exists because PT-2 was built feature-first, and several domains now carry retroactive semantic debt. Financial telemetry surfaced the pattern first: split-brain stores, overloaded language, ambiguous authority, projection uncertainty, and UI truthfulness failures. Similar fractures are likely in Visit, Rating Slip, Loyalty, MTL, and future projection consumers.

The goal is not perfect ontology.

The goal is controlled semantic awareness.

---

## 2. Core Principle

Semantic fractures are acceptable only when they are:

- named,
- bounded,
- assigned,
- risk-rated,
- prevented from silently propagating,
- and either resolved or explicitly deferred.

Unidentified semantic drift is not acceptable.

The protocol does not require immediate canonicalization of every ambiguity. It requires that ambiguities stop hiding inside implementation.

---

## 3. Non-Goals

This protocol must not become:

- an ontology tribunal for every feature,
- a blocker for small UI changes,
- a generic DDD performance,
- a substitute for operator discovery,
- a mandate to rewrite every bounded context,
- a reason to halt implementation until all concepts are perfect,
- a mechanism for smuggling infrastructure work into feature slices.

If the protocol produces more architecture than risk reduction, it has failed.

---

## 4. When This Protocol Is Required

Run this protocol when any of the following conditions are true.

### 4.1 Mandatory Triggers

The protocol is required when a feature or refactor introduces or modifies:

1. Cross-context propagation.
2. Transactional outbox emission.
3. Projection consumers or replayable read models.
4. Financial, compliance, loyalty, visit, or session aggregates.
5. User-visible totals, statuses, summaries, or lifecycle labels.
6. Multiple surfaces consuming the same source facts.
7. A new domain term that affects authority, lifecycle, attribution, or accountability.
8. A migration that changes meaning, not merely shape.
9. A bounded-context boundary crossing.
10. Any feature where two existing stores or services appear to own the same operational fact.

### 4.2 Advisory Triggers

The protocol should be considered when:

- a bug report sounds like “the data is correct but misleading,”
- two services compute similar state differently,
- a UI value requires a disclaimer,
- a term is being used inconsistently across docs or code,
- operators must mentally compensate for system ambiguity,
- downstream artifacts keep reopening “what does this mean?” questions,
- a PRD or EXEC spec starts accumulating repeated caveats.

### 4.3 Not Required

The protocol is not required for:

- isolated visual changes,
- copy-only changes that do not affect claims of authority or workflow meaning,
- straightforward CRUD additions inside a single bounded context,
- test refactors with no semantic impact,
- mechanical type or lint cleanup,
- localized UI state changes.

---

## 5. Required Outputs

A semantic integrity review produces one of three outputs.

### 5.1 Semantic Clearance

Used when the domain or feature is coherent enough to proceed without additional semantic work.

Required contents:

- scope reviewed,
- contexts touched,
- terms reviewed,
- clearance statement,
- residual risks, if any.

### 5.2 Semantic Risk Register Entry

Used when a fracture is found but can be safely deferred.

Required contents:

- risk ID,
- short name,
- affected contexts,
- fracture type,
- severity,
- current behavior,
- why it is acceptable temporarily,
- containment rule,
- trigger for resolution,
- likely owner,
- likely successor artifact.

### 5.3 Canonicalization Directive

Used when the fracture is load-bearing and must be resolved before implementation proceeds.

Required contents:

- problem statement,
- affected contexts,
- terms requiring stabilization,
- authority/lifecycle/projection decisions required,
- explicit non-goals,
- minimum viable resolution,
- required downstream artifacts,
- exit criteria.

---

## 6. Severity Model

Semantic risks are rated by propagation danger, not by implementation difficulty.

### S0 — No Material Semantic Risk

The change is local. No authority, lifecycle, projection, or cross-context meaning is affected.

Action: proceed.

### S1 — Named Ambiguity

A term or concept is slightly ambiguous, but no current surface or propagation path depends on the ambiguity.

Action: record if useful; no blocking action.

### S2 — Contained Drift

A semantic inconsistency exists, but it is isolated to one surface, one service, or one non-authoritative path.

Action: add Semantic Risk Register entry; proceed with containment.

### S3 — Propagating Drift

A semantic ambiguity affects more than one surface, projection, service, or bounded context.

Action: require Canonicalization Directive before broad rollout. Narrow exemplar work may proceed if explicitly contained.

### S4 — Authority or Compliance Hazard

The system may misrepresent authority, completeness, financial truth, compliance status, attribution, or lifecycle finality.

Action: block implementation until canonicalized or explicitly scoped out.

### S5 — Production Trust Break

The system can expose misleading operational truth to users, auditors, managers, or external stakeholders.

Action: halt affected rollout; produce corrective ADR/PRD/EXEC sequence.

---

## 7. Diagnostic Passes

A semantic review runs the following passes. Not every pass requires a long answer, but every pass must be considered.

---

## 7.1 Authority Audit

Purpose:

Identify what is authoritative, observational, estimated, derived, or external.

Questions:

- What owns the authoritative truth?
- Which facts are authored?
- Which facts are observed?
- Which facts are estimated?
- Which facts are derived?
- Which facts are external to PT-2?
- Can authority degrade?
- Can authority upgrade?
- Are corrections mutations or new facts?
- Can two surfaces disagree legitimately?
- Does the feature imply settlement, finality, or truth the system does not possess?

Common fracture signs:

- “source of truth” used casually,
- derived values treated as authored facts,
- observational data displayed as actual,
- totals without completeness,
- reconciliation implied by aggregation.

Required decision if fractured:

Define authority class, owner, correction model, and surface label.

---

## 7.2 Aggregate Ownership Audit

Purpose:

Detect bounded-context split-brain.

Questions:

- Which aggregate owns lifecycle truth?
- Which aggregate owns status truth?
- Which aggregate owns attribution truth?
- Is another context reconstructing the same lifecycle?
- Are two services updating equivalent state independently?
- Is a summary table acting like a source of record?
- Does a modal, route, or dashboard compute state that belongs elsewhere?
- Can one aggregate close while another remains open?
- Is there a canonical transition boundary?

Common fracture signs:

- Visit and Rating Slip both claiming session lifecycle,
- Loyalty deriving session state directly instead of consuming a stable event,
- duplicated close/open logic,
- two services computing “active” differently.

Required decision if fractured:

Name lifecycle owner, projection consumers, and forbidden reconstruction paths.

---

## 7.3 Propagation Integrity Audit

Purpose:

Ensure transported events preserve meaning rather than merely moving data.

Questions:

- What exactly is propagated?
- What is intentionally not propagated?
- Is the propagated unit an authority fact, telemetry fact, dependency event, projection input, or lifecycle signal?
- Is the event immutable?
- Does it carry enough identity for idempotency?
- Does it preserve authority and attribution?
- Can consumers reinterpret it?
- Can it be replayed deterministically?
- Are consumers projection-only?
- Is transport being confused with domain authority?

Common fracture signs:

- overloaded event names,
- event payloads carrying UI envelopes,
- consumers writing back to authoring stores,
- missing idempotency identity,
- event categories inferred from payload shape.

Required decision if fractured:

Define event category, authoring owner, immutable fields, replay expectations, and consumer limits.

---

## 7.4 Surface Truthfulness Audit

Purpose:

Prevent correct data from becoming misleading when rendered.

Questions:

- What will the user infer from this surface?
- Is the value complete, partial, or unknown?
- Is authority visible?
- Is source visible where needed?
- Are mixed-origin values labeled honestly?
- Can a user mistake operational visibility for financial truth?
- Can a user mistake a compliance aid for legal sufficiency?
- Can stale or missing data appear current?
- Does the UI hide uncertainty behind clean formatting?

Common fracture signs:

- clean totals over partial data,
- unlabeled estimates,
- confidence language without completeness,
- “drop,” “settlement,” or “final” language used prematurely,
- tooltip-only caveats for load-bearing uncertainty.

Required decision if fractured:

Define visible label, completeness semantics, forbidden copy, and rendering constraints.

---

## 7.5 Vocabulary Integrity Audit

Purpose:

Stabilize language before it becomes implementation.

Questions:

- Which terms are overloaded?
- Does the same term mean different things in code, UI, docs, and operator speech?
- Are different names used for the same concept?
- Is an internal architecture term leaking into buyer/operator language?
- Does the term collapse authority, lifecycle, and presentation into one word?
- Would an operator recognize this concept?
- Would a developer implement it consistently?

Common fracture signs:

- “financial event” used for authority facts, telemetry, and dependency events,
- “session” used for visit, rating slip, and UI tab state,
- “loyalty event” used for accrual, adjustment, reward, and notification,
- “complete” used without lifecycle ownership.

Required decision if fractured:

Retire, split, or canonize terms. Add glossary entry or UL note.

---

## 7.6 Projection Dependency Audit

Purpose:

Ensure derived state is computable, replayable, and honest.

Questions:

- What inputs are required?
- Which inputs are authoritative?
- Which inputs are dependency events?
- Which inputs may be missing?
- Can completeness be computed?
- Is the projection deterministic?
- Can it be rebuilt from events?
- Does ordering matter?
- What is the lifecycle window?
- What happens when a dependency arrives late?

Common fracture signs:

- projections polling authoring tables directly,
- completeness always unknown,
- replay producing different state,
- projection logic hidden in UI,
- derived tables becoming de facto source of truth.

Required decision if fractured:

Define inputs, ordering, lifecycle boundary, completeness rule, and replay gate.

---

## 7.7 Operational Reality Audit

Purpose:

Keep the model subordinate to casino floor reality.

Questions:

- Does the model reflect how operators actually work?
- Are operators mentally bridging missing state?
- Does the system invent a concept that operations will not recognize?
- Does the model force a workflow distortion?
- Are compliance or financial concepts being softened for UI convenience?
- Does the proposed abstraction reduce or increase operator ambiguity?

Common fracture signs:

- architecture-first labels,
- user-facing ontology,
- workflows that make sense only to developers,
- “technically correct” outputs that operators misread.

Required decision if fractured:

Return to operator moment, rewrite feature loop, or split domain concept.

---

## 8. Fracture Types

Use these labels in Semantic Risk Register entries.

| Fracture Type | Meaning |
|---|---|
| Authority Ambiguity | The system does not clearly distinguish actual, estimated, observed, compliance, or derived truth. |
| Aggregate Split-Brain | Two bounded contexts appear to own the same lifecycle, status, or fact. |
| Projection Drift | A projection computes state from unstable or incomplete inputs. |
| Surface Misrepresentation | UI/API/export can imply stronger truth than the system owns. |
| Vocabulary Overload | One term carries multiple conflicting meanings. |
| Lifecycle Ambiguity | Open, closed, active, complete, voided, or finalized states lack a clear owner. |
| Attribution Ambiguity | Actor, player, staff, table, casino, or gaming-day ownership is unclear. |
| Propagation Ambiguity | Events are transported without stable semantic category or consumer contract. |
| Reconciliation Leak | The system implies accounting, settlement, or external truth. |
| Domain Boundary Leak | One bounded context writes, derives, or corrects another context’s authority state. |

---

## 9. Standard Review Procedure

### Step 1 — Identify Review Scope

Record:

- artifact being reviewed,
- bounded contexts touched,
- tables/services/routes/surfaces touched,
- whether propagation or projection is involved,
- whether user-visible meaning changes.

### Step 2 — Run Trigger Check

State why the protocol is required or advisory.

### Step 3 — Run Diagnostic Passes

Use the seven audit passes. Keep answers terse unless a fracture is detected.

### Step 4 — Classify Fractures

For each fracture:

- assign fracture type,
- assign severity,
- identify affected contexts,
- describe current behavior,
- describe risk if ignored.

### Step 5 — Decide Disposition

Choose one:

- clear,
- defer with register entry,
- require canonicalization directive,
- block rollout.

### Step 6 — Define Containment

If deferred, define exactly what must not happen.

Examples:

- no new surfaces may use this term,
- no consumer may infer authority from payload,
- no projection may compute completeness from this store,
- no UI may label this value final,
- no route may expose this aggregate without unknown completeness.

### Step 7 — Attach Downstream Action

Attach one of:

- glossary patch,
- UL note,
- ADR,
- PRD amendment,
- FIB amendment,
- migration guard,
- test harness,
- surface label requirement,
- successor semantic review.

---

## 10. Semantic Risk Register Template

```md
# Semantic Risk Register Entry

## Identity
- Risk ID:
- Name:
- Date opened:
- Reviewer:
- Severity: S0 / S1 / S2 / S3 / S4 / S5
- Fracture type:
- Affected contexts:
- Affected artifacts:

## Current Behavior
[Describe what the system currently does.]

## Semantic Fracture
[Describe the meaning conflict.]

## Why This Matters
[Describe operational, compliance, financial, or implementation risk.]

## Temporary Containment
[Describe what must not happen while unresolved.]

## Allowed Work While Open
[Describe what can safely continue.]

## Blocked Work While Open
[Describe what must wait.]

## Resolution Trigger
[Describe what event forces resolution.]

## Likely Resolution Artifact
[ADR / PRD amendment / FIB amendment / UL note / migration / test harness]

## Owner
[Name / role]

## Status
Open / Contained / Resolved / Superseded
```

---

## 11. Canonicalization Directive Template

```md
# Semantic Canonicalization Directive

## 1. Problem
[State the semantic fracture plainly.]

## 2. Affected Contexts
[List bounded contexts, tables, services, routes, surfaces.]

## 3. Current Competing Meanings
| Concept | Meaning A | Meaning B | Where Seen |
|---|---|---|---|

## 4. Required Decisions
- Authority:
- Aggregate owner:
- Lifecycle owner:
- Propagation category:
- Surface rendering rule:
- Vocabulary decision:
- Projection rule:

## 5. Explicit Non-Goals
- [Non-goal]
- [Non-goal]

## 6. Minimum Viable Resolution
[Smallest decision set that restores semantic coherence.]

## 7. Required Downstream Artifacts
- [ADR / PRD / EXEC / migration / test / glossary]

## 8. Exit Criteria
- [Criterion]
- [Criterion]
- [Criterion]
```

---

## 12. Semantic Clearance Template

```md
# Semantic Clearance

## Scope Reviewed
[Artifact / feature / PRD / EXEC / migration]

## Contexts Touched
[List contexts]

## Trigger
[Why review was run]

## Diagnostic Summary
| Pass | Result | Notes |
|---|---|---|
| Authority | Clear / Risk | |
| Aggregate Ownership | Clear / Risk | |
| Propagation | Clear / Risk | |
| Surface Truthfulness | Clear / Risk | |
| Vocabulary | Clear / Risk | |
| Projection Dependency | Clear / Risk | |
| Operational Reality | Clear / Risk | |

## Decision
Clear / Clear with register entry / Canonicalization required / Blocked

## Residual Risk
[None or named risks]

## Reviewer
[Name / date]
```

---

## 13. Integration With Existing PT-2 Governance

### 13.1 Feature Intake Brief

A FIB defines human intent.

This protocol checks whether the existing domain model can express that intent coherently.

If the semantic review discovers a new operator-visible goal, amend the FIB. Do not smuggle it through a semantic artifact.

### 13.2 ADR

Use an ADR when the protocol requires a durable architectural decision.

Examples:

- authority ownership,
- lifecycle ownership,
- propagation category,
- correction model,
- surface truth boundary.

### 13.3 PRD

Use a PRD when the semantic decision must be implemented as product or service behavior.

Examples:

- route response shape,
- projection consumer behavior,
- UI label behavior,
- new status lifecycle.

### 13.4 EXEC

Use an EXEC spec when the semantic decision is stable and implementation sequencing is needed.

The EXEC must cite the semantic review if it is implementing a resolved fracture.

### 13.5 Rollout Map

Use rollout maps when a fracture requires phased consolidation.

The map must distinguish:

- diagnostic phase,
- exemplar proof phase,
- producer expansion,
- consumer expansion,
- surface migration.

### 13.6 Test Harness

Semantic decisions should become tests when possible.

Useful test types:

- authority label preservation,
- no authority upgrade,
- lifecycle owner consistency,
- no direct cross-context writes,
- projection replay equivalence,
- surface completeness presence,
- forbidden term grep where appropriate.

---

## 14. Initial Candidate Reviews

The following domains are likely candidates for this protocol.

### 14.1 Visit vs Rating Slip

Likely fracture types:

- Aggregate Split-Brain
- Lifecycle Ambiguity
- Projection Drift
- Surface Misrepresentation

Initial questions:

- Does Visit own session lifecycle, or does Rating Slip?
- Is Rating Slip a transactional session artifact, a rating artifact, or both?
- Which aggregate owns close/open semantics?
- Which surfaces are reconstructing session financial state?
- What does “active visit” mean compared to “open rating slip”?

### 14.2 Loyalty Outbox

Likely fracture types:

- Propagation Ambiguity
- Authority Ambiguity
- Vocabulary Overload
- Projection Dependency

Initial questions:

- Is loyalty accrual an authority fact, projection artifact, or reward liability event?
- What does the outbox propagate: accrual, eligibility, liability, notification, or reward issuance?
- Can loyalty events be replayed without double-crediting?
- Does loyalty consume financial authority, operational telemetry, or both?
- What is the correction model?

### 14.3 MTL / Compliance

Likely fracture types:

- Authority Ambiguity
- Reconciliation Leak
- Surface Misrepresentation
- Domain Boundary Leak

Initial questions:

- What is compliance truth versus operational financial truth?
- What does MTL own that PFT does not?
- Can compliance summaries aggregate non-compliance authority values?
- Which surfaces may show compliance alongside financial activity?
- What must remain parallel and never merged?

### 14.4 Operational Intelligence

Likely fracture types:

- Projection Drift
- Surface Misrepresentation
- Vocabulary Overload
- Operational Reality Drift

Initial questions:

- Which metrics are derived from complete lifecycle windows?
- Which metrics are estimates?
- Which metrics are operational heuristics?
- Can dashboard freshness be computed?
- Can operators distinguish insight from financial truth?

---

## 15. Operating Discipline

The protocol should be run with restraint.

A good semantic review is short when nothing is wrong.

A bad semantic review produces pages of speculation without changing risk.

Preferred behavior:

- detect,
- classify,
- contain,
- decide the minimum next action.

Avoid:

- inventing new abstractions,
- expanding scope,
- requiring new infrastructure,
- rewriting working domains without evidence,
- canonizing speculative future concepts.

The governing maxim:

> Surface the fracture. Do not worship the fracture.

---

## 16. Exit Standard

A domain is considered semantically stable enough for production-facing work when:

- authority ownership is explicit,
- aggregate lifecycle ownership is explicit,
- propagated events preserve meaning,
- projections declare inputs and completeness,
- surfaces do not overclaim,
- vocabulary is stable enough for implementation,
- known fractures are either resolved or registered with containment.

This does not mean the domain is perfect.

It means the domain is honest.

---

## 17. Closing Statement

PT-2 does not need universal ontology.

It needs semantic integrity at the points where meaning becomes operationally load-bearing.

The protocol exists to prevent the next split-brain from being discovered only after it has already propagated through services, projections, dashboards, and operator-facing claims.
