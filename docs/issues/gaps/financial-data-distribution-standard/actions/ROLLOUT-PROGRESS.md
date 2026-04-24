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

> ⚠️ **Governance:** Every phase ≥ 1.1 requires PRD → EXEC-SPEC → `/build-pipeline`. See `ROLLOUT-ROADMAP.md §2.5`. Checkbox completion in this tracker does NOT authorize starting the next phase; Phase N+1's PRD must land first.

---

## Legend

- ⬜ Not started
- 🟦 In progress
- ✅ Complete
- ⛔ Blocked (document reason)
- ➖ N/A in current wave

---

## 1. Overall Status

Each Phase ≥ 1.1 has three gates, in order: **PRD drafted & approved → EXEC-SPEC scaffolded → build-pipeline executed to exit criteria**. Phase 1.0 is exempted from PRD/EXEC-SPEC per `ROLLOUT-ROADMAP.md §2.5.3` (meta-phase: produces the governance docs that feed every subsequent PRD).

| Wave  | Phase                         | PRD       | EXEC-SPEC | Build-pipeline exec | Exit gate |
| ----- | ----------------------------- | --------- | --------- | ------------------- | --------- |
| 1     | 1.0 Prep & Inventory          | ➖ Exempt | ➖ Exempt | ✅ Artifacts shipped | ✅ PASSED 2026-04-23 (SIGNOFF doc) |
| 1     | 1.1 Service DTO Envelope      | 🟦 Drafted (PRD-070) | 🟦 Scaffolded (EXEC-070) | ⬜ **next** | —         |
| 1     | 1.2 API Envelope at Wire      | 🟦 Drafted (PRD-071) | ⬜        | ⬜                  | —         |
| 1     | 1.3 UI Split Display          | ⬜        | ⬜        | ⬜                  | —         |
| 1     | 1.4 Validation + Lint + I5    | ⬜        | ⬜        | ⬜                  | —         |
| 1     | 1.5 Rollout & Sign-off        | ⬜        | ⬜        | ⬜                  | —         |
| 2     | Schema + Outbox + Consumer    | ⬜        | ⬜        | ⬜                  | —         |

**Skill routing per phase:** see `ROLLOUT-ROADMAP.md §9`. Skills are dispatched by `/build-pipeline`, not invoked directly.

---

## 2. Wave 1 — Surface Contract

### Phase 1.0 — Prep & Inventory  ✅ PASSED

**Entry date:** 2026-04-23
**Exit date:** 2026-04-23 (same-day sign-off)

| # | Deliverable | Status | Artifact |
|---|-------------|--------|----------|
| 1 | `types/financial.ts` — `FinancialValue` envelope (SRC §10 verbatim) | ✅ | `types/financial.ts` |
| 2 | Surface inventory — every component/route/DTO emitting currency | ✅ | `actions/WAVE-1-SURFACE-INVENTORY.md` |
| 3 | Forbidden-label allowlist/denylist (grep-able, feeds Phase 1.4 lint) | ✅ | `actions/WAVE-1-FORBIDDEN-LABELS.md` |
| 4 | Classification rules (source → authority + unit mapping) | ✅ | `actions/WAVE-1-CLASSIFICATION-RULES.md` |
| 5 | Exit-gate sign-off record (Q-A1–Q-A8 resolved) | ✅ | `actions/WAVE-1-PHASE-1.0-SIGNOFF.md` |

**Exit gate (all passed on 2026-04-23):**
- [x] Envelope type merged to `ref/financial-standard` branch (main merge is CI/CD step, not architectural gate)
- [x] Surface inventory reviewed by lead-architect (SIGNOFF §3)
- [x] Classification rules signed off — all 8 decisions Q-A1…Q-A8 resolved; no frozen-doc supersession required

**Known roadmap deltas (flagged during context gathering 2026-04-23):**
- Service named `player-financial-transaction` in roadmap → actual path `services/player-financial/`
- Service named `table-buyin-telemetry` → does not exist; Class B (TBT/grind) data currently lives in `services/table-context/` via `table_session.drop_total_cents`. Classification doc must reflect this; intersects §6 open question.
- Service named `shift-metrics` → actual path `services/shift-intelligence/`.
- Unit heterogeneity: cents predominate, but `rating_slip.average_bet`, `pit_cash_observation.amount`, and some visit DTOs are dollars. Envelope + classification rules must declare unit per source.

---

### Phase 1.1 — Service Layer: DTO Envelope  ⬜

Blocked on: ~~Phase 1.0 exit gate~~ ✅ + ~~**Phase 1.1 PRD**~~ 🟦 Drafted (PRD-070, 2026-04-23) + ~~**Phase 1.1 EXEC-SPEC**~~ 🟦 Scaffolded (EXEC-070, 2026-04-23). Next: `/build-pipeline`.

**Pipeline chain (required before any code change):**
- [x] PRD-070 drafted via `/prd-writer` citing classification rules + surface inventory (2026-04-23)
- [x] EXEC-SPEC scaffolded via `/lead-architect` (workstream IDs, dependencies, bounded contexts) — `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md`
- [ ] `/build-pipeline` executed; dispatches `/backend-service-builder` per workstream

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

Blocked on: Phase 1.1 exit gate + ~~**Phase 1.2 PRD**~~ 🟦 Drafted (PRD-071, 2026-04-24) + **Phase 1.2 EXEC-SPEC**.

**Pipeline chain:** `/prd-writer` → `/lead-architect` EXEC-SPEC → `/build-pipeline` dispatching `/api-builder` (+ `/backend-service-builder` for DTO contract touches).

- [x] PRD-071 drafted via `/prd-writer` citing Phase 1.1 handoff, route inventory, OpenAPI baseline, and forbidden-label/deprecation rules (2026-04-24)
- [ ] EXEC-SPEC scaffolded via `/lead-architect`
- [ ] `/build-pipeline` executed; dispatches `/api-builder` (+ `/backend-service-builder` for residual contract touchpoints)

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

Blocked on: Phase 1.2 exit gate + **Phase 1.3 PRD** + **Phase 1.3 EXEC-SPEC**.

**Pipeline chain:** `/prd-writer` → `/lead-architect` EXEC-SPEC → `/build-pipeline` dispatching `/frontend-design-pt-2` (+ `/web-design-guidelines` review).

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

Blocked on: Phase 1.3 exit gate + **Phase 1.4 PRD** + **Phase 1.4 EXEC-SPEC**.

**Pipeline chain:** `/prd-writer` → `/lead-architect` EXEC-SPEC → `/build-pipeline` dispatching `/qa-specialist` (+ `/e2e-testing` for Playwright assertions).

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

Blocked on: Phase 1.4 exit gate + **Phase 1.5 PRD** + **Phase 1.5 EXEC-SPEC**.

**Pipeline chain:** `/prd-writer` → `/lead-architect` EXEC-SPEC → `/build-pipeline` dispatching `/devops-pt2` (+ `/qa-specialist` for final gate).

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
| 2026-04-23 | **Execution governance added** to `ROLLOUT-ROADMAP.md` (new §2.5) and this tracker (PRD/EXEC-SPEC columns). ADRs are decisions; they do not ship. PRDs do. No PRDs exist yet for any phase, so the roadmap is NOT directly implementable as-is. Every Phase ≥ 1.1 now requires `/prd-writer` → `/lead-architect` EXEC-SPEC scaffold → `/build-pipeline` before implementation. Phase 1.0 explicitly exempted as meta-phase (produces the governance docs every subsequent PRD cites). Skill-routing table in roadmap §9 clarified to indicate skills are dispatched by build-pipeline, not invoked directly. |
| 2026-04-23 | **Phase 1.0 EXIT GATE PASSED** (lead-architect sign-off). All 8 open decisions resolved: Q-A1 `average_bet` not wrapped (operator input); Q-A2 `observed`/`compliance` labels live for surfaces, no new authoring; Q-A3 source strings service-private (UI may display, must not branch); Q-A4 cash-obs always Pattern A split; Q-A5 shift-intelligence metric-kind routing principle approved (Phase 1.1 produces concrete map); Q-A6 dollar→cents mapper with pinned rounding test; Q-A7 theo renders envelope `unknown` + "Not computed" badge (UI treatment deferred to frontend-design-pt-2 in Phase 1.3); Q-A8 `totalChipsOut` → `totalCashOut` rename approved for Phase 1.1 with full consumer scope. Sign-off record: `actions/WAVE-1-PHASE-1.0-SIGNOFF.md`. Classification rules + inventory + forbidden-labels amended to `Accepted` status with rules promoted to normative. **Phase 1.1 PRD authoring unblocked** — next action is `/prd-writer` for Phase 1.1 Service DTO Envelope migration. |
| 2026-04-23 | **Phase 1.1 PRD drafted** (`/prd-writer`). `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md` — Status: Draft. Scope: envelope migration across 8 in-scope services (`player-financial`, `rating-slip`, `rating-slip-modal`, `visit`, `mtl`, `table-context`, `loyalty`, `shift-intelligence`) with a **bounded direct-coupling exception** for live pass-through route/UI/test consumers where Phase 1.1 DTO changes would otherwise leak or fail to compile. Two breaking changes — `totalChipsOut` → `totalCashOut` rename across the directly coupled modal-data flow + visit-facing cents canonicalization across verified producers in `services/visit/` and `services/rating-slip`; mandatory pinned dollar→cents rounding test; non-wrapping carve-outs documented (operator inputs, policy/config, points, `hold_percent` ratio). **Q-A5 resolved in principle:** `MetricType` discriminator verified present on `BaselineDTO` / `AnomalyAlertDTO` / `ShiftAlertDTO` (`drop_total` / `hold_percent` / `cash_obs_total` / `win_loss_cents`) — lookup-table path chosen, but public DTO shape remains gated by EXEC-SPEC. `cash_obs_total` RPC source verification deferred to EXEC-SPEC with `estimated` / extrapolated as safe default. Added pre-workstream gates for shift-intelligence Phase 1.1 vs 1.2 split and any `totalCashOut` compatibility alias, plus required blast-radius, test, and rollback matrices in EXEC-SPEC. **Phase 1.1 EXEC-SPEC scaffolding is next action** — `/lead-architect` per ROLLOUT-ROADMAP §2.5.2. |
| 2026-04-23 | **Phase 1.1 EXEC-SPEC scaffolded** (`/lead-architect`). `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` — Workstreams frozen around a service-led migration with bounded exception slices: WS0 planning lock (GATE-070.6, GATE-070.7, blast-radius/test/rollback/deferral artifacts), WS1 shared contract foundation, WS2 internal service bundle (`player-financial`, `loyalty`, `mtl`, `table-context`), WS3 rating-slip core bundle, WS4 `totalCashOut` modal rename slice, WS5 recent-sessions cents canonicalization slice, WS6 live-view cents canonicalization slice, WS7 shift-intelligence split/authority routing decision, WS8 conditional shift-intelligence public-contract slice, WS9 cross-service verification and Phase 1.2 handoff. **Next action is `/build-pipeline`** — expand each workstream with domain-skill implementation detail and enforce the planning-lock gate before code changes begin. |
