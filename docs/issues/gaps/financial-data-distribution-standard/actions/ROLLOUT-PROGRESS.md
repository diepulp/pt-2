---
name: Financial Telemetry Rollout — Progress Tracker
description: Live status board for Wave 1 (Surface Contract) and Wave 2 (Dual-Layer Outbox) execution against the frozen ADR set and SRC.
type: progress-tracker
status: Active
started: 2026-04-23
last_updated: 2026-04-23
tracks:
- ROLLOUT-ROADMAP.md
- ../decisions/ADR-FINANCIAL-FACT-MODEL.md
- ../decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md
- ../decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md
- ../decisions/ADR-FINANCIAL-AUTHORING-PARITY.md
- SURFACE-RENDERING-CONTRACT.md
- FAILURE-SIMULATION-HARNESS.md
- FAILURE-SIMULATION-PLAYBOOK.md
---

# Financial Telemetry Rollout — Progress Tracker

> Single source of truth for Wave 1/Wave 2 execution status.
> Update inline as deliverables ship. Do not patch the frozen decision docs — use the supersession process.

---

## Legend

- ⬜ Not started
- 🟦 In progress
- ✅ Complete
- ⛔ Blocked (document reason)
- ➖ N/A in current wave

---

## 1. Overall Status

| Wave  | Phase                         | Status | Owner              | Exit gate met |
| ----- | ----------------------------- | ------ | ------------------ | ------------- |
| 1     | 1.0 Prep & Inventory          | 🟦     | lead-architect     | No — deliverables done; awaiting sign-off on Q-A1–Q-A8 |
| 1     | 1.1 Service DTO Envelope      | ⬜     | backend-service-builder | —        |
| 1     | 1.2 API Envelope at Wire      | ⬜     | api-builder        | —             |
| 1     | 1.3 UI Split Display          | ⬜     | frontend-design-pt-2 | —           |
| 1     | 1.4 Validation + Lint + I5    | ⬜     | qa-specialist      | —             |
| 1     | 1.5 Rollout & Sign-off        | ⬜     | devops-pt2         | —             |
| 2     | Schema + Outbox + Consumer    | ⬜     | TBD post-Wave-1    | —             |

---

## 2. Wave 1 — Surface Contract

### Phase 1.0 — Prep & Inventory  🟦

**Entry date:** 2026-04-23

| # | Deliverable | Status | Artifact |
|---|-------------|--------|----------|
| 1 | `types/financial.ts` — `FinancialValue` envelope (SRC §10 verbatim) | ✅ | `types/financial.ts` |
| 2 | Surface inventory — every component/route/DTO emitting currency | ✅ | `actions/WAVE-1-SURFACE-INVENTORY.md` |
| 3 | Forbidden-label allowlist/denylist (grep-able, feeds Phase 1.4 lint) | ✅ | `actions/WAVE-1-FORBIDDEN-LABELS.md` |
| 4 | Classification rules (source → authority + unit mapping) | ✅ | `actions/WAVE-1-CLASSIFICATION-RULES.md` |

**Exit gate (all must pass):**
- [ ] Envelope type merged to `main`
- [ ] Surface inventory reviewed by lead-architect
- [ ] Classification rules signed off — 8 open decisions (Q-A1 through Q-A8) require answers

**Known roadmap deltas (flagged during context gathering 2026-04-23):**
- Service named `player-financial-transaction` in roadmap → actual path `services/player-financial/`
- Service named `table-buyin-telemetry` → does not exist; Class B (TBT/grind) data currently lives in `services/table-context/` via `table_session.drop_total_cents`. Classification doc must reflect this; intersects §6 open question.
- Service named `shift-metrics` → actual path `services/shift-intelligence/`.
- Unit heterogeneity: cents predominate, but `rating_slip.average_bet`, `pit_cash_observation.amount`, and some visit DTOs are dollars. Envelope + classification rules must declare unit per source.

---

### Phase 1.1 — Service Layer: DTO Envelope  ⬜

Blocked on: Phase 1.0 exit gate.

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Extend DTOs for every financial-returning service to wrap currency fields | ⬜ |
| 2 | Mappers populate `type`, `source`, `completeness` at service boundary | ⬜ |
| 3 | Currency methods that cannot determine completeness emit `status: 'unknown'` explicitly | ⬜ |
| 4 | Zod schemas validate envelope on both sides of service boundary | ⬜ |
| 5 | No service returns bare `number` for currency | ⬜ |

**Exit gate:**
- [ ] All financial service DTOs updated
- [ ] Unit tests verify envelope shape + classification rules
- [ ] INV-ERR-DETAILS retained, no `as any`
- [ ] `npm run type-check` passes

**Services in scope (confirmed inventory, Phase 1.0 close):**
- `services/player-financial/`
- `services/rating-slip/`
- `services/rating-slip-modal/` *(added during Phase 1.0 after audit merge — `FinancialSectionDTO.totalChipsOut` rename required)*
- `services/visit/`
- `services/mtl/`
- `services/table-context/`
- `services/loyalty/`
- `services/shift-intelligence/`

---

### Phase 1.2 — API Layer: Envelope at the Wire  ⬜

Blocked on: Phase 1.1.

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Route handlers serialize envelope verbatim | ⬜ |
| 2 | OpenAPI specs under `docs/` updated to envelope schema | ⬜ |
| 3 | Contract tests enforce envelope shape | ⬜ |
| 4 | Raw-total endpoints split or deprecated with dated sunset | ⬜ |
| 5 | No endpoint returns forbidden-label aggregates (SRC §L3 / §F1) | ⬜ |

**Exit gate:**
- [ ] Contract tests green for every financial endpoint
- [ ] OpenAPI diff reviewed
- [ ] Deprecations have dated sunsets in OpenAPI descriptions

---

### Phase 1.3 — UI Layer: Split Display + Labels  ⬜

Blocked on: Phase 1.2.

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | `components/financial/FinancialValue.tsx` with visible type badge | ⬜ |
| 2 | `components/financial/AttributionRatio.tsx` (rename from "coverage" — SRC §K1) | ⬜ |
| 3 | `components/financial/CompletenessBadge.tsx` | ⬜ |
| 4 | All existing financial surfaces migrated | ⬜ |
| 5 | Forbidden labels removed from production UI | ⬜ |
| 6 | Pattern A split display wherever rated + unrated appear together | ⬜ |
| 7 | Mixed-authority aggregates degrade per D5 (Actual > Observed > Estimated; Compliance never merged) | ⬜ |

**Exit gate:**
- [ ] Manual walkthrough with lead-architect, every financial surface
- [ ] No unlabeled currency in any rendered surface
- [ ] Playwright screenshot regression coverage for financial surfaces
- [ ] Dev-server verification per CLAUDE.md UI-change rule

**Known targets (confirmed Phase 1.0):**
- `app/(landing)/floor-oversight/page.tsx` — "Coverage quality" → "Attribution Ratio"
- `components/pit-panels/analytics-panel.tsx:169` — `label: 'Handle'` → `'Estimated Drop'`
- `components/player-360/summary/summary-band.tsx` Theo row — remove stubbed `$0` or render `status: 'unknown'` (Q-A7)
- `services/rating-slip-modal/dtos.ts:149` `totalChipsOut` → `totalCashOut` (Q-A8, service-layer rename)
- `components/shift-dashboard-v3/**` — already badge-labeled; formalize under `<FinancialValue>`
- `components/shift-dashboard/**` (legacy) — full migration or deprecate in favor of v3
- `lib/format.ts` formatters + 18+ local `formatDollars/formatCents` variants in components

---

### Phase 1.4 — Validation: Lint + Truth-Telling Tests  ⬜

Blocked on: Phase 1.3.

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | ESLint rule `no-unlabeled-financial-value` | ⬜ |
| 2 | ESLint rule `no-forbidden-financial-label` | ⬜ |
| 3 | Unit tests: envelope-shape compliance for every DTO | ⬜ |
| 4 | Integration tests: every financial endpoint returns valid envelope | ⬜ |
| 5 | Playwright DOM assertion: no currency rendered without authority label | ⬜ |
| 6 | I5 truth-telling subset from `FAILURE-SIMULATION-HARNESS.md §6` | ⬜ |

**Exit gate:**
- [ ] CI red on any lint/test violation
- [ ] `npm run test:surface` passes
- [ ] Failure playbook I5 scenarios pass against Wave 1 surfaces

---

### Phase 1.5 — Rollout & Sign-off  ⬜

Blocked on: Phase 1.4.

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Staged deploy preview → staging → prod | ⬜ |
| 2 | Release notes referencing SRC + 5 frozen ADRs | ⬜ |
| 3 | Operator UX validation (pit boss sign-off on interpretability) | ⬜ |
| 4 | Supabase advisors clean (no regression from envelope marshaling) | ⬜ |
| 5 | Wave 1 retrospective captured | ⬜ |

**Exit gate (Wave 1 → Wave 2 handoff):**
- [ ] SRC envelope live on every production financial surface
- [ ] Lint rule active, CI red on violations
- [ ] No regressions in existing features
- [ ] Operator sign-off on interpretability
- [ ] §6 open questions resolved or explicitly deferred with rationale

---

## 3. Validation Matrix — Invariant Coverage

| Invariant     | Wave  | Phase gate      | Status |
| ------------- | ----- | --------------- | ------ |
| I1 Atomicity  | 2     | Harness TEST 1  | ➖ Wave 1 |
| I2 Durability | 2     | Harness TEST 2  | ➖ Wave 1 |
| I3 Idempotency| 2     | Harness TEST 3  | ➖ Wave 1 |
| I4 Replayability | 2  | Harness TEST 5  | ➖ Wave 1 |
| **I5 Truthfulness** | **1** | **Phase 1.4 truth-telling tests** | ⬜ |

Harness smoke check (Wave 2 prep): run against stubs in CI nightly to prevent bit-rot — not yet scheduled.

---

## 4. Open Questions Gating Wave 2

Accumulated during Wave 1. Do **not** gate Wave 1 deliverables.

| # | Question | Resolution path | Status |
|---|----------|-----------------|--------|
| Q1 | Should PFT schema expand to support table-only events, or does Class B stay in a separate authoring store? | Post–Wave 1 design review + prod data input | ⬜ Open |
| Q2 | Should grind remain fully separate, or normalize under shared parent with discriminator? | Same review | ⬜ Open |
| Q3 | External reconciliation consumer contract? | External stakeholder discovery | ⬜ Open |
| Q4 | Outbox emission: trigger-based, shared RPC, or both? | Performance testing under literal-same-txn constraint (ADR-PROP D2) | ⬜ Open |

Track resolutions in `WAVE-2-PREP-DECISIONS.md` as they accumulate.

---

## 5. Wave 2 — Dual-Layer + Outbox (Preview)

Not opened. Detailed plan → `WAVE-2-ROADMAP.md` post Wave 1 sign-off.

Scope outline (for awareness only):
- [ ] Schema migration (Class B authoring store — shape gated by Q1/Q2)
- [ ] `finance_outbox` DDL
- [ ] Shared write-path RPC `rpc_emit_financial_event(fact_class, ...)` with literal-same-transaction guarantee
- [ ] Outbox consumer worker
- [ ] Projection refactor — Rated ← Class A, Grind ← Class B
- [ ] Deprecate legacy trigger-based cross-domain propagation
- [ ] Full failure harness (I1–I5) as exit gate

---

## 6. Risk Watchlist (live)

Pulled from ROLLOUT-ROADMAP.md §7; update status as mitigations land.

| Risk | Likelihood | Impact | Mitigation status |
|------|-----------|--------|-------------------|
| Surface inventory misses a financial value | Medium | High | ⬜ Phase 1.0 audit |
| Type-level envelope drift across layers | Medium | Medium | ⬜ Single source-of-truth in `types/financial.ts` |
| Operator complaints on UI verbosity | Medium | Low | ⬜ Phase 1.5 walkthrough (non-negotiable) |
| Load-bearing "Total Drop" feature for a stakeholder | Low | Medium | ⬜ Deprecation path per endpoint |
| Wave 2 harness rots during Wave 1 | Medium | Low | ⬜ Nightly stub-run (not scheduled) |
| Freeze-rule pressure (patch instead of supersede) | Medium | High | 🟦 Lead-architect gate |
| Attribution Ratio misread as completeness | Medium | Medium | ⬜ Phase 1.3 visual design brief |

---

## 7. Change Log

| Date       | Entry |
|------------|-------|
| 2026-04-23 | Tracker created. Phase 1.0 opened. Context gathered against frozen ADR set + SRC. Roadmap-path deltas flagged (service rename mismatches, unit heterogeneity). |
| 2026-04-23 | **Phase 1.0 deliverables complete** (lead-architect). Shipped: (1) `types/financial.ts` — 3 exports, tsc clean; (2) `WAVE-1-SURFACE-INVENTORY.md` — 8 services enumerated, 4 confirmed SRC violations catalogued, shift-dashboard v3-vs-legacy split documented; (3) `WAVE-1-CLASSIFICATION-RULES.md` — source → authority mapping for ~40 sources, custody-chain resolved to `estimated` per FACT-MODEL §D1 (audit's proposed 5th `custody` class rejected as unnecessary), 8 open questions Q-A1…Q-A8 raised; (4) `WAVE-1-FORBIDDEN-LABELS.md` — regex-anchored denylist + replace-with + allowlist, ready for Phase 1.4 ESLint rule generation. Merged independent findings from `SURFACE-CLASSIFICATION-AUDIT.md` (added missed `services/rating-slip-modal/` + `Handle`/`Theo: 0`/`totalChipsOut` violations). **Exit gate NOT yet passed** — awaits lead-architect sign-off on Q-A1–Q-A8. |
