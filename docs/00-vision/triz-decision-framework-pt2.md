# TRIZ Decision Framework (Lean Adaptation for PT-2)

**ID:** PAT-TRIZ-001  
**Status:** Active  
**Scope:** Architecture, Product, Governance Decisions  
**Applies To:** All bounded contexts and cross-cutting decisions

---

## 1. Purpose

This document introduces a **lean adaptation of TRIZ (Theory of Inventive Problem Solving)** as a **decision hygiene tool** for PT-2.

It is **not** adopted as a full methodology.

It exists to solve a recurring failure mode in the project:

> Decisions framed as vague tradeoffs instead of explicit contradictions.

---

## 2. Why This Exists

TRIZ, developed by Genrich Altshuller, is fundamentally a method for resolving **contradictions**: improving one thing without making another worse.

For PT-2, the value is not in adopting TRIZ as an ideology. The value is in using its core habit of thought to expose false tradeoffs, reduce architecture theater, and keep hard decisions tied to actual operating constraints.

This project repeatedly encounters tensions such as:

- compliance strictness vs floor usability
- configurability vs simplicity
- bounded-context purity vs implementation drag
- governance rigor vs solo-dev throughput
- auditability vs workflow friction

Those tensions should not be handled as vague sentiment. They should be stated explicitly and resolved deliberately.

---

## 3. When to Use

Use this framework **only when a decision is stuck** or repeatedly debated.

### Trigger Conditions

- The same issue resurfaces across reviews
- “It depends” arguments dominate
- Tradeoffs feel arbitrary or political
- Over-engineering vs under-engineering tension appears
- Compliance vs usability friction appears
- Configurability vs simplicity debates stall progress
- The team keeps circling the same decision without freezing it

If the decision is obvious, local, or low-risk, **do not use this**.

---

## 4. Core Principle

Every hard problem must be reduced to:

> **Improve X without worsening Y.**

If X and Y cannot be named clearly, the problem is not yet understood well enough for a durable decision.

---

## 5. What Counts as a Contradiction

### 5.1 Technical Contradiction

Improving one property worsens another.

Examples:

- Increase compliance rigor → slower floor workflow
- Increase configurability → more schema sprawl
- Increase bounded-context purity → more implementation friction

### 5.2 Physical Contradiction

The same thing appears to need opposite properties at once.

Examples:

- The workflow must be strict and flexible
- The architecture must be centralized and decentralized
- The policy must be global and local

These usually indicate the need for **separation**, not compromise.

---

## 6. Contradiction Card (Required Format)

Use this structure before any major architectural or product decision that has stalled:

```md
### Contradiction Card

**Goal (Improve):**
- What must get better?

**Constraint (Without worsening):**
- What must NOT degrade?

**Current Assumption Causing Tension:**
- What design assumption is forcing the tradeoff?

**Type:**
- [ ] Technical (X vs Y)
- [ ] Physical (same thing must be both A and B)

---

### Separation Strategy

Choose one or more:

- [ ] By Time (different phases)
- [ ] By Space (different components/contexts)
- [ ] By Condition (different scenarios/roles)
- [ ] By Responsibility (different ownership)
- [ ] By Lifecycle (temporary vs permanent design)

---

### Candidate Moves

1.
2.
3.

---

### Decision

Chosen approach:
Rationale:
Tradeoffs accepted:
```

---

## 7. Allowed Separation Axes (PT-2 Interpretation)

These are the only “TRIZ-like” concepts retained for PT-2.

### 7.1 Separation by Condition

Different behavior depending on:

- role
- instrument type
- risk class
- workflow state
- surface type
- event type

**Examples:**

- Printable rewards require custody/print flow; internal adjustments do not
- Financial flows require stronger controls than informational dashboards
- Admin-only actions can tolerate more friction than pit-floor live-play actions

This is the most useful separation axis for PT-2.

---

### 7.2 Separation by Time

Different rules at different phases.

**Examples:**

- Capture quickly during live play, reconcile later
- Record event now, print only when the downstream custody chain needs it
- Allow temporary implementation co-location, preserve future extraction boundary in docs

Use this when the contradiction is really between **now vs later**.

---

### 7.3 Separation by Space

Different rules in different system areas.

**Examples:**

- Domain ownership stays strict; read aggregation is allowed in dashboard composition
- One bounded context owns writes; another may consume derived read models
- Localized strictness applies only to compliance-critical surfaces

Use this when the contradiction exists only in one layer or component, not system-wide.

---

### 7.4 Separation by Responsibility

Different ownership for different parts of the problem.

**Examples:**

- SRM remains strict on ownership; transport plumbing may still be consolidated
- Product policy lives in settings; execution details live in workflow handlers
- Domain logic stays local; orchestration logic sits at the boundary

Use this to prevent “everything must live everywhere” thinking.

---

### 7.5 Separation by Lifecycle

Different answers are acceptable at different maturity stages.

**Examples:**

- Hardcode now, configure later if variance becomes real
- Keep one audited RPC today; split later only when complexity is earned
- Test one bounded context deeply first; do not impose system-wide ceremony immediately

Use this to avoid premature abstraction and speculative infrastructure.

---

## 8. Operating Rule

This framework is a **working-note tool**, not a documentation religion.

### Required

Use a contradiction card when:

- a decision has stalled for more than one review cycle
- the issue affects architecture, compliance, product boundaries, or governance posture
- competing options are both plausible and the cost of a wrong decision is material

### Not Required

Do not invoke this framework for:

- trivial naming choices
- low-risk local implementation details
- obvious bug fixes
- decisions already frozen by canonical standards
- arguments that are merely preference wars with no real constraint underneath

---

## 9. PT-2 Application Heuristics

### 9.1 Compliance vs Usability

Ask:

> How do we increase control without increasing floor friction?

Typical resolution pattern:

- separate by condition
- separate by role
- separate by time

Do not apply full compliance ceremony to every event just because some events are high-risk.

---

### 9.2 Configurability vs Simplicity

Ask:

> Does this variance truly exist yet, and at what scope?

Typical resolution pattern:

- casino-wide knobs belong in existing casino-wide settings
- game-specific rules belong in game-level settings
- fake future flexibility should remain hardcoded until earned

Do not create tables, policy engines, or infrastructure for hypothetical variance.

---

### 9.3 Bounded Context Purity vs Delivery Velocity

Ask:

> What ownership boundary must be strict now, and what can remain temporarily co-located?

Typical resolution pattern:

- enforce write ownership first
- tolerate temporary read-side aggregation where appropriate
- preserve future extraction path in ADR/SRM/spec language

Do not confuse “documented future autonomy” with “must extract everything now.”

---

### 9.4 Governance vs Solo-Dev Throughput

Ask:

> Where is ceremony actually buying risk reduction?

Typical resolution pattern:

- strongest governance on money-moving, entitlement, and compliance flows
- lighter posture on low-risk slices
- establish one real exemplar instead of system-wide testing theater

Do not impose enterprise ritual where local proof is sufficient.

---

### 9.5 Auditability vs Workflow Friction

Ask:

> What needs permanent evidence, and what merely needs operational convenience?

Typical resolution pattern:

- stronger audit trail for irreversible or entitlement-affecting actions
- lighter handling for informational or reversible actions
- preserve custody chain only where downstream control actually depends on it

Do not treat every action as if the cage, regulators, and finance all need the same evidence format.

---

## 10. Examples for PT-2

### Example A — Printable Rewards vs Internal Adjustments

**Goal:** Preserve downstream custody integrity  
**Without worsening:** Operational speed for internal/admin actions  
**Assumption causing tension:** All reward-related flows must follow the same print/custody path

**Resolution direction:**  
Separate by condition.

- Printable instruments follow custody + print requirements
- Internal/admin-only adjustments default to audit-only and no print

This avoids dragging low-risk adjustments through a workflow designed for physical redemption instruments.

---

### Example B — Rounding Policy Placement

**Goal:** Support accurate accrual behavior  
**Without worsening:** Schema and config complexity  
**Assumption causing tension:** Every policy must have its own dedicated configuration infrastructure

**Resolution direction:**  
Separate by scope and lifecycle.

- If the policy is truly casino-wide, keep it with casino-wide policy settings
- If no real variance exists yet, hardcode the default until change is earned
- Do not create a table solely to host one scalar unless the table has justified breadth

This blocks “config because config feels grown-up” behavior.

---

### Example C — Bounded Context Integrity vs Slice Delivery

**Goal:** Keep domain ownership credible  
**Without worsening:** Initial implementation velocity  
**Assumption causing tension:** Every future boundary must be physically extracted immediately

**Resolution direction:**  
Separate by lifecycle and responsibility.

- Freeze ownership in SRM/ADR/specs now
- Allow temporary implementation co-location where it does not corrupt write ownership
- Extract later when the boundary has earned the operational cost

This keeps the architecture honest without indulging in premature fragmentation.

---

### Example D — Testing Governance vs Practical Rollout

**Goal:** Increase implementation confidence  
**Without worsening:** Solo-developer execution capacity  
**Assumption causing tension:** The only serious testing posture is system-wide enterprise CI governance

**Resolution direction:**  
Separate by risk and lifecycle.

- Prove the pattern in one bounded context first
- Make functional testing real where claims are strongest
- Defer broader governance until the exemplar is established and the tooling is actually alive

This prevents “green theater” from replacing real verification.

---

## 11. Decision Procedure

When a decision is stuck:

1. State the contradiction plainly  
2. Identify the assumption creating the tradeoff  
3. Choose the smallest relevant separation axis  
4. Generate 3 candidate moves  
5. Prefer the move that breaks the tradeoff with the least new infrastructure  
6. Record the final decision in normal ADR/PRD/spec language  
7. Discard the rest of the ceremony

---

## 12. Default Biases

When this framework is used, PT-2 should default toward the following biases unless the contradiction clearly disproves them:

- prefer existing policy homes over new config surfaces
- prefer hardcoded defaults over speculative configurability
- prefer conditional strictness over universal ceremony
- prefer one deep exemplar over broad shallow governance
- prefer future extraction paths over premature decomposition
- prefer write-boundary integrity over diagram purity
- prefer operational evidence where risk is real, not imagined

These are not absolute rules. They are anti-bullshit defaults.

---

## 13. Anti-Patterns

Do **not** use this framework to justify:

- abstract tables with one live scalar and no earned variance
- service extraction with no operational need
- generalized workflow engines for one narrow use case
- “flexibility” with no current tenant or product demand
- policy systems built for hypothetical future casinos
- governance theater that outruns actual implementation reality
- architecture debates driven by aesthetic preference instead of constraints

If the contradiction is fake, the framework should expose that quickly.

---

## 14. Integration with Existing PT-2 Artifacts

This framework does not replace:

- ADRs
- PRDs
- Exec Specs
- SRM
- hardening or governance standards

It exists **upstream** of them as a decision-shaping tool.

### Usage Pattern

- Use contradiction card in working notes
- Freeze actual decision in ADR/PRD/spec
- Keep published artifacts plain
- Do not force TRIZ terminology into canonical docs unless genuinely helpful

The output matters more than the method.

---

## 15. Adoption Guidance

### Recommended

Adopt this as a lightweight internal pattern for:

- architecture reviews
- scope alignment
- policy placement decisions
- cross-context boundary debates
- governance posture disputes

### Not Recommended

Do not create:

- a dedicated TRIZ workstream
- mandatory TRIZ sections in every artifact
- a new governance regime around this
- ritualized references to the 40 inventive principles
- methodology cosplay

That would be absurd, and this project already has enough opportunities to over-dress its reasoning.

---

## 16. Final Position

TRIZ is useful for PT-2 only in its leanest form:

> A contradiction-resolution lens for hard decisions.

Its purpose is to help the project avoid false binaries, expose bad assumptions, and choose the smallest durable move that preserves both operational reality and architectural integrity.

Use it when stuck.  
Do not build a church around it.
