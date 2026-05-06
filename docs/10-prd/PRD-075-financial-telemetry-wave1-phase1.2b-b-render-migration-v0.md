---
id: PRD-075
title: Financial Telemetry - Wave 1 Phase 1.2B-B - Render Migration
owner: Lead Architect (spec steward); Engineering (implementation)
status: Draft
affects:
  - PRD-074
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
created: 2026-05-03
last_review: 2026-05-03
phase: Wave 1 Phase 1.2B-B - UI Render Migration
pattern: Presentation-only; single component, three call sites
http_boundary: false
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md
predecessor_exec: docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-a-service-canonicalization.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.json
sdlc_category: UI
pipeline_chain: /prd-writer -> /lead-architect EXEC-075 -> /build-pipeline
---

# PRD-075 - Financial Telemetry - Wave 1 Phase 1.2B-B - Render Migration

## 1. Overview

- **Owner:** Lead Architect (spec steward). Engineering owns implementation through `frontend-design-pt-2`.
- **Status:** Draft
- **Summary:** Phase 1.2B-B fixes a live display error introduced by Phase 1.2B-A's retirement of BRIDGE-001. `start-from-previous.tsx` still calls `formatDollars` on `FinancialValue.value` fields that are now integer cents. A pit boss reviewing a prior buy-in of $75 sees `$7,500` — off by a factor of 100. This slice replaces the three `formatDollars` call sites in that component with `formatCents`, runs the Q-4 consumer audit grep to confirm no other runtime call sites exist, and closes DEF-004 in `ROLLOUT-TRACKER.json`. No service layer, route handler, OpenAPI contract, test file, or observability work is introduced; those remain Phase 1.2B-C.

## 2. Problem & Goals

### 2.1 Problem

Phase 1.2B-A retired BRIDGE-001 by removing the `/100` service-layer dollar-float conversions. `FinancialValue.value` is now integer cents at the service boundary. `start-from-previous.tsx` was not updated in that slice — DEF-004 in the rollout tracker explicitly deferred the render migration until integer-cents was confirmed stable at the service boundary. That confirmation now exists. The component still calls `formatDollars` at lines 202, 208, and 226, producing a factor-of-100 display error on the surface a pit boss uses when deciding whether and at what limit to open a new session for a returning player.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 - Correct render** | `start-from-previous.tsx` renders `$75` for a 7500-cent buy-in, not `$7,500` |
| **G2 - No stray call sites** | Q-4 audit confirms no runtime UI `formatDollars` call site passes a `FinancialValue.value` field outside the three named targets |
| **G3 - Clean build** | `npm run type-check`, `npm run lint`, and `npm run build` exit 0 after the migration |
| **G4 - Tracker closure** | DEF-004 is closed in `ROLLOUT-TRACKER.json` with the implementation commit SHA or an explicit post-commit closure follow-up |
| **G5 - Clean handoff** | Phase 1.2B-C can begin against a correct render baseline without rewriting this slice |

### 2.3 Non-Goals

- No service layer, route handler, or DTO changes of any kind.
- No OpenAPI path entry creation, modification, or expansion (full 28-route expansion is Phase 1.2B-C).
- No new route-boundary test files or matrices (Phase 1.2B-C).
- No DEC-6 `GET /api/v1/shift-intelligence/alerts` path entry (Phase 1.2B-C).
- No runtime structured log events or deprecation observability (Phase 1.4 or Phase 1.2B-C).
- No component test births — `start-from-previous.test.tsx` / `start-from-previous-modal.test.tsx` belong to Phase 1.3 (DEF-006).
- No `components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, or `CompletenessBadge.tsx` (Phase 1.3).
- No `lib/format.ts` formatter consolidation or forbidden-label removal (Phase 1.3).
- No `components/shift-dashboard-v3/**` migration to `<FinancialValue>` (Phase 1.3).
- No migration of `formatDollars(player.total_net_today)` at `player-list-panel.tsx:234` — `player.total_net_today` is a bare `number`, not a `FinancialValue.value` field.
- No `hold_percent` wrapping in `FinancialValue` at any layer in any phase (DEF-NEVER).

## 3. Users & Use Cases

- **Primary users:** Pit bosses and floor supervisors opening new sessions for returning players; frontend engineers executing the call-site swap; the lead architect stewarding the financial telemetry rollout.

**Top Jobs:**

- As a **pit boss**, I need the "Start from Previous Session" panel to show the correct dollar amounts from a player's prior session so I can set accurate table limits and rating slip parameters.
- As a **frontend engineer**, I need a clearly bounded list of call sites to update so the render fix can ship without scope creep or test-infrastructure dependencies.
- As a **lead architect**, I need DEF-004 closed with a real commit SHA, or an explicit post-commit closure follow-up marker, and the Q-4 audit documented clean so Phase 1.2B-C can begin on a verified baseline.

## 4. Scope & Feature List

### 4.1 In Scope

**Precondition Gate:**
- If any `FinancialValue.value` feeding `start-from-previous.tsx` is not integer cents, this PRD is invalid and execution must halt.

**Q-4 Consumer Audit (grep-only discovery, no logic change):**
- Grep runtime UI code for `formatDollars` call sites that pass a `FinancialValue.value` field, excluding historical planning/specification documents.
- Confirm no formatter, direct or indirect, consumes `FinancialValue.value` using dollar-based assumptions.
- Confirm `start-from-previous.tsx` lines 202, 208, and 226 are the only affected sites.
- Confirm `start-from-previous-modal.tsx`, `rating-slip-modal.tsx`, and `player-list-panel.tsx` are clean.
- Discovery of additional call sites invalidates the slice and requires re-scoping, not incremental amendment.

**Render Migration (logic change, 1 file):**
- Update the import in `components/player-sessions/start-from-previous.tsx` from `formatDollars` to `formatCents`.
- Update the stale financial-unit comment in `components/player-sessions/start-from-previous.tsx` so it no longer describes `FinancialValue.value` as a dollar float.
- Replace `formatDollars(session.total_buy_in.value)` with `formatCents(session.total_buy_in.value)` at line 202.
- Replace `formatDollars(session.total_cash_out.value)` with `formatCents(session.total_cash_out.value)` at line 208.
- Replace `formatDollars(session.net.value)` with `formatCents(session.net.value)` at line 226.

**Tracker Closure (artifact update):**
- Close DEF-004 in `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` after `npm run build` exits 0.
- Use `commit_sha_pending: true` if DEF-004 closure lands in the implementation commit.
- Perform a post-commit tracker-only follow-up that replaces `commit_sha_pending: true` with the real implementation commit SHA before Phase 1.2B-C starts.

### 4.2 Out of Scope

- `start-from-previous-modal.tsx` — no `FinancialValue` financial field reads; no changes needed.
- `rating-slip-modal.tsx` — no `RecentSessionDTO` / `VisitLiveViewDTO` field reads; no changes needed.
- `player-list-panel.tsx:234` — `formatDollars(player.total_net_today)` reads a bare `number`; out of scope.
- All route handler, service, OpenAPI, and test files — no logic changes in this slice.
- All Phase 1.3 and Phase 1.4 items listed in §2.3.

## 5. Requirements

### 5.1 Functional Requirements

1. `formatDollars` must be absent from `start-from-previous.tsx` for all three `FinancialValue.value` field reads after the migration.
2. `formatCents` must be the formatter at lines 202, 208, and 226 of `start-from-previous.tsx`.
3. The Q-4 audit must confirm no other runtime UI `formatDollars` call site passes a `FinancialValue.value` integer-cents field and no formatter, direct or indirect, consumes `FinancialValue.value` using dollar-based assumptions.
4. Only `start-from-previous.tsx` may receive logic changes in this slice; no other file is modified for logic.
5. `ROLLOUT-TRACKER.json` must record DEF-004 closed with the real implementation commit SHA or a post-commit closure follow-up marker.

### 5.2 Non-Functional Requirements

1. `npm run type-check` must exit 0 after the import swap and call-site replacements.
2. `npm run lint` must exit 0.
3. `npm run build` must exit 0.
4. No new test files, OpenAPI paths, route tests, service modules, or observability wiring are introduced; if any downstream artifact requires these, execution must stop for FIB amendment.
5. The slice must be shippable without Phase 1.2B-C, while leaving Phase 1.2B-C able to proceed against a correct render baseline without rewriting this slice.
6. `hold_percent` must not be wrapped in `FinancialValue` at any layer.

## 6. UX / Flow Overview

- Pit boss opens a returning player's profile in the "Start from Previous Session" panel.
- Prior session fields — buy-in, cash out, net — now display correctly under the existing formatter contract: 7500 cents renders as `$75`; -2500 cents renders as `-$25`.
- No change in layout, interaction model, or panel behavior; only the rendered dollar string changes.

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.2B-A exit gate:** EXEC-074 closed 2026-04-30 (commit `e83a2c12`). `FinancialValue.value` is integer cents for `RecentSessionDTO` financial fields; `financialValueSchema.int()` enforced; BRIDGE-001 retired.
- **`formatCents` exists:** `lib/format.ts` exports `formatCents(n: number): string` with the same call signature as `formatDollars`; no new utility is required.
- **Context confirmations from FIB intake:** `start-from-previous-modal.tsx`, `rating-slip-modal.tsx`, and `player-list-panel.tsx:234` confirmed clean during context gathering for the FIB.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| Q-4 audit finds an additional `FinancialValue.value` call site | Stop; amend FIB before touching the new site |
| `formatCents` signature differs from `formatDollars` | Verify during EXEC-SPEC planning; treat a parameter mismatch as a blocker requiring FIB amendment. Decimal-preserving output is not expected in this slice because `formatCents` delegates to `formatDollars`, which renders whole-dollar strings. |
| Render fix deferred to Phase 1.3 to reduce slice count | Unacceptable; DEF-004 was deferred only until integer-cents was confirmed stable — that confirmation exists |
| `player-list-panel.tsx:234` migration bundled in | `player.total_net_today` is a bare `number`; bundling would change its display semantics, not fix a cents/dollars mismatch — reject |

### 7.3 Open Questions for EXEC-075

- None. DEF-004 closure uses `commit_sha_pending: true` in the implementation commit when the real SHA is not yet knowable, followed by a tracker-only SHA closure before Phase 1.2B-C starts.
- Q-4 is a grep step resolved during planning; no formatter or surface-design question remains open at scaffold time.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `formatDollars` is absent from `start-from-previous.tsx` for all three `FinancialValue.value` field reads.
- [ ] The `formatDollars` import is absent from `start-from-previous.tsx`.
- [ ] `formatCents` is the formatter at lines 202, 208, and 226 of `start-from-previous.tsx`.
- [ ] Q-4 consumer audit returns clean: no other runtime UI `formatDollars` call site passes a `FinancialValue.value` integer-cents field.
- [ ] Q-4 command is recorded with output: `rg -n "formatDollars\\([^\\)]*\\.value\\)" app components hooks services lib -S`, with only the three pre-migration `start-from-previous.tsx` paths before the swap and no results after the swap.

**Data & Integrity**
- [ ] A prior session with `total_buy_in = 7500` renders as `$75` in the start-from-previous panel.
- [ ] A prior session with `net = -2500` renders as `-$25` in the start-from-previous panel.

**Security & Access**
- [ ] No route handler, service, RLS policy, or authorization behavior is changed.

**Testing**
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run build` exits 0.
- [ ] No new test files are created in this slice.

**Operational Readiness**
- [ ] Rollback is defined as a revert of the `start-from-previous.tsx` import/call-site changes plus the matching `ROLLOUT-TRACKER.json` DEF-004 closure change; if SHA closure used a second commit, both commits are reverted or the tracker is corrected explicitly.
- [ ] No observability, logging, or runtime instrumentation is introduced.

**Documentation**
- [ ] The stale financial-unit comment in `components/player-sessions/start-from-previous.tsx` is updated to integer-cents semantics.
- [ ] The stale `RecentSessionDTO` financial-unit comments in `services/visit/dtos.ts` are either updated in this slice as comment-only documentation cleanup or captured in a named follow-up defect before Phase 1.2B-C starts.
- [ ] DEF-004 is closed in `ROLLOUT-TRACKER.json` with the implementation commit SHA or a post-commit closure follow-up marker.
- [ ] Phase 1.2B-C remains documented as the owner of full OpenAPI expansion, route matrices, DEC-6, and deprecation observability.

## 9. Related Documents

**FIB Intake Artifacts**
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.json`

**Predecessor PRDs and Execution**
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`
- `docs/10-prd/PRD-072-financial-telemetry-wave1-phase1.1b-visit-anchored-cents-envelope-v0.md`
- `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md`
- `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md`
- `docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-a-service-canonicalization.md`

**Architecture, Quality, and Governance**
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/40-quality/README.md`
- `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

**Rollout Governance**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`

---

## Appendix A: Scope Guardrail Summary

| Guardrail | Rule |
|-----------|------|
| Primary layer | UI (Presentation) |
| Secondary layers | Rollout tracker status only (DEF-004 closure) |
| Logic-bearing files | 1 — `components/player-sessions/start-from-previous.tsx` |
| Directory boundaries | 1 — `components/player-sessions/` |
| Bounded contexts | 1 — player-sessions UI component |
| OpenAPI kill-switch | No paths, schemas, or components touched |
| Test kill-switch | No new test files, no existing test file edits |
| Route boundary | No route handler changes |
| Service boundary | No service layer changes |
| Observability boundary | No runtime logs, metrics, or structured events |
| Ratio boundary | `hold_percent` is never `FinancialValue` |

## Appendix B: Successor Slice

Phase 1.2B-C requires its own PRD and FIB pair after Phase 1.2B-B exits. It owns:

- Full 28-route OpenAPI expansion for financially-relevant routes.
- 4-case route-boundary test matrices for `recent-sessions` and `live-view`.
- DEC-6: `GET /api/v1/shift-intelligence/alerts` OpenAPI path entry and route-boundary test birth.
- Structured log events per deprecated-field usage at route handlers.
- Deprecation observability.

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-03 | Codex / PRD Writer | Generated from Phase 1.2B-B FIB-H/FIB-S pair; strict Presentation-only scope |
