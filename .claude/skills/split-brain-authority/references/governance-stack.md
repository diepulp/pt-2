# Governance Stack — The Four Load-Bearing Mechanisms

This reference owns the **governance layers that now contain the split-brain disease**, how they interlock, where each operates in the SDLC, and the SIGP diagnostic machinery (passes, severity, fracture types, outputs). Keep each layer's role distinct — conflating them is itself a governance failure.

## Table of Contents
1. The Four-Layer Stack
2. The Interlock (how a fracture flows through the stack)
3. SIGP — The Diagnostic Protocol
4. FCTSS — The Front-Door Standard
5. The ADR Spine (052–061)
6. Document Status Ledger
7. Standing Semantic Risk Register

---

## 1. The Four-Layer Stack

| Layer | Document | Owns | SDLC operating point | Status |
|---|---|---|---|---|
| **SRM** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | table/service **write ownership** — "what may this service own and write" | design / architecture | Canonical (v4.27.0) |
| **SRL** | `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` | **meaning** — "what does this service mean, what authority may it claim" | design / ADR | Canonical (v1.0.0, 2026-05-29) |
| **FCTSS** | `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.md` | **front-door classification** — classify before transport; prevent **new** split-brain at intake | intake → PRD → EXEC → audit | Proposed (adopted by ADR-058, Proposed) |
| **SIGP** | `docs/70-governance/SIGP/SEMANTIC_INTEGRITY_GOVERNANCE_PROTOCOL.md` | **diagnostic** — detect **existing** fracture, rate, contain | audit / before-or-alongside ADR-PRD-EXEC | Proposed canonical |

**Notable asymmetry to remember:** the detection and meaning/ownership layers (SIGP findings, SRL, SRM) have reached canonical/active status, but the *front-door prevention* layer (FCTSS + ADR-058) is still **Proposed**. The gate that detects existing split-brain is live; the gate that prevents new split-brain at intake is not yet ratified.

---

## 2. The Interlock

Each layer has one job; none substitutes for another (SIGP explicitly is "not a replacement for ADRs, PRDs, EXEC specs… or feature intake briefs"; FCTSS classification "does not replace FIB-H or FIB-S").

```
SIGP detects a fracture
   → severity-rates it (S0–S5)
   → if S3+, issues a Canonicalization Directive
        → which produces ADRs (e.g. ADR-059/060/061)
             → which admit a canonical SRL term
                  → bound to an SRM owner
   → FCTSS then prevents future features from re-fracturing it at intake
```

- **SIGP = detector** (reactive + trigger-gated)
- **FCTSS = preventer** (proactive, at the front door)
- **SRL = meaning ledger** (the canonical term registry)
- **SRM = ownership ledger** (the write-authority registry)

The two exemplar cures plug into this: TIA's SIGP-002 review → Canonicalization Directive → ADR-059/060/061 → SRL-TIA-001 (the first/anchoring SRL entry) bound to `TableContextService`. The financial cure's transport rule (outbox required for Projection Inputs) is gated *upstream* by FCTSS classification — "outbox is required for Projection Input features, not for every feature."

---

## 3. SIGP — The Diagnostic Protocol

**When required (mandatory triggers, §4.1):** cross-context propagation; outbox emission; projection consumers / replayable read models; financial/compliance/loyalty/visit/session aggregates; user-visible totals/statuses/summaries/lifecycle labels; multiple surfaces consuming the same source facts; a new domain term affecting authority/lifecycle/attribution/accountability; a migration that changes meaning not shape; a bounded-context boundary crossing; any feature where two stores appear to own the same fact.

**Not required for:** isolated visual changes, copy-only changes, single-context CRUD, test refactors, lint/type cleanup, localized UI state.

**The seven diagnostic passes (§7)** — consider every one, keep answers terse unless a fracture is found:
1. **Authority Audit** — what is authoritative vs observed vs estimated vs derived vs external; can authority degrade/upgrade; are corrections mutations or new facts.
2. **Aggregate Ownership Audit** — which aggregate owns lifecycle/status/attribution; is another context reconstructing it; can one close while another stays open.
3. **Propagation Integrity Audit** — what is propagated vs intentionally not; event category; idempotency identity; consumer limits; replay determinism.
4. **Surface Truthfulness Audit** — what will the user infer; is completeness/authority/source visible; can stale appear current; does clean formatting hide uncertainty.
5. **Vocabulary Integrity Audit** — overloaded terms; same term different meanings across code/UI/docs; architecture terms leaking into operator language.
6. **Projection Dependency Audit** — required inputs; which authoritative vs dependency; can completeness be computed; deterministic/replayable; late-arrival behavior.
7. **Operational Reality Audit** — does the model reflect how operators work; are they mentally bridging missing state; does it force workflow distortion.

**Severity model (§6) — rate by propagation danger, not implementation difficulty:**

| Severity | Meaning | Action |
|---|---|---|
| **S0** | no material semantic risk; local change | proceed |
| **S1** | named ambiguity; no surface/propagation depends on it | record if useful; no block |
| **S2** | contained drift; isolated to one surface/service/non-authoritative path | Risk Register entry; proceed with containment |
| **S3** | propagating drift; affects >1 surface/projection/service/context | **Canonicalization Directive before broad rollout**; narrow contained exemplar may proceed |
| **S4** | authority or compliance hazard; may misrepresent authority/completeness/finality | **block implementation** until canonicalized or scoped out |
| **S5** | production trust break; can expose misleading truth to users/auditors/managers | **halt rollout**; corrective ADR/PRD/EXEC sequence |

**The three outputs (§5):** Semantic Clearance (coherent, proceed) / Semantic Risk Register Entry (deferred with containment) / Canonicalization Directive (load-bearing, resolve first). A fourth disposition — **Block** — halts rollout. Templates are in SIGP §10–§12. Every deferral must declare **containment** — exactly what must not happen while the fracture is open (e.g., "no new surface may use this term", "no consumer may infer authority from payload", "no UI may label this value final").

**Operating discipline (§15):** detect → classify → contain → decide the minimum next action. A good review is short when nothing is wrong. *"Surface the fracture. Do not worship the fracture."* If the protocol produces more architecture than risk reduction, it has failed.

---

## 4. FCTSS — The Front-Door Standard

**Core rule:** *"Classify the feature first. Select the narrowest valid transport second. Do not let the implementation path redefine the feature."* Transport selection is a governance decision, not a developer preference.

**The seven feature classes** (each with a default transport and forbidden mechanisms): UI Interaction; Read Composition (+ `canonical_derived_model` qualifier); Authoring; Projection Input; Projection Consumer; Surface Value; External Integration. The transport decision tree (§5) and transport matrix (§4) map each class to its narrowest valid mechanism.

**Why it is load-bearing against split-brain:** it stops a feature from choosing its own path through the system before being classified — the original failure mode that produced the disease. *"This is the rule that keeps future features from rebuilding the same ad-hoc mess under new filenames."* The minimalism table (§12) is the antidote to mechanism-creep: e.g. *"'Let's add outbox because this might matter later' → No. Outbox is for real Projection Inputs, not future vibes."*

**Adopted by ADR-058**, which makes classification an admission gate at six points (FIB/scaffold → PRD → EXEC → audit → code-review → supersession). ADR-058 §12: *"A Projection Input without transactional outbox propagation is a dual-write risk. A consumer that writes authoring state is a domain violation. A financial Surface Value without source, authority, and completeness is a truthfulness violation."*

---

## 5. The ADR Spine (052–061)

The decisions that froze the two cures. Route conformance questions to the domain skills; this is the index.

**Financial (route to `financial-model-authority`):**
- ADR-052 Financial Fact Model (dual-layer: Class A ledger / Class B operational)
- ADR-053 Financial System Scope Boundary (no authoritative totals, no reconciliation)
- ADR-054 Event Propagation & Surface Contract (transactional outbox, immutable `origin_label`)
- ADR-055 Cross-Class Authoring Parity (no "lighter" ingestion for grind)
- ADR-056 Relay Worker Execution Environment
- ADR-057 Class A Table Anchoring & Outbox Idempotency (Accepted) — non-table-anchored Class A rows excluded from outbox emission; producer-side idempotency invariant
- ADR-058 Feature Classification & Transport Selection (Proposed) — adopts FCTSS; subordinates its universal outbox rule to ADR-057 for Class A

**TIA (route to `tia-canon-authority`):**
- ADR-059 Ownership & Formula (single formula owner; three-result-state model; canonical DTO)
- ADR-060 Drop Taxonomy & Naming (approved/deprecated/forbidden vocabulary; `source_authority` correction)
- ADR-061 Session-Scope Aggregation (session window not gaming-day; null-SUM semantics; no COALESCE)

Frozen ADRs are **superseded via new ADRs, never silently patched.**

---

## 6. Document Status Ledger

| Artifact | Status |
|---|---|
| SRM | Canonical (v4.27.0) |
| SRL | Canonical (v1.0.0, effective 2026-05-29) |
| FCTSS | Proposed |
| ADR-058 (adopts FCTSS) | Proposed |
| ADR-057 | Accepted |
| SIGP protocol | Proposed canonical |
| SIGP-001 review | Active (findings classified, dispositions assigned) |
| SIGP-002 review | S4, Risk Registered |
| ADR-059 / 060 / 061 | Accepted (2026-05-29) |

---

## 7. Standing Semantic Risk Register

Entries produced by SIGP reviews to date. Full detail in `references/remediation-surface.md`; this is the live index.

**From SIGP-001 (post-Wave-2 financial surface truth)** — render-boundary fractures; transport spine itself rated CLEAR:
- SR-001 (S4 → Canonicalization Directive CD-001) — Rating Slip Modal: no authority envelope + composite Net Position blends authoritative PFT value with unsaved form input
- SR-003 (S4 → CD-002) — Shift Dashboard: pre-projection data path + fabricated `complete` completeness on open-shift Win/Loss
- SR-002 (S3), SR-004 (S3), SR-005 (S3), SR-006 (S2), SR-007 (S3, Aggregate Split-Brain — fills/credits trigger-denorm vs outbox-projection divergence), SR-008 (S2) — Risk Register, open with containment

**From SIGP-002 (TIA win/loss split-brain)** — overall S4, Risk Registered (`SRR-002`):
- SRR-002-001 (S4) — "Win/Loss" label collision across three surfaces with no distinguishing envelope
- SRR-002-002 (S3) — "drop" naming three structurally different facts
- SRR-002-003 (S3) — opening-baseline divergence (session snapshot vs 4-tier par cascade)
- SRR-002-004 (S4 latent) — buy-ins used as drop proxy; activates the moment the telemetry bridge is wired
