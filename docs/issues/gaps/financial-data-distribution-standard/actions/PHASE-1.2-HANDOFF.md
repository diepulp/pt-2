---
name: Financial Telemetry Wave 1 — Phase 1.2 Handoff Package
description: Authoritative Phase 1.2 entry brief. Produced by WS9 at Phase 1.1 close (2026-04-25). Records every deferred field, owner, consumer obligation, and canonicalization requirement.
type: handoff-package
produced_by: WS9 (EXEC-070)
phase_closed: "1.1"
phase_opened: "1.2"
date: "2026-04-25"
---

# Financial Telemetry Wave 1 — Phase 1.2 Handoff Package

> **Phase 1.1 closed 2026-04-25.** This document is the authoritative entry point for Phase 1.2 (API Layer: Envelope at the Wire). Every item below is a precondition, obligation, or risk that Phase 1.2 must resolve before its own exit gate.

---

## 1. Phase 1.1 Verification Summary (WS9)

All gates passed on 2026-04-25.

| Gate | Result |
|------|--------|
| `npm run test:slice:rating-slip-modal -- --runInBand` | 5 suites / 124 tests PASS |
| `npm run test:slice:visit -- --runInBand` | 4 suites / 45 tests PASS |
| `npm run test:slice:rating-slip -- --runInBand` | 6 suites / 150 tests PASS |
| `npm run test:slice:shift-intelligence -- --runInBand` | 8 suites / 95 tests PASS |
| `route.test.ts` — modal-data | PASS |
| `route.test.ts` — recent-sessions | PASS |
| `route.test.ts` — live-view | PASS |
| `anomaly-alerts-route-boundary.test.ts` | PASS |
| `npm run type-check` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| grep gate: `totalChipsOut` in live code | CLEAN — zero references |

**Items struck from matrix (not run):**

| Item | Path | Reason |
|------|------|--------|
| 8 | `components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx` | Not born in WS4_UI; complex client component; rename verified by type-check + service/route layers; Phase 1.2 obligation |
| 9 | `components/player-sessions/__tests__/start-from-previous.test.tsx` | Dir absent — Phase 1.2 birth obligation |
| 10 | `components/player-sessions/__tests__/start-from-previous-modal.test.tsx` | Dir absent — Phase 1.2 birth obligation |
| 11 | `app/review/start-from-previous/__tests__/page.test.tsx` | Review page excluded per user directive 2026-04-24 |

---

## 2. Phase 1.2 Entry Requirements (PRD-071 is drafted; EXEC-SPEC pending)

Phase 1.2 is **blocked on**: Phase 1.1 exit gate (✅ passed) + EXEC-SPEC scaffolding + build-pipeline execution.

**PRD-071** is drafted at `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`. The EXEC-SPEC must be scaffolded via `/lead-architect` before any Phase 1.2 implementation begins.

---

## 3. Deferred Field Register — Phase 1.2 Obligations

### 3.1 Shift-Intelligence Public Fields (highest priority)

| Field | DTO | Consumer routes | Consumer components |
|-------|-----|-----------------|---------------------|
| `observedValue` | `AnomalyAlertDTO` | `GET /api/v1/shift-intelligence/anomaly-alerts` | `components/shift-intelligence/anomaly-alert-card.tsx` |
| `baselineMedian` | `AnomalyAlertDTO` | same | same |
| `baselineMad` | `AnomalyAlertDTO` | same | same |
| `thresholdValue` | `AnomalyAlertDTO` | same | same |
| `observedValue` | `ShiftAlertDTO` | `GET /api/v1/shift-intelligence/alerts` | `components/shift-dashboard/alerts-panel.tsx`, `components/admin-alerts/alerts-page-client.tsx`, `components/admin-alerts/acknowledge-alert-dialog.tsx` |
| `baselineMedian` | `ShiftAlertDTO` | same | same |
| `baselineMad` | `ShiftAlertDTO` | same | same |

**Phase 1.2 obligation:** Bundle route handler serialization, DTO contract update, and component `.value` access migration for all fields above in a single bounded slice. `resolveShiftMetricAuthority` is already implemented (PRD-073) and returns the correct `{ type, source }` — Phase 1.2 assigns this into `FinancialValue` instead of discarding it.

**RULE preserved from Phase 1.1 (HARD):** `hold_percent` is NEVER wrapped in `FinancialValue`. It is a bare ratio always. The exhaustive switch in `resolveShiftMetricAuthority` returns `null` for `hold_percent` — Phase 1.2 must not change this.

### 3.2 Cents Canonicalization Obligations (from PRD-072 Phase 1.1b)

These changes are **prohibited** until Phase 1.2 owns them explicitly:

| Service | File | Current state | Phase 1.2 action |
|---------|------|---------------|------------------|
| `services/visit/` | `crud.ts` lines 526–528 | `/100` pre-conversion preserved; `FinancialValue.value` is dollar float | Remove `/100`; `value` → integer cents |
| `services/rating-slip/` | `mappers.ts` | `/100` in `toVisitLiveViewDTO`; `FinancialValue.value` is dollar float | Remove `/100`; `value` → integer cents |
| `components/player-sessions/` | `start-from-previous.tsx` | `formatDollars(session.field.value)` — dollar float display | Migrate to `formatCents(session.field.value)` |
| `services/visit/` | `schemas.ts` `financialValueSchema` | `z.number().int()` constraint NOT applied (aspirational) | Apply `z.number().int()` once value is integer cents |

**Dollar-to-cents rounding pin:**
- File: `lib/financial/__tests__/schema.test.ts`
- The rounding test cases in this file are the canonical reference for Phase 1.2 rounding behavior. Do not remove or weaken these tests.
- The `dollarsToCents` function in `lib/financial/rounding.ts` is the single source of truth for rounding.

### 3.3 Route and Component Test Obligations (born in Phase 1.2)

| Missing test | Owner | Trigger |
|--------------|-------|---------|
| `components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx` | rating-slip-modal | Phase 1.2 DTO shape change for `totalCashOut` display |
| `components/player-sessions/__tests__/start-from-previous.test.tsx` | visit/player-session | Phase 1.2 cents-display migration |
| `components/player-sessions/__tests__/start-from-previous-modal.test.tsx` | visit/player-session | Phase 1.2 cents-display migration |
| Route test matrix expansion — `recent-sessions` | visit | unauthorized, 404, validation-error cases |
| Route test matrix expansion — `live-view` | rating-slip | unauthorized, 404, validation-error cases |

---

## 4. Rollback Matrix — Completed (WS2–WS7)

| Change set | Files that must revert together | Revert owner | Notes |
|------------|--------------------------------|--------------|-------|
| WS2 internal DTO envelope | `services/player-financial/`, `services/loyalty/`, `services/mtl/`, `services/table-context/` — all DTO/schema/mapper/test files | Service engineer | Git revert only; no schema/data rollback required |
| WS3 rating-slip core | `services/rating-slip/` DTO/schema/mapper/test files excluding live-view route scope | rating-slip owner | Revert separately from WS6 if live-view slice must stay |
| WS4 modal rename slice | `services/rating-slip-modal/**`, `app/api/v1/rating-slips/[id]/modal-data/**`, `components/modals/rating-slip/rating-slip-modal.tsx` | rating-slip-modal owner | No alias fallback path — one atomic revert |
| WS5/PRD-072 recent-sessions | `services/visit/dtos.ts`, `services/visit/crud.ts`, `app/api/v1/players/[playerId]/recent-sessions/route.ts`, `components/player-sessions/start-from-previous.tsx`, `components/player-sessions/start-from-previous-modal.tsx` | visit owner | Revert service + route + UI together to avoid unit mismatch |
| WS6/PRD-072 live-view | `services/rating-slip/mappers.ts`, `services/visit/dtos.ts` (live-view fields), `app/api/v1/visits/[visitId]/live-view/route.ts` | rating-slip owner | Revert as one route-boundary slice |
| WS7A/WS7B/PRD-073 shift-intelligence | `services/shift-intelligence/mappers.ts`, `services/shift-intelligence/alerts.ts`, `services/shift-intelligence/__tests__/*` | shift-intelligence owner | Safe to revert independently; public DTO shape deferred to Phase 1.2 |

---

## 5. Phase 1.1 → Phase 1.2 API Contract Delta

The following items changed at the service layer in Phase 1.1 but are **not yet visible at the HTTP wire**. Phase 1.2 must propagate each to the API boundary:

| Service change | Route(s) affected | Current wire shape | Phase 1.2 wire shape |
|----------------|-------------------|--------------------|----------------------|
| `RecentSessionDTO.total_buy_in/total_cash_out/net` → `FinancialValue` (dollar float) | `GET /api/v1/players/[playerId]/recent-sessions` | Already serializing `FinancialValue` (Phase 1.1b) | Canonicalize to integer cents |
| `VisitLiveViewDTO.session_total_*` → `FinancialValue` (dollar float) | `GET /api/v1/visits/[visitId]/live-view` | Already serializing `FinancialValue` (Phase 1.1b) | Canonicalize to integer cents |
| `AnomalyAlertDTO` numeric fields — deferred | `GET /api/v1/shift-intelligence/anomaly-alerts` | Bare `number \| null` | Wrap in `FinancialValue` (except `hold_percent`) |
| `ShiftAlertDTO` numeric fields — deferred | `GET /api/v1/shift-intelligence/alerts` | Bare `number \| null` | Wrap in `FinancialValue` |

---

## 6. Wave 1 Invariants Preserved Through Phase 1.1

| Invariant | Enforcement point | Status |
|-----------|------------------|--------|
| `hold_percent` is never wrapped in `FinancialValue` | `resolveShiftMetricAuthority` returns `null`; exhaustive switch throws on unknown MetricType | ✅ Enforced by code + test |
| `cash_obs_total` authority = `estimated`, source = `pit_cash_observation.extrapolated` | Frozen in `resolveShiftMetricAuthority`; tested in `mappers.test.ts` | ✅ Enforced by code + test |
| `FinancialValue.value` is integer cents at canonical wire boundary | Phase 1.2 obligation — dollar floats currently in `services/visit/` and `services/rating-slip/` | ⛔ Phase 1.2 |
| No `as any` in financial service layer | `getAlerts` inline assembly removed (PRD-073); lint clean | ✅ Enforced by lint |
| `totalCashOut` rename — zero `totalChipsOut` in live code | grep gate CLEAN | ✅ Enforced by grep + type-check |
| Outbound Zod schema for shift-intelligence DTOs | Explicitly waived in Phase 1.1 | ⛔ Phase 1.2 (if in scope) |

---

## 7. Phase 1.2 Skill Routing

Per ROLLOUT-ROADMAP.md §9 and EXEC-070 Phase 6 notes:

- **EXEC-SPEC scaffolding:** `/lead-architect` (EXEC-071 not yet created)
- **Service layer:** `/backend-service-builder` (shift-intelligence DTO updates, cents canonicalization)
- **Route handlers:** `/api-builder` (all route serialization updates)
- **UI layer:** `/frontend-design-pt-2` (component `.value` access migration, `formatCents` adoption)
- **Orchestration:** `/build-pipeline` dispatches all of the above

**Do not begin Phase 1.2 implementation without an approved EXEC-071.**
