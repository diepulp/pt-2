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

## Phase 1.2B — Service Canonicalization + Surface Alignment

**Scope:** Three sequential sub-phases following the GOV-FIB-001 sequencing requirement: cause (service semantics) → immediate presentation consequence (render correction) → contract enforcement (OpenAPI + tests). Runtime observability belongs to Phase 1.4 validation.

---

### Phase 1.2B-A — Service Canonicalization  ✅ COMPLETE 2026-04-30

**PRD:** `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md`
**EXEC:** `docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-canonicalization.md`
**Commit:** `e83a2c12`

**Deliverables — all complete:**

- [x] BRIDGE-001 retired: `/100` removed from `services/visit/crud.ts` and `services/rating-slip/mappers.ts`; `financialValueSchema.int()` enforced at DTO outbound boundary for `RecentSessionDTO` / `VisitLiveViewDTO`
- [x] `AnomalyAlertDTO` / `ShiftAlertDTO` public numeric fields promoted to `FinancialValue | null` via `resolveShiftMetricAuthority`; outbound Zod schemas added (DEF-007 lifted)
- [x] `hold_percent` confirmed bare `number | null` (DEF-NEVER) — grep + test assertion
- [x] Three named OpenAPI path entries shape-aligned to integer-cents contract
- [x] Named BRIDGE-001 route test assertions updated to integer-value assertions
- [x] `anomaly-alert-card.tsx` mechanical compatibility fix (metric-type-aware property access)
- [x] `ROLLOUT-TRACKER.json`: DEF-001, DEF-002, DEF-003, DEF-007 closed; BRIDGE-001 retired with commit SHA

---

### Phase 1.2B-B — Render Migration

**Scope:** Fix live display bug introduced by Phase 1.2B-A. `formatDollars` calls on `FinancialValue.value` integer-cents fields in `start-from-previous.tsx` must become `formatCents`. No route, service, OpenAPI, or test changes. Primary change class: Presentation.

**FIB-H:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.md`
**FIB-S:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.json`
**PRD:** pending — `/prd-writer` next action
**Skill to invoke:** `frontend-design-pt-2`

### Deliverables

- [ ] `formatDollars` → `formatCents` at `start-from-previous.tsx` lines 202, 208, 226; import updated
- [ ] Q-4 consumer audit: grep confirms no other `formatDollars` call site reads a `FinancialValue.value` integer-cents field
- [ ] `npm run type-check`, `npm run lint`, `npm run build` exit 0
- [ ] DEF-004 closed in `ROLLOUT-TRACKER.json` with implementation commit SHA

### Exit gate

- `formatDollars` absent from all `FinancialValue.value` reads in `start-from-previous.tsx`
- Q-4 audit clean (only the three named call sites affected)
- All build gates pass

---

### Phase 1.2B-C — Contract Expansion

**Scope:** Q-5-audited OpenAPI expansion for financially-relevant route fields + route-appropriate boundary test matrices for `recent-sessions` and `live-view` + DEC-6 `shift-intelligence/alerts` coverage. Primary change class: Enforcement/Transport. Runtime deprecation observability is Phase 1.4 scope.

**FIB-H/FIB-S:** pending — own FIB pair required
**PRD:** pending
**Skills to invoke:** `api-builder` (OpenAPI + DEC-6 route test) + `qa-specialist` (4-case test matrices)

### Deliverables

- [ ] Q-5 OpenAPI audit recorded: all financially-relevant fields discovered by the audit are annotated with `$ref FinancialValue`, or explicitly documented as deferred / DEF-NEVER bare-number fields
- [ ] DEC-6: `GET /api/v1/shift-intelligence/alerts` OpenAPI path entry + route-boundary test asserting discriminated union shape (`FinancialValue | null` for financial metric branches, bare `number | null` for `metricType: 'hold_percent'` ratio branch)
- [ ] Route-appropriate boundary test matrices for `recent-sessions` and `live-view`: `recent-sessions` covers authenticated success, unauthenticated (401), invalid params, and empty / no-prior-session; `live-view` covers authenticated success, unauthenticated (401), not-found (404), and service error
- [ ] DEF-005 closed in `ROLLOUT-TRACKER.json` with implementation commit SHA

### Exit gate

- Q-5 audit output confirms no remaining financially-relevant bare-number fields where `FinancialValue` is the correct type
- DEC-6 OpenAPI path entry and route-boundary test live and passing
- 4-case route-boundary test matrices pass for `recent-sessions` and `live-view`

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

**Scope:** Wave 1 Preview validation, operator sign-off, merge, production smoke, and Wave 2 handoff documentation. This is not a CI/CD remediation phase.

### Deliverables

- [ ] Gate 0 Preview validation surface: real Vercel Preview deployment is labeled/metadata-confirmed as Preview, no middleware HTTP 500, Supabase auth works, financial routes return data.
- [ ] Required Vercel Preview env vars added: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only secret; no logs/screenshots/PR comments/client bundles).
- [ ] Blocking gates green before merge: `npm run lint`, `npm run type-check`, `npm run build`.
- [ ] Advisory validation recorded: `npm run test:surface` and I5 E2E checks; every advisory failure has explicit engineering-lead disposition.
- [ ] Operator UX validation on confirmed Preview: pit bosses/floor supervisors confirm authority labels, completeness states, non-authoritative totals, and split displays are interpretable.
- [ ] Authoritative sign-off artifact created: `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md`.
- [ ] Production smoke after merge: three envelope-bearing API routes checked for `FinancialValue` shape and two bare-number sanity routes checked without envelope assertions.
- [ ] Release notes referencing SRC + ADR-052/053/054/055.
- [ ] Wave 1 retrospective: CI/CD gap register, shared-database caveat, Q1–Q4 deferral rationale, release notes, and pre-Wave-2 surface-debt register.

### Exit gate (Wave 1 → Wave 2 handoff)

- SRC envelope live on all Phase 1.5 envelope-bearing production smoke routes; known residual bare-number surfaces are explicitly recorded in the pre-Wave-2 surface-debt register below.
- Lint rule active, CI red on violations
- No regressions in existing features
- Operator sign-off on interpretability
- Open questions from ADR-FACT-MODEL §5 resolved or explicitly deferred with rationale (see §6 of this roadmap) — these gate Wave 2 schema design
- CI/CD gap register complete as Wave 2 prerequisite list

### Phase 1.5 Cut Surfaces

The following routes are cut from Phase 1.5 `FinancialValue` envelope assertions. They remain valid deployed-route sanity checks only. Phase 1.5 must not wrap these DTOs to satisfy rollout smoke checks.

| Surface | Current fields | Phase 1.5 disposition | Required follow-up |
|---|---|---|---|
| `GET /api/v1/rating-slips/[id]/modal-data` / `RatingSlipModalDTO.financial` | `totalCashIn`, `totalCashOut`, `netPosition` are bare-number cents fields | Bare-number sanity check only | Pre-Wave-2 decision: wrap as `FinancialValue`, or formally classify as internal BFF carve-out with UI-only labeling guarantees |
| `GET /api/v1/visits/[visitId]/financial-summary` / `VisitFinancialSummaryDTO` | `total_in`, `total_out`, `net_amount` are deferred bare-number cents fields | Bare-number sanity check only | Pre-Wave-2 decision: wrap as `FinancialValue`, or retire/replace public consumption before schema/outbox work |

### Recommended Pre-Wave-2 Surface-Debt Review

Before Wave 2 schema/outbox implementation begins, run a bounded prep slice to decide whether the remaining deferred financial DTO surfaces become wrapped contracts or documented permanent/internal carve-outs. Do not bury this inside generic outbox work.

**Minimum required review (2 surfaces / 6 fields):**

- `RatingSlipModalDTO.financial.totalCashIn`
- `RatingSlipModalDTO.financial.totalCashOut`
- `RatingSlipModalDTO.financial.netPosition`
- `VisitFinancialSummaryDTO.total_in`
- `VisitFinancialSummaryDTO.total_out`
- `VisitFinancialSummaryDTO.net_amount`

**Recommended full residual review (4 surfaces / 12 fields):**

- Minimum required review above.
- `MtlEntryDTO.amount` — deferred compliance value; classification target `compliance / mtl_entry / complete`.
- `MtlGamingDaySummaryDTO.total_in`
- `MtlGamingDaySummaryDTO.total_out`
- `MtlGamingDaySummaryDTO.max_single_in`
- `MtlGamingDaySummaryDTO.max_single_out`
- `MtlGamingDaySummaryDTO.total_volume`

**Do not count as surface debt:** `hold_percent`, `average_bet`, operator inputs, policy/config thresholds, loyalty points, or other non-currency unit systems. These remain bare-number carve-outs unless a new PRD supersedes the classification rules.

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
| 1.2B-A Canonicalization ✅ | `/backend-service-builder` (service layer) + `/api-builder` (contract alignment) | — |
| 1.2B-B Render Migration | `/frontend-design-pt-2` | — |
| 1.2B-C Contract Expansion | `/api-builder` (OpenAPI expansion + DEC-6 route test) | `/qa-specialist` (4-case test matrices) |
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
