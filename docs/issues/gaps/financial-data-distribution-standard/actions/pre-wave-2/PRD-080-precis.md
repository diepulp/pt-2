## PRD-080: Financial Telemetry — Pre-Wave-2 Surface Debt Closure — Delivery Précis

### What This Was (And Was Not)

PRD-080 is a **surface-layer debt closure slice** — it wraps 12 bare-number currency fields deferred from Wave 1 as canonical `FinancialValue` objects across 4 DTOs in 3 bounded contexts. It does **not** change database schema, introduce new routes, modify authentication/RLS policy, or perform any Wave 2 dual-layer or outbox work.

**One-line invariant enforced throughout:** *`financialValueSchema.parse()` is called at the outbound mapper boundary for every wrapped field. Badge computation on MTL entries is performed on the bare `row.amount` number **before** wrapping — the badge-order invariant must survive all future refactors.*

**Compliance isolation (F-11):** `type: 'compliance'` values (MTL) are never co-aggregated with `type: 'actual'` values (PFT). The MTL UI accumulates MTL entries only; the rating-slip modal financial section is PFT-only. This invariant was verified via a dedicated F-11 route-boundary test added in WS6.

**DEC-1 (carries forward to Wave 2):** Standalone `GET /api/v1/visits/{visitId}/financial-summary` and the modal-data financial section both emit `completeness.status: 'unknown'` always. The underlying views have no gaming-day lifecycle column. Wave 2 must introduce lifecycle-aware projection infrastructure before `'complete'` or `'partial'` can be emitted on these fields.

---

### Field Classification Map

| Group | DTO | Fields | type | source | completeness |
|-------|-----|--------|------|--------|--------------|
| A | `VisitFinancialSummaryDTO` | `total_in`, `total_out`, `net_amount` | `actual` | `PFT` | `unknown` (DEC-1) |
| B | `FinancialSectionDTO` | `totalCashIn`, `totalCashOut`, `netPosition` | `actual` | `PFT` | `unknown` (DEC-1) |
| C | `MtlEntryDTO` | `amount` | `compliance` | `mtl_entry` | `complete` |
| D | `MtlGamingDaySummaryDTO` | `total_in`, `total_out`, `total_volume` | `compliance` | `mtl_entry` | `unknown` (DEC-1) |
| D | `MtlGamingDaySummaryDTO` | `max_single_in`, `max_single_out` | `compliance` | `mtl_entry` | `unknown` (DEC-2: `null` when no transactions) |

---

### Artifacts Delivered

**WS1 — Inventory and Classification Lock** *(no code changes)*
- Grep-verified consumer callsite counts against `PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md`
- FLAG-1 resolved: `app/review/mtl-form/mtl-entry-form.tsx` does not exist — removed from WS4 scope; WS4 scope corrected to 5 files, 13 callsites
- FLAG-2 resolved: `compliance-dashboard.tsx:132` reads `total_volume` (not `total_in`) — WS5 consumer map corrected
- DEC-1 and DEC-2 frozen; EXEC-SPEC updated with decision records

**WS2 — `VisitFinancialSummaryDTO` FinancialValue Wrap**
- `services/player-financial/dtos.ts` — `total_in`, `total_out`, `net_amount` changed from `number` to `FinancialValue`
- `services/player-financial/mappers.ts` — `toVisitFinancialSummaryDTO`: `financialValueSchema.parse()` wrapping for all three fields (actual/PFT/unknown)
- `services/player-financial/crud.ts` — PGRST116 zero-fallback return path: inline `{ total_in: 0, ... }` literal wrapped with `financialValueSchema.parse()`
- `services/player360-dashboard/crud.ts` — inline `financialSummary` construction (buildSession path): all three fields wrapped
- `services/player360-dashboard/mappers.ts` — 5 callsites: `.net_amount`, `.total_in`, `.previousPeriodSummary.net_amount` (×3) unwrapped with `.value`
- `hooks/mtl/use-patron-daily-total.ts` — lines 124–125: `.total_in`, `.total_out` unwrapped with `.value`
- `components/mtl/gaming-day-summary.tsx` — no consumer change needed (reads different DTO)
- `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx` — line 43: `.total_in.value + .total_out.value`
- `services/player-financial/__tests__/mappers.test.ts` — all bare-number assertions replaced with FinancialValue shape assertions; "high-precision amounts" test corrected to integer cents (schema enforces `safeint`)

**WS3 — `FinancialSectionDTO` FinancialValue Wrap**
- `services/rating-slip-modal/dtos.ts` — `totalCashIn`, `totalCashOut`, `netPosition` changed from `number` to `FinancialValue`
- `services/rating-slip-modal/rpc.ts` — mapper section: `financialValueSchema.parse()` wraps DB bare numbers for all three fields (actual/PFT/unknown). Type guard still checks `typeof financial.totalCashIn !== 'number'` — DB still returns raw numbers, wrapper fires at the service mapper boundary
- `app/api/v1/rating-slips/[id]/modal-data/route.ts` — WS2 bridge (`.value` unwrap added temporarily in WS2) removed; `FinancialValue` now passes through directly to `FinancialSectionDTO`

**WS3b — `FinancialSectionDTO` Consumer Fix (rating-slip-modal.tsx)**
- `components/modals/rating-slip/rating-slip-modal.tsx` — line 554: `totalCashIn / 100` → `totalCashIn.value / 100`; line 560: `totalCashOut + pendingChipsTaken * 100` → `totalCashOut.value + pendingChipsTaken * 100`
- `components/modals/rating-slip/form-section-cash-in.tsx` — no change needed (receives derived `number` prop, not `FinancialValue` directly)

**WS4 — `MtlEntryDTO.amount` FinancialValue Wrap**
- `services/mtl/dtos.ts` — `amount` changed from `number` to `FinancialValue`
- `services/mtl/mappers.ts` — `mapMtlEntryRow`: `deriveEntryBadge(row.amount, thresholds)` called on bare number **first**; then `financialValueSchema.parse({value: row.amount, type: 'compliance', source: 'mtl_entry', completeness: {status: 'complete'}})` wraps. Badge-order invariant preserved and documented
- `components/mtl/entry-list.tsx:229` — `formatCents(entry.amount)` → `formatCents(entry.amount.value)`
- `components/mtl/entry-detail.tsx:168` — same pattern
- `components/mtl/mtl-entry-form.tsx` — lines 460/462: `runningCashIn/Out += entry.amount` → `.value`; line 547: `formatCents(entry.amount)` → `.value`; lines 679/681: `acc.cashIn/Out += entry.amount` → `.value`; optimistic entry construction (line ~714): `amount: amountCents` wrapped with `financialValueSchema.parse({value: amountCents, type: 'compliance', source: 'mtl_entry', completeness: {status: 'complete'}})`
- `components/mtl/mtl-entry-view-modal.tsx` — lines 226/228, 429/431: reduce accumulators `.value`; line 306: `formatCents` unwrap
- `components/mtl/compliance-dashboard.tsx:386` — `adjustmentTarget.amount / 100` → `adjustmentTarget.amount.value / 100`
- `services/mtl/__tests__/mappers.test.ts` — FinancialValue shape assertions for `mapMtlEntryRow`; badge-order invariant test added (badge derived from bare `5000000`, which exceeds CTR threshold)

**WS5 — `MtlGamingDaySummaryDTO` FinancialValue Wrap**
- `services/mtl/dtos.ts` — `total_in`, `total_out`, `total_volume` changed from `number` to `FinancialValue`; `max_single_in`, `max_single_out` changed from `number | null` to `FinancialValue | null` (DEC-2)
- `services/mtl/mappers.ts` — `mapGamingDaySummaryRow`: all five fields wrapped (compliance/mtl_entry/unknown); `max_single_in/out` use null-conditional: `row.max_single_in === null ? null : financialValueSchema.parse(...)`
- `components/mtl/compliance-dashboard.tsx:132` — `s.total_volume` → `s.total_volume.value`
- `hooks/mtl/use-patron-daily-total.ts` — already updated in WS2 (reads `VisitFinancialSummaryDTO`); WS5 confirms no double-update
- `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx` — already updated in WS2 via total_in/out.value unwrap
- `components/mtl/gaming-day-summary.tsx` — removed incorrect inline FinancialValue wrapper constructions (had wrong `source: 'mtl_gaming_day'`, `completeness: {status: 'complete'}`); now passes `summary.total_in` / `summary.total_out` directly as the correctly classified `FinancialValue` from the mapper

**WS6 — OpenAPI and Route-Boundary Test Alignment**
- `docs/25-api-data/api-surface.openapi.yaml`:
  - `GET /visits/{visit_id}/financial-summary`: `total_in`, `total_out`, `net_amount` changed from `type: number` to `allOf: [$ref: '#/components/schemas/FinancialValue']`
  - `GET /rating-slips/{rating_slip_id}/modal-data`: `financial` object section added with all three fields referencing `FinancialValue`
- `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts`:
  - Both `getVisitSummary` and `getModalDataViaRPC` mocks updated to return FinancialValue objects (inlined due to `jest.mock` hoisting constraint)
  - FinancialValue shape assertion test: `value`, `type`, `source`, `completeness.status` present on all three financial fields
  - F-11 isolation test: asserts `type: 'actual'` (not `'compliance'`) on `totalCashIn`, `totalCashOut`, `netPosition`

**WS7 — Rollout Tracker Closure**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`:
  - `cursor.last_closed_exec` → `"EXEC-080"`
  - `cursor.next_action` → Wave 2 entry criteria check
  - `cursor.phase_label` → updated to reference PRD-080 closure
  - New `pre_wave_2` phase entry: all 12 field closures recorded with classification, workstream reference, and DEC-1 Wave 2 completeness-refinement dependency

---

### Key Non-Obvious Decisions

**Badge-order invariant (WS4):** `deriveEntryBadge(row.amount, thresholds)` must receive the bare `number` from the database row, not the wrapped `FinancialValue`. The badge computation happens on raw cents; wrapping changes the type. If the call order is ever reversed, badge evaluation silently breaks — the `FinancialValue` object would be evaluated as a truthy non-numeric and produce incorrect results. The mapper comment and a dedicated test lock this invariant.

**DEC-2 — `null` vs `FinancialValue` for `max_single_in/out`:** `null` means "no transactions of this direction occurred on this gaming day" — it is not the same as `FinancialValue{value: 0}`. A zero-value `FinancialValue` would imply one or more zero-cent transactions were recorded, which is semantically distinct. Preserving `null` respects the distinction.

**`jest.mock` hoisting constraint (WS6):** `jest.mock()` factories are hoisted before `const` declarations in the same file. A `const mockFinancialValue = {...}` helper defined after the mock call causes `ReferenceError: Cannot access 'mockFinancialValue' before initialization`. Fixed by inlining the FinancialValue object literals directly in both mock factories.

**`financialValueSchema` rejects floats:** The schema enforces `z.number().int()` (`safeint`). Test fixtures using floating-point cent values (e.g. `1000.99`) will throw `ZodError: expected int, received number`. All test fixtures use integer cents.

**gaming-day-summary.tsx inline wrapper removal (WS5):** This component was constructing its own `FinancialValue` with `source: 'mtl_gaming_day'` and `completeness: {status: 'complete'}` — both wrong. The correct classification originates in the mapper; now that `summary.total_in` is already correctly wrapped, passing it through directly removes the incorrect local override.

---

### Spec Governance

| Artifact | Path |
|----------|------|
| PRD-080 | `docs/10-prd/PRD-080-financial-telemetry-pre-wave2-surface-debt-closure-v0.md` |
| EXEC-080 | `docs/21-exec-spec/EXEC-080-financial-telemetry-pre-wave2-surface-debt-closure.md` |
| Inventory | `docs/issues/gaps/financial-data-distribution-standard/actions/pre-wave-2/PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md` |
| Dispositions | `docs/issues/gaps/financial-data-distribution-standard/actions/pre-wave-2/PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md` |
| Patch delta | `docs/issues/gaps/financial-data-distribution-standard/actions/pre-wave-2/prd-80-patch-delta.md` |

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| Tests (all modified suites) | 112/112 PASS |
| `services/mtl/__tests__/mappers.test.ts` | 71/71 PASS |
| `services/player-financial/__tests__/mappers.test.ts` | included in 112 total |
| `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts` | 4/4 PASS (incl. F-11 isolation) |
| F-11 compliance isolation test | PASS — `type: 'compliance'` never mixed with `type: 'actual'` |
| `as any` in modified files | ABSENT (grep CLEAN) |
| Implementation commit (HEAD at WS7) | `20df161b6aadc3f236106bdc84dc96b415815d48` |

---

### Wave 2 Entry Note (DEC-1)

Standalone `GET /api/v1/visits/{visitId}/financial-summary` and the modal-data BFF financial section emit `completeness.status: 'unknown'` on all visit-level financial aggregates. This is correct and intentional — the underlying views (`mtl_gaming_day_summary`, `player_financial_transaction` aggregates) have no gaming-day lifecycle column that would signal when a day is closed.

Wave 2 must introduce lifecycle-aware projection infrastructure (a gaming-day-close event, a lifecycle column, or equivalent) before `'complete'` or `'partial'` can be emitted. Until then, `'unknown'` is the accurate and honest signal. Consumers are expected to present this to operators as "data may not be final for the current gaming day."
