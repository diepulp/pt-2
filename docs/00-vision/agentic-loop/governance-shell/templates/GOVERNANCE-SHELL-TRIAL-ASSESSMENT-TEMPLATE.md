# GOVERNANCE SHELL TRIAL ASSESSMENT — <ID>

**Implements:** GOV-CANON-SHELL-001 §7.3 (evaluation criteria), §8 (metrics), §14 (decision)
**Slice mandate:** SLICE-MANDATE-XXX
**Certification:** PROPAGATION-CERTIFICATION-XXX
**Assessed by / at:**

> The shell exists to reduce cognitive load, not institutionalize it (§13.5).
> Success is qualitative first, quantitative second (§8).

---

## 1. Evaluation criteria (§7.3)

Rate each PASS / PARTIAL / FAIL with one line of evidence.

### Cognitive-load reduction
- [ ] Pipeline agents received bounded canon context without reconstructing history
- [ ] Fewer broad discovery passes were required
- [ ] Fewer repeated questions on pattern / next-slice / authority selection
- [ ] Design artifacts cited the same map · mandate · exemplar · canon chain consistently

### Traceability
- [ ] Every major implementation obligation traces to a mandate field
- [ ] Every mandate field traces to a map node / edge / disposition / proof obligation
- [ ] Every certification result points to concrete evidence
- [ ] Every official status change appears in the map update

### Scope containment
- [ ] No deferred map node entered the slice
- [ ] feature-pipeline elaborated but did not expand the mandate
- [ ] build-pipeline executed but did not reinterpret strategy
- [ ] Discovered adjacent work was registered, not absorbed

### Delivery continuity
- [ ] The shell did not replace or fork the existing pipelines
- [ ] The remediation actually reached implementation
- [ ] Shell artifacts stayed materially smaller than the design artifacts they govern
- [ ] Governance work did not dominate implementation work

### Decision quality
- [ ] Build success was distinguishable from propagation success
- [ ] Uncured legacy paths remained visible
- [ ] Maturity was not advanced prematurely
- [ ] Next slice is determinable from the updated map without a fresh investigation

---

## 2. Trial metrics (§8 — small evidence table, not a telemetry platform)

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
    new_agent_roles_added:          # MUST be 0 (§9 non-goal)
    new_runtime_infrastructure_added:  # MUST be 0 (§9 non-goal)
```

---

## 3. Adoption decision (§14)

```yaml
adoption_decision:   # adopt_minimum_shell | adopt_with_reductions | reject_and_return_to_existing_pipeline
rationale:
```

- **adopt_minimum_shell** — traceability improved, rediscovery dropped, scope stayed
  contained, pipeline kept moving, certification caught gaps build success missed.
- **adopt_with_reductions** — map + certification add value but mandate/role mechanics
  are too heavy; name the fields/gates to remove.
- **reject_and_return_to_existing_pipeline** — the map alone is enough, or certification
  duplicates existing gates, or shell maintenance costs more load than it saves.
  (Rejection does NOT invalidate the map — only the extra shell.)

If shell overhead became dominant during the run, record which element caused the
delay (§13.5) so the reduction is targeted.
