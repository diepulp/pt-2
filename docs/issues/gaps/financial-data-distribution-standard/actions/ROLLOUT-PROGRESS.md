---
name: Financial Telemetry Rollout — Progress Tracker
description: Live status board for Wave 1 (Surface Contract) and Wave 2 (Dual-Layer Outbox) execution against the frozen ADR set and SRC.
type: progress-tracker
status: Active
started: 2026-04-23
last_updated: 2026-05-05 (Phase 1.4 complete — EXEC-078; cursor → 1.5)
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

> **Machine-readable projection:** `ROLLOUT-TRACKER.json` (same directory) mirrors this file in a structured format for `/financial-model-authority` skill orientation. Keep both in sync when phase state changes.

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
| 1     | 1.1 Service DTO Envelope      | ✅ PRD-070 | ✅ EXEC-070 (amended 3×) | ✅ All WS0–WS9 closed | ✅ PASSED 2026-04-25 (WS9 + DoD gates) |
| 1     | 1.2A API Transport Stabilization | ✅ PRD-071 | ✅ EXEC-071 | ✅ WS1–WS3 closed | ✅ PASSED 2026-04-30 |
| 1     | 1.2B Service Canonicalization | ✅ PRD-074 | ✅ EXEC-074/075/076 | ✅ WS1–WS3 closed | ✅ PASSED 2026-05-03 |
| 1     | 1.3 UI Split Display          | ✅ PRD-077 | ✅ EXEC-077 | ✅ All WS closed | ✅ PASSED 2026-05-04 |
| 1     | 1.4 Validation + Lint + I5    | ✅ PRD-078 | ✅ EXEC-078 | ✅ WS1–WS5 closed | ✅ PASSED 2026-05-05 |
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

### Phase 1.1 — Service Layer: DTO Envelope  ✅ PASSED 2026-04-25

~~Blocked on: Phase 1.0 exit gate ✅ + Phase 1.1 PRD ✅ + Phase 1.1 EXEC-SPEC ✅.~~

**Complete:** All workstreams closed (WS0–WS9). WS9 verification matrix executed and DoD gates passed 2026-04-25. Phase 1.2 handoff package produced at `actions/PHASE-1.2-HANDOFF.md`.

**Pipeline chain:**
- [x] PRD-070 drafted via `/prd-writer` citing classification rules + surface inventory (2026-04-23)
- [x] EXEC-SPEC scaffolded via `/lead-architect` — `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` (amended 2× — scope deferral + child-spec completion)
- [x] `/build-pipeline` executed — WS0–WS7A shipped 2026-04-24; WS5/WS5_ROUTE/WS5_UI/WS6 delivered via PRD-072 Phase 1.1b child spec (commit 38d25cc1)
- [x] WS7B PRD → EXEC-SPEC → build-pipeline — **✅ PRD-073 shipped 2026-04-25** (`resolveShiftMetricAuthority` + mapper unification + `getAlerts` delegation + test corrections; 95/95 tests PASS)
- [x] WS9 verification matrix + Phase 1.2 handoff package — **✅ complete 2026-04-25** (all test slices PASS; lint/type-check/build PASS; `totalChipsOut` grep CLEAN; handoff package produced)

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Extend DTOs for every financial-returning service to wrap currency fields | ✅ 7/8 services done; shift-intelligence public fields explicitly deferred to Phase 1.2 (GATE-070.6) |
| 2 | Mappers populate `type`, `source`, `completeness` at service boundary | ✅ Done for all services; shift-intelligence authority routing shipped via PRD-073 |
| 3 | Currency methods that cannot determine completeness emit `status: 'unknown'` explicitly | ✅ |
| 4 | Zod schemas validate envelope on both sides of service boundary | ✅ WS1 shared schema shipped; wire/DTO partition gap recorded in Phase 1.2 handoff |
| 5 | No service returns bare `number` for currency | ✅ 7/8 done; shift-intelligence public DTO fields explicitly deferred to Phase 1.2 (GATE-070.6) |

**Exit gate (all passed 2026-04-25):**
- [x] All financial service DTOs updated — shift-intelligence public fields explicitly deferred to Phase 1.2 per GATE-070.6 (documented in PHASE-1.2-HANDOFF.md)
- [x] Unit tests verify envelope shape + classification rules — WS9 matrix complete (see EXEC-070 ws9-completion amendment)
- [x] INV-ERR-DETAILS retained, no `as any` (verified through WS1–WS9)
- [x] `npm run type-check` passes (exit 0)
- [x] `npm run lint` passes (exit 0)
- [x] `npm run build` passes (exit 0)
- [x] `totalChipsOut` grep CLEAN — zero live-code references

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

### Phase 1.2A — API Transport Stabilization  ✅ PASSED 2026-04-30

~~Blocked on: Phase 1.1 exit gate + Phase 1.2 PRD + Phase 1.2 EXEC-SPEC.~~

**Complete:** EXEC-071 all workstreams closed (WS1–WS3). DoD gates passed 2026-04-30. Phase 1.2B (canonicalization) is the successor phase.

**Pipeline chain:**
- [x] PRD-071 drafted via `/prd-writer` citing Phase 1.1 handoff, route inventory, OpenAPI baseline, and forbidden-label/deprecation rules (2026-04-24)
- [x] EXEC-071 scaffolded via `/lead-architect` + guardrail audit (`OVERENGINEERING_GUARDRAIL_FIN_TELEMETRY.md`) — transport-stabilization scope enforced (2026-04-29)
- [x] `/build-pipeline` executed — WS1–WS3 shipped 2026-04-30

**Decisions resolved in Phase 1.2A:**
- **DEC-1:** `casino_id` REMOVE — MTL routes (`gaming-day-summary`, `entries`) always use `mwCtx.rlsContext!.casinoId`; client-provided `casino_id` stripped from schema and handler
- **DEC-3:** `casino_id` REMOVE on `loyalty/balances` — no active consumer found; `getBalance` receives `mwCtx.rlsContext!.casinoId` only
- **DEC-4:** BRIDGE-001 surfaces (`recent-sessions`, `live-view`) — `value` type: `number` (dollar-float correct at Phase 1.2A); integer assertion deferred to Phase 1.2B after BRIDGE-001 retirement
- **DEC-5 / WS7A waiver:** Shift-intelligence `anomaly-alerts` — bare `number | null` fields; no `FinancialValue` wrapping; Phase 1.2B scope
- **DEF-NEVER:** `hold_percent` — dimensionless ratio, never `FinancialValue` in any phase

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Route handlers stripped of spoofable `casino_id` on in-scope routes | ✅ DEC-1 (MTL) + DEC-3 (loyalty/balances) — service always receives RLS context `casinoId` |
| 2 | OpenAPI `FinancialValue` component defined; representative path entries for all 11 families | ✅ `api-surface.openapi.yaml` — component at line 2181; 14 representative path entries; BRIDGE-001 + DEC-5 + DEF-NEVER annotated |
| 3 | Route-boundary contract tests enforce `casino_id` REMOVE, BRIDGE-001 envelope shape, and DEC-5 bare-number carve-out | ✅ 47 tests passing across 6 test files |
| 4 | Phase 1.2A close documentation | ✅ ROLLOUT-PROGRESS.md, PRD-071 Appendix A, EXEC-071 checkpoint |

**Exit gate (all passed 2026-04-30):**
- [x] DEC-1/DEC-3 contract tests green — spoofed `casino_id` stripped; service receives `rlsContext.casinoId`
- [x] BRIDGE-001 spot-check tests green — `value`, `type`, `source`, `completeness.status` present; `typeof value === 'number'`; no integer assertions
- [x] DEC-5 bare-number tests green — `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` are bare `number`, not `FinancialValue` objects
- [x] OpenAPI diff coherent — single `FinancialValue` component; representative families covered
- [x] No test asserts dollar-float as integer (BRIDGE-001 guard: `grep integer` CLEAN on BRIDGE-001 files)

---

### Phase 1.2B — Service Canonicalization  🟦 PRD DRAFTED

Blocked on: **EXEC-074** via `/lead-architect`, then `/build-pipeline`.

**Pipeline chain:**
- [x] PRD-074 drafted via `/prd-writer` — `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md` (2026-04-30)
- [ ] EXEC-074 scaffolded via `/lead-architect`
- [ ] `/build-pipeline` executed — dispatching `/backend-service-builder` and `/api-builder`

**Pending scope** (governed by PRD-074):
- BRIDGE-001 retirement: remove `/100` from service mappers; enforce `financialValueSchema.int()`; `formatCents` migration
- Shift-intelligence DTO field type promotion: `number | null` → `FinancialValue | null`
- Full 34-route OpenAPI + contract test coverage
- Runtime deprecation observability: structured log events per deprecated-field usage

**Scope note:** Component test births for `rating-slip-modal.test.tsx`, `start-from-previous.test.tsx`, and `start-from-previous-modal.test.tsx` are Phase 1.3, not Phase 1.2B, per PRD-071 Appendix D / DEF-006 and PRD-074.

---

### Phase 1.3 — UI Layer: Split Display + Labels  ⬜

Blocked on: Phase 1.2B exit gate + **Phase 1.3 PRD** + **Phase 1.3 EXEC-SPEC**.

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
| 2026-04-24 | **Phase 1.1 build-pipeline — WS0–WS7A shipped.** WS0 planning lock (GATE-070.6 defers shift-intelligence public fields to Phase 1.2; GATE-070.7 no-alias hard rename for `totalCashOut`). WS1 shared contract: `lib/financial/{schema,rounding}.ts` + 39 tests. WS2 internal service envelope: player-financial, loyalty, mtl, table-context (+ rundown-report, shift-checkpoint, shift-metrics submodules). WS3 rating-slip core. WS4/WS4_ROUTE/WS4_UI `totalCashOut` rename slice: full vertical (service + route handler + UI component + SQL migration `20260424024019_prd070_rename_modal_bff_total_cash_out.sql`). WS7A shift-intelligence Phase 1.1 split decision (JSDoc carve-outs, outbound-schema waiver). **EXEC-070 amended (scope deferral):** WS5/WS5_ROUTE/WS5_UI/WS6/WS7B deferred to FIB-FIN-CENTS-001 + FIB-FIN-SHIFT-001 child specs (blast-radius reality check). |
| 2026-04-24 | **PRD-072 Phase 1.1b shipped** (commit `38d25cc1`). FIB-FIN-CENTS-001 child spec closed at semantic-labeling scope only. `RecentSessionDTO.total_buy_in/total_cash_out/net` and `VisitLiveViewDTO.session_total_*` wrapped in `FinancialValue` (dollar float — `/100` preserved, intentional Phase 1.1b). `components/player-sessions/start-from-previous.tsx` + modal consumer updated with `.value` access. Route smoke tests born for recent-sessions + live-view routes. Phase 1.2 canonicalization (remove `/100`, integer cents, `formatCents` migration) explicitly deferred. Implementation précis: `docs/issues/gaps/financial-data-distribution-standard/precis/PRD-072-implementation-precis.md`. |
| 2026-04-24 | **EXEC-070 amended (child-spec completion).** WS5/WS5_ROUTE/WS5_UI/WS6 status changed to `completed_phase_1_1b_via_prd072` with Phase 1.2 obligations recorded per workstream. FIB-FIN-CENTS-001 blocker removed from WS9. **Sole remaining Phase 1.1 blocker: WS7B** (shift-intelligence authority routing — FIB-FIN-SHIFT-001 intake not yet drafted). WS9 test matrix amended: items 9/10/11 struck (component test dirs absent; review page excluded); items 4/12 remain blocked on WS7B. Checkpoint commit: `a89b5b20`. |
| 2026-04-24 | **FIB-FIN-SHIFT-001 intake drafted** (context-gathering session). Three defects catalogued: (1) no `resolveShiftMetricAuthority` helper — WS7A-frozen routing rules (`drop_total → estimated/table_session.drop`, `win_loss_cents → estimated/table_session.inventory_win`, `cash_obs_total → estimated/pit_cash_observation.extrapolated`, `hold_percent → null/bare`) not yet implemented; (2) `getAlerts` in `alerts.ts` assembles `ShiftAlertDTO` inline bypassing `mapShiftAlertRow` — divergent paths will require dual-site Phase 1.2 update; (3) `anomaly-alerts-route-boundary.test.ts` fixture and assertions reference legacy `gamingDay`/`computedAt` keys instead of current `AnomalyAlertsResponseDTO` shape (`baselineGamingDay`/`baselineCoverage`). Transitional Governance Caveat explicitly in scope: shift-intelligence bare-number fields are pre-migration state, not bridge DTOs. Intake artifacts: `FIB-H-FIN-SHIFT-001` + `FIB-S-FIN-SHIFT-001` in `intake/`. EXEC-070 WS7B child_fib pointers updated. **Next action: `/prd-writer` for FIB-FIN-SHIFT-001.** |
| 2026-04-24 | **PRD-073 drafted** (`/prd-writer` from FIB-FIN-SHIFT-001). `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md` — Status: Draft. Phase 1.1c child spec for WS7B. Scope: (1) `resolveShiftMetricAuthority(metricType: MetricType)` helper with all four WS7A-frozen routing rules; (2) mapper path unification — `mapAnomalyAlertRow` + `mapShiftAlertRow` both call the helper; `getAlerts` inline assembly deleted, delegates to `mapShiftAlertRow`; (3) `anomaly-alerts-route-boundary.test.ts` corrected — `gamingDay`/`computedAt` replaced with `baselineGamingDay`/`baselineCoverage`; (4) routing assertion suite in `mappers.test.ts` (4 MetricType values + `hold_percent → null` invariant + `cash_obs_total` static-threshold). No public DTO changes. No FinancialValue on alert numeric fields. No bridge DTO. No route/UI/SQL changes. Phase 1.2 deferrals explicit. WS9 items 4 + 12 unblock on impl close. **Next action: `/lead-architect` EXEC-SPEC for PRD-073 → `/build-pipeline` → WS9.** |
| 2026-04-25 | **Phase 1.1 closed — WS9 complete.** Verification matrix executed in full (amended set): items 1–4 (service slices) PASS; items 5–7 + 12 (route boundary + anomaly boundary) PASS; item 8 struck (complex client component — type-check + service/route tests cover rename equivalently; Phase 1.2 birth obligation); items 9–11 previously struck. DoD gates all PASS: type-check exit 0, lint exit 0 (fixed two `Function` type lint errors in PRD-072 route tests), build exit 0, `totalChipsOut` grep CLEAN. Phase 1.2 handoff package produced at `actions/PHASE-1.2-HANDOFF.md` — deferred field register, rollback matrix, cents canonicalization obligations, and Phase 1.2 skill routing recorded. EXEC-070 amended (ws9-completion). **Phase 1.2 entry: PRD-071 is drafted; EXEC-071 + build-pipeline next.** |
| 2026-04-30 | **Phase 1.2A closed — EXEC-071 WS1–WS3 complete.** Delivered: (1) WS1 route audit + `casino_id` REMOVE — MTL `gaming-day-summary`/`entries` and `loyalty/balances` stripped of client-supplied `casino_id`; `mwCtx.rlsContext!.casinoId` is now the sole casino scope on those routes (DEC-1, DEC-3); loyalty schemas updated, MTL query/service schemas updated; hooks patched to drop `casino_id` from client calls; (2) WS2 OpenAPI `FinancialValue` component defined once at line 2181 in `api-surface.openapi.yaml`; 14 new representative path entries covering all 11 in-scope route families; BRIDGE-001 surfaces (`recent-sessions`, `live-view`) reference `$ref FinancialValue` with `value: type: number`; DEC-5 (`anomaly-alerts`) and DEF-NEVER (`hold_percent`) annotated explicitly; (3) WS3 route-boundary contract tests — 47 tests passing across 6 files; DEC-1/DEC-3 REMOVE assertions verify spoofed `casino_id` is stripped; BRIDGE-001 spot-checks assert all 4 `FinancialValue` keys on all 3 financial fields; DEC-5 asserts bare `number`, not objects; no integer assertions on BRIDGE-001 value fields (guard CLEAN); (4) WS4 close documentation (this entry). **Phase 1.2B pending:** BRIDGE-001 retirement + shift-intelligence DTO type promotion + full 34-route coverage → PRD-074. |
| 2026-04-30 | **PRD-074 drafted** (`/prd-writer` from Phase 1.2B FIB-H/FIB-S). `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md` — Status: Draft. Scope: BRIDGE-001 retirement, integer-cents validation, shift-intelligence DTO field promotion, BRIDGE-001 `formatCents` render migration, full 34-route OpenAPI coverage, full route contract coverage, and runtime deprecation log events. Component test births explicitly moved to Phase 1.3 per PRD-071 Appendix D / DEF-006. **Next action: `/lead-architect` scaffold EXEC-074 → `/build-pipeline`.** |
| 2026-04-25 | **PRD-073 shipped — WS7B closed** (`/build-pipeline` via EXEC-073). Phase 1.1c complete. Delivered: (1) `resolveShiftMetricAuthority` exported from `services/shift-intelligence/mappers.ts` — exhaustive switch over all 4 MetricType values, `hold_percent → null` (RULE-2), `cash_obs_total → estimated/pit_cash_observation.extrapolated` (static-threshold invariant), `default` throws with `never` narrowing (compile-time exhaustiveness gate); (2) `void resolveShiftMetricAuthority(...)` call injected into both `mapAnomalyAlertRow` and `mapShiftAlertRow` (Phase 1.1 dead-read path unification, `void` prefix prevents linter removal); (3) `getAlerts` in `alerts.ts` refactored — 36-line `as any` inline assembly replaced with typed `AlertQueryRow` assertion + join normalization + `mapShiftAlertRow` delegation; (4) `anomaly-alerts-route-boundary.test.ts` fixture and assertions corrected (`baselineGamingDay`/`baselineCoverage`, no `gamingDay`/`computedAt`); (5) routing suite added to `mappers.test.ts` (5 cases including unknown→throw); (6) delegation suite added to `alerts-mappers.test.ts` (3 cases). Two patch deltas assessed against EXEC-073; §2 patch-01 and §1 patch-02 rejected; §4/§6 patch-01 and §3 patch-02 accepted. Gates: `npm run type-check` exit 0; 95/95 tests pass. Implementation précis: `intake/FIB-FIN-SHIFT-001/PRD-073-implementation-precis.md`. **WS9 now unblocked.** |
