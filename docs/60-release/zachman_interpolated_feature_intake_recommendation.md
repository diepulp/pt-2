# Zachman-Interpolated Feature Intake for Spec-Driven Development

Date: 2026-04-07

## Verdict

Yes — the current Feature Intake Brief should be tightened with a **machine-legible structured companion** informed by the Zachman interrogatives. No — the pipeline should **not** adopt full Zachman as a process.

That would be cargo-cult enterprise architecture nonsense.

The useful move is narrower:

- keep the current **human-readable Feature Intake Brief** as the scope authority
- add a **structured intake artifact** for machine consumption
- use **What / How / Where / Who / When / Why** as a completeness grid
- treat missing structured fields as **unknown**, not as permission for downstream artifacts to invent them

This preserves your strongest current property — scope containment — while reducing the ambiguity that prose still leaves behind.

---

## Why the current intake is still insufficient

The existing Feature Intake Brief is already good at freezing human intent before design. It explicitly defines:

- operator problem
- pilot fit
- actor and moment
- containment loop
- required outcomes
- explicit exclusions
- adjacent rejected ideas
- dependencies
- amendment rules

That is strong governance.

But it is still primarily a **human memo**, not a **system descriptor**.

The ambiguity leak is here: the form does not force explicit structured declaration of:

- domain nouns / entities
- system capabilities
- surfaces and touchpoints
- actors and permissions
- trigger events and lifecycle events
- business rules and invariants
- traceability from loop step to outcome to capability

So downstream artifacts still get to “helpfully” fill in blanks, which is exactly where agentic drift starts.

---

## What Zachman is actually useful for here

The key value in the referenced proposal is not the article’s hype. It is the underlying observation:

> prose specs are written for humans, while machine execution needs structured completeness.

Zachman helps because it gives a stable classification grid:

- **What** — what data or objects exist
- **How** — what behaviors or capabilities exist
- **Where** — where the feature appears and what it connects to
- **Who** — who acts and who is allowed
- **When** — what events trigger or sequence behavior
- **Why** — why the feature exists and what rules constrain it

This is the right use of Zachman for your pipeline: **coverage ontology**, not implementation method.

Do not turn the intake process into a 36-cell enterprise-architecture ritual. That is not discipline; that is paperwork with delusions of grandeur.

---

## Recommended artifact split

Introduce a dual-artifact intake layer:

### FIB-H
Human-readable Feature Intake Brief

Purpose:
- freeze operator intent
- define pilot-bounded scope
- serve as human scope authority
- remain amendable only through explicit intake amendment

### FIB-S
Structured Feature Intake Schema

Purpose:
- normalize the feature into machine-legible fields
- eliminate implied assumptions
- provide deterministic downstream input for scaffold / ADR / PRD / EXEC generation
- enforce completeness and traceability

This yields a cleaner division of labor:

- **human prose** for intent
- **structured schema** for generation
- **amendment protocol** for scope growth

---

## Zachman-to-intake mapping

| Zachman column | Intake meaning |
|---|---|
| **What** | domain nouns, entities, aggregates, records, settings, artifacts |
| **How** | user-visible capabilities, system behaviors, allowed actions |
| **Where** | UI surfaces, APIs, RPCs, reports, imports, exports, bounded contexts |
| **Who** | actors, roles, ownership, permissions, restrictions |
| **When** | trigger events, lifecycle transitions, timing constraints |
| **Why** | operator problem, business rules, invariants, success outcomes, exclusions |

Note the important distinction: **integrations are not their own top-level Zachman column**. They belong mostly under **Where** and partially under **How**.

---

## What should change in the current Feature Intake Brief

Keep the spirit of the current form, but stop asking the human to carry all structure in prose.

### Keep, mostly as-is
- Feature identity
- Operator problem statement
- Pilot-fit justification
- Feature containment loop
- Required outcomes
- Explicit exclusions
- Adjacent ideas considered and rejected
- Dependencies and assumptions
- Expansion trigger rule
- Scope authority block

### Add structured mirrors for
- entities
- capabilities
- surfaces / touchpoints
- actors / permissions
- trigger events
- lifecycle events
- business rules
- invariants
- traceability

### Compress or merge
The current human form can be made leaner by reducing repetitive narrative overlap:

- merge **operator problem** and **pilot fit** into a shorter paired intent section
- keep the prose containment loop, but require a structured loop array too
- keep exclusions and rejected ideas, but mirror them into schema instead of re-elaborating later
- preserve governance sections because those are policy, not modeling

---

## Proposed structured schema

Below is the recommended JSON shape for **FIB-S**.

```json
{
  "artifact": {
    "type": "feature_intake_structured",
    "version": "1.0.0",
    "source_of_truth": "FIB-H v0",
    "status": "draft",
    "feature_id": "FIB-XXX",
    "feature_name": "string",
    "priority": "P0",
    "decision_horizon": "pilot",
    "owner": "string",
    "opened_on": "2026-04-07"
  },
  "intent": {
    "operator_problem": "string",
    "pilot_fit": "string",
    "success_outcomes": [
      "string"
    ],
    "explicit_exclusions": [
      "string"
    ],
    "adjacent_rejected": [
      {
        "idea": "string",
        "why_considered": "string",
        "why_rejected_now": "string"
      }
    ]
  },
  "zachman": {
    "what": {
      "entities": [
        {
          "name": "string",
          "kind": "aggregate|record|event|view|setting|artifact",
          "description": "string",
          "stateful": true,
          "system_of_record": "string",
          "fields_hint": [
            "string"
          ]
        }
      ]
    },
    "how": {
      "capabilities": [
        {
          "name": "string",
          "verb": "create|read|update|close|acknowledge|issue|reconcile",
          "description": "string",
          "served_outcomes": [
            "OUT-1"
          ],
          "loop_steps": [
            "STEP-1"
          ]
        }
      ]
    },
    "where": {
      "primary_surface": "string",
      "surfaces": [
        {
          "name": "string",
          "kind": "ui|api|rpc|job|report|modal|dashboard"
        }
      ],
      "touchpoints": {
        "inbound": [
          {
            "name": "string",
            "type": "user_action|api_call|event|import"
          }
        ],
        "outbound": [
          {
            "name": "string",
            "type": "event|notification|integration|report"
          }
        ]
      },
      "bounded_contexts": [
        "string"
      ]
    },
    "who": {
      "primary_actor": "string",
      "actors": [
        {
          "role": "string",
          "permissions": [
            "string"
          ],
          "restrictions": [
            "string"
          ]
        }
      ],
      "ownership": {
        "business_owner": "string",
        "domain_owner": "string"
      }
    },
    "when": {
      "trigger_events": [
        {
          "name": "string",
          "source": "user|system|external",
          "preconditions": [
            "string"
          ]
        }
      ],
      "lifecycle_events": [
        "string"
      ],
      "timing_constraints": [
        "string"
      ]
    },
    "why": {
      "business_rules": [
        {
          "id": "RULE-1",
          "statement": "string",
          "severity": "hard|soft"
        }
      ],
      "invariants": [
        "string"
      ],
      "decision_notes": [
        "string"
      ]
    }
  },
  "containment": {
    "loop": [
      {
        "id": "STEP-1",
        "actor": "string",
        "action": "string",
        "system_response": "string"
      }
    ],
    "frozen": true,
    "expansion_requires_amendment": true
  },
  "dependencies": {
    "required_existing": [
      "string"
    ],
    "missing_dependencies": [
      "string"
    ],
    "assumptions": [
      "string"
    ]
  },
  "traceability": {
    "outcomes": [
      {
        "id": "OUT-1",
        "statement": "string"
      }
    ],
    "capability_to_outcome": [
      {
        "capability": "string",
        "outcomes": [
          "OUT-1"
        ]
      }
    ],
    "rule_to_loop_step": [
      {
        "rule_id": "RULE-1",
        "loop_steps": [
          "STEP-1"
        ]
      }
    ]
  },
  "governance": {
    "scope_authority": {
      "artifact": "FEATURE_INTAKE_BRIEF",
      "version": "v0",
      "frozen": true
    },
    "open_questions_allowed_at_scaffold": [],
    "downstream_expansion_allowed_without_amendment": false
  }
}
```

---

## TOML version

If you prefer something friendlier for hand-editing and repo diffs, use TOML.

```toml
[artifact]
type = "feature_intake_structured"
version = "1.0.0"
source_of_truth = "FIB-H v0"
status = "draft"
feature_id = "FIB-XXX"
feature_name = "Example Feature"
priority = "P0"
decision_horizon = "pilot"
owner = "Owner Name"
opened_on = "2026-04-07"

[intent]
operator_problem = "Concrete operator pain."
pilot_fit = "Why this matters now."

success_outcomes = [
  "Outcome 1",
  "Outcome 2"
]

explicit_exclusions = [
  "Excluded item 1",
  "Excluded item 2"
]

[[intent.adjacent_rejected]]
idea = "Deferred idea"
why_considered = "It sounded adjacent"
why_rejected_now = "Out of slice"

[zachman.what]
bounded_contexts = ["rating_slip"]

[[zachman.what.entities]]
name = "rating_slip"
kind = "aggregate"
description = "Session telemetry record"
stateful = true
system_of_record = "supabase"

[zachman.how]

[[zachman.how.capabilities]]
name = "close_rating_slip"
verb = "close"
description = "Operator closes active slip"
served_outcomes = ["OUT-1"]
loop_steps = ["STEP-4"]

[zachman.where]
primary_surface = "rating slip modal"
bounded_contexts = ["rating_slip", "visit"]

[[zachman.where.surfaces]]
name = "rating slip modal"
kind = "ui"

[[zachman.where.touchpoints_inbound]]
name = "close button click"
type = "user_action"

[[zachman.where.touchpoints_outbound]]
name = "audit log write"
type = "event"

[zachman.who]
primary_actor = "pit_boss"

[[zachman.who.actors]]
role = "pit_boss"
permissions = ["close_slip", "view_slip"]
restrictions = ["cannot_edit_closed_slip"]

[zachman.when]

[[zachman.when.trigger_events]]
name = "operator_requests_close"
source = "user"
preconditions = ["slip is active"]

lifecycle_events = ["slip_closed"]
timing_constraints = ["must occur during active gaming day"]

[zachman.why]
invariants = [
  "Closed slips are immutable"
]

[[zachman.why.business_rules]]
id = "RULE-1"
statement = "Only authorized staff can close an active slip"
severity = "hard"
```

---

## Admission gates to add

A scaffold should fail admission if any of the following are missing from FIB-S:

- at least one declared entity under **what**
- at least one declared capability under **how**
- at least one declared surface or touchpoint under **where**
- at least one declared actor under **who**
- at least one trigger or lifecycle event under **when**
- at least one rule or invariant under **why**
- at least one explicit exclusion
- traceability from containment step to capability and outcome
- scope authority marked frozen
- downstream expansion flag explicitly set to false unless amended

This is the crucial part. Without hard admission rules, the new schema becomes decorative.

---

## Recommended pipeline update

### Current
1. Feature Intake Brief
2. Scaffold
3. RFC
4. ADR
5. PRD
6. EXEC

### Recommended
1. **FIB-H** — human intake brief
2. **FIB-S** — structured intake schema
3. Scaffold
4. RFC if needed
5. ADR
6. PRD
7. EXEC

### Consumption rules
- scaffold must cite both **FIB-H** and **FIB-S**
- scaffold must not invent any entity, capability, actor, or touchpoint absent from FIB-S
- ADRs may refine implementation but may not add operator outcomes absent from FIB-H
- PRD requirements must trace to loop steps and structured capabilities
- EXEC work items must trace to PRD requirements and schema objects

---

## Minimal example of traceability

Here is the shape of the trace chain you actually want:

- **Operator problem**  
  “Pit boss loses active alert state across refresh and shift handoff.”

- **Containment step**  
  STEP-3: pit boss acknowledges active alert → system persists acknowledgment state

- **Capability**  
  `acknowledge_alert`

- **Entity**  
  `alert_state`

- **Trigger event**  
  `operator_acknowledges_alert`

- **Rule**  
  acknowledged alerts remain visible until resolved

- **Outcome**  
  acknowledged issues persist across refresh and handoff

That is what machine-legible intake buys you: a downstream pipeline that stops pretending inference is harmless.

---

## Final recommendation

Adopt Zachman as a **coverage lens**, not as a process religion.

The real reform is this:

- keep the current intake brief as the **human scope authority**
- add a structured companion artifact as the **machine authority for completeness**
- enforce hard gates so downstream artifacts cannot “discover” new scope through enthusiasm
- require traceability from operator loop to structured schema to implementation artifacts

In plain terms:

your current intake already does a good job of saying **what not to build**.

What it still lacks is a reliable way to say, in machine-usable terms, **what the feature actually is**.

That is the gap Zachman can help close — provided you strip it down to the interrogatives and refuse the usual enterprise-architecture pageantry.

---

## Source notes

This recommendation is based on:

- the uploaded `FEATURE_INTAKE_BRIEF_FORM.md`, which already defines the Feature Intake Brief as the authoritative source of feature intent and scope authority
- the referenced Medium article arguing that spec-driven development should move from human-centric prose toward structured system-first specification
- official Zachman material emphasizing that the framework is an **ontology / schema** for describing an enterprise, not a **methodology** or process

