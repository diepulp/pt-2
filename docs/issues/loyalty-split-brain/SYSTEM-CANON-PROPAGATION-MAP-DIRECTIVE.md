# System Canon Propagation Map Directive

**Status:** Proposed  
**Artifact type:** Governance directive / system remediation control  
**Date:** 2026-06-21  
**Applies to:** TIA canon, transactional outbox, Loyalty canonization, Rating Slip standardization, and all future exemplar propagation  
**Primary purpose:** Prevent proven exemplars from remaining isolated islands or being propagated through ad-hoc feature-first development

---

## 1. Directive

The system must not propagate the Table Inventory Accounting canon, transactional-outbox pattern, or any future exemplar through ad-hoc feature work.

Before horizontal remediation begins, the system must create and maintain a **System Canon Propagation Map** covering:

- canonical authorities;
- producers;
- consumers;
- cross-domain seams;
- legacy competing paths;
- migration, suppression, or deletion dispositions;
- proof obligations for each rollout slice.

The governing sequence is:

```text
map
→ classify
→ select bounded exemplar
→ remediate
→ certify boundaries
→ expand through the map
```

The following sequence is forbidden:

```text
discover defect
→ patch local feature
→ copy exemplar pattern
→ leave adjacent producers and consumers unmapped
→ repeat in another domain
```

This directive exists because the system already contains locally correct exemplars surrounded by non-canonical paths. A proven exemplar is not yet a propagated standard.

---

## 2. Problem Statement

The system currently has at least two strong exemplars:

1. **Table Inventory Accounting**
   - canonical formula ownership;
   - canonical projection DTO;
   - explicit completeness and authority semantics;
   - suppression of competing table-result surfaces.

2. **Transactional Outbox**
   - same-transaction authoring and outbox insertion;
   - durable relay;
   - idempotent receipt;
   - replay proof;
   - producer classification and envelope discipline.

These exemplars prove that the chosen mechanisms work.

They do not prove that:

- all relevant producers use them;
- all relevant consumers read them;
- real operator workflows supply the required anchors;
- legacy paths are suppressed;
- downstream domains preserve the same semantics;
- future features cannot bypass the canonical boundary.

Without a propagation map, each domain may adopt only the parts it finds convenient. That reproduces the feature-first development pattern that created the current split-brain.

---

## 3. Exemplar Maturity Model

Every exemplar must be tracked through three distinct maturity states.

| State | Meaning |
|---|---|
| `proven_exemplar` | One bounded path works end to end |
| `standardized_pattern` | Rules, contracts, gates, and proof obligations are frozen |
| `propagated_standard` | All mapped producers and consumers conform, migrate, suppress, or delete |

An exemplar must not be described as system-wide merely because its own implementation is complete.

### 3.1 Completion Rule

```text
exemplar complete =
  vertical proof passed
  + producer map created
  + consumer map created
  + seam inventory created
  + suppression plan created
  + expansion register created
  + next bounded slice authorized
```

A vertical proof without the remaining items is a successful implementation slice, not a completed standardization program.

---

## 4. System Canon Propagation Register

The system must create a machine-readable register, recommended name:

```text
SYSTEM-CANON-PROPAGATION-REGISTER.yaml
```

This register becomes the source of truth for exemplar propagation status.

It must not replace domain ADRs, PRDs, or EXEC artifacts. It coordinates them.

---

## 5. Required Register Sections

## 5.1 Canonical Pattern Registry

The register must name each proven pattern and its current maturity.

Example:

```yaml
canonical_patterns:
  tia_projection:
    status: standardized_pattern
    owner: TableInventoryAccounting
    exemplar: PRD-090
    propagation_status: partial

  financial_value_surface:
    status: standardized_pattern
    owner: financial_surface_contract
    propagation_status: partial

  transactional_outbox:
    status: standardized_pattern
    owner: finance_outbox
    exemplar: PRD-081
    propagation_status: partial

  producer_anchor_resolution:
    status: standardized_pattern
    owner: service_or_bff_boundary
    propagation_status: partial

  append_only_correction:
    status: proven_exemplar
    owner: domain_specific
    propagation_status: incomplete

  temporal_snapshot_rule:
    status: candidate_standard
    owner: domain_specific
    propagation_status: incomplete
```

## 5.2 Domain Status Registry

Every bounded context must have one propagation state.

Recommended values:

- `unmapped`
- `mapping`
- `mapped`
- `active_remediation`
- `contingent_dependency`
- `exemplar_proven`
- `partial_propagation`
- `converged`
- `suppressed`
- `deferred`

Example:

```yaml
domains:
  loyalty:
    status: active_remediation
    active_program: loyalty_canonization

  rating_slip:
    status: contingent_dependency
    reason: upstream seam for loyalty, finance, telemetry, and session lifecycle

  player_financial:
    status: partial_propagation
    exemplar: transactional_outbox

  table_context:
    status: partial_propagation
    exemplar: table_inventory_accounting

  visit:
    status: mapped
```

## 5.3 Node Registry

Every meaningful producer, consumer, and seam must be represented as a node.

Each node should include:

```yaml
nodes:
  - id: loyalty_liability_shift_report
    domain: loyalty
    node_type: consumer
    current_source: live_rate_x_current_balance
    canonical_source: loyalty_liability_snapshot
    status: legacy_projection
    disposition: migrate
    severity: S4
    owner: loyalty
    target_slice: loyalty_phase_1

  - id: rating_slip_adjustment_modal
    domain: rating_slip
    node_type: workflow_seam
    current_source: direct_browser_rpc
    canonical_source: server_resolved_original_pft
    status: boundary_violation
    disposition: remediate_dependency
    severity: S3
    owner: rating_slip
    target_slice: loyalty_dependency_or_rating_slip_seam
```

## 5.4 Edge Registry

Cross-domain propagation and dependency relationships must be explicit.

Example:

```yaml
edges:
  - from: rating_slip_close
    to: loyalty_accrual
    relation: freezes_and_supplies_accrual_basis

  - from: pft_authoring
    to: finance_outbox
    relation: same_transaction_emission

  - from: table_buyin_telemetry
    to: table_inventory_accounting
    relation: session_scoped_projection_input

  - from: loyalty_ledger
    to: loyalty_liability_snapshot
    relation: as_of_valuation_projection
```

Every edge must state:

- source node;
- destination node;
- semantic relationship;
- authority carried;
- anchor requirements;
- transaction boundary;
- current certification status.

---

## 6. Required Inventories

The propagation map must include four connected inventories.

# 6.1 Canonical Authority Inventory

For every canonical concept, record:

- authored fact;
- canonical owner;
- canonical DTO or event envelope;
- correction rule;
- temporal posture;
- propagation path;
- permitted consumers;
- forbidden competing owners.

Minimum concepts include:

- financial authority fact;
- operational telemetry fact;
- table inventory accounting result;
- financial surface value;
- loyalty point movement;
- loyalty balance;
- loyalty liability;
- rating-slip lifecycle state;
- producer anchor resolution;
- correction / reversal.

# 6.2 Producer Inventory

For every authoring path, record:

- domain;
- operator workflow;
- entry surface;
- service or BFF boundary;
- RPC or command;
- authoritative table;
- outbox emission status;
- event type;
- anchor requirements;
- idempotency key;
- real-workflow certification;
- current classification;
- target disposition.

Producer classifications:

- `canonical`
- `canonical_but_uncertified_workflow`
- `legacy_authoring`
- `dual_write`
- `outbox_only`
- `ledger_only`
- `dead_candidate`
- `blocked_by_anchor_resolution`

# 6.3 Consumer Inventory

For every report, dashboard, API, hook, modal, export, and receipt, record:

- value consumed;
- current source;
- canonical source;
- whether it recomputes;
- whether it reads a cache;
- whether it preserves provenance;
- whether it preserves authority;
- whether it preserves completeness;
- whether it can tolerate staleness;
- migration, suppression, deletion, or deferral disposition.

Consumer classifications:

- `canonical_consumer`
- `legacy_projection_consumer`
- `direct_authoring_store_reader`
- `client_recompute`
- `cache_reader`
- `surface_misrepresentation`
- `dead_candidate`
- `migration_target`

# 6.4 Cross-Domain Seam Inventory

The seam inventory is mandatory because most semantic fractures occur between otherwise valid domains.

At minimum, map:

- Rating Slip → Loyalty accrual
- Rating Slip → PFT
- PFT → finance outbox
- Rating Slip → telemetry
- Telemetry → TIA
- Loyalty ledger → balance
- Loyalty ledger → liability
- Loyalty → shift report
- Rating Slip modal → adjustment producer
- Rating Slip modal → reward estimate
- MTL → linked PFT adjustment
- Visit → financial summaries
- Table session → TIA session-scope aggregation

Each seam must answer:

1. What fact crosses the boundary?
2. Is it a command, authored fact, estimate, or projection input?
3. Which identity anchors travel with it?
4. Which values are frozen?
5. Which values remain live?
6. Who owns idempotency?
7. Is propagation synchronous, transactional, or outbox-driven?
8. Which authority labels must survive?
9. What is the failure behavior?
10. Which side may correct the fact?

---

## 7. Rollout Selection Rule

The next remediation domain must not be selected only by code size, defect count, or implementation convenience.

Use:

```text
priority =
  operator_visible_trust_impact
  × financial_or_compliance_consequence
  × propagation_breadth
  × mutable_input_exposure
```

Additional tie-breakers:

- whether the domain can exercise multiple proven patterns;
- whether it exposes a bounded exemplar slice;
- whether a live S4 or S5 surface exists;
- whether the domain is an upstream ingress boundary;
- whether remediation would unblock multiple mapped nodes.

---

## 8. Loyalty and Rating Slip Direction

## 8.1 Loyalty

Loyalty is authorized as the first active remediation program because:

- it has a live S4 liability trust failure;
- it has a clear ledger candidate;
- it contains valuation, aggregate, correction, propagation, and surface fractures;
- it can prove combined use of TIA-style canonical projection ownership and outbox-style propagation.

Loyalty status:

```yaml
status: active_remediation
```

## 8.2 Rating Slip

Rating Slip is immediately registered as:

```yaml
status: contingent_dependency
```

Rating Slip is not ignored.

It must be mapped because it is an ingress and orchestration boundary for:

- session lifecycle;
- average bet;
- player, visit, and table attribution;
- financial transaction initiation;
- loyalty accrual;
- telemetry;
- financial adjustment;
- close behavior.

However, a full Rating Slip standardization program must not begin merely because it touches many domains.

Its first obligation is seam certification.

---

## 9. Loyalty–Rating Slip Seam Contract

During Loyalty remediation, the Rating Slip boundary must define:

- which inputs remain live during the open session;
- which inputs freeze at close;
- which close event or command initiates accrual;
- which identities accompany the accrual request;
- whether Loyalty reads a frozen snapshot or receives explicit inputs;
- who owns idempotency;
- who owns retry behavior;
- whether the ledger and outbox write are atomic;
- how post-close edits are rejected;
- how the UI distinguishes estimate from settled reward.

Recommended target:

```text
Rating Slip close
  → freezes accrual basis
  → invokes canonical Loyalty accrual boundary
  → Loyalty ledger + Loyalty outbox commit atomically
  → settled result returned
```

This is a bounded dependency repair.

It is not authorization to rewrite all Rating Slip behavior.

---

## 10. Rating Slip Escalation Rule

After the Loyalty-facing seams are repaired, perform a focused Rating Slip split-brain review.

Possible outcomes:

### Outcome A — Contained

Only boundary defects existed.

Action:

- keep Rating Slip as a certified upstream provider;
- no full canonization program required.

### Outcome B — Internally fractured

Rating Slip has competing lifecycle, authority, or consumer semantics.

Action:

- open a dedicated SIGP entry;
- create a Rating Slip Canonicalization Directive;
- select one bounded exemplar.

### Outcome C — Systemic ingress problem

Rating Slip cannot safely supply multiple downstream domains without a broader ingress standard.

Action:

- elevate Rating Slip as the next active canonization program;
- freeze downstream expansion until the ingress model is standardized.

The escalation decision must be evidence-based.

---

## 11. Concern-Lane Propagation

Propagation should be organized by canonical concern, not only by domain.

The primary lanes are:

## 11.1 Authority and Temporal Pinning

Applies to:

- loyalty valuation;
- loyalty accrual basis;
- rating-slip close snapshot;
- TIA session bounds;
- gaming-day attribution;
- historical report snapshots.

## 11.2 Aggregate Ownership

Applies to:

- loyalty balance;
- TIA projection;
- visit financial summaries;
- shift metrics;
- dashboard caches;
- liability snapshots.

## 11.3 Producer Discipline

Applies to:

- PFT;
- adjustments;
- loyalty accrual;
- loyalty redemption;
- grind;
- fills;
- credits;
- corrections.

## 11.4 Propagation

Applies to:

- finance outbox;
- loyalty outbox;
- relay;
- idempotent receipt;
- replay;
- workflow-level producer certification.

## 11.5 Surface Convergence

Applies to:

- Rating Slip modal;
- Player 360;
- shift report;
- measurement widgets;
- pit terminal rundown;
- comp panels;
- receipts;
- exports.

Every remediation PRD must identify:

- which lane it advances;
- which mapped nodes it changes;
- which nodes remain deferred;
- which proof obligations apply.

---

## 12. Mapping Before Remediation Rule

Mapping does not require documenting the entire system before any code changes.

The minimum mapping boundary for a remediation slice is:

- all direct producers;
- all direct consumers;
- all immediate upstream identity/temporal providers;
- all immediate downstream projections and surfaces;
- all competing paths for the same semantic value.

A slice may begin when this bounded map is complete.

A slice must not begin when only the local service implementation is understood.

---

## 13. Expansion Gate

Horizontal expansion is permitted only when:

1. the exemplar passes real execution proofs;
2. producer and consumer nodes are registered;
3. all competing paths are classified;
4. a suppression or migration disposition exists;
5. cross-domain seam contracts are frozen;
6. the next bounded slice is named;
7. inherited and re-proven invariants are explicit.

Each expansion slice must state:

- new nodes added;
- new edges certified;
- inherited proof invariants;
- invariants requiring re-proof;
- legacy nodes removed or suppressed;
- map updates required at completion.

---

## 14. Proof Obligations

The propagation map must track proof status separately for:

### 14.1 Mechanism Proof

Does the canonical mechanism work?

Examples:

- same-transaction outbox insert;
- deterministic TIA formula;
- liability as-of policy lookup.

### 14.2 Producer Capability Proof

Can the producer RPC or service produce the correct result when called with valid inputs?

### 14.3 Workflow Certification

Does the real operator workflow supply the required anchors and invoke the canonical path?

### 14.4 Consumer Certification

Does the real surface consume the canonical DTO or event-derived projection without recomputation?

### 14.5 Suppression Proof

Are competing visible paths removed, disabled, or unreachable?

These proof classes must not be collapsed into one “done” flag.

---

## 15. Forbidden Rollout Patterns

## AP-1 — Ad-Hoc Exemplar Copying

A feature copies the TIA or outbox pattern without updating the propagation map.

## AP-2 — Domain-Local Completion Claim

A service is called standardized while its consumers continue using legacy paths.

## AP-3 — RPC-Only Certification

A producer is called propagated because the RPC works, while the operator workflow does not supply its anchors.

## AP-4 — Surface Compatibility Preservation

A legacy surface remains active beside the canonical surface “temporarily” with no removal gate.

## AP-5 — Map-Free Parallel Canonization

Multiple domains begin broad remediation before their shared seams are classified.

## AP-6 — Infrastructure-First Propagation

The outbox is added before fact semantics, correction rules, and vocabulary are stable.

## AP-7 — Consumer Self-Healing

A UI or hook reads raw stores and recomputes state to compensate for missing propagation.

## AP-8 — Framework Prematurity

Repeated governance patterns are converted into a generic runtime platform before three or more stable implementations prove the abstraction.

---

## 16. Required Artifacts Per Canonization Program

Every canonization program must produce:

1. Split-brain diagnosis.
2. Canonicalization Directive.
3. Bounded producer/consumer map.
4. Cross-domain seam contract.
5. Exemplar PRD.
6. Real execution proof.
7. Suppression and migration inventory.
8. Expansion plan.
9. Propagation register update.
10. Final convergence signoff.

No program is complete without all ten.

---

## 17. Initial Execution Sequence

The initial system sequence is:

```text
1. Create SYSTEM-CANON-PROPAGATION-REGISTER.yaml
2. Register TIA and transactional outbox as partial propagation
3. Register Loyalty as active remediation
4. Register Rating Slip as contingent dependency
5. Map Loyalty producers, consumers, and immediate seams
6. Execute Loyalty liability exemplar
7. Execute Loyalty balance and reversal exemplar
8. Execute Loyalty outbox exemplar
9. Certify Rating Slip–Loyalty and Rating Slip–Finance seams
10. Perform focused Rating Slip split-brain review
11. Select the next canonization program from the propagation map
```

---

## 18. Initial Status Recommendation

```yaml
canonical_patterns:
  tia_projection:
    maturity: standardized_pattern
    propagation: partial

  transactional_outbox:
    maturity: standardized_pattern
    propagation: partial

  financial_value_surface:
    maturity: standardized_pattern
    propagation: partial

  producer_anchor_resolution:
    maturity: standardized_pattern
    propagation: partial

domains:
  loyalty:
    status: active_remediation

  rating_slip:
    status: contingent_dependency

  player_financial:
    status: partial_propagation

  table_context:
    status: partial_propagation

  visit:
    status: mapping

  mtl:
    status: mapped_dependency
```

---

## 19. Governance Rule

Any future PRD that:

- introduces a new financial or loyalty producer;
- introduces a new derived financial value;
- adds a new cache;
- adds a new report or dashboard consumer;
- introduces a correction path;
- introduces a new event type;
- reads directly from a canonical authoring store;

must cite the propagation register and declare:

- affected nodes;
- affected edges;
- canonical pattern used;
- migration or suppression disposition;
- proof obligations;
- register update required at completion.

A PRD lacking this block is incomplete.

---

## 20. Success Condition

The directive succeeds when the system no longer contains isolated exemplars surrounded by unmapped legacy behavior.

The target state is:

```text
one mapped system
+ explicit canonical authorities
+ certified producer workflows
+ canonical consumers
+ suppressed competing paths
+ bounded expansion slices
```

The strategic rule is:

> Exemplars prove the mechanism.  
> The propagation map turns the mechanism into a system standard.
