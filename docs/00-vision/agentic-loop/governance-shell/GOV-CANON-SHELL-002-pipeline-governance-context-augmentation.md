# PIPELINE AUGMENTATION — CANONIZATION GOVERNANCE CONTEXT BLOCK

**Artifact ID:** GOV-CANON-SHELL-002  
**Status:** Proposed — isolated-trial augmentation  
**Applies to:** Feature Pipeline, Build Pipeline, Slice Mandate generation, Propagation Certification  
**Parent directive:** `GOV-CANON-SHELL-001-minimum-governance-shell-directive.md`  
**Purpose:** Ensure every mapped canonization slice receives the governance already established by prior diagnoses, exemplars, standards, and authority artifacts without requiring agents to search for or reconstruct them manually.  
**Replaces existing pipeline stages:** No  
**Adds runtime infrastructure:** No  

---

## 1. Directive

The Minimum Governance Shell must generate a **Canonization Governance Context Block** for every mapped canon-propagation slice before that slice enters the Feature Pipeline.

The block is an executable index of applicable governance.

It must:

1. resolve the relevant governance artifacts from the propagation map;
2. extract the obligations that apply to the current slice;
3. distinguish enforceable gates from reference-only authority;
4. attach the resulting block to the Slice Mandate;
5. carry the block unchanged into the Feature Pipeline;
6. require the Build Pipeline to return evidence against its proof obligations;
7. feed the resulting evidence into Propagation Certification and the map update.

The context block must prevent each pipeline iteration from manually rediscovering:

- the accepted semantic diagnosis;
- applicable feature classification;
- governing exemplar discipline;
- canonical ownership and vocabulary;
- temporal and correction semantics;
- producer and consumer topology;
- transport requirements;
- suppression obligations;
- maturity transition;
- required proof environments.

The block does not replace source artifacts. It resolves, references, and operationalizes them.

---

## 2. Problem Being Corrected

The current architecture contains sufficient governance, but that governance is distributed across:

- SIGP diagnoses;
- canonicalization directives;
- feature classification and transport-selection standards;
- Exemplar Slice Discipline;
- FIBs, RFCs, ADRs, PRDs, and EXEC artifacts;
- ubiquitous-language and SRL baselines;
- producer-anchor standards;
- outbox and integration-proof standards;
- consumer inventories;
- suppression directives;
- overengineering guardrails;
- maturity and rollout maps.

Without pipeline-level resolution, every new slice requires agents to search for these artifacts, reconstruct their hierarchy, decide which rules apply, and repeat decisions already established by prior exemplars.

This creates:

- accreted cognitive load;
- inconsistent authority chains;
- omission of applicable standards;
- repeated pattern selection;
- scope drift;
- build-green results that do not prove propagation;
- maturity claims unsupported by consumer and suppression evidence.

The propagation map must therefore become the retrieval and routing authority for governance context.

---

## 3. Core Rule

> **Agents do not search for canonization governance during normal slice execution. The governance shell resolves it from the map and supplies it as structured pipeline input.**

Manual discovery is permitted only when:

- the map lacks a required reference;
- two referenced authorities conflict;
- a source artifact is missing or inaccessible;
- live-state inspection disproves a mapped assumption;
- the slice introduces a genuinely new semantic category.

In those cases, the pipeline must stop and report a map or authority defect. It must not silently infer the missing governance.

---

## 4. Pipeline Position

```text
SYSTEM CANON PROPAGATION MAP
        │
        ▼
GOVERNANCE CONTEXT RESOLUTION
        │
        ├── resolve mandatory gates
        ├── resolve authority references
        ├── resolve inherited proofs
        └── identify missing/conflicting governance
        │
        ▼
CANONIZATION GOVERNANCE CONTEXT BLOCK
        │
        ▼
SLICE MANDATE
        │
        ▼
FEATURE PIPELINE
        │
        ▼
BUILD PIPELINE
        │
        ▼
PROPAGATION CERTIFICATION
        │
        ▼
MAP UPDATE
```

The block is generated before Slice Mandate authorization.

The authorized mandate freezes the block version for that slice unless a formal rescope occurs.

---

## 5. Governance Families the Pipeline Must Resolve

The pipeline must resolve the following governance families when applicable.

---

### G-01 — SIGP Diagnosis

**Purpose:** Establish the accepted semantic fracture and prevent implementation from treating a systemic split-brain as an isolated defect.

**Resolve:**

- accepted SIGP artifact;
- fracture IDs;
- competing authority paths;
- duplicate formulas or projections;
- trust or compliance consequence;
- proposed canonical owner;
- unresolved diagnosis findings.

**Pipeline enforcement:**

- a canonization slice must cite an accepted fracture inventory;
- the Slice Mandate must name the specific fracture IDs it closes;
- findings outside the slice must remain registered and deferred;
- the pipeline must not rerun broad diagnosis unless the map is defective.

**Reference-only material:**

- full diagnostic traces;
- exploratory hypotheses already rejected;
- historical investigation notes not affecting the current slice.

---

### G-02 — Feature Classification and Transport Selection

**Purpose:** Ensure the slice uses the correct architectural mechanism.

**Resolve:**

- feature class;
- transport class;
- persistence posture;
- authoring versus read-composition distinction;
- projection role;
- outbox producer/consumer role;
- surface-only consequence;
- exemplar versus expansion versus suppression posture.

**Pipeline enforcement:**

Every mandate must declare:

```yaml
classification:
  feature_class:
  transport_class:
  persistence_posture:
  authoring_posture:
  projection_posture:
  surface_consequence:
  rollout_posture:
```

The pipeline must block:

- authoring behavior inside a read-composition slice;
- outbox work inside a slice classified as non-propagating;
- UI-local formula work when the slice requires a canonical derived model;
- persisted projections when read-time derivation is frozen;
- direct transport selection that conflicts with the classification standard.

---

### G-03 — Exemplar Slice Discipline

**Purpose:** Collapse broad remediation vertically before horizontal expansion.

**Resolve:**

- whether exemplar discipline applies;
- structural categories involved;
- representative exemplar or symmetric pair;
- end-to-end chain;
- containment boundary;
- expansion gate;
- inherited and repeated proof obligations.

**Pipeline enforcement:**

The pipeline must require the exemplar to be:

- minimal;
- representative;
- symmetric where multiple categories share the mechanism;
- end-to-end;
- proven through real execution.

The pipeline must block:

- horizontal-first rollout;
- asymmetric shortcut;
- mock-only or specification-only proof;
- expansion before the exemplar gate passes;
- absorbing newly discovered adjacent work into the exemplar.

---

### G-04 — Canonicalization Directive

**Purpose:** Freeze the domain-level target model before implementation slices begin.

**Resolve:**

- authoritative authored facts;
- derived projections;
- correction lifecycle;
- temporal postures;
- canonical ownership;
- canonical DTO family;
- producer and consumer classification;
- prohibited competing semantics;
- phase or slice order.

**Pipeline enforcement:**

A multi-fracture domain remediation must have a Canonicalization Directive before implementation begins.

The pipeline must block any PRD or EXEC that:

- invents ownership locally;
- reopens settled domain semantics without authority;
- combines phases frozen as separate slices;
- introduces a consumer before its underlying fact semantics are stable.

---

### G-05 — Ubiquitous Language and SRL Binding

**Purpose:** Preserve one meaning and one canonical name for each concept.

**Resolve:**

- canonical terms;
- forbidden terms;
- deprecated terms;
- term distinctions;
- allowed surface labels;
- reason-to-event mappings;
- database rejection requirements;
- migration terminology.

**Pipeline enforcement:**

- canonical names must be used in DTOs, events, APIs, tests, and surfaces;
- forbidden vocabulary must be mechanically scanned where practical;
- deprecated reasons or event terms must be rejected at the authoritative boundary when required;
- a consumer may not rename an estimated, partial, or unsettled value into a stronger claim.

---

### G-06 — Canonical Fact and Projection Standard

**Purpose:** Require each stateful slice to explicitly define authorship, derivation, and consumer authority.

**Resolve and enforce answers to:**

1. What is the authoritative authored fact?
2. What is derived?
3. Who owns each formula?
4. Is correction mutation or compensation?
5. Which inputs are pinned at event time?
6. Which inputs are selected as of a date?
7. Which values are live estimates?
8. Is an aggregate derived, cached, or independently authored?
9. May a surface recompute it?
10. What provenance crosses the boundary?
11. Can derived state be rebuilt?
12. Which consumers must converge or be suppressed?
13. Which vocabulary is canonical?
14. Which deprecated semantics are mechanically rejected?
15. Which proof invariants certify the exemplar?

The pipeline must reject any canonical derived value with no declared owner or consumer contract.

---

### G-07 — Temporal and Lifecycle Classification

**Purpose:** Prevent historical, settled, snapshot, live, and current values from collapsing into one another.

**Resolve:**

```yaml
temporal_posture:
  allowed:
    - event_time_pinned
    - as_of_date_versioned
    - live_estimate
    - current_operational_state
  selected:
  cutoff_identity:
  effective_date_rule:
  lifecycle_boundary:
  mutation_after_settlement:
  null_vs_zero_rule:
```

**Pipeline enforcement:**

- historical values must not use active render-time policy or mutable inputs;
- settled values must not be silently recomputed;
- live estimates must disclose that they may change;
- cutoff and effective-date selection must be server-owned when required;
- null and zero must remain semantically distinct when the canon requires it.

---

### G-08 — One Owner and One Canonical DTO Authority

**Purpose:** Eliminate formula and contract split-brain.

**Resolve:**

- owning bounded context, subdomain, service, or BFF;
- sole formula owner;
- canonical DTO;
- semantic fields consumers may not derive;
- raw fields that may or may not cross the boundary;
- approved consumer access path.

**Pipeline enforcement:**

- exactly one owner for each canonical calculation;
- exactly one canonical semantic DTO family per concern;
- routes and UIs may render but not recompute semantic meaning;
- competing DTOs and formulas must receive dispositions.

---

### G-09 — Consumer Disposition and Suppression Inventory

**Purpose:** Prove that canonical implementation replaces or suppresses competing paths.

**Resolve:**

```yaml
consumer_dispositions:
  canonical: []
  migrate: []
  suppress: []
  delete: []
  legacy_quarantined: []
  outside_active_workflow: []
```

**Pipeline enforcement:**

- every active in-scope consumer must have one disposition;
- a canonical implementation does not close the slice while competing active paths remain unclassified;
- suppression remains an independent proof class;
- forbidden direct-table reads, local calculations, or legacy labels must be removed or quarantined;
- “outside active workflow” requires evidence, not assertion.

---

### G-10 — Correction-by-Compensation Standard

**Purpose:** Preserve immutable history and auditable correction semantics.

**Resolve:**

- original-fact identity;
- compensating or superseding fact type;
- eligibility rules;
- correction reason;
- duplicate prevention;
- partial versus full correction semantics;
- trusted actor attribution;
- audit requirements.

**Pipeline enforcement:**

The pipeline must block:

- mutation or deletion of settled facts;
- unnamed corrections;
- correction rows lacking an original reference;
- duplicate full reversal;
- client-side correction arithmetic;
- caller-supplied trusted attribution.

---

### G-11 — Provenance, Authority, Completeness, and Settlement Envelope

**Purpose:** Prevent correct numbers from making false semantic claims.

**Resolve, where applicable:**

- source;
- authority;
- temporal posture;
- settlement state;
- as-of timestamp;
- policy version;
- effective date;
- included inputs;
- missing inputs;
- calculation kind;
- custody status;
- snapshot, ledger, or source identity.

**Pipeline enforcement:**

- every canonical derived value must define its boundary envelope;
- surface labels must match authority and temporal posture;
- completeness must not upgrade authority;
- a value with unknown authority must not be rendered as authoritative;
- related displayed amount and provenance must derive from the same canonical identity.

---

### G-12 — Producer Anchor Resolution and Workflow Certification

**Purpose:** Distinguish producer capability from actual workflow adoption.

**Resolve:**

- required anchor;
- anchor source;
- resolution boundary;
- caller restrictions;
- ambiguity rule;
- relevant call site;
- expected end-to-end workflow.

**Pipeline enforcement:**

The pipeline must require separate proof for:

- mechanism correctness;
- producer capability;
- actual workflow traversal.

It must block:

- UI-owned anchor resolution when the standard requires service/BFF ownership;
- using broad context identifiers where a specific authored-fact identity is required;
- treating RPC capability as workflow certification;
- silent ambiguity resolution.

---

### G-13 — Transport Invariants

**Purpose:** Apply proven propagation mechanics only when the slice classification requires transport.

**Resolve conditionally:**

- same-transaction authoring and event insertion;
- immutable event classification;
- event catalog;
- at-least-once delivery;
- idempotent consumer receipt;
- deterministic ordering;
- replayability;
- no side-channel propagation;
- transport security boundary;
- I1–I4 proof requirements.

**Pipeline enforcement:**

When transport applies, block:

- authoring without canonical event emission;
- event emission without authoring;
- two-transaction “logical atomicity”;
- payload-inferred semantics;
- non-idempotent consumers;
- claiming replayability without actual replay proof;
- using outbox history as authoritative authored state.

When transport does not apply, do not attach outbox requirements merely because an exemplar elsewhere used them.

---

### G-14 — Integration-Proof Standard

**Purpose:** Match the proof environment to the claim being certified.

**Resolve:**

```yaml
required_proof_environments:
  unit:
  contract:
  database_integration:
  route_integration:
  component_render:
  end_to_end_workflow:
  failure_injection:
  replay:
```

**Pipeline enforcement:**

- integration claims must use a real database path;
- workflow claims must traverse the real route/service/callsite chain;
- atomicity claims require rollback or failure injection;
- replayability claims require state reset and deterministic rebuild;
- surface claims require route and render evidence where applicable;
- mock-heavy tests cannot discharge real integration obligations.

---

### G-15 — Overengineering and Anti-Framework Guardrail

**Purpose:** Reuse proven governance without prematurely generalizing runtime architecture.

**Resolve:**

- allowed governance reuse;
- prohibited generic runtime abstractions;
- slice-specific containment;
- extraction trigger;
- deferred infrastructure.

**Pipeline enforcement:**

The pipeline must block:

- generic fact engines;
- generic valuation frameworks;
- generic projection platforms;
- cross-domain event-bus redesign;
- universal authority enums across unrelated domains;
- new runtime infrastructure not required by the mapped slice.

Repeated governance structures should become templates first. Runtime extraction requires repeated implementation evidence.

---

### G-16 — Maturity Ratchet and Expansion Inheritance

**Purpose:** Prevent code shipment from being mistaken for system-wide propagation.

**Resolve:**

```yaml
maturity:
  pattern_status:
    - candidate
    - accepted
    - superseded

  implementation_maturity:
    current:
    target:

  inherited_proofs: []
  proofs_to_repeat: []
  expansion_authority:
```

Recommended implementation maturity values:

```text
unproven
proven_exemplar
standardized_pattern
propagated_standard
```

**Pipeline enforcement:**

- pattern status and implementation maturity must remain separate;
- a build may not self-award a maturity transition;
- successor slices must declare inherited proofs and required re-proof;
- `propagated_standard` requires certified consumer convergence and suppression, not only mechanism delivery;
- official maturity changes occur only through Propagation Certification plus map update.

---

## 6. Canonization Governance Context Block

The governance shell must generate the following block.

```yaml
canonization_governance_context:
  context_id:
  generated_at:
  generator:
  map_version:
  register_version:
  slice_mandate_id:
  status: complete | incomplete | conflict

  diagnosis:
    sigp_ref:
    fracture_ids: []
    accepted_findings: []
    unresolved_findings: []
    prohibited_reinvestigation: []

  classification:
    standard_ref:
    feature_class:
    transport_class:
    persistence_posture:
    authoring_posture:
    projection_posture:
    surface_consequence:
    rollout_posture:
    exemplar_discipline_applies:

  scope_authority:
    canonicalization_directive_ref:
    feature_intake_ref:
    slice_mandate_ref:
    phase_or_slice_position:
    allowed_expansion_without_amendment: false

  semantic_authority:
    ownership_adr_refs: []
    formula_adr_refs: []
    temporal_rule_refs: []
    correction_rule_refs: []
    ubiquitous_language_ref:
    srl_binding_ref:
    canonical_terms: []
    forbidden_terms: []
    deprecated_terms: []

  canonical_model:
    authored_facts: []
    derived_values: []
    formula_owner:
    dto_authority:
    correction_model:
    temporal_posture:
    cutoff_identity:
    effective_date_rule:
    provenance_contract:
    settlement_contract:
    null_vs_zero_rule:

  topology:
    producers: []
    producer_anchors: []
    workflow_callsites: []
    consumers: []
    competing_paths: []
    direct_read_paths: []
    legacy_formulas: []

  containment:
    in_scope_nodes: []
    in_scope_edges: []
    deferred_nodes: []
    forbidden_expansion: []
    suppression_targets: []
    stop_conditions: []

  exemplar:
    discipline_ref:
    representative_categories: []
    exemplar_pair_or_path:
    end_to_end_chain:
    expansion_gate:
    inherited_mechanism:
    inherited_proofs: []
    proofs_to_repeat: []

  transport:
    applies:
    authority_refs: []
    same_transaction_required:
    immutable_classification_required:
    idempotent_consumer_required:
    deterministic_order_required:
    replay_required:
    prohibited_side_channels: []

  proof:
    mechanism:
      required:
      obligations: []
      admissible_evidence: []

    producer_capability:
      required:
      obligations: []
      admissible_evidence: []

    workflow_certification:
      required:
      obligations: []
      admissible_evidence: []

    consumer_certification:
      required:
      obligations: []
      admissible_evidence: []

    suppression:
      required:
      obligations: []
      admissible_evidence: []

    required_environments:
      unit:
      contract:
      database_integration:
      route_integration:
      component_render:
      end_to_end_workflow:
      failure_injection:
      replay:

  guardrails:
    overengineering_ref:
    prohibited_runtime_abstractions: []
    allowed_governance_reuse: []
    correction_by_compensation_required:
    one_owner_required:
    one_dto_authority_required:

  maturity:
    pattern_status:
    implementation_maturity_current:
    implementation_maturity_target:
    authorized_transition:
    map_update_required: true

  resolution:
    missing_references: []
    conflicts: []
    warnings: []
    decision: admit | block_map_incomplete | block_authority_conflict
```

---

## 7. Context Resolution Rules

### R1 — Map-first resolution

The propagation map supplies the artifact references and applicability flags.

The resolver must not perform open-ended repository search when the map is complete.

### R2 — Reference source artifacts, do not copy full documents

The block contains:

- references;
- applicable obligations;
- frozen decisions;
- exact proof expectations;
- explicit exclusions.

It must not duplicate entire ADRs, SIGPs, or standards.

### R3 — Strongest active authority wins

Where historical artifacts conflict with later accepted amendments, the context block must name:

- the active authority;
- the superseded artifact;
- the specific superseded rule.

A conflict with no declared precedence blocks admission.

### R4 — Conditional governance remains conditional

Transport, correction, snapshot, custody, compliance, and surface-envelope rules apply only when classification activates them.

Do not attach every standard to every slice.

### R5 — Missing governance is a map defect

Missing required references produce:

```yaml
resolution:
  decision: block_map_incomplete
```

The Feature Pipeline must not fill the gap through inference.

### R6 — Context freeze

The context block is frozen when the Slice Mandate is authorized.

Changes require:

- map update;
- regenerated context block;
- mandate amendment or replacement;
- human reauthorization.

### R7 — Evidence traces to obligations

Every build or certification evidence item must identify:

- context block section;
- proof class;
- obligation ID;
- produced artifact or test;
- pass/fail result.

---

## 8. Feature Pipeline Entry Gate

Add the following entry gate to the Feature Pipeline:

```text
CANONIZATION GOVERNANCE CONTEXT GATE

A mapped canon-propagation slice may not enter Scaffold, RFC, ADR, PRD,
or EXEC authoring unless:

1. an authorized Slice Mandate exists;
2. a complete Canonization Governance Context Block is attached;
3. its map and register versions match the mandate;
4. classification is resolved;
5. the applicable Canonicalization Directive and SIGP diagnosis are cited;
6. exemplar-discipline applicability is declared;
7. canonical owner, DTO authority, temporal posture, and correction model
   are resolved where applicable;
8. producers, consumers, competing paths, and suppression targets are named;
9. proof classes and required proof environments are declared;
10. no missing reference or unresolved authority conflict remains.
```

### Entry outcomes

```yaml
entry_gate:
  - admitted
  - blocked_map_incomplete
  - blocked_authority_conflict
  - blocked_classification_missing
  - blocked_scope_mismatch
```

---

## 9. Feature Pipeline Obligations

The Feature Pipeline must:

- treat the context block as frozen upstream authority;
- elaborate implementation design without expanding the mapped slice;
- cite context obligations in every downstream artifact;
- surface contradictions instead of resolving them silently;
- preserve deferred nodes and forbidden expansion;
- generate a traceability table from context obligation to design decision;
- state which source artifacts remain reference-only;
- prevent ADR, PRD, or EXEC authors from reopening settled canon accidentally.

Required downstream traceability:

```yaml
governance_traceability:
  context_id:
  obligations:
    - obligation_id:
      source_governance:
      downstream_artifact:
      section:
      disposition:
```

---

## 10. Build Pipeline Entry Requirements

The Build Pipeline may begin only when the approved EXEC includes:

- context block ID and version;
- governing Slice Mandate;
- in-scope nodes and edges;
- explicit deferrals;
- required proof classes;
- proof environment matrix;
- suppression inventory;
- maturity target;
- stop and rescope conditions.

The Build Pipeline must not invoke a worker whose assignment cannot be traced to:

- an EXEC workstream;
- a Slice Mandate boundary;
- a context block obligation.

---

## 11. Build Pipeline Exit Handoff

Add the following exit handoff:

```text
CANONIZATION EVIDENCE HANDOFF

Build completion does not certify propagation.

The Build Pipeline must emit an evidence package mapped to the
Canonization Governance Context Block:

- mechanism evidence;
- producer-capability evidence;
- real-workflow evidence;
- consumer evidence;
- suppression evidence;
- required proof-environment results;
- unresolved residuals;
- discovered map defects;
- maturity recommendation without authority to apply it.
```

Required shape:

```yaml
canonization_evidence_handoff:
  context_id:
  slice_mandate_id:
  build_id:
  implementation_status:

  evidence:
    mechanism: []
    producer_capability: []
    workflow_certification: []
    consumer_certification: []
    suppression: []

  proof_environment_results:
    unit:
    contract:
    database_integration:
    route_integration:
    component_render:
    end_to_end_workflow:
    failure_injection:
    replay:

  residuals: []
  discovered_map_defects: []
  requested_rescope:
  recommended_maturity_transition:
```

The Build Pipeline may recommend but may not apply the maturity transition.

---

## 12. Propagation Certification Integration

Propagation Certification must compare the evidence handoff against the frozen context block.

Certification must verify:

1. every required obligation has admissible evidence;
2. evidence came from the required environment;
3. all required proof classes passed independently;
4. competing paths received dispositions;
5. suppression evidence is complete;
6. no authority or vocabulary drift occurred;
7. maturity transition is supported;
8. discovered residuals are registered;
9. the map can be updated without claiming more than the evidence proves.

Certification outcomes remain:

```yaml
decision:
  - certified
  - rejected
  - rescope_required
  - evidence_incomplete
```

---

## 13. Governance to Enforce Directly

The following belong directly in pipeline gates because their omission changes correctness, scope, or certification:

1. Accepted SIGP fracture inventory.
2. Feature classification and transport selection.
3. Canonicalization Directive presence where required.
4. Exemplar Slice Discipline decision.
5. One canonical owner.
6. One canonical DTO authority.
7. Temporal posture and lifecycle boundary.
8. Correction model.
9. Producer-anchor ownership.
10. Producer, workflow, consumer, and competing-path inventory.
11. Consumer disposition and suppression targets.
12. Proof-class separation.
13. Required proof environments.
14. Conditional transport invariants.
15. Overengineering containment.
16. Pattern status and implementation maturity separation.
17. Map update as the only official propagation-state change.

These must be represented as structured fields, pass/fail gates, or explicit dispositions.

---

## 14. Governance to Reference

The following should normally be resolved by reference rather than copied into the pipeline:

- full SIGP diagnostic reports;
- complete ADR text;
- complete ubiquitous-language baselines;
- complete SRL catalogs;
- full knowledge bases;
- exemplar implementation précis;
- prior proof scripts;
- rollout histories;
- full producer and consumer research notes;
- rejected alternatives;
- external industry-pattern research;
- historical superseded drafts.

The context block must extract only the rules and obligations applicable to the current slice while preserving source references for audit.

---

## 15. Reference Resolution Priority

When several artifacts address the same concern, resolve precedence in this order unless an explicit project rule says otherwise:

```text
1. Accepted superseding ADR or frozen amendment
2. Active classification or transport-selection standard
3. Active Canonicalization Directive
4. Accepted ubiquitous-language / SRL authority
5. Authorized Slice Mandate
6. Current FIB / RFC / PRD / EXEC within its proper responsibility
7. Adopted exemplar standard
8. Historical intent artifact
9. Diagnostic or research reference
```

A lower artifact must not silently override a higher authority.

The context block must record any intentional exception.

---

## 16. Minimum Repository Integration

For the isolated trial, add:

```text
governance-shell/
  README.md
  pipeline-augmentation.md
  templates/
    canonization-governance-context.yaml
    slice-mandate.yaml
    propagation-certification.yaml
    trial-assessment.md
```

Recommended generated artifact location:

```text
docs/governance/canon-propagation/context/
  CANONIZATION-CONTEXT-<SLICE-ID>.yaml
```

The exact paths may follow repository convention. Do not create a new documentation taxonomy solely for this feature.

---

## 17. Trial Requirements

The next isolated loyalty-liability slice must test whether the resolver can supply, without manual rediscovery:

- SIGP-003 fracture references;
- Loyalty Canonicalization Directive;
- liability temporal posture;
- as-of valuation rule;
- server-owned policy selection;
- canonical snapshot identity;
- one-consumer exemplar boundary;
- deferred liability widget;
- consumer suppression obligation;
- proof environments;
- maturity target;
- map update obligation.

The trial assessment must record:

- governance references automatically resolved;
- references manually searched;
- missing or conflicting map entries;
- repeated governance questions;
- context omissions discovered during design;
- context fields unused or excessively burdensome;
- whether the block reduced or increased cognitive load.

---

## 18. Success Criteria

This augmentation succeeds when:

- agents no longer manually search for established canonization governance during ordinary slice execution;
- downstream artifacts consistently cite the same authority chain;
- applicable exemplar rules are not omitted;
- classification prevents mechanism mismatch;
- temporal, correction, and ownership decisions remain stable;
- proof classes remain distinct;
- active competing paths are not forgotten;
- build completion is not confused with propagated-standard maturity;
- the updated map is sufficient to initiate the next slice without a fresh governance investigation;
- the context block remains materially smaller than the source artifact set it indexes.

---

## 19. Failure Criteria

Reject or reduce this augmentation when:

- generating the context block requires a new broad investigation every time;
- most fields are irrelevant to most slices;
- agents spend more effort maintaining the block than using it;
- the block duplicates full source artifacts;
- it becomes a second specification artifact;
- it permits stale extracted rules to override updated source authority;
- pipeline progress depends on maintaining a generalized governance engine;
- the context block expands rather than reduces cognitive load.

---

## 20. Closing Rule

The propagation map must function as the system’s executable governance index.

The Canonization Governance Context Block is the bounded handoff that converts that index into pipeline action:

```text
Map identifies the slice and applicable authority.
Context resolution assembles the governing obligations.
The mandate authorizes one bounded reconciliation.
The existing pipelines design and build.
Certification evaluates real propagation.
The map records the new observed state.
```

The augmentation is successful only when it removes repeated governance discovery without creating another governance system to manage.

---

## Appendix A — Industry Basis

This augmentation follows three established architectural ideas:

1. **Desired-state reconciliation:** Kubernetes controllers read desired state and act to bring observed state closer to it. The propagation map and certification loop use the same high-level separation while retaining human authorization.
2. **Orchestrator–workers:** bounded orchestration retains control and delegates implementation work to specialized workers; the Slice Mandate and context block constrain that delegation.
3. **Blackboard/shared-state coordination:** specialized actors coordinate through structured shared state rather than requiring every actor to reconstruct all prior reasoning.

These patterns justify the topology. They do not authorize introducing Kubernetes, an external workflow engine, or a generalized multi-agent framework.
