# Register & Artifacts Reference

Field schemas, the maturity model, the §19 PRD citation block, and precise pointers into the canonical artifacts. The register (`SYSTEM-CANON-PROPAGATION-REGISTER.yaml`) is authoritative; this file tells you how to read and extend it.

## Table of contents
1. Artifact map — what to read for what
2. Maturity-state definitions (the completion rule)
3. Node registry schema
4. Edge registry schema
5. Proof-obligation schema (the five classes)
6. Domain status values
7. The §19 PRD citation block (the gate every qualifying PRD must pass)
8. How to update the register

---

## 1. Artifact map — what to read for what

All under `docs/issues/loyalty-split-brain/`.

- **DIRECTIVE** (`SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md`) — the constitution. Sections you cite most: §3 maturity model, §6 required inventories, §7 rollout selection, §13 expansion gate, §14 proof obligations, §15 forbidden patterns, §19 governance rule.
- **REGISTER** (`SYSTEM-CANON-PROPAGATION-REGISTER.yaml`) — current state. Top-level keys: `meta`, `canonical_patterns`, `domains`, `nodes`, `edges`, `fracture_crosswalk`, `rating_slip_escalation`, `proof_obligations`, `flags`, `execution_sequence`, `rollout_recommendation`.
- **MAP** (`SYSTEM-CANON-PROPAGATION-MAP.md`) — narrative overview + the seam certification table + expansion-gate standing table.
- **LANE reports** (`propagation-map/LANE-{TIA,FINANCIAL,SPLITBRAIN}.md`) — the `file:line` evidence behind each node. When a ruling needs proof, cite the lane report, not memory.
- **DIAGNOSIS** (`SPLIT-BRAIN-DIAGNOSIS-loyalty.md`) — the L-01..L-15 fracture register; the `fracture_crosswalk` in the register maps each L-ID to node IDs.

---

## 2. Maturity-state definitions (the completion rule)

```
proven_exemplar      = one bounded path works end to end
standardized_pattern = rules, contracts, gates, proof obligations frozen
propagated_standard  = all mapped producers + consumers conform / migrate / suppress / delete
```

Completion rule (directive §3.1) — an exemplar is **complete** only with all of:
```
vertical proof passed
+ producer map created
+ consumer map created
+ seam inventory created
+ suppression plan created
+ expansion register created
+ next bounded slice authorized
```
Anything short of this is a *successful implementation slice*, not a completed standardization program. This is the single most common thing you will be asked to adjudicate; default to the completion rule, not the claim.

---

## 3. Node registry schema

Every meaningful producer, consumer, or seam is one node. Required fields:

| Field | Meaning |
|---|---|
| `id` | stable snake_case identifier (referenced by edges + crosswalk) |
| `domain` | bounded context it belongs to |
| `node_type` | `producer` \| `consumer` \| `seam` / `workflow_seam` \| `authority` / `canonical_authority` \| `aggregate` \| `projection` |
| `current_source` | what actually produces/feeds the value today (RPC, view, cache, file:path) |
| `canonical_source` | what *should* own/feed it under the canon |
| `status` | classification (see below) |
| `disposition` | `keep` \| `migrate` \| `suppress` \| `delete` \| `remediate_dependency` \| `certify_workflow` \| `build` \| `keep_excluded` |
| `severity` | S0..S5 — propagation danger, not implementation cost |
| `owner` | the domain/team accountable |
| `target_slice` | the bounded slice that will resolve it (or `none`/`certified`/`deferred:<id>`) |
| `l_refs` *(optional)* | linked loyalty fracture IDs (L-01..L-15) |

**Producer status values** (directive §6.2): `canonical`, `canonical_but_uncertified_workflow`, `legacy_authoring`, `dual_write`, `outbox_only`, `ledger_only`, `dead_candidate`, `blocked_by_anchor_resolution`.

**Consumer status values** (directive §6.3): `canonical_consumer`, `legacy_projection_consumer`, `direct_authoring_store_reader`, `client_recompute`, `cache_reader`, `surface_misrepresentation`, `dead_candidate`, `migration_target`.

**Seam status values** (observed): `certified`, `certified_with_leak`, `boundary_violation`, `boundary_labeling`, `uncertified`, `failing`, `deferred_to_<lane>`, `owned_by_<lane>`.

---

## 4. Edge registry schema

Cross-domain propagation/dependency. Required fields (directive §5.4 / §6.4):

| Field | Meaning |
|---|---|
| `from`, `to` | source and destination node (or named boundary) |
| `relation` | the semantic relationship (e.g. `same_transaction_emission`, `as_of_valuation_projection`, `freezes_and_supplies_accrual_basis`) |
| `authority_carried` | which authority label travels (ledger/actual, telemetry/estimated, none, fact_class) |
| `anchor_requirements` | identity/temporal anchors that must travel (casino_id, table_id, player_id, visit_id, gaming_day, idempotency_key, event_id) |
| `transaction_boundary` | `single BEGIN..COMMIT` \| `db_trigger_same_tx` \| `outbox-driven` \| `synchronous_read` \| `NOT_ATOMIC_*` \| `none` |
| `certification_status` | `certified` \| `partial` \| `uncertified` \| `failing` \| `deviated` \| `deferred_to_<lane>` |

The ten seam questions every seam must answer are in directive §6.4; the answered set for the live seams is in `LANE-SPLITBRAIN.md`.

---

## 5. Proof-obligation schema (the five classes — never collapse to one flag)

Directive §14. Track each separately; a "done" that hides which of these is unproven is the failure the directive forbids.

| Class | The question |
|---|---|
| **mechanism proof** | does the canonical mechanism work at all? (same-txn insert, deterministic formula, as-of lookup) |
| **producer-capability proof** | can the producer RPC/service produce the correct result given valid inputs? |
| **workflow certification** | does the *real operator workflow* supply the required anchors and invoke the canonical path? |
| **consumer certification** | does the *real surface* render the canonical DTO/event projection without recomputing? |
| **suppression proof** | are competing visible paths removed, disabled, or unreachable? |

Record per slice as `PROVEN` / `PARTIAL` / `UNPROVEN` / `FAILING` / `NOT_DONE`, with the honest qualifier (e.g. `PARTIAL_DEVIATED` for the relay). The recurring pattern in PT-2: mechanism + producer-capability pass; workflow / consumer / suppression are where the truth lives.

---

## 6. Domain status values

Directive §5.2: `unmapped`, `mapping`, `mapped`, `active_remediation`, `contingent_dependency`, `exemplar_proven`, `partial_propagation`, `converged`, `suppressed`, `deferred`. (`mapped_dependency` is used for MTL — mapped, parallel-compliance, one-directional.)

---

## 7. The §19 PRD citation block (the gate every qualifying PRD must pass)

A PRD **must** cite the register and declare this block when it does any of: introduces a new financial or loyalty producer; introduces a new derived financial value; adds a new cache; adds a new report or dashboard consumer; introduces a correction path; introduces a new event type; or reads directly from a canonical authoring store.

```yaml
canon_propagation:
  affected_nodes:        # node ids this PRD creates, changes, or migrates
  affected_edges:        # edge ids this PRD certifies or breaks
  canonical_pattern:     # which standardized_pattern it advances (tia_projection / transactional_outbox / financial_value_surface / producer_anchor_resolution / append_only_correction / temporal_snapshot_rule)
  disposition:           # migrate | suppress | delete | keep | certify_workflow for each touched legacy node
  proof_obligations:     # which of the five classes this PRD discharges, and which remain
  register_update:       # the exact register edit due at PRD completion
```

**A PRD lacking this block is incomplete.** That is a hard ruling, not a suggestion — its absence is how the program silently re-fractures (AP-1). Also confirm the PRD names the **concern lane** it advances (directive §11: authority/temporal-pinning, aggregate-ownership, producer-discipline, propagation, surface-convergence).

---

## 8. How to update the register

- The register is the source of truth; the map prose is derived. Edit the YAML first, then reconcile `SYSTEM-CANON-PROPAGATION-MAP.md`.
- On an expansion slice, the register must gain: new nodes, new certified edges, the inherited proof invariants, the invariants needing re-proof, the legacy nodes removed/suppressed, and the map update due at completion (directive §13).
- Advance a `canonical_patterns` entry from `standardized_pattern` to `propagated_standard` **only** when every mapped producer and consumer node for that pattern is `keep`/`certified`/`deleted`/`suppressed` — i.e. no open `migrate`/`failing`/`uncertified` node remains. Until then it is `partial`.
- Keep `execution_sequence` and `rollout_recommendation` current — they are how the next session knows where the program stands.
