# Minimum Governance Shell — Scaffold

**Implements:** `GOV-CANON-SHELL-001` (Proposed — isolated-environment trial)
**Pattern:** Canon-Propagation Loop / Authority–Map–Factory (see `../PRECIS-canon-propagation-agentic-loop.md`)
**Status:** Scaffold — not yet executed. First trial slice pre-loaded in `trial/`.

> Read the map. Issue one bounded mandate. Use the existing pipelines. Certify
> actual propagation. Update the map.

This directory is the **thin shell** that wraps the existing `feature-pipeline`
and `build-pipeline`. It adds **no second factory**. It governs only *entry into*
and *exit from* those pipelines (directive §3, §12, G3).

---

## 1. What this scaffold is (and is not)

| It IS | It IS NOT |
|---|---|
| 4 governance components (§5) expressed as 3 artifact types + 1 map update (§11) | A second feature pipeline or build pipeline |
| A read → commission → certify → record loop, **human-gated at every arrow** | An autonomous planner or scheduler (§9) |
| A way to carry the already-decided map decision into the pipelines without re-deriving governance history | A re-prioritization or pattern-selection engine (G1) |

The four shell responsibilities (directive §1):

1. **Preflight** — read the propagation register/map, confirm the next slice.
2. **Slice Mandate** — issue one bounded commissioning contract.
3. **Propagation Certification** — five independent proof classes over build evidence.
4. **Map Update** — the only thing that changes official propagation state (G8).

---

## 2. Foundational concepts (verified via research)

The shell is a **minimal composition** of three established patterns. It borrows
the *topology*, not the runtimes (directive Appendix C).

| Shell element | Industry pattern | Core mechanism we reuse | Where we deliberately diverge |
|---|---|---|---|
| **The loop** (desired vs observed state; act to converge) | **Kubernetes controller / reconciliation loop** — a controller continuously reconciles `spec` (desired) against observed state, acting idempotently until they converge; `status` records progress. | The map is `spec` + `status` in one: *desired disposition* vs *observed disposition* per node/edge. A slice is one reconcile step. **Map update = `status` write.** | The "controller" is a human-gated authority agent, **not** an automatic deterministic loop. No auto-requeue (G9). |
| **Mandate → pipelines → evidence** (coordinator delegates bounded work, retains synthesis/certification) | **Orchestrator–workers** (Anthropic, *Building Effective Agents*) | Root authority decomposes the map into **one bounded subtask** (the Slice Mandate), delegates to the factories, and retains synthesis = **certification**. Workers never decide scope. | The orchestrator is **standing & stateful** across runs; subtasks are admitted **one at a time** behind a human gate, not fanned out. |
| **The map as shared state** (specialists coordinate through shared state, not direct messages) | **Blackboard architecture** (Hearsay-II) | `SYSTEM-CANON-PROPAGATION-REGISTER.yaml` + `MAP.md` are the blackboard. Authorities and factories **read/write the map**; they do not message each other (précis §6.4). | The blackboard is **governance-authoritative**, append-disciplined, and human-curated — not a scratchpad. |

**Invariant the composition must preserve:** idempotence + convergence (controller),
bounded subtask + retained synthesis (orchestrator), monotonic shared-state updates
(blackboard). Concretely: a mandate is one bounded slice; certification is separate
from build success; only the map update advances maturity.

Sources: Kubernetes "Controllers"; Anthropic "Building Effective AI Agents";
Hearsay-II / blackboard systems (IJCAI, Warwick CS-RR-110). Full citations in the
directive Appendix C and the research log.

---

## 3. Operating model (the wrapped loop)

```text
        ┌──────────────── THE MAP (blackboard: REGISTER.yaml + MAP.md) ────────────────┐
        │   desired disposition  ⟷  observed disposition   (controller spec ⟷ status)  │
        └───────────────▲───────────────────────────────────────────────▼─────────────┘
          read next slice │                                               │ map update (§5.4, G8)
                          │                                               │
                   ① PREFLIGHT ──▶ ② SLICE MANDATE ──▶ [feature-pipeline] ──▶ [build-pipeline] ──▶ ③ CERTIFICATION
                  (map read)      (one bounded slice,   (existing §0–5,        (existing,           (5 proof classes,
                                   human-authorized)     unchanged)            unchanged)            independent)
                          │              │                    │                     │                    │
                          └── G1 gate ───┴──── G9 human gate ─┴──── G9 human gate ──┴──── G9 human gate ─┘
```

**Entry gate (the only feature-pipeline change, §12):** no mapped propagation slice
enters `/feature-start` without an authorized Slice Mandate.

**Exit handoff (the only build-pipeline change, §12):** build completion emits
evidence for certification; build completion **does not** advance propagation maturity.

See `pipeline-augmentation.md` for the exact two hooks.

---

## 4. Directory layout

```text
governance-shell/
├── README.md                                  ← this file (operating model + concept map)
├── pipeline-augmentation.md                   ← §12: the one entry gate + one exit handoff
├── templates/
│   ├── SLICE-MANDATE-TEMPLATE.yaml            ← §5.2 / Appendix A
│   ├── PROPAGATION-CERTIFICATION-TEMPLATE.yaml← §5.3 / Appendix B
│   └── GOVERNANCE-SHELL-TRIAL-ASSESSMENT-TEMPLATE.md ← §7.3 / §8 / §14
└── trial/
    └── SLICE-MANDATE-001-loyalty-liability.yaml ← pre-filled from the register's
                                                    rollout_recommendation.next_slice
```

The fourth artifact type (§11.4) is **not a new file** — it is an in-place update to
the existing `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-REGISTER.yaml`
using its existing schema (G3: no new document family).

---

## 5. How to run the trial (directive §7.2 / §15)

```text
T1  Freeze the map version.                 → record register/map version in the mandate
T2  Generate the Slice Mandate.             → trial/SLICE-MANDATE-001-loyalty-liability.yaml (DONE: scaffolded)
T3  Human reviews mandate against the map.  → set human_authorization.* (BLOCKING — G9)
T4  Submit to feature-pipeline.             → /feature-start loyalty-liability-valuation
T5  Run the normal design chain.            → Phase 0–5, unchanged
T6  Run build-pipeline (isolated env).      → /build PRD-###
T7  Collect proof outputs.                  → build evidence (DoD gates, integration logs)
T8  Five-class propagation certification.   → PROPAGATION-CERTIFICATION-001.yaml
T9  Update the (isolated copy of the) map.  → REGISTER.yaml node/edge dispositions + maturity
T10 Assess the shell itself.                → GOVERNANCE-SHELL-TRIAL-ASSESSMENT-001.md
```

**Hard guardrails active throughout:** G1 follow the map · G2 one mandate/one slice ·
G3 no second pipeline · G4 authorities decide/certify, factories design/build ·
G5 evidence before maturity · G6 proof classes stay separate · G7 desired ≠ observed ·
G8 commands ≠ evidence ≠ certification ≠ status · G9 human gates active · G10 isolated first.

---

## 6. The first slice (pre-loaded)

`rollout_recommendation.next_slice` in the register = **`loyalty_liability_slice`**
(fractures L-01 / L-02 — live S4 trust impact in the shift-report PDF; a reported
money figure that re-prices on rate edits). The scaffolded mandate
`trial/SLICE-MANDATE-001-loyalty-liability.yaml` is filled from that register entry
and carries one **preflight defect note** (a crosswalk inconsistency around L-05)
to demonstrate the §5.1 `map_conflict` path working as designed — resolve or accept
it before authorizing.
