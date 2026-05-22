---
id: PRD-070
title: Financial Telemetry — Wave 1 Phase 1.1 — Service Layer DTO Envelope
owner: Lead Architect (spec steward); backend engineers across 8 bounded contexts (implementation)
status: Draft
affects:
  - ADR-FINANCIAL-FACT-MODEL
  - ADR-FINANCIAL-SYSTEM-SCOPE
  - ADR-FINANCIAL-EVENT-PROPAGATION
  - ADR-FINANCIAL-AUTHORING-PARITY
  - SURFACE-RENDERING-CONTRACT
  - ROLLOUT-ROADMAP (Wave 1)
  - WAVE-1-PHASE-1.0-SIGNOFF
  - WAVE-1-CLASSIFICATION-RULES
  - WAVE-1-SURFACE-INVENTORY
  - WAVE-1-FORBIDDEN-LABELS §2.D (ACTIVE)
created: 2026-04-23
last_review: 2026-04-23
phase: Wave 1 Phase 1.1 — Service DTO Envelope Migration
pattern: (update — no new service, existing 8 bounded contexts updated)
http_boundary: false
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
handoff_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.0-SIGNOFF.md
adr_refs:
  - docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-FACT-MODEL.md
  - docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md
  - docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md
  - docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-AUTHORING-PARITY.md
standards_ref: docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
classification_rules_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md
surface_inventory_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
forbidden_labels_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
sdlc_category: DATA (service-layer DTO contracts)
pipeline_chain: /prd-writer (this doc) → /lead-architect EXEC-SPEC → /build-pipeline dispatching /backend-service-builder
gov010_status: waiver-pending  # ROLLOUT-ROADMAP + WAVE-1-PHASE-1.0-SIGNOFF supply scaffold-equivalent decomposition
---

# PRD-070 — Financial Telemetry — Wave 1 Phase 1.1 — Service Layer DTO Envelope

## 1. Overview

- **Owner:** Lead Architect (spec steward). Implementation shared across backend engineers in the 8 bounded contexts enumerated in §2.2.
- **Status:** Draft
- **Summary:** Phase 1.1 is the first implementation phase of the Financial Telemetry rollout, converting service-layer DTOs from bare `number` currency fields to the `FinancialValue` envelope frozen in `SURFACE-RENDERING-CONTRACT §10` and shipped in `types/financial.ts` (commit `ff9da699`). Phase 1.0 produced the governance artifacts (classification rules, surface inventory, forbidden-label taxonomy, exit-gate sign-off) that this PRD consumes directly. Phase 1.1 wraps currency-returning DTO fields across 8 bounded contexts, populates `type` / `source` / `completeness` at the service boundary via mappers, validates both sides of the service boundary with Zod schemas, and lands two breaking changes mandated by the Phase 1.0 sign-off: the `totalChipsOut` → `totalCashOut` rename in `services/rating-slip-modal/` (Q-A8) and the removal of dollar pre-conversion in visit-anchored DTO producers so envelopes carry canonical cents (Q-A6 + CLASSIFICATION-RULES §4). Phase 1.1 remains a service-led slice, but for DTOs already returned verbatim by existing route handlers or consumed directly by UI, the phase also includes the minimum directly coupled route/UI/test updates required to keep contracts truthful and the codebase compiling. No schema migration ships in Phase 1.1; broad API/OpenAPI and reusable UI migration still follow in Phases 1.2 and 1.3.
- **Pipeline Chain:** This PRD is drafted for `/lead-architect` EXEC-SPEC scaffolding. EXEC-SPEC production is the next step; `/build-pipeline` then dispatches `/backend-service-builder` per workstream. This PRD does NOT enumerate workstream IDs, task dependencies, or file-by-file diffs — those belong in EXEC-SPEC per `ROLLOUT-ROADMAP §2.5.4`.
- **Phase 1.0 governance inputs (authoritative):**
  - `actions/WAVE-1-PHASE-1.0-SIGNOFF.md` §4 — Phase 1.1 handoff prerequisites (primary spec input)
  - `actions/WAVE-1-CLASSIFICATION-RULES.md` — source → authority mapping (Accepted 2026-04-23)
  - `actions/WAVE-1-SURFACE-INVENTORY.md` — 8 services enumerated with per-field migration calls
  - `actions/WAVE-1-FORBIDDEN-LABELS.md` §2.D — `no-misleading-chips-identifier` ACTIVE
- **Envelope type (already shipped, do not redefine):** `types/financial.ts` exports `FinancialValue`, `FinancialAuthority`, `CompletenessStatus`. All mappers import from this canonical location.

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 service DTOs return bare `number` values for currency across 8 bounded contexts. The envelope type exists in `types/financial.ts`, but no service emits it. Consumers — API routes, UI components, downstream services — receive unlabeled cents-or-dollars numbers and must guess authority provenance (PFT ledger fact? Table-session operational estimate? Cash observation attestation? MTL compliance record?). This is precisely the "semantic drift at the surface" failure mode `SURFACE-RENDERING-CONTRACT §F1/§F2/§F3/§F4` forbids and `ADR-FINANCIAL-FACT-MODEL §D1` diagnoses: four distinct authority classes collapsed to a shared primitive at the boundary that renders them.

Until service DTOs emit the envelope, every downstream phase is blocked: Phase 1.2 cannot serialize an envelope that services do not produce; Phase 1.3 cannot consume a labeled value that the API does not carry; Phase 1.4 lint rules cannot assert envelope shape against bare numbers. Phase 1.1 is the origination point of the envelope contract; all downstream truth-telling flows through it.

Additionally, Phase 1.0 surfaced two live contract defects that Phase 1.1 must close:

1. **`services/rating-slip-modal/` `totalChipsOut` field** (Q-A8) — Name semantically implies `observed` (physical chip count); source is PFT (`actual` ledger). Every consumer reading this DTO has been misled by the identifier. Rename is a breaking change across DTOs, mappers, schemas, RPC return shape, and downstream consumers.

2. **Visit-anchored dollar pre-conversion at service boundary** (CLASSIFICATION-RULES §4 + Q-A6 rounding mandate) — Visit-facing DTOs (`session_total_buy_in`, `session_total_cash_out`, `session_net`, `total_buy_in`, `total_cash_out`, `net`) are still pre-divided by 100 before they reach consumers. In the live codebase this conversion spans `services/visit/` and `services/rating-slip/` producers, not a single file. The envelope's canonical unit is cents. Phase 1.1 must remove these conversions at every live producer of the visit-facing DTO contract.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1** — Every currency-returning DTO field across the 8 in-scope services is either wrapped in `FinancialValue` in Phase 1.1 or explicitly deferred to Phase 1.2 because it already flows through a pass-through route/UI contract and cannot be changed without the paired direct-consumer workstream; defined carve-outs (§2.3, §4) remain documented inline as bare numbers | Grep audit: no undocumented bare `number` currency fields remain in `services/{player-financial,rating-slip,rating-slip-modal,visit,mtl,table-context,loyalty,shift-intelligence}/dtos.ts`; any Phase 1.2 deferral is enumerated in EXEC-SPEC with owning consumer path(s) |
| **G2** — Mappers populate `type`, `source`, `completeness` at the service boundary per `WAVE-1-CLASSIFICATION-RULES §3` | Unit test coverage: one mapper test per mapped envelope asserts exact `type` + `source` pair and `completeness.status` per classification rules |
| **G3** — Zod schemas in `services/*/schemas.ts` validate envelope shape on both sides of the service boundary (inbound RPC response parsing + outbound DTO emission) | Schema suite runs against a fixture set covering `actual` / `estimated` / `observed` / `compliance` + `complete` / `partial` / `unknown` combinations; failures produce domain errors per `INV-ERR-DETAILS` |
| **G4** — The `totalChipsOut` → `totalCashOut` rename lands for `services/rating-slip-modal/` and every directly coupled consumer required by the Phase 1.0 sign-off | Grep audit: zero live-code occurrences of `totalChipsOut` in `services/`, `app/`, and `components/`; route/UI tests for the modal-data flow pass on `totalCashOut` |
| **G5** — Visit-facing DTO producers emit cents envelope directly; no dollar pre-conversion remains at the service boundary | Unit tests on all live producers of visit-facing DTOs assert `FinancialValue.value === row.cents_field` (no ÷100 at boundary); manual diff review confirms removed conversion logic from `services/visit/` and `services/rating-slip/` producer paths |
| **G6** — `pit_cash_observation.amount` dollar→cents mapper is implemented with pinned rounding behavior | Unit test suite pins `Math.round(dollars * 100)` semantics at boundary cases (at minimum: `0.005`, `0.015`, `0.025`, `-0.005`, `-0.015`); test name + assertion referenced in Wave 2 migration plan as the replication spec |
| **G7** — Shift-intelligence `MetricType` discriminator routes envelope authority deterministically; no "observed default" collapse (Q-A5) | Mapper contains a `metricType → FinancialAuthority` lookup; every enum value has an explicit entry; test covers each metric kind |
| **G8** — Methods that cannot determine completeness emit `status: 'unknown'` explicitly, never omitted | Lint / schema rejects envelopes missing `completeness.status`; test fixtures for `rating_slip.legacy_theo_cents`, theo-stub on player-360, shift baselines below sample-size threshold, and any gaming-day ambiguous boundary produce `'unknown'` explicitly |
| **G9** — `INV-ERR-DETAILS` compliance retained across all modified services; no `as any`; `safeErrorDetails()` used for domain-error wrapping | `npm run lint` clean; `npm run type-check` clean; grep audit finds zero `as any` or `details: error` in touched files |

### 2.3 Non-Goals

- **Broad API route-handler envelope rollout** (Phase 1.2 scope). Phase 1.1 does not attempt the full route-by-route serialization/OpenAPI migration planned for Phase 1.2. Exception: where a Phase 1.1 DTO change already flows through an existing route unchanged, the directly coupled route/test update ships in the same workstream so the codebase remains truthful and compiling.
- **OpenAPI spec updates** (Phase 1.2 scope). The `FinancialValue` OpenAPI component schema is defined once in Phase 1.2 and referenced across endpoints; per-endpoint schema diffs are Phase 1.2 work.
- **Broad UI migration to `<FinancialValue>` component** (Phase 1.3 scope). The `components/financial/FinancialValue.tsx`, `<AttributionRatio>`, and `<CompletenessBadge>` components are Phase 1.3 deliverables. Exception: where a Phase 1.1 DTO change already feeds a live component directly, the minimal compatibility update for that component ships in the same workstream; Phase 1.1 does not attempt the full visual migration.
- **Theo-stub UI treatment** (Phase 1.3 scope per Q-A7 sign-off). Phase 1.1 emits the envelope with `type: 'estimated'`, `source: "rating_slip.theo"`, `completeness.status: 'unknown'`. The badge text ("Not computed" / "Unknown" / "Pending"), visual weight, collapse-vs-render default, and tooltip content are `/frontend-design-pt-2` scope in Phase 1.3.
- **ESLint custom rules** `no-unlabeled-financial-value` and `no-forbidden-financial-label` (Phase 1.4 scope). Phase 1.1 does not ship lint enforcement; regression is prevented during Phase 1.1 by reviewer diligence + mapper, route-boundary, and directly coupled consumer tests.
- **Playwright DOM assertions** on currency surfaces (Phase 1.4 scope).
- **Schema migrations** (Wave 2 scope per `ROLLOUT-ROADMAP §2`). The `pit_cash_observation.amount` dollar→cents column migration is explicitly Wave 2 per Q-A6; Phase 1.1 implements the mapper-level conversion with pinned rounding test.
- **Class B authoring store consolidation** (Wave 2 open question per `ADR-FINANCIAL-FACT-MODEL §5`). Source strings are service-private in Phase 1.1 (normative rule N-2, CLASSIFICATION-RULES §3); Wave 2 may rename or consolidate without UI churn because UI consumes `type`, not `source`.
- **Compliance-domain authoring rules.** `compliance` envelopes carry the label for surface consistency per Q-A2 sign-off; this PRD does not open compliance-class authoring workflows.
- **Points unit system.** Loyalty `pointsDelta` / `currentBalance` / `balanceBefore` / `balanceAfter` / `points_redeemed` / `bonusPoints` remain bare numbers (CLASSIFICATION-RULES §6.3). Point labeling discipline is out of Wave 1 scope.
- **Policy / configuration values.** `CasinoThresholds`, `TableSettings` limits, `ValuationPolicy.centsPerPoint`, `EntitlementFulfillmentPayload.required_match_wager_cents` remain bare numbers (CLASSIFICATION-RULES §6.2).
- **Frozen ADR / SRC modifications.** If Phase 1.1 implementation surfaces a conflict with any frozen decision, the response is a superseding ADR per `ROLLOUT-ROADMAP §2` freeze discipline — not a patch. Reviewers MUST reject in-place edits to `decisions/ADR-FINANCIAL-*.md` or `actions/SURFACE-RENDERING-CONTRACT.md`.
- **Unbounded direct-coupling expansion.** The Phase 1.1 exception for directly coupled route/UI/test consumers is intentionally narrow. If EXEC-SPEC discovers blast radius beyond the already verified pass-through consumers named in this PRD, lead-architect review is mandatory before implementation proceeds. The default response is to move the additional contract work to Phase 1.2 unless the coupled change is required to keep Phase 1.1 truthful and compiling.

---

## 3. Users & Use Cases

- **Primary users:** Backend engineers in the 8 bounded contexts implementing DTO / mapper / schema updates. Downstream consumers (Phase 1.2 API layer engineers, Phase 1.3 UI engineers) depend on Phase 1.1 emitting the envelope contract before their phases open.
- **Secondary users:** Lead Architect (EXEC-SPEC scaffolding, Wave 1 exit gate review); `/qa-specialist` (Phase 1.4 validation planning consumes the shape established here); pit bosses / floor supervisors (ultimate end-users whose interpretability in Phase 1.5 depends on envelope fidelity all the way up the stack).

**Top Jobs:**

- As a **backend engineer implementing a Phase 1.1 mapper**, I need a single classification table I can consume mechanically to fix `type` + `source` + completeness strategy per DB source — without negotiating edge cases or re-deciding Phase 1.0 governance.
- As a **backend engineer consuming a cross-context DTO**, I need to rely on the envelope's `type` field as the authoritative discriminator for authority — never `source` string matching, never downstream re-classification.
- As the **Phase 1.2 API-layer engineer**, I need every financial-returning service to emit the envelope at its boundary so I can serialize it verbatim in route handlers without re-authoring classification logic at the API layer.
- As the **Phase 1.3 UI engineer**, I need the envelope to already carry `completeness.status` (including `'unknown'` where appropriate) by the time it reaches the rendering component, so UI never has to infer or default.
- As the **Phase 1.4 lint-rule author**, I need mapper unit tests to have pinned exact `type` + `source` pairs so my rules generate test expectations deterministically.
- As a **reviewer**, I need the rename and cents-transition breaking changes to land in isolated, reviewable commits with explicit tests — not buried in mass-migration diffs.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Workstream framing note.** Per `ROLLOUT-ROADMAP §2.5.4`, this section states capabilities — not workstream IDs. `/lead-architect` EXEC-SPEC scaffolding will decompose these into workstreams with IDs, dependencies, and bounded-context assignments. The table-of-eight below establishes the scope boundary and the two breaking changes; EXEC-SPEC chooses sequencing.

**Envelope migration (all 8 services):**

The 8 bounded contexts in scope, with their primary authority classes:

| # | Service path | Primary authority class(es) | Surface-inventory ref |
|---|--------------|------------------------------|-----------------------|
| 1 | `services/player-financial/` | `actual` (PFT ledger) | INVENTORY §3.1 |
| 2 | `services/rating-slip/` | `estimated` (theo) + non-wrapped inputs (`average_bet`) + `observed` (`pit_cash_observation`) | INVENTORY §3.2 |
| 3 | `services/rating-slip-modal/` | `actual` (PFT projection for modal) | INVENTORY §3.7 |
| 4 | `services/visit/` | `actual` (PFT rollups) + non-wrapped inputs | INVENTORY §3.3 |
| 5 | `services/mtl/` | `compliance` (MTL entries + gaming-day summaries) + non-wrapped policy config | INVENTORY §3.4 |
| 6 | `services/table-context/` | `estimated` (table-session / fill / credit / drop / need / inventory-derived win) + `observed` (opening/closing attestations, confirmed cash-obs) + non-wrapped policy bounds | INVENTORY §3.5 |
| 7 | `services/loyalty/` | `actual` (comp / entitlement face values) + `estimated` (loyalty theo) + non-wrapped points + non-wrapped policy ratios | INVENTORY §3.6 |
| 8 | `services/shift-intelligence/` | `estimated` (baselines) + metric-kind-routed (anomaly / alert `observedValue` per §4.2 Q-A5) | INVENTORY §3.8 |

**Per-service expectations (common across all 8):**

- Every currency-returning DTO field that `WAVE-1-SURFACE-INVENTORY §3.x` classifies as wrapped emits `FinancialValue` at the DTO boundary.
- Every carve-out field (§4.3 below) is documented as a bare `number` in JSDoc with reason + CLASSIFICATION-RULES cross-reference.
- Mapper populates `type`, `source`, `completeness.status` (and `completeness.coverage` where computable per CLASSIFICATION-RULES §5.2).
- Mapper applies unit normalization to cents per CLASSIFICATION-RULES §4 (pass-through where DB is cents; `Math.round(dollars * 100)` where DB is dollars).
- Mapper applies completeness decision tree per CLASSIFICATION-RULES §5.1.
- `services/*/schemas.ts` Zod schema validates envelope shape inbound and outbound. If the envelope shape is invariant across services, a shared Zod schema in a shared location (e.g., `types/financial.ts` adjacent) is permitted — EXEC-SPEC decides placement.
- Mapper unit tests assert (a) envelope shape compliance, (b) exact `type` + `source` per CLASSIFICATION-RULES §3, (c) completeness strategy applied correctly per lifecycle state / sample size / confirmation presence.
- `INV-ERR-DETAILS` retained: any error path through mapper uses `safeErrorDetails()` from `@/lib/errors/safe-error-details`; no `details: error` raw-Error passthroughs.

**Breaking change #1 — `totalChipsOut` → `totalCashOut` rename (Q-A8):**

- Scope: `services/rating-slip-modal/` — DTO (`dtos.ts:149`), Zod schema (`schemas.ts`), RPC return shape (`rpc.ts`), directly coupled route handler(s), directly coupled UI consumer(s), integration/route/UI tests asserting on the old identifier, and internal documentation referencing the old field.
- **Direct-coupling exception to the normal phase boundary.** The Phase 1.0 sign-off requires this rename to land with all consumers, and the live codebase currently passes the field through `app/` and `components/` unchanged. Therefore Phase 1.1 includes the minimum route/UI/test updates required for the rename to be real, while broader OpenAPI cleanup and generalized API migration remain Phase 1.2 scope.
- Transition window strategy: Phase 1.1 is a hard rename across the directly coupled modal-data flow in one change set. If compatibility is required for any non-modal downstream consumer discovered during EXEC-SPEC, the compatibility field must be explicit, dated, and removed in the Phase 1.2 API cleanup — not implied by leaving the old identifier live indefinitely.
- Post-Phase-1.1, `WAVE-1-FORBIDDEN-LABELS §2.D` rule `no-misleading-chips-identifier` (ACTIVE per sign-off) prevents regression once Phase 1.4 lands ESLint enforcement. In the interim between Phase 1.1 and Phase 1.4, reviewer diligence prevents regression.

**Breaking change #2 — Visit service cents canonicalization (CLASSIFICATION-RULES §4 + Q-A6):**

- Scope: every live producer of the visit-facing DTO contract that currently pre-divides by 100 before values reach consumers. Verified code references include `services/visit/crud.ts` for `RecentSessionDTO`/`open_visit` and `services/rating-slip/mappers.ts` for `VisitLiveViewDTO`; EXEC-SPEC must enumerate any remaining visit-facing producers before implementation begins.
- Post-change: these fields emit `FinancialValue` with `value` in cents (DB-unit pass-through), consistent with every other cents-native field across the 8 services.
- Because some visit-facing DTOs are already returned verbatim by existing routes, Phase 1.1 includes the minimum directly coupled route/test updates required for those producers. Full route-by-route/OpenAPI migration still belongs to Phase 1.2.

**Dollar→cents rounding-test pinning (Q-A6 mandate):**

- `services/rating-slip/` (and any other service that consumes `pit_cash_observation.amount`) — mapper converts dollars → cents at envelope boundary via `Math.round(dollars * 100)`.
- Unit test MUST pin rounding behavior at boundary cases. At minimum, the following test fixtures are mandatory (EXEC-SPEC may add more):
  - `0.005` dollars → cents
  - `0.015` dollars → cents
  - `0.025` dollars → cents
  - `-0.005` dollars → cents
  - `-0.015` dollars → cents
  - `0` dollars → `0` cents
  - Non-round values that exercise JavaScript floating-point behavior (e.g., `0.1 + 0.2 = 0.30000000000000004`) — the fixture set MUST document the actual emitted cents for each input as the normative test, not a theoretical value.
- The pinned test is the **replication spec for Wave 2**: the Wave 2 `pit_cash_observation.amount` schema migration will either replicate these semantics verbatim or intentionally change them with a documented rationale. Without a pinned test, Wave 2 cannot distinguish preserved-vs-changed behavior.
- The test file location + test-case names MUST be referenced in Wave 2 prep documentation (`WAVE-2-PREP-DECISIONS.md` when drafted).

**Shift-intelligence metric-kind authority routing (Q-A5 — resolved below as §4.2):**

See §4.2 — resolution confirms Option A (discriminator exists; lookup table is implementable without schema change).

### 4.2 Q-A5 Resolution — Shift-Intelligence Metric-Kind Authority Routing

**Sign-off §4.5 left Phase 1.1 PRD to decide:** does `services/shift-intelligence/` need a metric-kind discriminator column to route `AnomalyAlertDTO.observedValue` / `ShiftAlertDTO.observedValue` authority?

**Inspection of `services/shift-intelligence/dtos.ts` (verified 2026-04-23):**

The discriminator **already exists** as `MetricType` on `BaselineDTO`, `AnomalyAlertDTO`, and `ShiftAlertDTO`:

```ts
export type MetricType =
  | 'drop_total'
  | 'hold_percent'
  | 'cash_obs_total'
  | 'win_loss_cents';
```

**Decision: Option A — lookup table. No schema change, no column addition.** Phase 1.1 mapper contains an exhaustive `metricType → { type, source }` lookup:

| `MetricType` value | `FinancialAuthority` | `FinancialValue.source` | Wrap? | Notes |
|--------------------|-----------------------|--------------------------|-------|-------|
| `'drop_total'` | `'estimated'` | `"table_session.drop"` | Yes (currency, cents) | Class B; mirrors CLASSIFICATION-RULES §3.2 table-session drop row. |
| `'hold_percent'` | — | — | **No** | Non-currency ratio (percentage). Bare `number` with JSDoc note per CLASSIFICATION-RULES §6.3 principle extended to ratios. `observedValue` / `medianValue` / `madValue` / `minValue` / `maxValue` / `thresholdValue` remain bare when `metricType === 'hold_percent'`. |
| `'cash_obs_total'` | `'estimated'` (default) | `"pit_cash_observation.extrapolated"` (default) | Yes (currency, cents) | Default maps to extrapolated rollup. EXEC-SPEC MUST verify whether the underlying baseline RPC pulls from `cash_out_observed_estimate_total` (extrapolated → `estimated`) or `cash_out_observed_confirmed_total` (confirmed → `observed`). If the RPC exposes both separately, the metric enum may need one value per source (out-of-scope schema change, see below); if the RPC aggregates both into a single `cash_obs_total`, Pattern B "worst-of" applies → authority `estimated`. |
| `'win_loss_cents'` | `'estimated'` | `"table_session.inventory_win"` | Yes (currency, cents) | Composite; Pattern B in UI per CLASSIFICATION-RULES §3.2 `table_win_cents` row. |

**Non-currency metric handling (`hold_percent`):** a metric-kind-discriminated DTO where some values are currency and some are ratios cannot force all values into `FinancialValue` without type laundering. Two implementation options were evaluated:

- **Option A1:** Public DTO union (`FinancialValue | number`) on the current alert/baseline contract, with directly coupled route/UI/test updates in the same Phase 1.1 workstream.
- **Option A2:** `FinancialValue` always, including ratios. Rejected because it violates CLASSIFICATION-RULES §6.3 and lies about units.

**Chosen path:** Phase 1.1 defines and tests the `metricType → { type, source }` lookup now, but any public DTO union or envelope change for shift-intelligence fields that currently flow unchanged through route handlers is gated behind the same direct-coupling rule as the other Phase 1.1 exceptions. EXEC-SPEC must either (a) bundle the route/UI/test updates in the same workstream, or (b) defer the public-field shape change to the Phase 1.2 API slice while still landing the lookup helper, classification tests, and internal mapper preparation in Phase 1.1.

**Residual uncertainty to resolve during EXEC-SPEC:** whether the baseline RPC computes `cash_obs_total` from extrapolated-only, confirmed-only, or combined cash-obs rollups. EXEC-SPEC MUST inspect the baseline-computation RPC (in `services/shift-intelligence/baseline.ts` and its underlying Supabase RPC) to verify the source field, then:

- If source is extrapolated-only → authority `estimated`, source `"pit_cash_observation.extrapolated"` (current PRD default).
- If source is confirmed-only → authority `observed`, source `"pit_cash_observation.confirmed"` — update PRD table.
- If source is both combined → Pattern B worst-of → authority `estimated`, source indicates composite (EXEC-SPEC names the source string).
- If source requires splitting → EXEC-SPEC flags a potential scope expansion to the `MetricType` enum; escalate to lead-architect before proceeding.

This residual question does NOT block PRD sign-off — the default mapping is safe, and EXEC-SPEC handles the RPC inspection as a discovery step. Should the inspection require splitting `cash_obs_total` into two enum values, that is a schema change that remains within Wave 1's "additive only" allowance (`ROLLOUT-ROADMAP §2` principle 2) but MUST be flagged for lead-architect approval before implementation.

### 4.3 Non-Wrapping Carve-Outs (bare-number fields with mandatory JSDoc)

Per CLASSIFICATION-RULES §6, the following fields remain bare `number` in DTOs. Each service's DTO file MUST document these fields with JSDoc including:

1. Why the field is not wrapped (one of: operator input, policy/config, non-currency unit, metric-kind ratio).
2. Cross-reference to `WAVE-1-CLASSIFICATION-RULES.md §6.x`.
3. UI-layer expectation (label as "Input", "Draft", "Threshold", "Ratio", etc. — Phase 1.3 enforces).

**Operator inputs (CLASSIFICATION-RULES §6.1):**

- `RatingSlipDTO.average_bet` and all other surfacings (`RatingSlipWithPlayerDTO.average_bet`, `ActivePlayerForDashboardDTO.averageBet`, `ClosedSlipForGamingDayDTO.average_bet`, `CurrentSegment.current_segment_average_bet`, `LastSessionContextDTO.last_average_bet`)
- All `CreateXInput` amount fields: `CreateFinancialTxnInput.amount`, `CreateMtlEntryInput.amount`, `RequestTableFillInput.amountCents`, `RequestTableCreditInput.amountCents`, `ActivateTableSessionParams.openingTotalCents`, `PostTableDropTotalInput.dropTotalCents`, `CreatePitCashObservationInput.amount`, `UpdateAverageBetInput.average_bet`, `UpdateTableLimitsDTO.min_bet`, `UpdateTableLimitsDTO.max_bet`, `UpdateValuationPolicyInput.centsPerPoint`, `RedeemInput.points`, `ManualCreditInput.points`, `ApplyPromotionInput.bonusPoints`, `AcknowledgeAlertInput.*` (non-currency fields), etc.

**Policy / configuration (CLASSIFICATION-RULES §6.2):**

- `CasinoThresholds.watchlistFloor`
- `CasinoThresholds.ctrThreshold`
- `TableSettingsDTO.min_bet` / `max_bet`
- `ValuationPolicyDTO.centsPerPoint`
- `EntitlementFulfillmentPayload.required_match_wager_cents`
- `AnomalyAlertDTO.thresholdValue` (shift-intelligence policy bound)
- `ShiftAlertDTO` threshold-related fields

**Non-currency units — points (CLASSIFICATION-RULES §6.3):**

All loyalty-service point-denominated fields: `LoyaltyLedgerEntryDTO.pointsDelta`, `PlayerLoyaltyDTO.currentBalance`, `AccrueOnCloseOutput.pointsDelta` / `balanceAfter`, `RedeemOutput.pointsDelta` / `balanceBefore` / `balanceAfter`, `ManualCreditOutput.pointsDelta` / `balanceAfter`, `ApplyPromotionOutput.promoPointsDelta`, `CompIssuanceResult.pointsDebited` / `balanceBefore` / `balanceAfter`, `CompFulfillmentPayload.points_redeemed` / `balance_after`.

**Non-currency metric kind — hold percent (§4.2):**

Shift-intelligence DTO fields (`observedValue`, `medianValue`, `madValue`, `minValue`, `maxValue`, `thresholdValue`) when the companion `metricType === 'hold_percent'`.

### 4.3A Verified Direct-Coupling Blast Radius (must seed EXEC-SPEC tables)

The following consumers are already verified in the live codebase and form the **minimum** direct-coupling inventory for Phase 1.1 exceptions. EXEC-SPEC must reproduce this inventory as workstream-scoped blast-radius tables and may add to it only via the escalation rule in §2.3 / NFR-7.

| Contract change | Producer / owner | Verified pass-through consumers | Verification status |
|-----------------|------------------|----------------------------------|---------------------|
| `FinancialSectionDTO.totalChipsOut` → `totalCashOut` | `services/rating-slip-modal/` | `services/rating-slip-modal/rpc.ts`, `services/rating-slip-modal/schemas.ts`, `app/api/v1/rating-slips/[id]/modal-data/route.ts`, `components/modals/rating-slip/rating-slip-modal.tsx`, `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts`, `services/rating-slip-modal/__tests__/rpc*.ts`, `services/rating-slip-modal/__tests__/bff-aggregation.test.ts` | Verified 2026-04-23 by code search |
| `RecentSessionDTO.total_buy_in` / `total_cash_out` / `net` cents-envelope migration | `services/visit/crud.ts` | `app/api/v1/players/[playerId]/recent-sessions/route.ts`, `components/player-sessions/start-from-previous.tsx`, `services/visit/__tests__/visit-continuation*.ts` | Verified 2026-04-23 by code search |
| `VisitLiveViewDTO.session_total_buy_in` / `session_total_cash_out` / `session_net` cents-envelope migration | `services/rating-slip/mappers.ts` | `app/api/v1/visits/[visitId]/live-view/route.ts`, `services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts` | Verified 2026-04-23 by code search |

Any additional consumer discovered during EXEC-SPEC is **not** silently in scope. It triggers the escalation rule in §2.3 and NFR-7.

### 4.3B Minimum Direct-Coupling Test Matrix (must seed EXEC-SPEC tables)

Phase 1.1 does not permit generic “update tests as needed” treatment for pass-through contracts. EXEC-SPEC must include, at minimum, the following path-level test rows:

| Contract change | Minimum route-boundary tests | Minimum directly coupled UI/component tests |
|-----------------|------------------------------|--------------------------------------------|
| `totalCashOut` rename | `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts`; `services/rating-slip-modal/__tests__/rpc.test.ts`; `services/rating-slip-modal/__tests__/rpc-contract.test.ts`; `services/rating-slip-modal/__tests__/rpc-security.test.ts`; `services/rating-slip-modal/__tests__/bff-aggregation.test.ts` | Modal consumer coverage for `components/modals/rating-slip/rating-slip-modal.tsx` via its existing routed/modal test harness or an equivalent component-level test added in the same workstream |
| `RecentSessionDTO` cents-envelope migration | Route-boundary coverage for `app/api/v1/players/[playerId]/recent-sessions/route.ts`; service coverage in `services/visit/__tests__/visit-continuation.test.ts` and `services/visit/__tests__/visit-continuation.integration.test.ts` | Consumer coverage for `components/player-sessions/start-from-previous.tsx` or its owning feature test harness |
| `VisitLiveViewDTO` cents-envelope migration | Route-boundary coverage for `app/api/v1/visits/[visitId]/live-view/route.ts`; producer coverage in `services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts` | No dedicated live component was verified in this review; if EXEC-SPEC identifies one, it must add the paired consumer test row before implementation |
| Shift-intelligence public DTO shape change (only if kept in Phase 1.1) | `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts`; route-boundary coverage for `app/api/v1/shift-intelligence/anomaly-alerts/route.ts` and any other affected `app/api/v1/shift-intelligence/*` handler | `components/shift-intelligence/anomaly-alert-card.tsx` and any dashboard/admin consumer that reads the changed field shape directly |

If EXEC-SPEC chooses Phase 1.2 deferral for any of these public DTO changes, the corresponding test row moves with the deferral record and Phase 1.1 must not claim that field as complete.

### 4.4 Mandatory `completeness.status: 'unknown'` Targets (CLASSIFICATION-RULES §5.3)

Phase 1.1 mappers MUST emit `status: 'unknown'` explicitly (never omit, never default to `'complete'`) for:

- **`rating_slip.legacy_theo_cents`** (rating-slip service) — legacy provenance unrecoverable; always `'unknown'`.
- **Theo-stub on `components/player-360/summary/summary-band.tsx`** (Q-A7 resolution) — emit envelope with `type: 'estimated'`, `source: "rating_slip.theo"`, `completeness.status: 'unknown'` wherever the field is populated in the mapper (likely the visit or player-360 projection mapper — EXEC-SPEC identifies exact location). UI rendering treatment (badge text, collapse behavior) is Phase 1.3.
- **Ambiguous-boundary gaming-day aggregates** — MTL gaming-day summary fields during a gaming-day rollover or when `rpc_current_gaming_day()` lifecycle signals uncertainty. Mapper reads the boundary signal; where uncertain → `'unknown'`.
- **Shift-intelligence baselines below sample-size threshold** — `BaselineDTO.medianValue` / `minValue` / `maxValue` when `sampleCount` is below the threshold Phase 1.1 establishes. EXEC-SPEC sets the threshold (a starting proposal: sample size < 5 → `'unknown'`; sample size 5–14 → `'partial'`; sample size ≥ 15 → `'complete'`). Final threshold is an EXEC-SPEC deliverable with lead-architect review.
- **Confirmed-null fields** — e.g., `table_fill.confirmed_amount_cents IS NULL` → envelope `status: 'unknown'` rather than propagating `null` as a value. `value` field in this case requires an EXEC-SPEC decision: emit `value: 0` with `status: 'unknown'` (misleading zero) vs. emit the requested `value` with `status: 'unknown'` (confirmed-pending). Recommended path: emit the **requested** amount as `value` with `status: 'unknown'` — this represents "we asked for X cents; confirmation pending." Mapper JSDoc documents this convention.

### 4.5 Out-of-Phase Theo Stub Removal (product decision, not architectural)

Per Q-A7 sign-off interim-violation handling, product may elect to patch the `Theo: 0` violation out-of-phase by removing the theo field from `services/visit/mappers.ts:179` and `components/player-360/summary/summary-band.tsx:137` before Phase 1.3 lands the envelope-unknown treatment. This is a **product-impact call**, not an architectural one — Phase 1.1 EXEC-SPEC does NOT decide it. If such a patch lands before Phase 1.1 completes, Phase 1.1 reintroduces the field with the envelope-unknown treatment per §4.4.

EXEC-SPEC MUST verify the current state of the theo field during scaffolding and account for either possibility (field present → wrap with envelope-unknown; field removed → reintroduce with envelope-unknown). No separate EXEC-SPEC workstream is needed for this — it is a branch condition within the service-specific workstream for `services/visit/` (or wherever the mapper producing the stub lives).

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1** — Every currency-returning DTO field in the 8 in-scope services either (a) emits `FinancialValue` with populated `type`, `source`, `completeness` per `WAVE-1-CLASSIFICATION-RULES §3`, (b) is documented as a bare-number carve-out per §4.3 with mandatory JSDoc, or (c) is explicitly deferred to the Phase 1.2 API slice because it already flows through a pass-through route/UI contract and the paired consumer workstream is not bundled into Phase 1.1.

**FR-2** — Mapper logic for each envelope-emitting field MUST apply the `WAVE-1-CLASSIFICATION-RULES §5.1` completeness decision tree. Outputs MUST match the per-field completeness strategy listed in `WAVE-1-SURFACE-INVENTORY §3.x`.

**FR-3** — Mappers converting dollars → cents MUST use `Math.round(dollars * 100)` (never `Math.floor` / `Math.trunc` / bit-shift). The conversion is explicit and commented in-source.

**FR-4** — Live producers of visit-facing DTOs no longer pre-divide by 100. Envelope `value` is cents pass-through from the source column, and verified producer paths in `services/visit/` and `services/rating-slip/` are both updated.

**FR-5** — `services/rating-slip-modal/` DTO field `totalChipsOut` is renamed to `totalCashOut` across the directly coupled modal-data flow. DTO, schema, RPC, route handler, live UI consumer, and tests reference the new identifier.

**FR-6** — Shift-intelligence mappers contain an exhaustive `MetricType → { type, source }` lookup per §4.2. Adding a new `MetricType` enum value (out-of-scope for Phase 1.1) MUST require an exhaustiveness-check type error.

**FR-7** — Zod schemas validate envelope shape on both sides of the service boundary. An invalid envelope (missing `type`, missing `completeness.status`, non-enum `type` or `status`, non-integer `value`) produces a domain error wrapped via `safeErrorDetails()` per `INV-ERR-DETAILS`.

**FR-8** — Every mapper emitting an envelope has a unit test asserting exact `type` + `source` + `completeness.status` per `WAVE-1-CLASSIFICATION-RULES §3`. Tests use fixture data, not live RPC calls.

**FR-9** — Dollar→cents mapper unit tests pin rounding at the boundary cases enumerated in §4.1. Test file location and case names are documented in-source for Wave 2 migration reference.

**FR-10** — Any DTO field deferred to Phase 1.2 under the pass-through-contract exception MUST be recorded in EXEC-SPEC with: the exact field name, owning service path, owning route/UI consumer path(s), owner, required paired tests, and planned Phase 1.2 cleanup workstream.

### 5.2 Non-Functional Requirements

**NFR-1** — `npm run type-check` passes across the repo after Phase 1.1 changes.

**NFR-2** — `npm run test` green for new and existing unit tests (no regressions in existing service tests).

**NFR-3** — `npm run lint` clean; zero `as any`; zero `details: error` passthroughs outside `safeErrorDetails()`.

**NFR-4** — Per-mapper envelope marshaling overhead is acceptable at pilot scale (per `ROLLOUT-ROADMAP §8` non-goal on envelope performance optimization). No benchmarking required for Phase 1.1 exit.

**NFR-5** — Service-layer changes preserve cross-context DTO boundaries per SRM. No cross-context raw-row reads introduced; cross-context consumption remains DTO-only even when Phase 1.1 must update directly coupled route/UI consumers.

**NFR-6** — Breaking changes (FR-4, FR-5) land in reviewable commits with explicit test evidence. EXEC-SPEC sequences them in dedicated workstreams.

**NFR-7** — Direct-coupling exceptions remain bounded. If a Phase 1.1 workstream touches pass-through consumers beyond the verified blast-radius inventory captured in this PRD and its EXEC-SPEC tables, implementation pauses for lead-architect scope review rather than silently absorbing Phase 1.2 work.

---

## 6. UX / Flow Overview

Phase 1.1 is a service-led migration. Broad API/OpenAPI and reusable UI migration remain later phases, but the flows below include the narrow directly coupled exceptions required to keep currently pass-through contracts truthful and compiling.

- **Flow 1 — Backend engineer mapper update:** Engineer reads `WAVE-1-CLASSIFICATION-RULES §3` to find the source row, copies the `source` string and `type` authority into the mapper, applies §5.1 completeness decision tree, writes unit test asserting `type` + `source` + `completeness.status`, lands the PR.
- **Flow 2 — Cross-context DTO consumption:** Upstream service (e.g., visit) emits envelope; downstream service (e.g., rating-slip-modal) consumes via published DTO. Consumer reads `type` field to branch authority-aware logic; consumer does NOT match on `source` string (normative rule N-2).
- **Flow 3 — Rating-slip-modal rename consumer sweep:** `services/rating-slip-modal/` renames `totalChipsOut` → `totalCashOut` in DTO, schema, and RPC; the directly coupled modal-data route, live modal component, and their tests update in the same PR.
- **Flow 4 — Visit cents transition:** Verified visit-facing producers drop ÷100 in both `services/visit/` and `services/rating-slip/`. Where those DTOs already flow through routes unchanged, the minimal route-boundary updates ship in the same workstream.
- **Flow 5 — Shift-intelligence `MetricType` routing:** Mapper logic receives a row with `metricType` + value fields and applies the §4.2 lookup. If the chosen DTO shape change would alter a currently pass-through route/UI contract, EXEC-SPEC must either bundle the directly coupled consumer updates in the same workstream or defer the public-field shape change to Phase 1.2.
- **Flow 6 — Phase handoff to 1.2:** Phase 1.1 exit gate met → Phase 1.2 PRD drafted. API routes in Phase 1.2 consume the envelope verbatim from services and serialize at the wire; no re-classification at the API layer.

---

## 7. Dependencies & Risks

### 7.1 Dependencies (must exist before Phase 1.1 implementation begins)

- **Phase 1.0 exit gate passed** ✅ (passed 2026-04-23; `WAVE-1-PHASE-1.0-SIGNOFF.md`).
- **`types/financial.ts` merged to `ref/financial-standard` branch** ✅ (commit `ff9da699`).
- **Classification rules in Accepted status** ✅ (`WAVE-1-CLASSIFICATION-RULES.md` — Accepted 2026-04-23).
- **Surface inventory reviewed** ✅ (sign-off §3 table confirms).
- **Forbidden-label taxonomy published with §2.D ACTIVE** ✅ (`WAVE-1-FORBIDDEN-LABELS.md` §2.D rule `no-misleading-chips-identifier`).
- **This PRD approved** — pending this document's sign-off.
- **EXEC-SPEC drafted** — next step after PRD approval; `/lead-architect` scaffolding role produces workstream IDs, dependencies, bounded-context assignments.
- **`INV-ERR-DETAILS` patterns stable** ✅ (per CLAUDE.md / MEMORY.md: `@/lib/errors/safe-error-details`, lint rule enforces).

### 7.2 Risks

Pulled from `ROLLOUT-ROADMAP §7` risk table and scoped to Phase 1.1 service-layer work.

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Type-level envelope drift between services** — different mappers populate `type` / `source` / `completeness` inconsistently | Medium | Medium | Single source-of-truth `types/financial.ts` + Zod schema shared across services. Classification rules are the normative per-field table; unit tests assert exact `source` strings. |
| **`rating-slip-modal` rename blast radius larger than anticipated** — integration tests, route handlers, or UI consumers not yet enumerated break on rename | Medium | High | EXEC-SPEC enumerates all live-code consumers before rename commits land. Grep audit for `totalChipsOut` across `services/`, `app/`, and `components/` produces the full blast list during EXEC-SPEC. Single rename PR with co-located direct-consumer updates. |
| **Visit-facing cents transition breaks directly coupled consumers** assuming dollars | Medium | Medium | EXEC-SPEC enumerates all verified producers and pass-through consumers during scaffolding. Unit and route-boundary tests on all affected consumers update simultaneously. Full OpenAPI migration still waits for Phase 1.2. |
| **Direct-coupling exception grows into hidden Phase 1.2 work** — additional pass-through API/UI consumers are discovered mid-implementation and absorbed without review | Medium | High | EXEC-SPEC must enumerate every Phase 1.1 exception as a blast-radius table with owner + tests. Any newly discovered consumer beyond that table triggers lead-architect review before implementation continues. |
| **Shift-intelligence `cash_obs_total` routing ambiguity** — RPC source (extrapolated vs confirmed) unclear until EXEC-SPEC RPC inspection | Low | Low | §4.2 residual-uncertainty clause: default to `estimated` / extrapolated; EXEC-SPEC verifies and corrects before implementation. If correction requires splitting the `MetricType` enum, escalate to lead-architect before proceeding. |
| **`completeness.status: 'unknown'` threshold for shift baselines** — threshold choice (e.g., `sampleCount < 5`) is arbitrary and may surface operator confusion | Medium | Low | EXEC-SPEC sets threshold with lead-architect review. Initial threshold is conservative; Phase 1.5 operator UX testing tightens or loosens it based on pit-boss feedback. |
| **Dollar→cents rounding test fixtures produce platform-dependent results** — JavaScript floating-point means `Math.round(0.015 * 100)` can emit `1` or `2` depending on IEEE 754 representation | Medium | Low | Test fixtures pin the **actual observed** emitted cents as the normative value, not a theoretical-ideal rounding. In-source comment documents this as Wave 2 migration replication spec. |
| **Compliance-class envelope misuse** — consumer aggregates `compliance` MTL totals with Class A/B values | Medium | Medium | Normative rule N-1 (CLASSIFICATION-RULES §3) prohibits this aggregation. Phase 1.3 verifies via lint / Playwright assertion. Phase 1.1 mapper docs reinforce via JSDoc. |
| **Freeze-rule pressure during Phase 1.1** — team encounters an edge case and wants to patch a frozen ADR / SRC clause | Medium | High | Any such conflict routes through supersession (new ADR), not patch. Lead-architect gate during EXEC-SPEC review. Governance reminder is explicit in this PRD §2.3 Non-Goals. |
| **Envelope type drift between Phase 1.1 DTOs and Phase 1.2 API schemas** — if OpenAPI component schema is authored in Phase 1.2 with slight structural divergence | Low | Medium | Phase 1.2 PRD MUST cite `types/financial.ts` as the authoritative envelope source; OpenAPI `FinancialValue` component schema is a mechanical translation, not a re-authored contract. |

### 7.3 Open Questions (non-blocking; resolved during EXEC-SPEC or deferred)

- **Q-070.1** — `services/shift-intelligence/` `cash_obs_total` baseline RPC source verification (extrapolated / confirmed / combined). §4.2 defaults to extrapolated; EXEC-SPEC verifies. Escalation to lead-architect only if split is required.
- **Q-070.2** — Shift-baseline `sampleCount` threshold for `'unknown'` / `'partial'` / `'complete'` completeness. Initial proposal: `< 5` → `'unknown'`, `5–14` → `'partial'`, `≥ 15` → `'complete'`. EXEC-SPEC finalizes with lead-architect review.
- **Q-070.3** — Zod schema placement: shared `types/financial.ts` extension vs. per-service `schemas.ts` re-declaration vs. shared `services/_shared/financial-envelope-schema.ts`. EXEC-SPEC decides; lead-architect approves.
- **Q-070.4** — Full visit-facing producer/consumer list for FR-4 (`services/visit/`, `services/rating-slip/`, and any directly coupled route consumers). EXEC-SPEC enumerates during scaffolding.
- **Q-070.5** — `rating-slip-modal` rename blast radius full enumeration across `services/`, `app/`, and `components/`. EXEC-SPEC grep-audits during scaffolding.

### 7.4 Pre-Workstream Gates (must resolve before implementation starts)

The following are no longer discretionary “open questions.” They are explicit pre-workstream gates. Phase 1.1 implementation must not begin until they are resolved in EXEC-SPEC and reviewed by lead-architect where noted.

- **GATE-070.6 — Shift-intelligence Phase split.** EXEC-SPEC must declare which public shift-intelligence DTO fields ship in Phase 1.1 and which defer to Phase 1.2, plus the owning route/UI consumer path(s) and paired tests for each deferred field.
- **GATE-070.7 — `totalCashOut` compatibility alias policy.** If any non-modal downstream consumer requires a temporary compatibility alias, EXEC-SPEC must record the exact alias field, affected consumer path(s), approval owner, and dated Phase 1.2 cleanup workstream before implementation starts. Default is **no alias**.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All 8 services' DTOs either emit `FinancialValue` for every currency-returning field not explicitly carved out (§4.3) or carry an explicit Phase 1.2 deferral record for any pass-through public contract that cannot be changed without bundled direct-consumer work
- [ ] Mappers populate `type`, `source`, `completeness.status` (and `coverage` where computable) per `WAVE-1-CLASSIFICATION-RULES §3`
- [ ] `totalChipsOut` → `totalCashOut` rename lands across the directly coupled modal-data flow; grep audit finds zero remaining live-code `totalChipsOut` in `services/`, `app/`, and `components/`
- [ ] Verified visit-facing DTO producers emit cents envelope directly; no ÷100 pre-conversion remains at the service boundary in `services/visit/` or `services/rating-slip/`
- [ ] Shift-intelligence `MetricType → FinancialAuthority` lookup implemented per §4.2; all 4 enum values routed; `cash_obs_total` RPC source verified in EXEC-SPEC
- [ ] `completeness.status: 'unknown'` emitted explicitly for all §4.4 targets (legacy theo, theo stub, ambiguous gaming-day boundaries, baselines below sample-size threshold, confirmed-null fields)

**Data & Integrity**
- [ ] Dollar→cents mapper for `pit_cash_observation.amount` converts via `Math.round(dollars * 100)`; pinned rounding test covers boundary cases (§4.1 enumeration)
- [ ] Zod schemas validate envelope shape on both sides of the service boundary; invalid envelopes produce domain errors via `safeErrorDetails()`
- [ ] No cross-authority aggregation introduced at the service layer (normative rule N-1 / SRC §C1 preserved)
- [ ] `compliance`-class envelopes isolated from Class A/B values in every mapper (no derived rollups combining authorities)

**Security & Access**
- [ ] RLS posture unchanged — Phase 1.1 is a DTO-shape migration, not a security boundary change. No new `SECURITY DEFINER` RPCs, no context-derivation changes.
- [ ] `INV-ERR-DETAILS` retained: zero `as any`, zero `details: error` passthroughs outside `safeErrorDetails()`

**Testing**
- [ ] Unit test per envelope-emitting mapper asserting exact `type` + `source` + `completeness.status` per classification rules
- [ ] Unit tests for dollar→cents conversion pin rounding at boundary cases (§4.1 list minimum)
- [ ] Unit tests for `MetricType → authority` lookup cover all 4 enum values
- [ ] Unit tests for `completeness.status: 'unknown'` cover all §4.4 target cases
- [ ] Existing unit test suites for all 8 services updated to reflect envelope shape (no regressions)
- [ ] Route-boundary tests updated anywhere a Phase 1.1 DTO change already flows through an existing handler unchanged
- [ ] Directly coupled UI/component tests updated anywhere a Phase 1.1 rename or DTO shape change already feeds a live component unchanged
- [ ] EXEC-SPEC contains a route-boundary test table for every Phase 1.1 DTO change that already passes through a live handler unchanged
- [ ] EXEC-SPEC contains a UI/component test table for every directly coupled Phase 1.1 rename or DTO shape change that already feeds a live component unchanged
- [ ] Any DTO field deferred to Phase 1.2 has an explicit failing-forward note in EXEC-SPEC naming the owning route/UI consumer and the required paired tests

**Operational Readiness**
- [ ] `npm run type-check` passes
- [ ] `npm run test` green (new tests + no regression in existing)
- [ ] `npm run lint` clean
- [ ] Rollback plan: envelope migration is additive at the type level (existing fields wrapped, not removed — except the `totalChipsOut` rename which IS a breaking shape change). The rename rollback is a revert PR; the envelope wrap rollback is a per-service revert PR. No data migration, no schema change, no state persistence — full revert path is git-only.
- [ ] Rollback plan identifies which directly coupled route/UI updates are paired to each Phase 1.1 DTO change so revert scope is explicit rather than inferred
- [ ] EXEC-SPEC contains a rollback matrix mapping each Phase 1.1 DTO change to its paired route/UI/test files and revert owner

**Documentation**
- [ ] Each updated `services/*/dtos.ts` carries JSDoc on carve-out fields per §4.3 (reason + CLASSIFICATION-RULES cross-ref + UI expectation)
- [ ] Each updated mapper has in-source comments documenting dollar→cents conversion convention and pinned test reference where applicable
- [ ] `ROLLOUT-PROGRESS.md` Phase 1.1 row updated: PRD checkbox checked (this PRD landing), EXEC-SPEC checkbox pending
- [ ] `ROLLOUT-PROGRESS.md` Change Log entry appended dated 2026-04-23 for this PRD's landing

**Surface Governance** *(not applicable — Phase 1.1 introduces no new UI surfaces; surface classification is Phase 1.3 scope)*

**Phase Gate Handoff**
- [ ] Phase 1.1 exit gate per `ROLLOUT-ROADMAP §3 Phase 1.1` met
- [ ] Handoff package to Phase 1.2 PRD author includes: updated DTO contracts (inputs to OpenAPI component schema), service-layer consumer list for rename propagation to API layer, visit-service cents-transition notes for API-layer consumer updates
- [ ] Before any Phase 1.1 workstream starts, EXEC-SPEC enumerates every Phase 1.2 deferral with exact field name, owning service, owning route/UI consumer path(s), owner, required paired tests, and cleanup workstream
- [ ] Before any direct-coupling exception workstream starts, EXEC-SPEC records the verified blast-radius table and the escalation rule: newly discovered consumers beyond that table require lead-architect approval
- [ ] Before any shift-intelligence workstream starts, GATE-070.6 is resolved in EXEC-SPEC with an explicit keep-vs-defer decision for every affected public DTO field
- [ ] Before any rename workstream starts, GATE-070.7 is resolved in EXEC-SPEC if an alias is proposed; otherwise EXEC-SPEC records “no alias approved”

---

## 9. Related Documents

### Canonical decisions (frozen)

- `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-FACT-MODEL.md` — §D1 four authorities, §D3 Class A/B scope, §D4 taxonomy, §5 open questions for Wave 2
- `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md` — hard boundary: no authoritative totals, no reconciliation
- `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md` — §4 outbox surface envelope requirements; literal-same-transaction rule for Wave 2
- `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-AUTHORING-PARITY.md` — Class A/B envelope/discipline/strictness parity

### Normative standards (prep artifacts, now Accepted)

- `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md` — §3 authority taxonomy, §8 Pattern A split, §10 envelope shape, §C1 no implicit aggregation, §C2/§C3 derived totals, §F1/F2/F3/F4 forbidden patterns, §K1/K2 attribution, §L1/L2/L3 labeling
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md` — primary per-source mapping consumed by mappers
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md` — per-service DTO migration table
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md` — §2.D `no-misleading-chips-identifier` ACTIVE
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.0-SIGNOFF.md` — §4 Phase 1.1 handoff prerequisites (authoritative spec input)

### Planning

- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` — parent planning doc; §2.5 execution protocol; §3 Phase 1.1 checklist; §9 skill routing
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` — live tracker; this PRD closes the Phase 1.1 PRD column

### Architecture

- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — bounded-context registry; 8 in-scope services enumerated here
- `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` — implementation patterns for service / DTO / mapper / schema structure
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` — YAGNI check on envelope migration (single envelope type, no generics expansion)

### Quality

- `docs/40-quality/` — QA-005 route handler coverage (Phase 1.2 concern, not Phase 1.1); QA-006 E2E testing (Phase 1.4 concern)

### Code references (verified 2026-04-23)

- `types/financial.ts` — envelope type exports (DO NOT redefine)
- `lib/errors/safe-error-details.ts` — `safeErrorDetails()` helper for `INV-ERR-DETAILS` compliance
- `services/shift-intelligence/dtos.ts` — `MetricType` discriminator confirmed present (Q-A5 resolution)
- `services/rating-slip-modal/dtos.ts:149` — `totalChipsOut` rename site (Q-A8)
- `services/visit/crud.ts` — `RecentSessionDTO` / `open_visit` dollar pre-conversion removal site (FR-4)
- `services/rating-slip/mappers.ts` — `VisitLiveViewDTO` dollar pre-conversion removal site (FR-4)
- `app/api/v1/rating-slips/[id]/modal-data/route.ts` — directly coupled `totalCashOut` rename consumer
- `components/modals/rating-slip/rating-slip-modal.tsx` — directly coupled `totalCashOut` rename consumer

### Pipeline chain

- `/prd-writer` → this PRD → `/lead-architect` (EXEC-SPEC scaffolding per `ROLLOUT-ROADMAP §2.5.2`) → `/build-pipeline` dispatching `/backend-service-builder` per workstream (8 in-scope services; EXEC-SPEC determines sequencing / parallelism / dependencies)

---

## Appendix A: Breaking Changes Summary

Two breaking changes anchor this phase. Both are reviewable and have hard-revert paths (git revert PRs), but neither can be treated as a pure `services/*` edit set because the current codebase has direct route/UI coupling.

### A.1 DTO Rename — `totalChipsOut` → `totalCashOut`

- **Scope:** `services/rating-slip-modal/` DTO/schema/RPC plus the directly coupled modal-data route, live modal component, tests, and internal docs.
- **Rationale:** "Chips" semantically implies `observed` authority (physical count); source is PFT (`actual` ledger). The identifier lied about provenance. The Phase 1.0 sign-off requires this rename to land with all consumers, so the phase includes the narrow API/UI exception needed to make the rename real.
- **Blast radius:** directly coupled consumers across `services/`, `app/`, `components/`, and tests. EXEC-SPEC grep-audits to enumerate.
- **Transition strategy:** hard rename across the directly coupled modal-data flow in one PR. Any non-modal compatibility alias discovered during EXEC-SPEC must be explicit and dated for Phase 1.2 cleanup.
- **Post-Phase-1.1 regression prevention:** Phase 1.4 ESLint rule `no-misleading-chips-identifier` (ACTIVE per sign-off) catches any reintroduction. In the interim, reviewer diligence.

### A.2 Visit Service Cents Canonicalization

- **Scope:** every verified producer of visit-facing DTOs currently pre-dividing by 100, including `services/visit/` and `services/rating-slip/`, plus any directly coupled route-boundary tests required to keep those contracts coherent.
- **Rationale:** `FinancialValue.value` is canonically cents (CLASSIFICATION-RULES §4). Visit service is currently the single outlier emitting dollars. Removal of pre-conversion aligns all services on cents.
- **Blast radius:** service producers plus any pass-through route consumers that already expose those DTOs unchanged. EXEC-SPEC enumerates.
- **Transition strategy:** hard cents emission at service layer in one PR. External HTTP consumers remain on dollars until Phase 1.2 serializes the envelope with cents at the wire.
- **Test update burden:** all internal visit DTO consumer tests update ÷100 assertions simultaneously with the mapper change.

---

## Appendix B: Source → Authority Mapping Quick Reference

Excerpted from `WAVE-1-CLASSIFICATION-RULES §3` for mapper-author convenience. The classification rules doc is authoritative; this table is a non-normative quick reference.

| DB source field | Service | `type` | `source` string | Completeness default |
|------------------|---------|--------|-----------------|---------------------|
| `player_financial_transaction.amount` | player-financial | `actual` | `"PFT"` | `complete` per row; lifecycle-aware in aggregates |
| `player_financial_transaction.amount` (adjustment) | player-financial | `actual` | `"PFT.adjustment"` | `complete` per row |
| `loyalty_comp.face_value_cents` | loyalty | `actual` | `"loyalty.comp_face_value"` | `complete` per issuance |
| `loyalty_entitlement.face_value_cents` | loyalty | `actual` | `"loyalty.entitlement_face_value"` | `complete` per issuance |
| `table_fill.amount_cents` | table-context | `estimated` | `"table_session.fill.requested"` | `complete` per row |
| `table_fill.confirmed_amount_cents` | table-context | `estimated` | `"table_session.fill.confirmed"` | `complete` if non-null; `unknown` if null |
| `table_credit.amount_cents` | table-context | `estimated` | `"table_session.credit.requested"` | `complete` per row |
| `table_credit.confirmed_amount_cents` | table-context | `estimated` | `"table_session.credit.confirmed"` | `complete` if non-null; `unknown` if null |
| `table_session.fills_total_cents` | table-context | `estimated` | `"table_session.fills_total"` | Session-lifecycle aware |
| `table_session.credits_total_cents` | table-context | `estimated` | `"table_session.credits_total"` | Session-lifecycle aware |
| `table_session.drop_total_cents` | table-context | `estimated` | `"table_session.drop"` | `complete` after post; `unknown` before post; never `partial` |
| `table_session.need_total_cents` | table-context | `estimated` | `"table_session.need"` | Session-lifecycle aware |
| `rating_slip.computed_theo_cents` | rating-slip | `estimated` | `"rating_slip.theo"` | `partial` if gaps; `complete` if none |
| `rating_slip.legacy_theo_cents` | rating-slip | `estimated` | `"rating_slip.theo.legacy"` | **Always `unknown`** |
| `pit_cash_observation.amount` (dollars→cents) | rating-slip | `observed` | `"pit_cash_observation"` | `complete` per row; aggregates lifecycle-aware |
| Cash-obs extrapolated rollup | table-context | `estimated` | `"pit_cash_observation.extrapolated"` | `partial` / `unknown` per sampling coverage |
| Cash-obs confirmed rollup | table-context | `observed` | `"pit_cash_observation.confirmed"` | `partial` / `complete` per row presence |
| `table_inventory_snapshot.opening_total_cents` | table-context | `observed` | `"table_inventory_snapshot.opening"` | `complete` if attested; `unknown` otherwise |
| `table_inventory_snapshot.closing_total_cents` | table-context | `observed` | `"table_inventory_snapshot.closing"` | `complete` if attested; `unknown` otherwise |
| `table_inventory_snapshot.discrepancy_cents` | table-context | `estimated` | `"table_inventory_snapshot.discrepancy"` | Inherit worst from inputs |
| Derived `table_win_cents` | table-context | `estimated` | `"table_session.inventory_win"` | Inherit worst (Pattern B; declare inputs per SRC §C3) |
| `mtl_entry.amount` | mtl | `compliance` | `"mtl_entry"` | `complete` per row |
| MTL gaming-day summary totals | mtl | `compliance` | `"mtl_entry"` (aggregate) | Gaming-day lifecycle aware |
| Shift-intelligence median / min / max baseline | shift-intelligence | `estimated` | `"shift_baseline.<metric>"` | Sample-size threshold gated |
| Shift-intelligence `AnomalyAlertDTO.observedValue` (metric-kind-routed) | shift-intelligence | `drop_total`→`estimated` / `cash_obs_total`→`estimated`(default) / `win_loss_cents`→`estimated` / `hold_percent`→**not wrapped** | Per §4.2 | Inherit from source |
| Loyalty theo (when surfaced) | loyalty | `estimated` | `"loyalty.theo"` | `complete` on close; `unknown` for gapped sessions |

**Not wrapped:** `rating_slip.average_bet`, all `CreateXInput.amount*`, policy/config values, points, `hold_percent` metric values. See §4.3 for full carve-out list.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-23 | `/prd-writer` skill (on behalf of Lead Architect) | Initial draft. Phase 1.0 sign-off consumed as authoritative handoff. Q-A5 resolved via inspection of `services/shift-intelligence/dtos.ts` — `MetricType` discriminator already present; Option A (lookup table) selected; `cash_obs_total` RPC source verification deferred to EXEC-SPEC with documented default. All 8 services scoped, 2 breaking changes documented, carve-outs enumerated, DoD aligned with ROLLOUT-ROADMAP Phase 1.1 exit gate. |
