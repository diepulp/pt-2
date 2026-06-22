# Precis — The Canon-Propagation Agentic Loop

**Document type:** Vision precis / emerging design pattern (for review)
**Status:** Draft — captured for further review and design
**Date:** 2026-06-22
**Working name:** Canon-Propagation Loop (a.k.a. the **Authority–Map–Factory** pattern)
**Provenance:** Emerged while wiring `system-canon-propagation-authority` (root), `split-brain-authority`, the lane authorities, and the feature/build pipelines around the System Canon Propagation Map Directive.
**Related artifacts:** `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-{MAP-DIRECTIVE,REGISTER.yaml,MAP}.md`; `.claude/skills/{system-canon-propagation-authority,split-brain-authority,tia-canon-authority,financial-model-authority,feature-pipeline,build-pipeline}`

---

## 1. Why this precis exists (the gap)

We have, by accretion, built an **agentic architecture** that is no longer just "a skill that does X." A set of standing **authority skills** now coordinate ephemeral **pipeline skills** through a persistent **shared map**, gating system-wide change behind a multi-class proof ledger and a maturity ratchet.

This is a *pattern*, not a feature. It is currently encoded implicitly across six skills and a directive. The gap: **the pattern has no name, no single description, and no cross-reference to the established industry patterns it composes.** Without that, each new skill author re-derives the topology (or violates it), and we cannot reason about whether we are reinventing a known structure badly or composing known structures well.

This precis names the moving parts and maps them to prior art, so the pattern can be reviewed, validated, and either adopted deliberately or corrected.

---

## 2. The pattern in one paragraph

> **Standing authorities decide and certify but never build; ephemeral factories build but never decide; both coordinate through a persistent shared map rather than by direct conversation.** Work is admitted one *bounded slice* at a time, selected by a priority formula, commissioned to a design factory as a thin **mandate**, hardened into a build, and then *certified against a five-class proof ledger* before the map is updated and the next slice authorized. A capability is not "done" when its code ships; it advances along a **maturity ratchet** (`proven_exemplar → standardized_pattern → propagated_standard`) and may only expand horizontally once the map shows every competing path classified, suppressed, or migrated.

---

## 3. The moving parts

### 3.1 Three roles, by *authorization to act*

| Role | Skills | May | May NOT |
|---|---|---|---|
| **Brains (authorities)** | `system-canon-propagation-authority` (root/strategist), `split-brain-authority` (diagnostician), `tia-canon-authority` + `financial-model-authority` (lane specialists) | decide what's next, name the fracture, own mechanism end-states, certify | write production code, invoke craftsmen |
| **Factories (pipelines)** | `feature-pipeline` (design), `build-pipeline` (build) | author artifacts (FIB/PRD/ADR/EXEC), drive multi-phase work, invoke craftsmen | decide strategy, redefine the slice, re-own canon |
| **Bench (craftsmen)** | backend-service-builder, api-builder, rls-expert, qa-specialist, e2e-testing, frontend-design, devops-pt2, performance-engineer | execute a scoped unit of work | be invoked by a brain directly |

**Governing rule:** *a brain never invokes a craftsman; a factory never decides strategy.* Violating it reproduces the very split-brain disease the program exists to cure — one floor up, in the governance layer.

### 3.2 The shared map (the coordination medium)

`SYSTEM-CANON-PROPAGATION-REGISTER.yaml` + `MAP.md` are **not a skill** — they are a persistent, machine-readable shared state that every actor reads and the root authority writes. Nodes, edges, dispositions, proof obligations, flags, and the rollout recommendation live here. Actors coordinate by **reading and updating the map**, not by messaging each other.

### 3.3 The handoff artifacts (thin contracts between layers)

| Artifact | Emitted by | Consumed by | Role |
|---|---|---|---|
| **Slice Mandate** *(proposed)* | root authority | feature-pipeline | commission one bounded slice (nodes/edges, pattern, proof obligations, lane routing, containment) — *not a FIB* |
| **Canon Context Block** *(proposed)* | root authority (as preflight) | lead-architect (EXEC drafting) | scope the EXEC before design, so it is born conformant |
| **§19 PRD block** | feature-pipeline (consulting root) | the PRD gate | declare map impact at PRD time |
| **Proof outputs** | build-pipeline | root authority | evidence to certify the five proof classes |

### 3.4 The loop

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                          THE MAP (shared state)                         │
   └────────────────────────────────────────────────────────────────────────┘
        ▲ read                                                       ▼ update
   SELECT ──► COMMISSION ──► DESIGN ──► EXEC-SCAFFOLD ──► BUILD ──► CERTIFY ──► EXPAND
  (root +     (Slice         (feature-  (lead-architect   (build-   (root: 5-    (root:
   split-      Mandate)       pipeline)   + Canon          pipeline) class proof  maturity
   brain,                                 Preflight)                 ledger)      ratchet +
   §7 formula)                                                                    next slice)
        │            │            │             │             │          │           │
        └─ human gate┴─ human gate┴─ human gate ┴─ human gate ┴─ gate ───┴─ gate ────┘
```

Each arrow is a **human-authorized gate**, not an autonomous chain. The skills produce the decision artifact *at* the gate; a human authorizes passage *through* it.

### 3.5 The two ratchets that make it a *propagation* loop (not just a build loop)

1. **Maturity ratchet:** `proven_exemplar → standardized_pattern → propagated_standard`. Code shipping only earns the first two. Propagation is a separate, later state.
2. **Proof ledger (five classes, never collapsed):** mechanism · producer-capability · workflow-certification · consumer-certification · suppression. A slice's I1–I4 proof discharges *mechanism*; propagation adds the last three. Horizontal expansion is gated on all five plus the §13 seven-point gate.

---

## 4. Cross-reference to established industry patterns

The loop is a **composite** of known patterns. Each part has good prior art; the *integration* is what is novel.

| Our element | Closest industry pattern | Fit | Where we diverge |
|---|---|---|---|
| Root authority commissions specialist sub-authorities & factories | **Hierarchical Orchestrator–Workers** (Anthropic, *Building Effective Agents*); **Supervisor / hierarchical teams** (LangGraph) | Strong | Our orchestrator is *standing & stateful* across many runs, not spun up per task |
| The register/map as shared state all actors read/write | **Blackboard architecture** (Hearsay-II); **Stigmergy** (coordination via traces in a shared environment) | Strong | Blackboard is machine-readable *and* governance-authoritative, not just a scratchpad |
| Authorities decide; pipelines execute | **Control plane / data plane** separation (networking, Kubernetes) | Strong | Control plane here is an LLM-agent set, not a deterministic scheduler |
| Lane authorities own bounded mechanism; map = relationships; DTOs = contracts | **DDD**: bounded context, **context map**, anti-corruption layer, published language (Evans) | Strong | The "context map" is executable governance, not documentation |
| Suppression-not-deprecation; migrate legacy paths incrementally | **Strangler Fig** (Fowler) | Strong | Applied at the *semantic/data-authority* layer, not just routing/HTTP |
| Five proof classes + expansion gate + §19 as automated guardrails | **Fitness functions / Evolutionary Architecture** (Ford/Parsons/Kua); **policy-as-code** (OPA) | Strong | Proof classes are partly human-certified, not fully automated yet |
| `propagated_standard` as the goal state; exemplar = reference impl | **Paved Road / Golden Path** (platform engineering) | Good | The "road" is a semantic canon, not a tech stack |
| Certify-then-expand; reject-and-rescope | **Evaluator–Optimizer** workflow (Anthropic) | Good | Evaluator is a governance authority with a persistent ledger |
| Gated, orchestrated phases (vs. event choreography) | **Saga / Process Manager** (orchestration style) | Good | Orchestration is human-gated between phases |
| Select-next-slice → mandate → execute | **Plan-and-Execute**; **BDI** (belief/desire/intention) agents | Partial | "Plan" is a standing map + priority formula, not a per-run plan |
| Maturity states gating capability rollout | **Capability Maturity Model**; **ratchet** pattern | Partial | Maturity is per-*pattern*, tracked in a live register |
| 6-agent parallel diagnosis run | **Parallelization — sectioning** (Anthropic) | Strong (already used) | — |

---

## 5. The novel composite (what is actually emerging)

No off-the-shelf agentic framework packages this combination:

> A **hierarchical blackboard orchestrator** whose control plane is a set of *standing, stateful authority agents*, that admits change as **strangler-fig slices**, gates horizontal propagation behind **evolutionary-fitness proof classes** and a **maturity ratchet**, and coordinates ephemeral build factories **stigmergically through a persistent governance map** rather than by direct agent-to-agent messaging.

In short: **DDD context-mapping + blackboard orchestration + fitness-function governance + strangler-fig rollout, expressed as an agent topology.** That integrated whole is the candidate pattern worth naming and hardening — provisionally the **Canon-Propagation Loop / Authority–Map–Factory (AMF)** pattern.

---

## 6. Invariants (what must hold for the pattern to be sound)

1. **Commission ≠ build.** Brains emit mandates; factories emit artifacts; the bench emits code. No layer reaches two layers down.
2. **One source of truth per fact.** The map is authoritative over prose; each pattern's canon has exactly one owning authority. Re-owning canon in a consumer is a governance split-brain.
3. **Maturity is not completion.** Shipping ≠ propagated. The ratchet and the five proof classes are distinct from the build's green checks.
4. **Coordinate through the map, not by chatter.** Actors read/write the register; they do not pass hidden state.
5. **Gates are human-authorized.** No autonomous phase-chaining; no autonomous parallel spawn beyond bounded analysis runs.
6. **Bounded slice before motion.** A slice begins only when its direct producers/consumers/upstream-temporal-providers/downstream-surfaces/competing-paths are mapped (§12).

---

## 7. Open design questions (for the review this precis feeds)

1. **Handoff weight:** thin Slice Mandate (commission only) vs. mandate + pre-filled FIB stub. Tension: speed vs. single-ownership of the FIB form.
2. **Mandate as artifact vs. ephemeral:** committed/versioned governance doc, or in-context handoff discarded once the FIB exists?
3. **Does the FIB already subsume the mandate?** If FIB-H/FIB-S already carries scope+containment, the root authority may contribute a *canon block into the existing FIB* rather than emit a new artifact layer.
4. **Lane co-signature:** must the relevant lane authority co-sign a mandate before it reaches the factory, or is the lane only consulted later at PRD/EXEC gates?
5. **Automation boundary of the proof ledger:** which of the five classes can become true fitness functions (CI-enforced) vs. remain human-certified?
6. **Autonomy:** are the gates permanently human-in-the-loop, or do low-severity slices earn a reduced-gate fast path once the pattern is proven?
7. **Generality:** is this PT-2-specific, or a reusable agentic pattern worth extracting to a standalone skill/framework once ≥3 programs have run through it? (Guard against AP-8 framework-prematurity.)

---

## 8. Recommended next steps

1. Review and either ratify or correct the role separation and invariants (§3, §6).
2. Resolve the handoff-weight + mandate-as-artifact questions (§7.1–7.3) — they unblock template authoring.
3. If ratified, formalize two templates in the root-authority skill (**Slice Mandate**, **Canon Context Block**) and one operating-model doc that feature-pipeline and lead-architect cite.
4. Re-run this precis against a *second* program (post-loyalty) to test whether the pattern generalizes before any move toward a generic runtime (respect AP-8).
