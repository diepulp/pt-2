# MINIMUM GOVERNANCE SHELL DIRECTIVE

**Directive ID:** GOV-CANON-SHELL-001  
**Status:** Proposed — isolated-environment trial authorized  
**Date:** 2026-06-22  
**Applies to:** Current agentic feature and build architecture  
**Primary purpose:** Reduce accreted cognitive load, preserve governance and pattern traceability, and force the next remediation slice to follow the established canon-propagation map rather than rediscovering strategy.  
**Trial boundary:** One isolated-environment execution against the next slice already selected by the System Canon Propagation Map.  
**Supersedes:** Nothing  
**Replaces existing pipelines:** No  

---

## 1. Directive

The current feature pipeline and build pipeline remain the only authorized design and implementation factories.

A **Minimum Governance Shell** must be added around those pipelines for the next mapped remediation slice.

The shell has four responsibilities only:

1. read the established propagation map;
2. issue one bounded Slice Mandate;
3. certify the completed slice against explicit propagation proof classes;
4. update the propagation map with the certified result.

The shell must not become a second feature pipeline, a second build pipeline, a general workflow engine, or an autonomous planning system.

The trial exists to determine whether this thin governance layer reduces cognitive load and improves traceability without delaying delivery.

---

## 2. Problem Being Addressed

The system no longer suffers from a lack of patterns, exemplars, or governance artifacts.

It suffers from their **accretion**.

The current posture includes:

- multiple accepted ADR chains;
- canonical exemplars;
- lane-specific authority skills;
- split-brain investigations;
- feature and build pipelines;
- rollout maps;
- proof harnesses;
- suppression requirements;
- producer and consumer dependencies;
- maturity distinctions between exemplar, standard, and propagated standard.

The immediate problem is therefore not:

> What pattern should be used?

Nor is it:

> What feature should be built next?

Those questions have already been answered by the established propagation map.

The immediate problem is:

> How does the system reliably carry the mapped decision into the existing pipeline, preserve its authority and constraints through implementation, certify that the result propagated, and record the outcome without requiring each agent to reconstruct the entire governance history?

The Minimum Governance Shell addresses that problem.

---

## 3. Core Principle

> **The map decides sequence. The mandate bounds the slice. The existing pipelines design and build. Certification proves propagation. The map records the result.**

The shell governs entry into and exit from the current pipelines.

It does not govern their internal implementation mechanics.

---

## 4. Operating Model

```text
SYSTEM CANON PROPAGATION MAP
        │
        │ read next authorized slice
        ▼
SLICE MANDATE
        │
        │ human authorization
        ▼
EXISTING FEATURE PIPELINE
        │
        ▼
EXISTING BUILD PIPELINE
        │
        ▼
PROPAGATION CERTIFICATION
        │
        │ pass / reject / rescope
        ▼
MAP UPDATE
        │
        └── next mapped slice remains blocked until update is complete
```

This is a human-gated reconciliation loop:

- the canon and map express desired and observed state;
- one discrepancy is admitted;
- the existing delivery system performs the work;
- evidence is evaluated;
- observed state is updated.

The loop is intentionally not autonomous during the trial.

---

## 5. Components of the Minimum Shell

The trial introduces exactly four governance components.

### 5.1 Propagation Map Preflight

Before the feature pipeline begins, the governance shell reads the existing propagation register and map.

The preflight must identify:

- the next authorized slice;
- the canon or standardized pattern being propagated;
- affected nodes and edges;
- current dispositions;
- known competing paths;
- required proof obligations;
- explicitly deferred nodes;
- applicable authority lane;
- containment boundary.

The preflight must not perform a new broad system investigation unless the map entry is internally inconsistent or lacks the minimum fields required to issue a mandate.

#### Preflight rule

```text
If the map already answers the sequencing question,
the shell must follow the map rather than reopen prioritization.
```

#### Permitted preflight outcomes

```yaml
outcome:
  - mandate_ready
  - map_incomplete
  - map_conflict
```

`map_incomplete` or `map_conflict` blocks mandate issuance and returns the defect to the map owner. It does not authorize the feature pipeline to infer the missing strategy.

---

### 5.2 Slice Mandate

The Slice Mandate is the sole commissioning contract between the governance shell and the existing feature pipeline.

It is intentionally thinner than a Feature Intake Brief, RFC, ADR, PRD, or EXEC.

It tells the pipeline **what mapped discrepancy to reconcile**, not how to design or implement it.

#### Required Slice Mandate fields

```yaml
slice_mandate:
  id:
  status: proposed | authorized | completed | rejected | superseded

  map_authority:
    register_version:
    map_version:
    source_node_ids:
    source_edge_ids:

  target:
    slice_name:
    bounded_problem:
    desired_end_state:
    current_observed_state:

  canon:
    governing_pattern:
    authority_artifacts:
    exemplar_reference:
    maturity_target:

  containment:
    in_scope_nodes:
    in_scope_edges:
    forbidden_expansion:
    deferred_nodes:
    stop_conditions:

  routing:
    authority_lane:
    delivery_entrypoint: feature_pipeline
    build_entrypoint: build_pipeline

  proof_obligations:
    mechanism:
    producer_capability:
    workflow_certification:
    consumer_certification:
    suppression:

  completion_rule:
    map_update_required: true
    propagation_certification_required: true

  human_authorization:
    authorized_by:
    authorized_at:
```

#### Mandate invariants

The mandate must:

- authorize one bounded slice only;
- cite the exact map version used;
- identify the established exemplar or standard;
- state the required maturity transition;
- name proof obligations before design begins;
- preserve deferred nodes as explicitly out of scope;
- enter the feature pipeline through its normal intake path.

The mandate must not:

- contain detailed architecture;
- replace the FIB, RFC, ADR, PRD, or EXEC;
- invoke implementation workers;
- redefine canon;
- reprioritize the rollout map;
- combine several independent remediation slices for convenience.

---

### 5.3 Propagation Certification

Completion of the build pipeline does not automatically mean that canon propagation is complete.

The governance shell performs a separate certification after the existing pipeline reports delivery complete.

Certification evaluates five proof classes independently.

#### Proof Class 1 — Mechanism

Question:

> Does the implementation conform to the established mechanism and its invariants?

Typical evidence:

- schema and service implementation;
- contract tests;
- failure harness;
- architectural conformance checks;
- required CI gates.

A passing mechanism proof does not prove real workflow adoption.

---

#### Proof Class 2 — Producer Capability

Question:

> Can the intended producer or authoring path emit or invoke the canonical mechanism correctly?

Typical evidence:

- producer-level integration tests;
- anchor-resolution proof;
- same-transaction or equivalent invariant proof;
- canonical envelope or DTO proof;
- no alternate producer path introduced.

A capable producer does not prove that the real operator workflow reaches it.

---

#### Proof Class 3 — Workflow Certification

Question:

> Does the actual operator or system workflow traverse the canonical path end to end?

Typical evidence:

- real route/BFF/service path;
- real UI or system trigger where applicable;
- workflow-level integration proof;
- correct anchor and context propagation;
- observable canonical output.

This class prevents RPC capability or isolated service tests from being mistaken for rollout completion.

---

#### Proof Class 4 — Consumer Certification

Question:

> Do all in-scope consumers preserve the canonical semantics and use the approved owner or contract?

Typical evidence:

- consumer inventory;
- canonical DTO consumption;
- no local recomputation;
- authority and completeness preservation;
- route and UI boundary tests.

A consumer that merely displays a similar number is not certified.

---

#### Proof Class 5 — Suppression

Question:

> Have competing in-scope paths been removed, disabled, redirected, or explicitly classified?

Typical evidence:

- legacy surface inventory;
- code-path removal;
- route suppression;
- forbidden-label scan;
- negative tests;
- map disposition update.

Suppression is independent from successful canonical implementation. A new correct path does not eliminate an old competing path.

---

#### Certification outcomes

```yaml
certification:
  decision:
    - certified
    - rejected
    - rescope_required
    - evidence_incomplete

  proof_classes:
    mechanism:
    producer_capability:
    workflow_certification:
    consumer_certification:
    suppression:
```

The overall slice is `certified` only when every proof class required by the Slice Mandate passes.

A proof class may be marked `not_applicable` only when the mandate declared that status before implementation and provided a reason.

---

### 5.4 Map Update

A certified slice is not complete until the propagation map is updated.

The update must record:

- implemented nodes and edges;
- former and new dispositions;
- proof evidence references;
- maturity transition;
- suppressed or removed paths;
- unresolved residuals;
- newly discovered dependencies;
- next-slice eligibility impact;
- certification decision and date.

#### Update invariant

```text
Implementation changes code.
Certification changes confidence.
Only the map update changes official propagation state.
```

No pipeline artifact may independently claim `propagated_standard` unless the map has been updated accordingly.

---

## 6. Relationship to Existing Agentic Roles

### 6.1 Root / System Propagation Authority

May:

- read the map;
- issue the Slice Mandate;
- evaluate certification evidence;
- update authoritative map status.

May not:

- write production code;
- bypass the feature pipeline;
- invoke implementation craftsmen directly;
- redesign the slice after mandate authorization without rescoping.

---

### 6.2 Lane Authorities

May:

- verify lane-specific canon;
- identify applicable exemplars and invariants;
- evaluate lane-specific evidence;
- report conflicts to the root authority.

May not:

- independently reprioritize the system map;
- issue competing mandates;
- directly coordinate implementation workers.

---

### 6.3 Feature Pipeline

May:

- consume the Slice Mandate;
- elaborate it into the existing design artifact chain;
- surface design conflicts;
- request rescoping when the mandate cannot be honored.

May not:

- redefine rollout priority;
- expand to deferred map nodes;
- reinterpret the maturity target;
- certify its own propagation result.

---

### 6.4 Build Pipeline

May:

- execute the approved design;
- invoke implementation specialists;
- collect implementation and test evidence;
- report completion or failure.

May not:

- modify the Slice Mandate;
- mark map nodes as propagated;
- collapse the five proof classes into build success;
- directly update strategic map fields.

---

### 6.5 Craftsmen / Implementation Agents

May:

- execute scoped work assigned through the build pipeline;
- produce required evidence;
- report contradictions.

May not:

- infer strategic scope from the entire map;
- invoke sibling specialists outside the pipeline;
- change canon or rollout sequence;
- update certification or maturity state.

---

## 7. Trial Protocol

The Minimum Governance Shell will be tested once in an isolated environment against the **next slice already selected by the established propagation map**.

The trial is not permission to select a new slice.

### 7.1 Trial entry conditions

The trial may begin when:

- the propagation map identifies the next slice;
- the relevant canon and exemplar are already established;
- the isolated environment is available;
- the current pipeline can execute normally;
- the map version is frozen for the duration of mandate authoring;
- a human authorizes the Slice Mandate.

---

### 7.2 Trial execution sequence

```text
T1 — Read the frozen map entry
T2 — Generate the Slice Mandate
T3 — Human reviews mandate against the map
T4 — Submit mandate to the existing feature pipeline
T5 — Run the normal design artifact chain
T6 — Run the normal build pipeline in the isolated environment
T7 — Collect proof outputs
T8 — Perform five-class propagation certification
T9 — Update the isolated copy of the propagation map
T10 — Evaluate the shell itself
```

The trial must not modify production rollout state until the shell evaluation is accepted.

---

### 7.3 Trial evaluation criteria

The shell is successful when it demonstrates all of the following:

#### Cognitive-load reduction

- pipeline agents receive the bounded canon context without reconstructing the entire history;
- fewer broad discovery passes are required;
- fewer repeated questions concern pattern selection, next-slice selection, or governing authority;
- design artifacts cite the same map, mandate, exemplar, and canon chain consistently.

#### Traceability

- every major implementation obligation traces to a mandate field;
- every mandate field traces to a map node, edge, disposition, or proof obligation;
- every certification result points to concrete evidence;
- every official status change appears in the map update.

#### Scope containment

- no deferred map node enters the slice;
- the feature pipeline elaborates but does not expand the mandate;
- the build pipeline executes but does not reinterpret strategy;
- discovered adjacent work is registered rather than absorbed.

#### Delivery continuity

- the governance shell does not replace or fork the existing pipelines;
- the immediate remediation reaches implementation;
- shell artifacts remain materially smaller than the design artifacts they govern;
- governance work does not dominate implementation work.

#### Decision quality

- build success is distinguishable from propagation success;
- uncured legacy paths remain visible;
- maturity is not advanced prematurely;
- the next slice can be determined from the updated map without a fresh architecture investigation.

---

## 8. Trial Metrics

The trial should capture a small evidence table rather than create a telemetry platform.

```yaml
trial_metrics:
  context:
    map_nodes_in_scope:
    map_edges_in_scope:
    governing_artifacts_count:

  pipeline:
    repeated_governance_questions:
    scope_expansion_attempts:
    mandate_rescope_count:
    rediscovery_passes:
    pipeline_interruptions_due_to_missing_authority:

  traceability:
    obligations_total:
    obligations_with_map_trace:
    proof_classes_required:
    proof_classes_certified:
    residual_paths_registered:

  effort:
    shell_artifacts_added:
    existing_pipeline_artifacts_changed:
    new_agent_roles_added:
    new_runtime_infrastructure_added:
```

Success is qualitative first, quantitative second.

The shell should be retained when the trial shows that it materially improves traceability and reduces rediscovery without creating a competing orchestration layer.

---

## 9. Explicit Non-Goals

The trial must not introduce:

- autonomous slice selection;
- autonomous progression between phases;
- a new workflow engine;
- a generic agent scheduler;
- a new implementation-agent hierarchy;
- a generalized policy engine;
- a new graph database;
- a new RAG dependency;
- direct skill-to-skill conversational coordination;
- multi-slice parallel reconciliation;
- production deployment automation;
- a generalized enterprise governance platform.

These may be evaluated later only if repeated operation of the minimum shell exposes a concrete need.

---

## 10. Hard Guardrails

### G1 — Follow the map

The next slice is read from the propagation map.

The shell must not reopen pattern selection or sequencing unless the map is defective.

### G2 — One mandate, one slice

A Slice Mandate authorizes one bounded remediation slice.

Adjacent work is registered, not absorbed.

### G3 — No second pipeline

The governance shell wraps the feature and build pipelines.

It does not duplicate their artifact chain, checkpoints, or implementation routing.

### G4 — Authorities decide and certify; factories design and build

No authority invokes craftsmen directly.

No factory marks its own result as propagated.

### G5 — Evidence before maturity

`proven_exemplar`, `standardized_pattern`, and `propagated_standard` remain distinct.

A successful build cannot skip a maturity state without explicit proof and map authority.

### G6 — Proof classes remain separate

Mechanism proof cannot substitute for workflow, consumer, or suppression proof.

### G7 — Desired state and observed state remain distinct

The map must not represent planned remediation as completed implementation.

### G8 — Commands, evidence, certification, and status are separate artifacts

- Slice Mandate = authorized command;
- build outputs = evidence;
- certification = decision over evidence;
- map update = official observed status.

### G9 — Human gates remain active during trial

No phase transition occurs automatically.

### G10 — Isolated trial first

The first execution must occur in the isolated environment.

The production governance path changes only after trial review.

---

## 11. Minimum Artifact Set

The trial may add only the following new artifact types:

```text
1. SLICE-MANDATE-<ID>.yaml or .md
2. PROPAGATION-CERTIFICATION-<ID>.yaml or .md
3. GOVERNANCE-SHELL-TRIAL-ASSESSMENT-<ID>.md
4. Map/register update using the existing schema
```

No additional document family should be created unless the trial demonstrates a missing responsibility that cannot be expressed in these artifacts.

---

## 12. Required Pipeline Augmentation

The existing feature pipeline needs one entry gate:

```text
No mapped propagation slice enters design without an authorized Slice Mandate.
```

The existing build pipeline needs one exit handoff:

```text
Build completion emits evidence for Propagation Certification.
Build completion does not update propagation maturity.
```

No other internal pipeline redesign is required for the trial.

---

## 13. Failure and Rescope Rules

### 13.1 Map defect discovered before design

Action:

- stop mandate issuance;
- record `map_incomplete` or `map_conflict`;
- return to the map authority;
- patch the map;
- reissue the mandate against a new map version.

### 13.2 Canon conflict discovered during design

Action:

- stop before build;
- record the conflict;
- return to the governing authority lane;
- amend or supersede the applicable authority artifact;
- reauthorize the mandate if its boundary remains valid.

### 13.3 Scope expansion discovered during build

Action:

- do not absorb the work;
- register the discovered node or edge;
- determine whether the current slice remains viable;
- continue only if the existing mandate can still be satisfied;
- otherwise issue `rescope_required`.

### 13.4 Evidence fails certification

Action:

- do not advance maturity;
- preserve completed implementation status separately;
- identify failed proof classes;
- return a bounded remediation request to the existing pipeline;
- recertify only the failed and invalidated proof obligations.

### 13.5 Shell overhead becomes dominant

Action:

- stop adding governance artifacts;
- complete the slice through the existing pipeline where safe;
- record which shell element caused the delay;
- simplify or reject the shell after trial assessment.

The shell exists to reduce cognitive load, not institutionalize it.

---

## 14. Adoption Decision After Trial

The trial assessment must recommend one of three outcomes.

```yaml
adoption_decision:
  - adopt_minimum_shell
  - adopt_with_reductions
  - reject_and_return_to_existing_pipeline
```

### Adopt minimum shell

Choose when:

- traceability materially improves;
- rediscovery decreases;
- scope remains contained;
- the pipeline continues moving;
- certification catches propagation gaps not represented by build success.

### Adopt with reductions

Choose when:

- the map and certification add value;
- mandate or role mechanics are too heavy;
- some fields or gates can be removed without losing authority.

### Reject and return to existing pipeline

Choose when:

- the map already provides sufficient execution guidance without a mandate;
- certification duplicates existing gates;
- shell maintenance adds more cognitive load than it removes;
- delivery delay outweighs traceability gains.

Rejection does not invalidate the propagation map. It means the additional shell is unnecessary.

---

## 15. Initial Implementation Direction

For the isolated trial:

1. freeze the current propagation map version;
2. select the already-authorized next slice from that map;
3. author one Slice Mandate;
4. pass the mandate into the existing feature pipeline;
5. run the normal pipeline without adding new agent roles;
6. perform one five-class certification;
7. update an isolated copy of the map;
8. assess the shell against cognitive load, traceability, containment, and delivery continuity;
9. decide whether to adopt, reduce, or reject the shell.

No broader governance refactor is authorized by this directive.

---

## 16. Closing Statement

The system already knows the governing patterns and the next remediation sequence.

The Minimum Governance Shell exists so agents do not have to reconstruct that knowledge for every slice.

Its purpose is not to make the architecture more elaborate.

Its purpose is to make the established architecture executable:

```text
Read the map.
Issue one bounded mandate.
Use the existing pipelines.
Certify actual propagation.
Update the map.
```

If the trial proves that this loop reduces cognitive load and improves traceability, it becomes the standard entry and exit shell for mapped canon-propagation slices.

If it does not, it must be removed rather than preserved as governance debt.

---

## Appendix A — Minimal Slice Mandate Template

```yaml
id: SLICE-MANDATE-XXX
status: proposed

map_authority:
  register_version:
  map_version:
  source_node_ids: []
  source_edge_ids: []

target:
  slice_name:
  bounded_problem:
  desired_end_state:
  current_observed_state:

canon:
  governing_pattern:
  authority_artifacts: []
  exemplar_reference:
  maturity_target:

containment:
  in_scope_nodes: []
  in_scope_edges: []
  forbidden_expansion: []
  deferred_nodes: []
  stop_conditions: []

routing:
  authority_lane:
  delivery_entrypoint: feature_pipeline
  build_entrypoint: build_pipeline

proof_obligations:
  mechanism:
    required: true
    evidence_expected: []
  producer_capability:
    required:
    evidence_expected: []
  workflow_certification:
    required:
    evidence_expected: []
  consumer_certification:
    required:
    evidence_expected: []
  suppression:
    required:
    evidence_expected: []

completion_rule:
  propagation_certification_required: true
  map_update_required: true

human_authorization:
  authorized_by:
  authorized_at:
```

---

## Appendix B — Minimal Propagation Certification Template

```yaml
id: PROPAGATION-CERTIFICATION-XXX
slice_mandate_id:
map_version_evaluated:
decision: certified | rejected | rescope_required | evidence_incomplete

proof_classes:
  mechanism:
    status: pass | fail | not_applicable
    evidence: []
    findings: []

  producer_capability:
    status: pass | fail | not_applicable
    evidence: []
    findings: []

  workflow_certification:
    status: pass | fail | not_applicable
    evidence: []
    findings: []

  consumer_certification:
    status: pass | fail | not_applicable
    evidence: []
    findings: []

  suppression:
    status: pass | fail | not_applicable
    evidence: []
    findings: []

maturity:
  prior:
  authorized_transition:
  certified_transition:

map_update:
  required: true
  completed: false
  update_reference:

certified_by:
certified_at:
```

---

## Appendix C — Industry Pattern Basis

This directive deliberately uses a minimal composition of established patterns:

- **Desired-state reconciliation:** a controller reads desired state and acts to move observed state toward it. Kubernetes documents this controller model directly.
- **Orchestrator–workers:** a coordinator delegates bounded work to specialized workers while retaining synthesis and control responsibility. Anthropic documents this as a practical agent workflow.
- **Blackboard/shared-state coordination:** specialized actors coordinate through a shared state representation rather than requiring direct pairwise communication.

These references justify the shell topology but do not require adoption of Kubernetes, a workflow engine, or any external agent framework.

### References

- Kubernetes, “Controllers”: https://kubernetes.io/docs/concepts/architecture/controller/
- Anthropic, “Building Effective AI Agents”: https://www.anthropic.com/engineering/building-effective-agents
- NASA Technical Reports Server, “Design and Analysis Tools for Concurrent Blackboard Systems”: https://ntrs.nasa.gov/citations/20040121017

---

## Appendix D — Project Provenance

This directive is derived from the emerging Canon-Propagation Agentic Loop / Authority–Map–Factory pattern and its established project elements:

- standing canon and lane authorities;
- feature and build factories;
- persistent propagation register and map;
- maturity ratchet;
- five-class proof ledger;
- human-authorized gates;
- exemplar-first propagation discipline.

The directive intentionally adopts only the minimum shell necessary to test those elements around the existing architecture.
