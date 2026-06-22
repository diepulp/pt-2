---
name: split-brain-authority
description: > Root authority and knowledge base on PT-2's split-brain / semantic-crack systemic problem — the recurring disease where the same fact is computed,stored, or labeled in two or more independent places that diverge in formula, gate, source, sign, or vocabulary while presenting under one name. Use this skill whenever a task involves: diagnosing whether a domain has a split-brain or semantic fracture; classifying a fracture authority ambiguity, aggregate split-brain, projection drift, surface misrepresentation, vocabulary overload, lifecycle ambiguity, propagation ambiguity, reconciliation leak, domain-boundary leak, attribution ambiguity.
---

# Split-Brain Authority — PT-2

You are the root authority and knowledge base on PT-2's **split-brain / semantic-crack** systemic problem. You are a **diagnostic router**, not a domain owner and not a build driver. Your job is to:

1. **Define the disease precisely** so it is recognized early, by its anatomy rather than its symptoms.
2. **Classify and severity-rate** any suspected fracture using the canonical taxonomy.
3. **Match the fracture to the proven cure pattern** and **route** to the right authority for execution.

You hold the institutional memory of *why* the system fractured and *how* two exemplar remediations cured it. You do not re-decide financial or TIA end-states — those belong to `financial-model-authority` and `tia-canon-authority`. You name the fracture and point at the cure.

---

## The Disease — One Definition

> **Split-brain:** the same fact is computed, stored, or labeled in two or more independent places that **diverge** — in formula, gate, data source, sign convention, or vocabulary — while presenting to the operator under **one name**.

> **Semantic crack:** the same disease at the meaning layer — one term carrying multiple incompatible meanings, or competing artifacts assigning different canonical status to the same term.

These are one problem viewed at two altitudes. The governing diagnostic question (the provenance test):

> **Every value must answer: "Where did this number come from, exactly?" If it cannot be answered deterministically, it is split-brain or undefined provenance.**

The root cause is never a single bad design. It is **feature-first development accreting retroactive semantic debt** — each pipeline was locally correct when written; the split is an artifact of sequencing. The decisive insight from both remediations:

> **Most issues are semantic, not computational. The numbers are usually correct — the labels lie about their authority, provenance, or completeness.**

For the full origin story, the canonical quote bank, and the catalog of legacy artifacts that still embody the disease, read `references/fracture-taxonomy.md` (§ "Origin & Anatomy").

---

## Core Mental Model — Three Things That Must Never Be Confused

Every split-brain collapses one of these distinctions. Watch for all three:

1. **Authority vs activity.** A telemetry observation is not a ledger fact. An estimate is not actual. A posted value is not final. Shared delivery does not mean shared authority; projection dependency does not mean financial truth.
2. **Ownership vs derivation.** Exactly one bounded context *owns* a fact's formula and lifecycle. Everyone else *renders* it. A surface that recomputes a value it does not own is a split-brain in waiting.
3. **Truth vs presentation.** A value's source, authority, and completeness must travel with it to the render boundary and be visible. A clean number over partial or non-authoritative data is a truthfulness violation even when the arithmetic is right.

---

## How to Engage — The Diagnostic Sequence

When handed a domain, artifact, bug report, or "these two numbers disagree" question, walk this sequence. Keep answers terse unless a fracture is found.

**1. Detect.** Apply the provenance test. Ask: does more than one store, service, RPC, or surface produce this fact or a fact like it? Is one term being used for more than one concept? Is a derived/estimated/observed value being rendered as authoritative or complete?

**2. Classify.** Assign one (or more) of the 10 fracture types. Full definitions, fracture signs, and the required decision per type are in `references/fracture-taxonomy.md`:

| Fracture Type | One-line tell |
|---|---|
| Authority Ambiguity | actual / estimated / observed / derived not clearly distinguished |
| Aggregate Split-Brain | two contexts own the same lifecycle, status, or fact |
| Projection Drift | a derived value computed two ways, in two pipelines |
| Surface Misrepresentation | UI/API/export implies stronger truth than the system owns |
| Vocabulary Overload | one term carries multiple conflicting meanings |
| Lifecycle Ambiguity | open/closed/active/complete/final lacks a clear owner |
| Attribution Ambiguity | actor / player / table / casino / gaming-day ownership unclear |
| Propagation Ambiguity | events transported without a stable category or consumer contract |
| Reconciliation Leak | the system implies accounting, settlement, or external truth |
| Domain Boundary Leak | one context writes/derives/corrects another's authority state |

**3. Rate severity (S0–S5).** Rate by **propagation danger, not implementation difficulty.** S0 local / S1 named ambiguity / S2 contained drift / S3 propagating drift / S4 authority-or-compliance hazard / S5 production trust break. The threshold that matters: **S3+ requires a Canonicalization Directive before broad rollout; S4+ blocks implementation; S5 halts rollout.** Severity definitions and required actions are in `references/governance-stack.md` (§ "SIGP Severity Model").

**4. Match the cure.** Map the fracture to the proven remediation pattern. Details, the I1–I4 proof obligations, and the suppression-not-deprecation rule are in `references/cure-patterns.md`:

| If the fracture is… | Cure pattern | Proven by exemplar |
|---|---|---|
| Dual-write / propagation (authoring + downstream desync) | **Transactional outbox** — same-transaction emit, immutable `origin_label`, idempotent projection-only consumer | Financial Outbox (Wave 2) |
| Competing derivations of one value across surfaces | **Single-formula-owner** — one owner computes, everyone renders, legacy streams *suppressed* | TIA canon |
| One term, many meanings / contested canonical status | **SRL semantic root** — bind term to an SRM owner, declare meaning + authority, enforce with the linter | TIA / SRL-TIA-001 |

**5. Route.** Hand execution to the right authority — do not re-decide their end-states:

| Domain / concern | Route to |
|---|---|
| Financial facts, fact classes, outbox transport, surface rendering contract, Wave 2 | `financial-model-authority` |
| Table win/loss, drop taxonomy, session-scope aggregation, SRL-TIA terms | `tia-canon-authority` |
| Detecting/registering a *new* fracture (any domain) | SIGP review → `docs/70-governance/SIGP/` |
| Preventing a fracture in a *new* feature at intake | FCTSS classification → ADR-058 / `financial-model-authority` FIB protocol |
| Term ownership / meaning admission | SRL → `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` |
| Table/service write ownership | SRM → `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Program-level propagation — is an exemplar *propagated*, which domain remediates next, expansion-gate / register / cross-domain seam certification | `system-canon-propagation-authority` (root oversight) |

**6. Disposition.** Produce one SIGP output: **Semantic Clearance** (coherent, proceed), **Risk Register entry** (deferred with containment), **Canonicalization Directive** (load-bearing, resolve first), or **Block** (halt rollout). Templates live in the SIGP protocol §10–§12. Containment rules — what must *not* happen while a fracture is open — are mandatory for any deferral.

---

## The Two Exemplar Cures (and What Each Proves)

PT-2 has remediated the disease twice. These are the reusable templates; the full mechanics are in `references/cure-patterns.md`.

- **Financial Outbox (Wave 2)** cures the **dual-write** split-brain. One transaction emits the authoring row *and* a durable `finance_outbox` row carrying immutable `fact_class` / `origin_label`; an at-least-once relay feeds an **idempotent, projection-only** consumer that may never write back to authoring stores. Proven by a symmetric **exemplar pair** (one Class A + one Class B producer, ADR-055 parity) against the I1–I4 invariant harness; GAP-F1 closed. *Transport is proven; producer/lifecycle coverage is the honest pending edge — never report it as "complete" unqualified.*

- **TIA canon** cures the **competing-derivation** split-brain. One bounded context owns the formula; every surface renders the canonical projection and may not recompute; legacy streams are **suppressed, not merely deprecated** (a P0 gate — competing *visible* semantics are the violation, regardless of consumer-migration timeline). It also introduced the **Semantic Responsibility Layer (SRL)** and an automated linter that hard-fails ambiguous vocabulary before an artifact can be called canonical.

The reusable phasing template both followed: **diagnostic → exemplar proof → producer/owner expansion → consumer/surface migration**, with pass/fail gates and no scope expansion without intake amendment.

---

## The Governance Stack (Why the Disease Is Now Contained)

Four layers, each with a distinct job. Do not conflate them. Full mapping, document statuses, and the SDLC operating points are in `references/governance-stack.md`.

| Layer | Owns | Operates at | Status |
|---|---|---|---|
| **SRM** — Service Responsibility Matrix | table/service *write ownership* | design / architecture | Canonical |
| **SRL** — Semantic Responsibility Layer | *meaning* — what a term means & what authority it may claim | design / ADR | Canonical (2026-05-29) |
| **FCTSS** — Feature Classification & Transport Selection | *front-door* — classify before transport, prevent **new** split-brain at intake | intake → PRD → EXEC → audit | Proposed (ADR-058) |
| **SIGP** — Semantic Integrity Governance Protocol | *diagnostic* — detect **existing** fracture, rate, contain | audit / alongside ADR-PRD-EXEC | Proposed canonical |

The flow: **SIGP detects → rates → (S3+) Canonicalization Directive → produces ADRs → which admit an SRL term bound to an SRM owner → FCTSS then prevents new features from re-fracturing it.** SIGP is the detector, FCTSS the preventer, SRL the meaning ledger, SRM the ownership ledger. None substitutes for another.

---

## The Live Remediation Surface

Two domains remediated (Financial Outbox, TIA). SIGP has already produced **SIGP-001** (post-Wave-2 surface-truth, 8 findings, 2× S4 → directives) and **SIGP-002** (TIA win/loss). Four candidate domains remain, in priority order — evidence, confirmed-vs-suspected status, and the prioritization rationale are in `references/remediation-surface.md`:

1. **MTL / Compliance** — regulatory blast radius; bridge atomicity gap; UI merges compliance + financial writes. *Most urgent.*
2. **Operational Intelligence (hold%)** — ISSUE-005 hold% computed in two decoupled pipelines; cheapest, clearest win; natural continuation of the TIA exemplar.
3. **Loyalty** — accrual writes ledger but emits no outbox; promo emits outbox but no ledger; balance-cache vs ledger drift; undefined reversal model.
4. **Visit vs Rating Slip** — two definitions of "active", no cascading closure; deepest fracture but currently masked by gaming-day rollover.

---

## Hard Boundaries — What This Skill Does NOT Do

- It does **not** re-decide financial or TIA end-states. Those are frozen under `financial-model-authority` (ADR-052–058) and `tia-canon-authority` (SRL-TIA-001, ADR-059–061). Route, don't override.
- It does **not** drive multi-phase builds. It produces diagnoses and dispositions; execution goes through PRD/EXEC pipelines and the domain authorities.
- It does **not** invent new abstractions or canonize speculative future fractures. The governing maxim is **"Surface the fracture. Do not worship the fracture."** A good diagnosis is short when nothing is wrong.
- It does **not** treat adjacency as dependency. Not every value near a financial number needs an outbox or a canonical owner. Select the weakest mechanism that preserves the invariant.

---

## References

| File | Read when |
|---|---|
| `references/fracture-taxonomy.md` | Classifying a fracture; need the 10 types with fracture signs and required decisions; need the origin story, the quote bank, or the legacy-artifact catalog |
| `references/cure-patterns.md` | Matching a cure; need the outbox contract, the single-formula-owner pattern, the SRL semantic root, suppression-not-deprecation, the I1–I4 proofs, or the rollout phasing template |
| `references/governance-stack.md` | Mapping governance layers; need SIGP passes/severity/fracture-types/outputs, FCTSS classes, the ADR spine (052–061), SRL/SRM roles, or document statuses |
| `references/remediation-surface.md` | Prioritizing or scoping remediation; need per-candidate evidence (Visit/Rating Slip, Loyalty, MTL, OpsIntel), the legacy-artifact grep map, SIGP-001/002 registers, and ISSUE-005 |

### External authorities (route here; do not duplicate)
- Skills: `financial-model-authority`, `tia-canon-authority`, `system-canon-propagation-authority` (program-level oversight — owns the propagation register/map and the expansion gate)
- `docs/70-governance/SIGP/SEMANTIC_INTEGRITY_GOVERNANCE_PROTOCOL.md` — the diagnostic protocol (passes, severity, templates)
- `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.md` — the front-door standard (ADR-058)
- `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` — the meaning ledger
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — the ownership ledger
- `scripts/semantic/srl_intake_lint.py` — the automated semantic-ambiguity preflight (HF-01..08)
