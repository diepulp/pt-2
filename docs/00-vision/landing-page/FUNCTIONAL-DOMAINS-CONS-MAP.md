# Functional Domain Consolidation Map

## Executive Finding

The current landing page over-separates operational responsibilities that are naturally perceived by casino operators as parts of the same operational loop.

The system reality map reveals that the application actually collapses into four primary operational domains:

1. Floor Operations
2. Player Intelligence
3. Financial Accountability
4. Compliance & Governance

Everything else is either:

* supporting infrastructure,
* configuration,
* telemetry,
* or cross-cutting operational intelligence.

This structure is substantially more comprehensible for directors of operations, shift managers, and ownership stakeholders than the current fragmented presentation.

---

# Recommended High-Level Domain Model

| Domain                   | Primary Question Answered                  | Stakeholder Lens              |
| ------------------------ | ------------------------------------------ | ----------------------------- |
| Floor Operations         | What is happening on the floor right now?  | Shift Managers / Pit Managers |
| Player Intelligence      | Who is playing and what is their value?    | Hosts / Marketing / Ops       |
| Financial Accountability | Where did the money move?                  | Cage / Accounting / Directors |
| Compliance & Governance  | Can the operation be defended and audited? | Compliance / Ownership        |

---

# Domain 1 — Floor Operations

## Operational Meaning

The real-time operational layer of the casino floor.

This is the system's primary observational surface.

It answers:

* Which tables are active?
* Which sessions are open?
* Which dealers are assigned?
* Which players are seated?
* Which operational anomalies require attention?
* Which tables are underperforming?
* What is stalled or aging?

## Consolidated Functions

### Session Tracking

* Rating slips
* Session lifecycle
* Table occupancy
* Dealer rotations
* Pause intervals
* Active session telemetry

### Floor Oversight

* Shift dashboard
* Live operational state
* Alerting
* Throughput monitoring
* Table health
* Runtime visibility

### Table Operations

* Rundowns
* Fill/credit workflows
* Drop visibility
* Table inventory state
* Table lifecycle state

## Dependency Relationships

```text
Floor Operations
 ├── generates player telemetry
 ├── generates operational cash observations
 ├── generates compliance evidence
 └── feeds operational intelligence surfaces
```

## Landing Page Position

This should become the primary operational pillar immediately after the hero section.

Reason:

This is the most visually demonstrable and operationally visceral capability in the system.

It creates immediate comprehension.

---

# Domain 2 — Player Intelligence

## Operational Meaning

The player-centric intelligence and relationship layer.

This domain converts raw operational telemetry into longitudinal player understanding.

It answers:

* Who is this player?
* What is their historical value?
* How often do they visit?
* What games do they prefer?
* What is their theoretical worth?
* What loyalty liability exists?
* Which players require attention?

## Consolidated Functions

### Player Profiles

* Player 360
* Visit history
* Session history
* Game preferences
* Player notes
* Identity management

### Loyalty & Value

* Theo tracking
* Loyalty accrual
* Loyalty redemption
* Reward issuance
* Tier progression
* Worth estimation

### Recognition Intelligence

* Cross-property recognition
* Visit patterns
* High-value player visibility
* Frequency analysis

## Dependency Relationships

```text
Player Intelligence
 ├── consumes Floor Operations telemetry
 ├── consumes Financial Accountability facts
 ├── produces loyalty decisions
 └── produces operational value insights
```

## Landing Page Position

This should become the second major narrative pillar.

Operational telemetry first.
Player value second.

This ordering mirrors how operators mentally process casino operations.

---

# Domain 3 — Financial Accountability

## Operational Meaning

The financial provenance and transactional traceability layer.

This is the system's trust backbone.

It answers:

* Where did money move?
* Which movements were operational vs authoritative?
* Which transactions are reconciled?
* Which movements are estimated?
* Which workflows produced financial evidence?
* Can operational activity be financially defended?

## Consolidated Functions

### Financial Tracking

* Player financial transactions
* Buy-ins
* Cash-outs
* Financial envelopes
* Transaction provenance

### Table Cash Accountability

* Fills
* Credits
* Chip movement
* Drop events
* Inventory deltas
* Cash observations

### Financial Telemetry

* Transactional outbox
* Event propagation
* Provenance tracking
* Financial integrity surfaces

## Dependency Relationships

```text
Financial Accountability
 ├── receives operational events from Floor Operations
 ├── feeds Player Intelligence valuation
 ├── feeds Compliance evidence
 └── anchors audit defensibility
```

## Landing Page Position

This should likely NOT appear as a giant standalone “finance system” surface.

Casino operators interpret this as:

"cash accountability"

not:

"financial platform"

The language must remain operational.

---

# Domain 4 — Compliance & Governance

## Operational Meaning

The operational defensibility layer.

This domain transforms telemetry into auditable operational evidence.

It answers:

* Can operational history be reconstructed?
* Are thresholds monitored?
* Are required logs captured?
* Are operators following procedure?
* Is the system internally defensible?
* Can disputes be audited?

## Consolidated Functions

### Compliance Monitoring

* MTL tracking
* Threshold monitoring
* Compliance dashboards
* Suspicious activity visibility

### Audit Infrastructure

* Audit logs
* Event lineage
* Operational history
* Actor attribution
* Change tracking

### Governance

* Role management
* Casino settings
* Operational policy controls
* Multi-property configuration

## Dependency Relationships

```text
Compliance & Governance
 ├── consumes all operational domains
 ├── depends on financial provenance
 ├── depends on operational telemetry
 └── produces audit defensibility
```

## Landing Page Position

This should appear last.

Compliance is rarely the emotional buying trigger.

It is the institutional trust validator.

---

# Cross-Cutting Layer — Operational Intelligence

## Important Architectural Clarification

Operational Intelligence is not a standalone domain.

It is the emergent layer produced by all four domains interacting.

Examples:

* Shift anomalies
* Theo integrity
* Aging sessions
* Runtime alerts
* Operational KPIs
* Comparative analytics
* Floor efficiency metrics

This should be represented visually as:

```text
Floor Operations
        ↓
Player Intelligence
        ↓
Financial Accountability
        ↓
Compliance & Governance
        ↓
Operational Intelligence
```

NOT as a separate feature category.

---

# Recommended Landing Page Consolidation

## Current Problem

The current landing page treats operational responsibilities as isolated products.

This creates:

* conceptual fragmentation,
* repetitive copy,
* narrative drift,
* weak hierarchy,
* and stakeholder cognitive overload.

---

# Recommended Executive Structure

## Hero

Operational Intelligence System for Casino Operations.

Single operational narrative.

---

## Pillar 1 — Run the Floor

Maps to:

* Floor Operations

Operational runtime visibility.

---

## Pillar 2 — Understand the Player

Maps to:

* Player Intelligence

Player worth and behavioral visibility.

---

## Pillar 3 — Track the Money

Maps to:

* Financial Accountability

Operational cash provenance.

---

## Pillar 4 — Defend the Operation

Maps to:

* Compliance & Governance

Audit and regulatory defensibility.

---

# Most Important Strategic Discovery

The system is not actually:

* a player tracker,
* a pit management system,
* a loyalty engine,
* or a compliance tool.

Those are downstream manifestations.

The system is fundamentally:

"an operational measurement and accountability layer for casino floor operations."

That is the unifying narrative.

Everything else emerges from it.

---

# Recommended Supporting Page Decomposition

| Supporting Page     | Backing Domain           |
| ------------------- | ------------------------ |
| Floor Oversight     | Floor Operations         |
| Player Intelligence | Player Intelligence      |
| Cash Accountability | Financial Accountability |
| Audit & Compliance  | Compliance & Governance  |

Avoid creating supporting pages for:

* loyalty alone,
* rating slips alone,
* alerts alone,
* fills/credits alone,
* dashboards alone.

Those are sub-capabilities, not executive domains.

---

# Final Recommendation

Collapse the current five operational responsibilities into four executive-operational domains.

This produces:

* stronger narrative containment,
* better stakeholder comprehension,
* clearer hierarchy,
* stronger product identity,
* and substantially better landing page information architecture.

The current fragmentation exposes implementation topology.

The proposed consolidation exposes operational value topology.
