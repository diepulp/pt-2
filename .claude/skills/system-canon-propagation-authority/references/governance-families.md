# Governance Families Resolution Index (G-01 … G-16)

The executable index behind `GOV-CANON-SHELL-002` §5. When a mapped canon-propagation
slice is commissioned, this is the routing table the resolver uses to assemble the
**Canonization Governance Context Block** — *resolve from here, do not let agents
re-discover governance by open-ended search* (GOV-CANON-SHELL-002 §3, R1).

**How to use:** for each family, confirm applicability for the slice, resolve the
artifact(s) at the path(s) below, extract only the obligations that apply, and record
them in the context block. Reference source artifacts; never copy them whole (R2).

**Dispositions:**
- **Enforce** — belongs in a pipeline gate as a structured field / pass-fail / disposition (§13).
- **Reference** — resolved by pointer for audit; not copied into the pipeline (§14).
- **Conditional** — applies only when classification activates it (R4); do not attach to every slice.

**Precedence when artifacts conflict (§15):** accepted superseding ADR/amendment →
active classification standard → active Canonicalization Directive → SRL/ubiquitous-language
authority → authorized Slice Mandate → current FIB/RFC/PRD/EXEC → adopted exemplar →
historical intent → diagnostic/research. A lower artifact must not silently override a higher one (R3).
**Missing required reference → `decision: block_map_incomplete`. Unresolved conflict → `block_authority_conflict`. Never infer (R5).**

---

## G-01 — SIGP Diagnosis · **Enforce**
Accepted semantic fracture inventory; stops a systemic split-brain being treated as an isolated defect.
- `docs/issues/loyalty-split-brain/SPLIT-BRAIN-DIAGNOSIS-loyalty.md` — L-01…L-15 fracture register (loyalty slice)
- `docs/70-governance/SIGP/` — SIGP templates + reviews (SIGP-001 post-Wave-2, SIGP-002 TIA win-loss)
- Crosswalk: `…/SYSTEM-CANON-PROPAGATION-REGISTER.yaml` → `fracture_crosswalk` (L-ID → node IDs)
- **Resolve:** accepted artifact, fracture IDs the slice closes, competing authority paths, duplicate formulas, trust/compliance consequence, proposed owner, unresolved findings (kept deferred).

## G-02 — Feature Classification & Transport Selection · **Enforce**
Correct architectural mechanism (feature class + narrowest transport).
- `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` (+ `.md`)
- `docs/80-adrs/ADR-058-feature-classification-and-transport-selection.md`
- **Already cited:** feature-pipeline (Phase 1 classification, Phase 5 ADM-1…10).
- **Resolve:** `feature_class`, `transport_class`, persistence/authoring/projection posture, surface consequence, rollout posture.

## G-03 — Exemplar Slice Discipline · **Enforce**
Vertical-first collapse before horizontal expansion.
- `docs/70-governance/EXEMPLAR_SLICE_DISCIPLINE.md` — §3 applicability criteria, §5 I1–I4, §6 containment, AP-ES-*
- **Already cited:** feature-pipeline (FIB §P exemplar scope).
- **Resolve:** applies?, representative categories, exemplar pair/path, end-to-end chain, containment boundary, expansion gate, inherited vs repeated proofs.

## G-04 — Canonicalization Directive · **Enforce**
Domain target model frozen before implementation slices begin.
- `docs/issues/loyalty-split-brain/LOYALTY-CANONIZATION-REMEDIATION-STRATEGY.md` — loyalty target model + phase order
- `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md` — program constitution
- **Resolve:** authored facts, derived projections, correction lifecycle, temporal postures, ownership, canonical DTO family, producer/consumer classification, prohibited semantics, phase/slice order.

## G-05 — Ubiquitous Language & SRL Binding · **Enforce**
One meaning, one canonical name per concept.
- `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` — §8 admitted-extension registry, §9 admission paths
- `docs/20-architecture/SRL-CHANGE-LOG.md`; exemplar `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`
- Enforcement code: `scripts/semantic/srl_intake_lint.py` (invoked by build-pipeline SRL preflight)
- **Already cited:** both pipelines.
- **Resolve:** canonical / forbidden / deprecated terms, term distinctions, allowed surface labels, reason→event mappings, DB-rejection requirements.

## G-06 — Canonical Fact & Projection Standard · **Enforce** · ⚠️ CONTENT GAP
Each stateful slice declares authorship, derivation, consumer authority (the 15 questions, §5 G-06).
- ⚠️ **No system-wide standard doc yet** — strategy §47 defers creating it until loyalty proves the pattern.
- Nearest authority today: `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md`; `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md`
- For the loyalty slice answer via ADR-052 + strategy §47's 15 questions.
- **Action:** register this as a future artifact; certify loyalty against the 15 questions inline until the standard exists.

## G-07 — Temporal & Lifecycle Classification · **Enforce**
Keep historical / settled / snapshot / live / current values from collapsing.
- `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`, `TEMP-002-temporal-authority-pattern.md`, `TEMP-003-temporal-governance-enforcement.md`
- `docs/80-adrs/ADR-026-gaming-day-scoped-visits.md`
- Code: `lib/gaming-day/`, `lib/validation/date.ts`, `hooks/casino/use-gaming-day.ts` (never `new Date()` / `toISOString().slice(0,10)`)
- **Resolve:** `temporal_posture` (event_time_pinned | as_of_date_versioned | live_estimate | current_operational_state), cutoff identity, effective-date rule, lifecycle boundary, mutation-after-settlement, null-vs-zero.

## G-08 — One Owner & One Canonical DTO Authority · **Enforce**
Eliminate formula / contract split-brain.
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — write/table ownership
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md` — canonical DTO derivation
- **Already cited:** SRM→feature-pipeline (Phase 0), DTO→build-pipeline (validate).
- **Resolve:** owning context/service/BFF, sole formula owner, canonical DTO, non-derivable semantic fields, approved consumer access path; dispositions for competing DTOs/formulas.

## G-09 — Consumer Disposition & Suppression Inventory · **Enforce**
Prove canonical implementation replaces/suppresses competing paths.
- `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-REGISTER.yaml` — `nodes`/`edges` with `disposition` + `target_slice`
- `docs/issues/loyalty-split-brain/propagation-map/LANE-{TIA,FINANCIAL,SPLITBRAIN}.md` — `file:line` evidence
- **Resolve:** per-consumer disposition (canonical | migrate | suppress | delete | legacy_quarantined | outside_active_workflow); suppression remains an independent proof class; "outside active workflow" requires evidence.

## G-10 — Correction-by-Compensation Standard · **Enforce** · ⚠️ CONTENT GAP
Immutable history; auditable compensating corrections.
- ⚠️ **No dedicated ADR.** Pattern recorded in REGISTER `canonical_patterns.append_only_correction` (proven_exemplar/incomplete — loyalty reversal RPC absent, L-05)
- Loyalty design: `docs/issues/loyalty-split-brain/agents/agent-4-balance-reversal.md` + strategy §21–24
- Finance exemplar (mature instance): `rpc_create_financial_adjustment` (PRD-084 runtime cert)
- **Resolve:** original-fact identity, compensating/superseding type, eligibility, correction reason, duplicate prevention, partial-vs-full, trusted attribution, audit. **Action:** consider an ADR once loyalty reversal lands.

## G-11 — Provenance / Authority / Completeness / Settlement Envelope · **Enforce (conditional)**
Correct numbers must not make false semantic claims.
- `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md` — surface rendering contract
- Code: `types/financial.ts`, `lib/financial/schema.ts`, `components/financial/FinancialValue.tsx`
- Pipeline enforcement: build-pipeline **Gate B** (`scripts/classify-render-path.py`) for derived-value surfaces.
- **Resolve:** source, authority, temporal posture, settlement state, as-of, policy version, effective date, included/missing inputs, calculation kind, custody status, snapshot/ledger identity. Label must match authority; completeness must not upgrade authority; amount + provenance share one canonical identity.

## G-12 — Producer Anchor Resolution & Workflow Certification · **Enforce**
Distinguish producer capability from actual workflow adoption.
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml`
- `docs/80-adrs/ADR-057-class-a-table-anchoring-idempotency-clarification.md`
- `PROD-ANCHOR-STD-001` ratified in `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md`
- Exemplar: `fn_finance_outbox_emit` (casino_id from GUC, never caller-supplied)
- **Resolve:** required anchor, anchor source, resolution boundary, caller restrictions, ambiguity rule, real call site, expected E2E workflow. Require **separate** proof: mechanism / producer-capability / workflow-traversal. Block UI-owned anchor resolution; block treating RPC capability as workflow cert.

## G-13 — Transport Invariants · **Conditional**
Proven propagation mechanics, only when classification requires transport (R4).
- `docs/02-design/RFC-006-transactional-outbox.md`; `docs/01-scaffolds/SCAFFOLD-TRANSACTIONAL-OUTBOX.md`
- `docs/80-adrs/ADR-054` (propagation contract), `ADR-056-relay-worker-execution-environment.md`
- I1–I4 proof exemplar: `docs/10-prd/PRD-082-wave2-integration-proof-v0.md` (+ EXEC-082)
- **Resolve:** same-transaction authoring+emit, immutable event classification, event catalog, at-least-once, idempotent receipt, deterministic order, replayability, no side-channels, transport security, I1–I4. **When transport does NOT apply, do not attach outbox requirements just because an exemplar used them.**

## G-14 — Integration-Proof Standard · **Enforce**
Match the proof environment to the claim.
- `docs/40-quality/QA-006-e2e-testing-standard.md` (Mode A/B/C; E2E vs System vs Local verification); `QA-005-route-handler-testing.md`
- Enforcement code: `.claude/skills/build-pipeline/scripts/{check-test-fidelity.py (Gate A), classify-render-path.py (Gate B), classify-write-path.py (E2E mandate)}`; `jest.integration.config.js`
- **Already wired:** build-pipeline Gate A/B + E2E mandate scripts (QA-006 itself not yet named as governing standard).
- **Resolve:** `required_proof_environments` (unit / contract / database_integration / route_integration / component_render / end_to_end_workflow / failure_injection / replay). Mock-heavy tests cannot discharge real-integration obligations.

## G-15 — Overengineering & Anti-Framework Guardrail · **Enforce**
Reuse governance; do not prematurely generalize runtime (AP-8).
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- Wave-specific: `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_{FIN_TELEMETRY.WAVE-1,OUTBOX_WAVE2}.md`
- **Resolve:** allowed governance reuse, prohibited generic runtime abstractions, slice containment, extraction trigger, deferred infra. Block generic fact engines / valuation frameworks / projection platforms / event-bus redesign / universal authority enums.

## G-16 — Maturity Ratchet & Expansion Inheritance · **Enforce**
Code shipment ≠ system-wide propagation.
- `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md` — maturity model (§3) + expansion gate (§13)
- `docs/issues/loyalty-split-brain/SYSTEM-CANON-PROPAGATION-REGISTER.yaml` — per-pattern `status` + `propagation_status`
- **Resolve:** pattern_status (candidate | accepted | superseded) **separate from** implementation_maturity (unproven → proven_exemplar → standardized_pattern → propagated_standard); inherited_proofs, proofs_to_repeat, expansion_authority. A build may not self-award a transition; only Propagation Certification + map update changes official state.

---

## Coverage snapshot (verify against current skill state)

| Disposition | Families |
|---|---|
| Already cited in pipeline skills | G-02, G-03, G-05, G-08 |
| Wired as enforcement code, standard not named | G-14 |
| Artifact exists, citation gap to close | G-01, G-04, G-07, G-09, G-11, G-12, G-13, G-15, G-16 |
| **Content gap (artifact does not fully exist)** | **G-06** (no system-wide fact/projection standard yet), **G-10** (no correction-by-compensation ADR) |

The resolver's job is to turn this index into a per-slice `canonization_governance_context`
block (GOV-CANON-SHELL-002 §6). Conditional families (G-11, G-13, and custody/compliance)
attach only when classification (G-02) activates them.
