# ROLLOUT ROADMAP — Financial Telemetry (PT-2 Pilot)

---

status: Active
date: 2026-04-23
scope: PT-2 pilot, from decision-freeze (2026-04-23) to production-hardened dual-layer outbox
purpose: Execution plan from the current point through Wave 1 (surface contract) and Wave 2 (dual-layer outbox), with explicit gates and validation tie-ins.
derived_from:
- decisions/ADR-FINANCIAL-FACT-MODEL.md
- decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md
- decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md
- decisions/ADR-FINANCIAL-AUTHORING-PARITY.md
- actions/SURFACE-RENDERING-CONTRACT.md
- actions/FAILURE-SIMULATION-PLAYBOOK.md
- actions/FAILURE-SIMULATION-HARNESS.md
- SYSTEM-ARCHITECTURE.md

---

# 1. Status Snapshot (as of 2026-04-23)

## Frozen (decision-level)

| Doc | Status | Owns |
|-----|--------|------|
| ADR-FINANCIAL-FACT-MODEL | Frozen | Two fact classes, table-first anchoring, TBT reclassification |
| ADR-FINANCIAL-SYSTEM-SCOPE | Frozen | Hard boundary: no authoritative totals, no reconciliation |
| ADR-FINANCIAL-EVENT-PROPAGATION | Frozen | Outbox discipline, literal-same-transaction rule, surface envelope |
| ADR-FINANCIAL-AUTHORING-PARITY | Frozen | Cross-class envelope/discipline/strictness parity |
| SURFACE-RENDERING-CONTRACT | Frozen | UI/API binding rules, DTO envelope, forbidden patterns |

## Companion artifacts

| Doc | Status | Applies To |
|-----|--------|------------|
| SYSTEM-ARCHITECTURE.md | Overview (follows decisions) | Both waves — reference during review |
| FAILURE-SIMULATION-PLAYBOOK | Draft | I5 → Wave 1, I1–I4 → Wave 2 |
| FAILURE-SIMULATION-HARNESS | EXEC-READY | Targets Wave 2 mechanics; partial use in Wave 1 |

## Implementation

**Zero.** No production code has been touched against the frozen set. This roadmap starts from the current `main` branch.

---

# 2. Rollout Principles

1. **Surface before schema.** Wave 1 ships the label envelope on the existing backend. Wave 2 changes the underlying stores. The UI/API contract remains stable across the boundary.
2. **Additive only in Wave 1.** No deletions, no migrations, no new tables. Everything is a tightening of output shape.
3. **Parity from day one.** Even though Wave 1 reads from one store (current PFT/TBT state), the envelope must already distinguish Class A and Class B. Wave 2 wires in a second authoring path without reshaping surfaces.
4. **Gates are pass/fail, not "mostly ready."** Each phase has a hard exit condition. No partial advancement.
5. **Freeze discipline holds.** If Wave 1 or Wave 2 surfaces a real conflict with the frozen set, write a superseding ADR before changing code. Do not patch the frozen docs silently.

---

# 2.5. Execution Protocol (READ THIS BEFORE IMPLEMENTING)

> **This roadmap is a PLANNING document, not an EXEC-SPEC.**
>
> The phase tables in §3 enumerate *what must be built* and *what the exit gate looks like*. They do **not** replace PT-2's implementation pipeline. No engineer or agent should read a Phase 1.x checklist and start writing service code against it.

## 2.5.1 The frozen-ADR / PRD gap

The ADR-FINANCIAL-* set + SRC are **decisions**. PT-2 decisions do not ship; PRDs do. No PRDs exist yet for any phase of this rollout. Therefore:

- **Every Phase ≥ 1.1 requires its own PRD** before an EXEC-SPEC can be generated.
- **Every Phase ≥ 1.1 requires its own EXEC-SPEC** before build-pipeline can execute it.
- **Every Phase ≥ 1.1 runs through `/build-pipeline`** with explicit validation gates — not as ad-hoc skill invocations.

## 2.5.2 Per-phase execution chain

For each Phase ≥ 1.1, the chain is fixed:

```
┌──────────────┐   ┌──────────────────────┐   ┌──────────────┐
│ /prd-writer  │ → │  /lead-architect     │ → │ /build-pipeline │
│ (PRD for     │   │  (EXEC-SPEC scaffold  │   │ (workstream   │
│  the phase)  │   │   + workstream IDs)   │   │  execution)  │
└──────────────┘   └──────────────────────┘   └──────────────┘
```

1. **`/prd-writer`** converts this roadmap's phase entry + the classification rules + the surface inventory into a bounded, shippable PRD that cites ADRs, defines a Definition of Done, and lists cross-context impacts.
2. **`/lead-architect`** (acting in the EXEC-SPEC scaffolding role defined in the skill header) produces the workstream skeleton: IDs, dependencies, bounded contexts. No implementation hints.
3. **`/build-pipeline`** invokes the domain-expert skills (`backend-service-builder`, `api-builder`, `frontend-design-pt-2`, `qa-specialist`, `rls-expert`) per workstream and enforces phase-gate validation.

The skill-routing table in §9 lists the **terminal** skills each phase invokes **through build-pipeline** — it is NOT a list of skills to call directly without PRD/EXEC-SPEC.

## 2.5.3 Phase 1.0 exception (why no PRD)

Phase 1.0 is a **meta-phase**: its deliverables ARE the source-of-truth governance docs (`types/financial.ts`, surface inventory, classification rules, forbidden-label taxonomy) that every subsequent PRD will cite. A PRD for Phase 1.0 would be meta-circular — "write docs that define the envelope" — so lead-architect produced the artifacts directly under this roadmap's scope. Phase 1.0 is the **only** phase with this exemption. Phase 1.1 onwards has no such out.

## 2.5.4 What the phase tables in §3 ARE and ARE NOT

| The phase tables in §3 ARE… | …ARE NOT |
|-----------------------------|----------|
| A list of capabilities that must exist by phase end | A task breakdown for an engineer |
| A scope boundary (what belongs in 1.1 vs 1.2 vs 1.3) | A workstream dependency graph |
| A gate definition (what "done" means for review) | An acceptance-criteria PRD |
| Input material for `/prd-writer` | Output of `/lead-architect` EXEC-SPEC scaffolding |

## 2.5.5 Phase transitions

Exiting Phase N → Opening Phase N+1 is a **two-document transition**, not a checkbox flip:

1. Phase N exit gate met (this roadmap's §3 criteria).
2. Phase N+1 PRD drafted, reviewed, and approved.

No code may be written for Phase N+1 before its PRD lands. This is the freeze-discipline principle (§2.5) applied to implementation, not just decisions.

## 2.5.6 PRD naming convention (proposed)

Phase PRDs land in `docs/10-prd/` using the existing PRD-NNN numbering. Suggested title pattern:

```
PRD-NNN: Financial Telemetry — Wave 1 Phase 1.<N> — <phase name>
```

Each PRD cites ADR-FINANCIAL-FACT-MODEL, ADR-FINANCIAL-SYSTEM-SCOPE, ADR-FINANCIAL-EVENT-PROPAGATION, ADR-FINANCIAL-AUTHORING-PARITY, and SRC as canonical decisions; cites this roadmap as parent planning doc.

---

# 3. WAVE 1 — Surface Contract Rollout

**Goal:** every financial value rendered in UI, API response, export, or report carries the SRC envelope. No schema changes. No outbox. No dual-authoring path.

**Duration estimate:** ~2 weeks across phases 1.0–1.5 assuming one backend + one frontend engineer. Compressible if phases 1.2/1.3 run in parallel after 1.1 gates.

**Why Wave 1 has value without Wave 2:** the primary identified failure mode is semantic misinterpretation at the surface, not structural drift. The envelope closes the semantic gap on current data. Wave 2 then closes the structural gap without re-touching surfaces.

---

## Phase 1.0 — Prep & Inventory

**Scope:** align terminology, define types, audit existing surfaces.

### Deliverables

- [ ] `types/financial.ts` — canonical `FinancialValue<T>` envelope type, matching SRC §10 verbatim
  ```ts
  export type FinancialAuthority = 'actual' | 'estimated' | 'observed' | 'compliance'
  export type CompletenessStatus = 'complete' | 'partial' | 'unknown'

  export interface FinancialValue {
    value: number
    type: FinancialAuthority
    source: string
    completeness: {
      status: CompletenessStatus
      coverage?: number  // 0.0 – 1.0
    }
  }
  ```
- [ ] Surface audit: enumerate every component/route/DTO that renders or returns a currency value. Record table columns under `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`.
- [ ] Forbidden-label list: convert SRC §L3 to a concrete grep-able allowlist/denylist for the lint rule in Phase 1.4.
- [ ] Classification rules: document how each existing data source maps to an authority label (PFT → `actual`; TBT/grind → `estimated`; neither → reject).

### Exit gate

- Envelope type merged to `main`
- Surface inventory complete and reviewed by lead-architect
- Classification rules signed off

---

## Phase 1.1 — Service Layer: DTO Envelope

**Scope:** backend services emit the envelope instead of bare numbers.

**Skill to invoke:** `backend-service-builder` for each affected service (player-financial-transaction, table-buyin-telemetry, shift-metrics, anything in `services/*/` that returns currency).

### Deliverables

- [ ] Extend DTOs for every financial-returning service to wrap currency fields in `FinancialValue`
- [ ] Mappers populate `type`, `source`, `completeness` at the service boundary — not at the API layer, not in the UI
- [ ] Currency-returning methods that cannot determine completeness set `status: 'unknown'` explicitly (never omitted)
- [ ] Zod schemas (`services/*/schemas.ts`) updated to validate envelope shape on both sides of the service boundary
- [ ] No service returns a bare `number` for any currency field

### Exit gate

- All financial service DTOs updated
- Unit tests verify envelope shape, mandatory fields, classification rules
- No `as any`, no raw error passthroughs (INV-ERR-DETAILS compliance retained)
- Type-check passes (`npm run type-check`)

---

## Phase 1.2A — API Layer: Envelope Pass-Through (Transport Stabilization)

**Scope:** route handlers verified as pass-through; shared OpenAPI component defined; representative routes documented and tested. No unit normalization, no DTO type changes, no UI changes.

**PRD:** `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`

**Skill to invoke:** `api-builder` for each representative route.

### Deliverables

- [ ] Route handlers in `app/api/**/route.ts` confirmed to return the service envelope verbatim — no route-local type/source inference, no flattening
- [ ] Shared `FinancialValue` component defined once in `docs/25-api-data/api-surface.openapi.yaml`
- [ ] OpenAPI path entries authored for 1–2 representative routes per family (Bucket A amendment or Bucket B authoring)
- [ ] Shape + pass-through contract tests for each representative route
- [ ] Deprecated fields on representative routes annotated in OpenAPI with dated sunset and replacement pointer (annotation only — no runtime log events)
- [ ] `casino_id` classified per representative route: removed, deprecated-and-ignored, or out-of-scope-with-rationale

### Exit gate

- Representative route contract tests pass (shape: `value`, `type`, `source`, `completeness.status` present; no flattening)
- Shared `FinancialValue` OpenAPI component reviewed
- Deprecated fields on representative routes have dated sunset annotations; no TBD sunsets

---

## Phase 1.2B — Service Canonicalization

**Scope:** unit normalization at the service layer; DTO type promotion for deferred fields; full-breadth OpenAPI expansion; runtime deprecation observability wired. No route-handler logic changes — Phase 1.2A proved routes are pass-through; Phase 1.2B fixes what passes through.

**PRD:** `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md`

**Skill to invoke:** `backend-service-builder` (service canonicalization) + `api-builder` (OpenAPI expansion).

### Deliverables

- [ ] BRIDGE-001 retired: `/100` removed from `services/visit/crud.ts` and `services/rating-slip/mappers.ts`; `financialValueSchema.int()` enforced at DTO outbound boundary for `RecentSessionDTO` / `VisitLiveViewDTO`
- [ ] `AnomalyAlertDTO` / `ShiftAlertDTO` public numeric fields (`observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue`) typed as `FinancialValue | null`; `resolveShiftMetricAuthority` void-read promoted to assignment
- [ ] `hold_percent` confirmed bare `number | null` in all touched files (DEF-NEVER invariant)
- [ ] `financialValueSchema.int()` enforced at all financial DTO outbound boundaries
- [ ] Full-breadth OpenAPI expansion: remaining routes (beyond Phase 1.2A representative set) authored; schemas updated to reflect integer-cents `value` after BRIDGE-001 retirement
- [ ] Contract tests expanded to full route coverage; integer-value assertions added
- [ ] Runtime deprecation observability: structured log event emitted per deprecated-field usage (route path, field name, replacement, correlation ID, sunset date)
- [ ] `ROLLOUT-TRACKER.json` updated: BRIDGE-001 recorded as retired with commit SHA

### Exit gate

- `financialValueSchema.int()` passes for all canonicalized DTO fields; no dollar floats at any financial wire boundary
- `AnomalyAlertDTO` / `ShiftAlertDTO` fields emit `FinancialValue` at the wire for all MetricType values except `hold_percent`
- Contract tests pass for every financial endpoint (full coverage, integer assertions)
- OpenAPI spec diff reviewed; all in-scope routes documented
- Any deprecated field emits structured log event on usage

---

## Phase 1.3 — UI Layer: Split Displays + Label Component

**Scope:** frontend renders the envelope with mandatory labels.

**Skill to invoke:** `frontend-design-pt-2`.

### Deliverables

- [ ] `components/financial/FinancialValue.tsx` — reusable component that renders `{ value, type, source, completeness }` with the type badge visible at first glance (SRC §L2 — no tooltip-only labels)
- [ ] `components/financial/AttributionRatio.tsx` — renamed from any "coverage" component per SRC §K1
- [ ] `components/financial/CompletenessBadge.tsx` — renders `complete | partial | unknown` with appropriate visual weight
- [ ] All existing financial surfaces in `components/**/` and `app/**/` migrated to the new components
- [ ] Forbidden labels removed from production UI: `Total`, `Handle`, `Chips Out`, `Win` (unqualified), `Theo: 0`
- [ ] Pattern A (split display — SRC §8) applied wherever rated and unrated are shown together
- [ ] Mixed-authority aggregates degrade per D5 hierarchy (Actual > Observed > Estimated); compliance never merged

### Exit gate

- Manual walkthrough of every financial surface with lead-architect
- No unlabeled currency in any rendered surface
- Visual regression test (Playwright screenshot) for all financial surfaces
- Dev-server verification per PT-2 CLAUDE.md UI-change rule

---

## Phase 1.4 — Validation: Lint Rules + Truth-Telling Tests

**Scope:** make SRC violations impossible to land via CI.

**Skill to invoke:** `qa-specialist`.

### Deliverables

- [ ] ESLint custom rule `no-unlabeled-financial-value`: rejects currency-typed fields in DTOs without `FinancialValue` wrapper. Lives in `.eslintrc` or a local plugin.
- [ ] ESLint custom rule `no-forbidden-financial-label`: greps for banned strings (`"Total In"`, `"Handle"`, `"Total Drop"`) in `components/**/*.tsx` and `app/**/*.tsx`
- [ ] Unit tests: envelope-shape compliance for every DTO (schema-driven, generated from Zod)
- [ ] Integration tests: every financial API endpoint returns a valid envelope
- [ ] Playwright test: UI never renders a currency value without visible authority label — DOM assertion, not screenshot
- [ ] **Truth-telling subset of failure harness (I5 only):** adapt `FAILURE-SIMULATION-HARNESS.md` §6 scenarios to assert the UI correctly displays `completeness.status = 'partial'` and `'unknown'` without silently presenting as complete. No outbox/consumer dependencies.

### Exit gate

- CI red on any lint/test violation
- Wave 1 test suite (`npm run test:surface`) passes
- Failure-playbook I5 scenarios pass against Wave 1 surfaces

---

## Phase 1.5 — Rollout & Sign-Off

**Scope:** Wave 1 goes to production.

### Deliverables

- [ ] Staged deploy: preview → staging → prod (following `docs/deployments/CICD-PIPELINE-SPEC.md`)
- [ ] Release notes referencing SRC + all 5 frozen ADRs
- [ ] Operator UX validation: pit bosses confirm surfaces are interpretable (not just correct)
- [ ] Supabase advisors clean (no performance regression from envelope marshaling)
- [ ] Wave 1 retrospective: what surfaced that the frozen set didn't anticipate? Open a superseding ADR if warranted.

### Exit gate (Wave 1 → Wave 2 handoff)

- SRC envelope live on every production financial surface
- Lint rule active, CI red on violations
- No regressions in existing features
- Operator sign-off on interpretability
- Open questions from ADR-FACT-MODEL §5 resolved (see §6 of this roadmap) — these gate Wave 2 schema design

---

# 4. WAVE 2 — Dual-Layer + Outbox (Preview)

Detailed plan deferred until Wave 1 exit gate passes. Scope outline below for context.

## Scope

- [ ] Schema migration: separate authoring store for Class B (or shared parent with discriminator — decided by open questions in §6)
- [ ] `finance_outbox` table DDL
- [ ] Shared write-path primitive (ADR-AUTHORING-PARITY P2) — single RPC `rpc_emit_financial_event(fact_class, ...)` with literal-same-transaction guarantee (ADR-EVENT-PROPAGATION D2)
- [ ] Outbox consumer worker (Supabase function or scheduled job)
- [ ] Projection refactor: Rated Projection reads Class A only; Grind Projection reads Class B only
- [ ] Deprecate legacy trigger-based cross-domain propagation (ADR-EVENT-PROPAGATION D6)
- [ ] Full `FAILURE-SIMULATION-HARNESS.md` execution as the Wave 2 exit gate (I1–I5)

## Why Wave 2 is cheaper after Wave 1

- Surfaces already emit the envelope → consumer refactor doesn't touch UI/API
- Classification logic already proven in production → Wave 2 just changes *where* the classification is authored, not *what* it looks like
- Lint rules catch any regression in envelope discipline while Wave 2 code lands

## Wave 2 will need its own roadmap

Open a `WAVE-2-ROADMAP.md` after Wave 1 sign-off. Do not pre-plan Wave 2 phases now — the open questions in §6 change what Wave 2 looks like.

---

# 5. Failure-Simulation Alignment

| Invariant | Applies to | Where validated |
|-----------|------------|-----------------|
| I1 — Atomicity | Wave 2 (no authoring changes in Wave 1) | Harness §6 TEST 1, run in Wave 2 |
| I2 — Durability | Wave 2 (no outbox in Wave 1) | Harness §6 TEST 2, run in Wave 2 |
| I3 — Idempotency | Wave 2 (no consumer in Wave 1) | Harness §6 TEST 3, run in Wave 2 |
| I4 — Replayability | Wave 2 (no projections in Wave 1) | Harness §6 TEST 5 (Replay), run in Wave 2 |
| **I5 — Truthfulness** | **Wave 1** (surfaces) | **Phase 1.4 truth-telling tests** |

Wave 1 validates I5 end-to-end. Wave 2 adds I1–I4 without weakening I5 (the envelope already exists, projections just become the new source).

The harness file is EXEC-READY for Wave 2. Do not let it bit-rot during Wave 1 — run the harness against a stub implementation periodically to confirm the test scaffolding still compiles and fixtures still match the frozen event model.

---

# 6. Open Questions Gating Wave 2

From `ADR-FINANCIAL-FACT-MODEL §5`, these are deferred but must resolve before Wave 2 schema design begins. They do **not** gate Wave 1.

| Question | Resolution path | Blocks |
|----------|-----------------|--------|
| Should PFT schema expand to support table-only events, or does Class B stay in a separate authoring store? | Post–Wave 1 design review; input from Wave 1 production data | Wave 2 schema migration |
| Should grind remain fully separate, or partially normalized under a shared parent with a discriminator column? | Same review | Wave 2 schema migration |
| What does the external reconciliation consumer contract look like? | External stakeholder discovery | Wave 2 outbox consumer design |
| Should outbox emission use trigger-based insertion, shared RPC, or both? | Literal-same-transaction rule (ADR-PROP D2) constrains options; performance testing decides | Wave 2 authoring primitive |

Track resolutions in a `WAVE-2-PREP-DECISIONS.md` accumulated during Wave 1.

---

# 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Surface inventory misses a financial value, ships unlabeled | Medium | High (reintroduces drift) | Phase 1.0 audit + lint rule; code review on every `number` in a currency context |
| Type-level envelope drift between service/API/UI | Medium | Medium | Single source-of-truth `types/financial.ts`; Zod schema shared across layers |
| UI verbosity complaints from operators ("too many labels") | Medium | Low (SRC rejects this tradeoff outright) | Phase 1.5 operator walkthrough; labels are non-negotiable (SRC §L2, §12) |
| Existing "Total Drop" feature is load-bearing for a stakeholder | Low | Medium | Deprecation path with explicit rename (`Estimated Drop (Derived)`) or redirect to split view; no silent removal |
| Wave 2 harness rots during Wave 1 | Medium | Low | Run harness against stub in CI nightly; flag when fixtures diverge from frozen event model |
| Freeze rule pressure: team wants to "just patch" the frozen ADRs mid-Wave-1 | Medium | High (discipline collapse) | Route any proposed change through supersession process; lead-architect gate |
| Attribution Ratio misinterpreted as completeness despite rename | Medium | Medium | SRC §K1 wording in the component tooltip; Phase 1.3 visual design brief |

---

# 8. Non-Goals (explicit)

- No schema changes in Wave 1
- No new tables in Wave 1
- No outbox, no consumer, no projections refactor in Wave 1
- No performance optimization of the envelope itself (marshaling overhead is acceptable at pilot scale)
- No external integration (future reconciliation layer) — deferred past Wave 2
- No Compliance domain work — parallel, out of pilot scope
- No `pit_cash_observation` authoring — taxonomy only

---

# 9. Ownership & Skill Routing (invoked *through* `/build-pipeline`)

**Do not invoke these skills directly for Phase ≥ 1.1.** Per §2.5, each phase runs `/prd-writer` → `/lead-architect` (EXEC-SPEC scaffold) → `/build-pipeline`; `/build-pipeline` is what dispatches the domain-expert skills below. The column names indicate which skill `/build-pipeline` invokes for each workstream type, not a call-order for humans.

| Phase | Terminal skill(s) (dispatched by build-pipeline) | Supporting |
|-------|--------------------------------------------------|-----------|
| 1.0 Prep | `/lead-architect` — **direct invocation permitted** (meta-phase, see §2.5.3) | — |
| 1.1 Service DTOs | `/backend-service-builder` | — |
| 1.2A API Transport | `/api-builder` | — |
| 1.2B Canonicalization | `/backend-service-builder` (service layer) + `/api-builder` (OpenAPI expansion) | — |
| 1.3 UI | `/frontend-design-pt-2` | `/web-design-guidelines` for review |
| 1.4 Validation | `/qa-specialist` | `/e2e-testing` for Playwright assertions |
| 1.5 Rollout | `/devops-pt2` | `/qa-specialist` for final gate |
| Wave 2 (all) | TBD post-Wave-1 (PRD + EXEC-SPEC per workstream) | — |

---

# 10. Exit Criteria Summary

## Wave 1 complete when

1. SRC envelope present on every production financial surface (API + UI)
2. Lint rule red on violations, active in CI
3. Truth-telling test suite passes (harness I5 subset)
4. No "Total"/"Handle"/"Chips Out" in production code
5. Attribution Ratio renders correctly, distinct from completeness
6. Operator sign-off on interpretability
7. Open questions §6 either resolved or explicitly deferred with documented rationale

## Ready to start Wave 2 when

1. Wave 1 complete
2. §6 open questions resolved
3. `WAVE-2-ROADMAP.md` drafted
4. Failure harness verified against stubs

---

# 11. Closing

```
Wave 1 changes how the system talks.
Wave 2 changes what the system is.

The talk has to be honest before the structure changes,
or the structure change will be invisible.
```

This roadmap is live. Update as phases complete. If the frozen set needs to change mid-roadmap, supersede — do not patch.
