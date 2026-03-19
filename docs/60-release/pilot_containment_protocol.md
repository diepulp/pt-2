# Pilot Containment Protocol
**Project:** Casino Player Tracker  
**Purpose:** Force shipment discipline for the next 4 weeks  
**Status:** Active operating constraint until pilot launch  

---

## Premise

You do not currently have an architecture problem first.  
You have a **containment problem**.

The project has enough foundation to support a pilot. What keeps delaying shipment is not absence of capability, but absence of hard boundaries around what is allowed into scope.

This protocol exists to stop the following pattern:

- over-structuring early
- anticipating every edge case
- treating future flexibility as present necessity
- allowing every useful idea to masquerade as pilot-critical
- expanding the application instead of closing the loop

For the next 4 weeks, the governing principle is:

> We are not building the system we can imagine. We are building the system the pilot can survive.

---

## Core Rule

For the next 4 weeks:

> No new feature enters pilot scope unless it fixes a demonstrated failure in the canonical pilot loop.

Not because it is elegant.  
Not because it is prudent.  
Not because it will obviously be needed later.  
Only because the pilot loop **fails without it**.

---

## Pilot Doctrine

A pilot only needs five things to be true:

1. Users can complete the core job end to end.
2. Data lands correctly and remains trustworthy.
3. Staff cannot easily corrupt state.
4. Failures are diagnosable.
5. There is a manual recovery path when something breaks.

Anything outside those five conditions is presumptively deferred.

---

## Scope Buckets

Every task, defect, feature, or idea must go into one of these buckets.

### 1. Ship Now
Work that is required for pilot viability.

A task belongs here only if it directly affects one or more of the following:

- core workflow completion
- data integrity
- operator trust
- legal/compliance minimums
- supportability and failure recovery

### 2. Stabilize Later
Useful work that improves quality but does not block pilot.

Examples:

- additional polish
- broader reuse
- richer dashboards
- cleaner abstractions
- generalizations
- reporting depth
- non-essential operator conveniences

These items may be important. They are not pilot-critical.

### 3. Ban Until After Pilot
Any work that introduces a new axis of variability or expands the system shape.

Examples:

- optional workflows
- additional surfaces or consoles
- generalized policy systems
- cross-context abstractions not tied to a blocker
- speculative admin tools
- broad refactors
- phase-2 scaffolding
- future-proofing disguised as safety

If it changes the shape of the system instead of closing a known pilot gap, ban it.

---

## Canonical Pilot Loop

This must be filled in and frozen in Week 1.

Use one concrete operator journey only.

### Template
1. Authenticate
2. Enter shift / table context
3. Find existing player or create player
4. Open visit / session / rating context
5. Perform core operational actions
6. Issue reward if included in pilot scope
7. Close / persist / confirm state
8. Review basic operational record

### Project-Specific Canonical Loop
_Fill this in with the exact screens and actions that a real pilot user will perform._

1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 

### Freeze Rule
Only the canonical loop is protected for pilot.  
Anything outside it must prove that it is required for completion, correctness, trust, compliance, or supportability.

---

## Four-Week Closure Plan

This is not a roadmap.  
It is a closure plan.

### Week 1 — Freeze and Expose Reality
Goal: define the pilot loop and stop unauthorized expansion.

#### Deliverables
- Pilot Definition (one page)
- Canonical pilot loop
- Pilot blocker list
- Explicit non-goals list
- Defect ledger
- Scope kill-switch rule
- Daily triage board

#### Required Outputs

##### A. Pilot Definition
Write a short statement answering:

- Who is the pilot user?
- What exact workflow are they piloting?
- What actions must succeed without assistance?
- What data must be trustworthy?
- What can still be handled manually for 4 weeks?

##### B. Pilot Blockers
List only defects that break:

- completion
- correctness
- trust
- compliance minimum
- supportability

##### C. Explicit Non-Goals
Write down what is **not** part of pilot, even if it is desirable.

Examples:
- broader admin surfaces
- full multi-property sophistication
- advanced measurement surfaces
- generalized loyalty variants
- expanded reporting
- major refactors
- phase-2 scaffolding

If it is not written as excluded, your future self will try to sneak it back in.

---

### Week 2 — Close Red-Path Failures
Goal: make the main loop work every time.

Allowed work:

- broken route handlers
- missing RPCs or broken RPC behavior
- validation holes
- state corruption risks
- permissions failures
- missing essential UI required by the loop
- reliability defects in the main workflow

Not allowed:

- architecture cleanup for its own sake
- speculative abstractions
- dashboard expansion
- reporting enrichment
- nonessential polish
- future-oriented refactors

#### Week 2 Exit Condition
A real user can complete the canonical loop without hitting a hard stop.

---

### Week 3 — Operator Hardening
Goal: reduce embarrassment and operational friction.

Allowed work:

- clear error messages
- empty states
- loading states
- duplicate submission protection
- guardrails against invalid actions
- basic audit visibility for support
- manual recovery instructions
- seed/demo data for realistic rehearsal
- basic diagnostics

Not allowed:

- new business capabilities
- new surfaces unless absolutely required
- “while we’re here” model improvements
- generalized administrative control planes

#### Week 3 Exit Condition
A pit boss or operator can use the workflow without you standing behind them translating the system.

---

### Week 4 — Rehearsal and Lock
Goal: stop building and simulate reality.

Required activities:

- define 3–5 pilot scenarios
- run each scenario end to end
- record failures and classify them
- fix only launch-threatening issues
- perform go/no-go assessment
- finalize deployment checklist
- finalize rollback / manual recovery notes
- lock scope

#### Week 4 Rule
No meaningful new feature work.  
If you are still inventing product in Week 4, you are not rehearsing. You are relapsing.

---

## Daily Triage Board

Every open item must sit in exactly one of these columns:

- Canonical Loop Gap
- Data Integrity Risk
- Operator Confusion
- Compliance Minimum
- Supportability
- Deferred
- Banned

### Rule
If an item does not belong in one of the first five columns, it does not belong in pre-pilot execution.

---

## The Seven-Question Filter

Before starting any task, answer these questions in writing.

1. What exact pilot scenario fails without this?
2. Who fails, specifically?
3. Can they still complete the task without it?
4. Is there a manual workaround for 4 weeks?
5. Does this add a new axis of variability?
6. Does this touch more than one bounded context?
7. If I defer this, does pilot actually die?

### Decision Rules
- If it adds a new axis of variability, default = **No**
- If it touches more than one bounded context, default = **No**
- If a manual workaround exists for 4 weeks, default = **Defer**
- If pilot does not literally die without it, default = **Defer**

---

## Personal Operating Constraints

These are hard constraints, not aspirations.

### 1. No parallel initiatives
One active pilot stream at a time.

### 2. No foundation work without a linked blocker
Any refactor must cite the pilot blocker it resolves.

### 3. No new surfaces unless the canonical loop lacks a necessary step
No new page or console may be created because it feels like the “right place” for something.

### 4. No phase-2 reasoning during phase-1 execution
The following phrases are danger signals:

- “eventually”
- “later this will support”
- “we might need”
- “to avoid repainting ourselves into a corner”
- “while we’re here”

Those are not pilot arguments. They are expansion arguments.

### 5. Write deferrals down immediately
Do not carry ideas in your head.
A remembered idea becomes a false obligation.

### 6. One axis of variability at a time
If you are introducing more than one new degree of freedom in a change, stop.

### 7. Prefer manual workaround over permanent abstraction
A workaround that survives 4 weeks is cheaper than a rushed permanent abstraction that expands the system.

---

## Unknown-Gap Audit Method

Because the exact implementation gaps are not yet fully known, use this bounded audit method instead of broadening scope.

### Pass 1 — Happy Path Walkthrough
Run the canonical pilot loop end to end.

Record only:

- blocked
- confusing
- incorrect
- missing
- ugly but tolerable

Do **not** capture future enhancements during this pass.

### Pass 2 — Failure Path Walkthrough
Test these cases:

- empty search
- invalid input
- duplicate submit
- refresh mid-flow
- expired session
- partial network failure
- missing related record
- permission mismatch

Record only what threatens pilot viability.

### Pass 3 — Support Path Walkthrough
Ask:

- If this breaks in pilot, how will I know?
- What evidence can I inspect?
- What can I repair manually?
- What will support need to see?

This pass exists to expose supportability gaps, not new product ideas.

---

## Pilot Scorecard

Score each area from 0 to 2.

- 0 = broken
- 1 = works with known risk or workaround
- 2 = pilot-acceptable

### Categories
- Core workflow completion
- Data correctness
- Role / permission sanity
- Error handling
- Manual recovery
- Operator clarity
- Deployment readiness

### Interpretation
- Any **0** is a blocker
- A **1** may ship only with a known workaround
- Do not chase universal 2s if doing so delays launch

### Scorecard Table

| Category | Score (0–2) | Notes / Workaround |
|---|---:|---|
| Core workflow completion |  |  |
| Data correctness |  |  |
| Role / permission sanity |  |  |
| Error handling |  |  |
| Manual recovery |  |  |
| Operator clarity |  |  |
| Deployment readiness |  |  |

---

## Deferred / Ban Ledger

Use this section to quarantine ideas so they stop poisoning current execution.

### Deferred Until After Pilot
- 
- 
- 
- 

### Explicitly Banned Until After Pilot
- 
- 
- 
- 

---

## Pilot Blocker Ledger

Use a brutal standard. This is not a wishlist.

| ID | Title | Classification | Canonical Scenario Impacted | Manual Workaround? | Owner | Status |
|---|---|---|---|---|---|---|
| PB-01 |  |  |  |  |  |  |
| PB-02 |  |  |  |  |  |  |
| PB-03 |  |  |  |  |  |  |

### Allowed Classifications
- completion
- correctness
- trust
- compliance minimum
- supportability

---

## Daily Review Ritual

Twice a week, review all open items and ask:

1. Is this required for a real pilot user this month?
2. Can I operationally fake this for 4 weeks?
3. Does this create a new branch of behavior?
4. Am I solving an observed problem or projected discomfort?

If the answer points to projected discomfort, defer it.

---

## Go-Live Checklist

### Scope
- [ ] Canonical pilot loop is written and frozen
- [ ] Explicit non-goals are documented
- [ ] Deferred / banned ledger exists
- [ ] No active work outside pilot scope

### Product
- [ ] Core workflow completes end to end
- [ ] Main data writes are trustworthy
- [ ] Permissions behave acceptably
- [ ] Known failure cases produce understandable outcomes
- [ ] Duplicate / invalid actions are reasonably guarded

### Support
- [ ] Essential logs / audit traces can be inspected
- [ ] Manual recovery path exists for core failures
- [ ] Known issues list exists
- [ ] Workarounds are documented for all non-blocking risks

### Rehearsal
- [ ] 3–5 realistic scenarios were run
- [ ] Failures were triaged
- [ ] Only launch-threatening issues remain open
- [ ] Pilot scorecard contains no zeroes

### Deployment
- [ ] Environment is selected
- [ ] Seed/demo data is ready if needed
- [ ] Rollback or disable plan exists
- [ ] Operator handoff notes exist

---

## The Wall Statements

Put these where you will actually see them.

> We are not building the system we can imagine. We are building the system the pilot can survive.

> No new feature enters pilot scope unless it fixes a demonstrated failure in the canonical pilot loop.

> A workaround for 4 weeks is cheaper than a permanent abstraction built in panic.

> “Can support” does not mean “must include.”

> If pilot does not literally die without it, defer it.

---

## Final Reminder

Your bottleneck is no longer knowledge, architecture, or technical capability.

It is restraint.

The next 4 weeks are not for expanding the application into the shape it may someday deserve. They are for proving that the existing foundation can carry a real operator through a narrow, trustworthy, supportable workflow in production.

Ship the loop.  
Then earn the right to broaden it.
