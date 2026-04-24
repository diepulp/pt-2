# Financial Data Distribution Standard — Index

Navigation index for the financial data distribution standard workspace under `docs/issues/gaps/financial-data-distribution-standard/`.

**Status**: Mixed set of draft, accepted, frozen, and active rollout documents  
**Scope**: PT-2 pilot financial telemetry, provenance, surface semantics, and rollout planning  
**Use this index for**: reading order, document purpose, and locating frozen decisions vs. working artifacts

---

## Reading Order

### Step 1 — Investigation and problem framing

| # | Document | Purpose |
|---|----------|---------|
| 1a | [FINANCIAL-PROVENANCE-TRACE.md](./FINANCIAL-PROVENANCE-TRACE.md) | System-wide provenance audit. Establishes where financial values originate and where split-brain or undefined provenance exists. |
| 1b | [UNRATED-GRIND-BUY-IN-INVESTIGATION.md](./UNRATED-GRIND-BUY-IN-INVESTIGATION.md) | Focused analysis of unrated/grind buy-ins and the core design conflict around anonymous vs. patron-linked facts. |
| 1c | [FIN-UNIFICATIOTION-CODEBASE-MAP.md](./FIN-UNIFICATIOTION-CODEBASE-MAP.md) | Codebase mapping and exact-change synthesis. Useful when moving from architectural intent to implementation planning. |
| 1d | [SURFACE-CLASSIFICATION-AUDIT.md](./SURFACE-CLASSIFICATION-AUDIT.md) | Audit of service, API, and UI financial surfaces against the authority/rendering model. |

### Step 2 — Canonical contract and authority model

| # | Document | Purpose |
|---|----------|---------|
| 2a | [FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md](./FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md) | Proposed system-wide contract for authoring, propagation, projection, and consumption of financial facts. |
| 2b | [FACT-AUTHORITY-MATRX-FIN-DOMAIN.md](./FACT-AUTHORITY-MATRX-FIN-DOMAIN.md) | Authority matrix for financial fact types, domain ownership, and prohibited misuse of each fact class. |

### Step 3 — Decision consolidation and canonical ADR set

| # | Document | Purpose |
|---|----------|---------|
| 3a | [decisions/DECISION-CONSOLIDATION.md](./decisions/DECISION-CONSOLIDATION.md) | Pre-ADR consolidation of the major architectural decisions and tensions. Read this before the canonical ADRs if you want the rationale chain. |
| 3b | [../80-adrs/ADR-052-financial-fact-model-dual-layer.md](../../80-adrs/ADR-052-financial-fact-model-dual-layer.md) | Canonical ADR defining the dual-layer fact model and common anchoring rule. |
| 3c | [../80-adrs/ADR-053-financial-system-scope-boundary.md](../../80-adrs/ADR-053-financial-system-scope-boundary.md) | Canonical ADR defining the scope boundary for what PT-2 financial telemetry does and does not claim. |
| 3d | [../80-adrs/ADR-054-financial-event-propagation-surface-contract.md](../../80-adrs/ADR-054-financial-event-propagation-surface-contract.md) | Canonical ADR defining propagation and surface contract semantics. |
| 3e | [../80-adrs/ADR-055-cross-class-authoring-parity.md](../../80-adrs/ADR-055-cross-class-authoring-parity.md) | Canonical ADR defining cross-class parity invariants for event authoring. |

**Canonical ADR set**: `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md`, `docs/80-adrs/ADR-053-financial-system-scope-boundary.md`, `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md`, `docs/80-adrs/ADR-055-cross-class-authoring-parity.md`, and `actions/SURFACE-RENDERING-CONTRACT.md`.

### Step 4 — Companion architecture and rollout rulebook

| # | Document | Purpose |
|---|----------|---------|
| 4a | [SYSTEM-ARCHITECTURE.md](./SYSTEM-ARCHITECTURE.md) | Illustrative projection of the frozen decision set. Companion overview, not a decision artifact. |
| 4b | [actions/SURFACE-RENDERING-CONTRACT.md](./actions/SURFACE-RENDERING-CONTRACT.md) | Binding surface/UI rulebook for rendering and labeling financial values. Companion to the propagation ADR. |
| 4c | [actions/ROLLOUT-ROADMAP.md](./actions/ROLLOUT-ROADMAP.md) | Execution roadmap from decision freeze through Wave 1 and Wave 2 rollout. |
| 4d | [actions/ROLLOUT-PROGRESS.md](./actions/ROLLOUT-PROGRESS.md) | Live status tracker for rollout work against the frozen decision set. |

### Step 5 — Wave 1 implementation guidance

| # | Document | Purpose |
|---|----------|---------|
| 5a | [actions/WAVE-1-SURFACE-INVENTORY.md](./actions/WAVE-1-SURFACE-INVENTORY.md) | Inventory of every DTO, route, and UI surface that emits or renders financial values. |
| 5b | [actions/WAVE-1-CLASSIFICATION-RULES.md](./actions/WAVE-1-CLASSIFICATION-RULES.md) | Canonical mapping rules for populating `FinancialValue` authority metadata. |
| 5c | [actions/WAVE-1-FORBIDDEN-LABELS.md](./actions/WAVE-1-FORBIDDEN-LABELS.md) | Grep-ready denylist and replacement rules for invalid or misleading financial labels. |
| 5d | [actions/WAVE-1-PHASE-1.0-SIGNOFF.md](./actions/WAVE-1-PHASE-1.0-SIGNOFF.md) | Decision and sign-off artifact resolving open Phase 1.0 questions. |

### Step 6 — Validation, failure testing, and blast radius

| # | Document | Purpose |
|---|----------|---------|
| 6a | [actions/BLAST-RADIUS-ASSESSMENT.md](./actions/BLAST-RADIUS-ASSESSMENT.md) | Cross-layer change impact assessment for services, APIs, UI, tests, DB, and RLS. |
| 6b | [actions/FAILURE-SIMULATION-PLAYBOOK.md](./actions/FAILURE-SIMULATION-PLAYBOOK.md) | Scenarios for intentionally breaking the pipeline to validate recovery and correctness. |
| 6c | [actions/FAILURE-SIMULATION-HARNESS.md](./actions/FAILURE-SIMULATION-HARNESS.md) | Implementation guide for deterministic failure injection and pipeline validation. |

---

## Decision History

### Current authoritative decisions

| Document | Status |
|----------|--------|
| [../../80-adrs/ADR-052-financial-fact-model-dual-layer.md](../../80-adrs/ADR-052-financial-fact-model-dual-layer.md) | Accepted, canonicalized from frozen 2026-04-23 snapshot |
| [../../80-adrs/ADR-053-financial-system-scope-boundary.md](../../80-adrs/ADR-053-financial-system-scope-boundary.md) | Accepted, canonicalized from frozen 2026-04-23 snapshot |
| [../../80-adrs/ADR-054-financial-event-propagation-surface-contract.md](../../80-adrs/ADR-054-financial-event-propagation-surface-contract.md) | Accepted, canonicalized from frozen 2026-04-23 snapshot |
| [../../80-adrs/ADR-055-cross-class-authoring-parity.md](../../80-adrs/ADR-055-cross-class-authoring-parity.md) | Accepted, canonicalized from frozen 2026-04-23 snapshot |
| [actions/SURFACE-RENDERING-CONTRACT.md](./actions/SURFACE-RENDERING-CONTRACT.md) | Accepted, frozen 2026-04-23 |

### Interim drafts retained for history

| Document | Notes |
|----------|-------|
| [decisions/interim/ADR-FINANCIAL-FACT-MODEL-DRAFT.md](./decisions/interim/ADR-FINANCIAL-FACT-MODEL-DRAFT.md) | Earlier fact-model draft; superseded by the canonical ADR set. |
| [decisions/interim/ADR-FINANCIAL-EVENT-INJESTION-UNIFICATION.md](./decisions/interim/ADR-FINANCIAL-EVENT-INJESTION-UNIFICATION.md) | Interim ingestion unification draft retained as historical design input. |
| [decisions/interim/ADR-FINANCIAL-EVENT-OUTBOX.md](./decisions/interim/ADR-FINANCIAL-EVENT-OUTBOX.md) | Interim outbox draft preserved for lineage; superseded by propagation ADR. |

---

## Directory Map

| Path | Contents |
|------|----------|
| `./` | Core investigations, authority model, contract, and architecture companion docs |
| `./decisions/` | Consolidation artifact, frozen source snapshots, and canonical ADR mapping note |
| `./decisions/interim/` | Draft ADRs retained for historical context |
| `./actions/` | Rollout plan, wave artifacts, validation docs, and implementation guidance |

---

## Quick Navigation By Need

| If you need to... | Start here |
|-------------------|-----------|
| Understand the root problem | [FINANCIAL-PROVENANCE-TRACE.md](./FINANCIAL-PROVENANCE-TRACE.md) |
| Resolve grind / unrated buy-in semantics | [UNRATED-GRIND-BUY-IN-INVESTIGATION.md](./UNRATED-GRIND-BUY-IN-INVESTIGATION.md) |
| See the canonical financial rules | [FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md](./FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md) |
| Check which facts are authoritative | [FACT-AUTHORITY-MATRX-FIN-DOMAIN.md](./FACT-AUTHORITY-MATRX-FIN-DOMAIN.md) |
| Read the canonical ADR set | [../../80-adrs/ADR-052-financial-fact-model-dual-layer.md](../../80-adrs/ADR-052-financial-fact-model-dual-layer.md) |
| Understand UI/API labeling requirements | [actions/SURFACE-RENDERING-CONTRACT.md](./actions/SURFACE-RENDERING-CONTRACT.md) |
| Plan execution work | [actions/ROLLOUT-ROADMAP.md](./actions/ROLLOUT-ROADMAP.md) |
| Check active rollout state | [actions/ROLLOUT-PROGRESS.md](./actions/ROLLOUT-PROGRESS.md) |
| Estimate implementation impact | [actions/BLAST-RADIUS-ASSESSMENT.md](./actions/BLAST-RADIUS-ASSESSMENT.md) |
| Validate failure behavior | [actions/FAILURE-SIMULATION-PLAYBOOK.md](./actions/FAILURE-SIMULATION-PLAYBOOK.md) |
