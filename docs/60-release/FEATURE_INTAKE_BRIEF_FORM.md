# FEATURE INTAKE BRIEF FORM
**Status:** Proposed pipeline artifact  
**Purpose:** Pre-spec intent capture and pilot-bounded feature scope control  
**Audience:** Human requester / product owner / domain owner  
**Downstream consumers:** Scaffold, RFC, ADR, PRD, EXEC, audits

---

# 1. Why this artifact exists

The Feature Intake Brief exists to freeze **human intent before the feature pipeline begins**.

It is **not** a design document.  
It is **not** an architecture proposal.  
It is **not** a substitute for ADR / PRD / EXEC.

Its job is to answer, in plain terms:

- what problem is being solved
- for whom
- in what operator moment
- why it belongs in the pilot or current wedge
- what must work
- what is explicitly out of scope
- what tempting adjacent ideas were considered and rejected

This artifact is the **scope authority** for feature intent.  
Downstream artifacts may **elaborate** the feature, but may not **expand** it without an explicit amendment to this brief.

---

# 2. Pipeline position

**Required order:**

1. Feature Intake Brief
2. Scaffold
3. RFC (if needed)
4. ADR
5. PRD
6. EXEC

The scaffold must cite the approved intake brief version.

---

# 3. Completion rules

## Required rules

1. The brief must be completed by a human, not inferred by the pipeline.
2. The brief must be written in operator / business language first.
3. Architecture, vendor selection, implementation details, and solution bias must be minimized.
4. The feature must include a **Feature Containment Loop** of **5–10 steps max**.
5. The brief must contain **explicit exclusions**.
6. Any item not traceable to the containment loop or required outcomes is presumed **out of scope** unless later amended.
7. Any downstream addition not present here must be treated as **scope expansion**, not harmless elaboration.

## Anti-drift rules

- Do not write “future-proofing,” “nice to have,” or “supportability improvement” as if those are user requirements.
- Do not introduce third-party integrations unless they are explicitly named as required here.
- Do not allow downstream artifacts to smuggle in new surfaces, channels, or automations without amendment.

---

# 4. Scope authority rule

This brief is the **authoritative source of feature intent**.

Downstream artifacts may:
- clarify
- sequence
- decompose
- assess tradeoffs
- define implementation

Downstream artifacts may **not**:
- add new operator goals
- add external channels
- add new surfaces
- add cross-wedge dependencies
- add infrastructure work that does not trace to the containment loop

without an explicit **Intake Amendment**.

---

# 5. FEATURE INTAKE BRIEF TEMPLATE

---

## A. Feature identity

**Feature name:**  
[Enter short feature name]

**Feature ID / shorthand:**  
[Optional]

**Related wedge / phase / slice:**  
[Example: Wedge C, post C-1, planning C-2]

**Requester / owner:**  
[Name]

**Date opened:**  
[YYYY-MM-DD]

**Priority:**  
[P0 / P1 / P2]

**Target decision horizon:**  
[Example: pilot / post-pilot / Phase C-2 only]

---

## B. Operator problem statement

**Prompt:**  
What concrete operator problem or pain does this feature solve?

**Rules:**
- 1 paragraph max
- no architecture language
- no implementation detail
- name the human actor and the operational consequence

**Fill-in:**
[Write here]

**Example shape:**  
“Pit boss needs anomaly alerts to persist across refreshes and shift handoff so active and acknowledged issues remain visible and actionable instead of disappearing between sessions.”

---

## C. Pilot-fit / current-slice justification

**Prompt:**  
Why is this feature required **now** for the current pilot / wedge / slice?

**Rules:**
- tie to one concrete operator journey
- explain what fails without it
- do not justify by future value alone

**Fill-in:**
[Write here]

**Example shape:**  
“This belongs in the current slice because the operator cannot complete the alert review loop reliably if alert state disappears after refresh or shift handoff.”

---

## D. Primary actor and operator moment

**Primary actor:**  
[Example: pit boss, floor supervisor, cage cashier, admin]

**When does this happen?**  
[Example: during active shift, at slip close, during end-of-shift review]

**Primary surface:**  
[Example: shift dashboard, rating slip modal, admin settings]

**Trigger event:**  
[What causes the user to need this feature?]

---

## E. Feature Containment Loop (required)

**Prompt:**  
Write the exact operator workflow this feature must enable.

**Rules:**
- 5–10 numbered steps maximum
- each step must include actor + action + expected system response
- if it needs more than 10 steps, split the feature
- this loop becomes the feature’s **positive boundary**

**Template:**

1. [Actor] does [action] → system [response]
2. [Actor] does [action] → system [response]
3. [Actor] does [action] → system [response]
4. [Actor] does [action] → system [response]
5. [Actor] does [action] → system [response]

[Add up to 10 total only if truly needed]

---

## F. Required outcomes

**Prompt:**  
What must be true for this feature to be considered successful?

**Rules:**
- 3 to 7 bullets
- outcomes, not tasks
- operator-visible or business-visible where possible

**Template:**
- [Outcome 1]
- [Outcome 2]
- [Outcome 3]

---

## G. Explicit exclusions (required)

**Prompt:**  
What is specifically **not** part of this feature, even if adjacent or tempting?

**Rules:**
- be blunt
- list known temptations and adjacent work
- this is the negative boundary

**Template:**
- [Excluded item 1]
- [Excluded item 2]
- [Excluded item 3]
- [Excluded item 4]

**Examples of useful exclusions:**
- external notifications
- Slack integration
- email delivery
- scheduler automation
- cross-property support
- new console / new top-level page
- unrelated compliance cutover
- analytics / telemetry for later tuning only

---

## H. Adjacent ideas considered and rejected

**Prompt:**  
What came up during planning that sounded reasonable but is deferred or rejected now?

**Rules:**
- this creates a memory so excluded items cannot be re-smuggled later
- at least 2 entries strongly recommended

| Idea | Why it came up | Why it is out now |
|---|---|---|
| [Idea] | [Reason discussed] | [Reason deferred / rejected] |
| [Idea] | [Reason discussed] | [Reason deferred / rejected] |

---

## I. Dependencies and assumptions

**Prompt:**  
What must already exist, or what assumption is being made, for this feature to work?

**Rules:**
- list only actual dependencies
- do not turn aspirations into dependencies
- if a dependency is missing, say so plainly

**Template:**
- [Dependency / assumption 1]
- [Dependency / assumption 2]
- [Dependency / assumption 3]

---

## J. Out-of-scope but likely next

**Prompt:**  
What is the most likely next slice once this feature lands?

**Rules:**
- 1 to 3 items maximum
- this is not part of the current feature
- useful for sequencing, not permission to preload work

**Template:**
- [Likely next slice 1]
- [Likely next slice 2]

---

## K. Expansion trigger rule

**Prompt:**  
When must the intake brief be amended?

**Default rule:**  
Amend this brief if any downstream artifact proposes:
- a new user-visible outcome
- a new integration
- a new top-level surface
- a new automation path
- a new actor or workflow not represented in the containment loop

**Feature-specific note:**  
[Optional feature-specific amendment trigger]

---

## L. Scope authority block

**Intake version:**  
[v0 / v1 / v1.1]

**Frozen for downstream design:**  
[Yes / No]

**Downstream expansion allowed without amendment:**  
[No]

**Open questions allowed to remain unresolved at scaffold stage:**  
[List or “None”]

**Human approval / sign-off:**  
[Name / date]

---

# 6. Admission checks for scaffold

A scaffold may not be considered approved unless:

- the intake brief exists
- the containment loop is present
- the required outcomes are present
- the explicit exclusions are present
- at least one adjacent rejected idea is recorded
- the feature can be stated without architecture jargon
- the feature maps to the canonical pilot loop or current wedge objective

If any of the above is missing, the feature is not ready for design.

---

# 7. Required downstream traceability

## Scaffold must include
- `Scope Authority: Feature Intake Brief vX`
- copied or referenced Feature Containment Loop
- copied or referenced Explicit Exclusions
- copied or referenced Deferred / Rejected items

## RFC / ADR / PRD / EXEC must each answer
- Which loop step(s) does this section / decision / requirement serve?
- Does this introduce anything not present in the intake brief?
- If yes, where is the approved intake amendment?

---

# 8. Suggested checkpoint schema additions

```json
{
  "coherence": {
    "non_goals": [],
    "feature_loop": [],
    "feature_loop_frozen": false,
    "deferred_items": [],
    "scope_authority": {
      "artifact": "FEATURE_INTAKE_BRIEF",
      "version": "v0",
      "frozen": false
    },
    "violations": []
  }
}
```

---

# 9. Intake amendment template

Use this only when scope must legitimately expand.

## Intake Amendment

**Amendment ID:**  
[Example: FIB-A1]

**Requested addition / change:**  
[Write here]

**Why current intake is insufficient:**  
[Write here]

**Which containment loop step does this support?**  
[Write here, or state “none”]

**If none, why is this now justified?**  
[Write here]

**Net scope effect:**  
[Expansion / clarification / deferral / cut]

**Approved by:**  
[Name / date]

---

# 10. Recommended operating principle

> The human defines the feature.  
> The intake freezes intent.  
> The pipeline elaborates, but does not expand.  
> Expansion requires explicit re-entry.

---

# 11. Quick-use blank form

Copy the block below for new features.

```md
# Feature Intake Brief

## A. Feature identity
- Feature name:
- Feature ID / shorthand:
- Related wedge / phase / slice:
- Requester / owner:
- Date opened:
- Priority:
- Target decision horizon:

## B. Operator problem statement
[Write here]

## C. Pilot-fit / current-slice justification
[Write here]

## D. Primary actor and operator moment
- Primary actor:
- When does this happen?
- Primary surface:
- Trigger event:

## E. Feature Containment Loop
1.
2.
3.
4.
5.

## F. Required outcomes
- 
- 
- 

## G. Explicit exclusions
- 
- 
- 

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
|  |  |  |
|  |  |  |

## I. Dependencies and assumptions
- 
- 
- 

## J. Out-of-scope but likely next
- 
- 

## K. Expansion trigger rule
[Write here]

## L. Scope authority block
- Intake version:
- Frozen for downstream design:
- Downstream expansion allowed without amendment:
- Open questions allowed to remain unresolved at scaffold stage:
- Human approval / sign-off:
```

---

# 12. Final note

This artifact exists because downstream agents are good at elaboration and bad at divining unspoken human intent.  
The intake brief fixes that by making intent explicit before the machinery starts expanding it.
