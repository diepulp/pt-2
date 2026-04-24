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

## Phase 1.2 — API Layer: Envelope at the Wire

**Scope:** route handlers serialize the envelope; OpenAPI specs updated.

**Skill to invoke:** `api-builder` for each affected route.

### Deliverables

- [ ] Route handlers in `app/api/**/route.ts` return the envelope verbatim (no flattening back to bare numbers)
- [ ] OpenAPI specs under `docs/` updated to reflect the envelope schema
- [ ] Response validation (contract tests) enforces envelope shape
- [ ] Any endpoint currently returning a raw "total" is either: (a) split into labeled components, or (b) deprecated with a migration note pointing to the split variant
- [ ] No endpoint returns `Total Drop`, `Handle`, or other forbidden-label aggregates (SRC §L3 / §F1)

### Exit gate

- Contract tests pass for every financial endpoint
- OpenAPI spec diff reviewed
- Any deprecated endpoint has a dated sunset in its OpenAPI description

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

# 9. Ownership & Skill Routing

| Phase | Primary skill | Supporting |
|-------|--------------|-----------|
| 1.0 Prep | `lead-architect` | — |
| 1.1 Service DTOs | `backend-service-builder` | — |
| 1.2 API | `api-builder` | `backend-service-builder` |
| 1.3 UI | `frontend-design-pt-2` | `web-design-guidelines` for review |
| 1.4 Validation | `qa-specialist` | `e2e-testing` for Playwright assertions |
| 1.5 Rollout | `devops-pt2` | `qa-specialist` for final gate |
| Wave 2 (all) | TBD post-Wave-1 | — |

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
