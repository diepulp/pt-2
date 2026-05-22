## EXEC-076: Financial Telemetry Wave 1 Phase 1.2B-C — Contract Expansion Précis

### What This Was (And Was Not)

EXEC-076 is **Phase 1.2B-C — a documentation and test enforcement slice only.** It documents and validates the stable integer-cents contract established by Phase 1.2B-A (EXEC-074, commit `e83a2c12`, 2026-04-30). No service logic, route handler, DTO, mapper, UI component, lint rule, or observability wiring is touched in any workstream.

**What it delivers:**
- WS1: OpenAPI contract enforcement — `FinancialValue` component correction, branch-valid `oneOf` conversion for anomaly-alerts, and DEC-6 path birth for `/shift-intelligence/alerts`
- WS2: Route-boundary test expansion (recent-sessions, live-view, anomaly-alerts) and birth (alerts) with 4- and 6-case matrices asserting integer-cents FinancialValue shape and discriminated-union branches
- WS3: ROLLOUT-TRACKER.json closure — DEF-005 close, DEC-6 resolution, quality gates

**What it explicitly is not:**
- No `/100` removals, no Zod schema changes, no mapper changes — those were EXEC-074
- No render format changes — that was EXEC-075 (Phase 1.2B-B)
- No UI component births or formatter consolidation — those are Phase 1.3 scope
- No ESLint rule additions, CI gate changes, or deprecation observability — Phase 1.4 scope

**Precondition gate confirmed:** EXEC-074 closed (`e83a2c12`). `FinancialValue.value` is integer cents, `financialValueSchema.int()` enforced, `ShiftAlertDTO` discriminated union on `metricType` active, BRIDGE-001 retired.

---

### Critical Invariants Enforced

**DEF-NEVER** is load-bearing across all three workstreams: `hold_percent` is a dimensionless ratio — it is never wrapped in `FinancialValue`, never appears adjacent to a `$ref: '#/components/schemas/FinancialValue'` in the OpenAPI schema, and the ratio branch in every discriminated union must carry bare `number | null`.

**Branch-valid vs. field-level oneOf:** The pre-existing anomaly-alerts schema used field-level `oneOf: [FinancialValue, number]` on each field independently. This form permits impossible combinations — a single response object where `metricType: hold_percent` is paired with a `FinancialValue` envelope on `observedValue`. The branch-valid `oneOf` on the `items` level makes that combination un-documentable: the discriminant `metricType` selects the branch, and each branch locks the field types.

---

### Artifacts Delivered

#### WS1 — `docs/25-api-data/api-surface.openapi.yaml` (COMPLETE)

Three targeted edits to a single file.

**Edit 1 — FinancialValue component correction (line 2330)**
- `value.type`: `number` → `integer`
- Component `description`: removed stale "Dollar-float values present on BRIDGE-001 surfaces" / "Phase 1.2B canonicalizes" wording; replaced with: "Currency amount in integer cents. BRIDGE-001 retired (Phase 1.2B-A). All in-scope financial fields emit integer cents at service output."
- `value` field `description`: removed "Dollar-float on BRIDGE-001 surfaces" wording; replaced with: "Monetary amount in integer cents. Fractional values (dollar-floats) are rejected at the service boundary. Phase 1.2B-A canonicalized all in-scope surfaces."

**Edit 2 — anomaly-alerts branch-valid oneOf conversion (line 1381)**
- Replaced flat `items: { type: object, properties: { ..., observedValue: { oneOf: [...] }, ... } }` with branch-valid `items: { oneOf: [financial-branch, ratio-branch] }`
- Financial branch (`metricType: enum [drop_total, win_loss_cents, cash_obs_total]`): `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` as `allOf: [$ref: FinancialValue], nullable: true`
- Ratio branch (`metricType: enum [hold_percent]`): same four fields as `type: number, nullable: true`; DEF-NEVER documented inline on each field
- Path description updated to note branch-valid discriminated union

**Edit 3 — `/shift-intelligence/alerts` path birth (line 1477, DEC-6)**
- New path entry inserted as Family 7b, after anomaly-alerts, before Family 8
- `gaming_day` query parameter: required, `type: string`, YYYY-MM-DD format
- `status` query parameter: optional, `enum: [open, acknowledged]` — matches `alertsQuerySchema` exactly (confirmed from `services/shift-intelligence/schemas.ts:52–54`)
- Financial branch (`metricType: enum [drop_total, win_loss_cents, cash_obs_total]`): full `ShiftAlertDTO` base fields (`id`, `tableId`, `tableLabel`, `gamingDay`, `status`, `severity`, `deviationScore`, `direction`, `message`, `createdAt`, `updatedAt`, `acknowledgment`) + `observedValue`, `baselineMedian`, `baselineMad` as `allOf: [$ref: FinancialValue], nullable: true`
- Ratio branch (`metricType: enum [hold_percent]`): same base fields + `observedValue`, `baselineMedian`, `baselineMad` as `type: number, nullable: true`; DEF-NEVER documented
- `thresholdValue` is **absent** from both branches — confirmed against `services/shift-intelligence/dtos.ts:197`; `ShiftAlertDTO` does not carry this field
- `acknowledgment` object documented with `acknowledgedBy`, `acknowledgedByName`, `notes`, `isFalsePositive`, `createdAt`; nullable at top level
- `tableId` typed as `{ type: string }` (not UUID ref) — matches runtime DTO; OpenAPI contract does not over-constrain the validator

#### WS2 — Route-boundary test expansion and birth (PENDING — qa-specialist)

Four test files. Not yet executed. Blocking DEF-005 close and final DEC-6 SHA.

| File | Operation | Matrix |
|------|-----------|--------|
| `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` | EXPAND | 4-case: 401, invalid params, empty (cross-tenant), success with integer-cents FinancialValue |
| `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` | EXPAND | 4-case: 401, 404 not found, service error, success with integer-cents FinancialValue |
| `app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts` | BIRTH | 6-case: 401, invalid/missing gaming_day, empty array, ratio-branch, financial-branch, optional status query |
| `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` | EXPAND | 4-case: 401, invalid window params, empty, success with both discriminated-union branches |

Key assertions required:
- `Number.isInteger(value)` on all FinancialValue `.value` fields (RULE-5)
- `'thresholdValue' in responseItem === false` on all alerts-route response items (RULE-6)
- No `hold_percent` field adjacent to a FinancialValue object in any response (DEF-NEVER)
- Cross-tenant empty case in recent-sessions documents route-boundary-only scope (not formal RLS proof)

#### WS3 — ROLLOUT-TRACKER.json (PARTIALLY COMPLETE)

Partial update applied 2026-05-03:
- `cursor.phase_label` and `cursor.next_action` updated to reflect WS1 done, WS2 pending
- `phases[1.2B].pending_scope_1_2b_c` narrowed to WS2 items only
- `phases[1.2B].phase_1_2b_c_ws1_closed` added with 4-item WS1 delivery record
- `phases[1.2B].decisions_resolved_1_2b_c.DEC-6` added with `commit_sha_pending: true`
- `DEF-005` status set to `pending_ws2`

Remaining after WS2 commits:
- Replace all `commit_sha_pending: true` markers with real SHAs
- Close `DEF-005` with WS2 commit SHA
- Run and record `npm run type-check`, `npm run lint`, `npm run build`

---

### Q-5 Route/Field Inventory (EXEC-SPEC planning record)

All financially-relevant fields classified. No remaining unclassified fields.

| Route | Field(s) | Disposition |
|-------|----------|-------------|
| GET /visits/{visit_id}/live-view | `session_total_buy_in`, `session_total_cash_out`, `session_net` | FinancialValue — `$ref` present (EXEC-074 WS3) |
| GET /players/{player_id}/recent-sessions | `total_buy_in`, `total_cash_out`, `net` | FinancialValue — `$ref` present (EXEC-074 WS3) |
| GET /rating-slips/{rating_slip_id}/modal-data | `totalCashOut` | FinancialValue — `$ref` present |
| GET /rating-slips/{rating_slip_id}/modal-data | `averageBet` | Excluded — bare number, operator input; WAVE-1-CLASSIFICATION-RULES §6 carve-out |
| GET /shift-intelligence/anomaly-alerts | `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` | Branch-valid oneOf converted (this EXEC) |
| GET /shift-intelligence/alerts | `observedValue`, `baselineMedian`, `baselineMad` | Path born (DEC-6, this EXEC) |
| GET /shift-dashboards/metrics/tables | `drop_total`, `win_loss` | Excluded — explicitly DEFERRED Phase 1.2 |
| GET /shift-dashboards/cash-observations/summary | cash total fields | Excluded — explicitly DEFERRED Phase 1.2 |
| GET /mtl/gaming-day-summary | `total_in`, `total_out`, et al. | Excluded — DEFERRED Phase 1.2, compliance/mtl_entry classification |

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `fibs/phase-1-2b-c/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.md` |
| FIB-S | `fibs/phase-1-2b-c/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.json` — frozen 2026-05-03 |
| PRD-076 | `docs/10-prd/` |
| EXEC-076 | `docs/21-exec-spec/PRD-076/EXEC-076-financial-telemetry-wave1-phase1.2b-c-contract-expansion.md` |
| Surface classification | Not applicable — no user-facing rendered surface introduced |
| GOV-010 check | Waived: enforcement-only slice, no new ADRs |

---

### Validation Results (WS1 gate — complete)

| Gate | Result |
|------|--------|
| `npx openapi-typescript` parse | PASS — 123ms, exit 0, `/tmp/exec076-api-schema.d.ts` generated |
| `npm run type-check` | PASS — exit 0 |
| RULE-2 grep: `hold_percent` adjacent to `$ref: FinancialValue` | CLEAN — zero schema adjacency (description text only) |
| `thresholdValue` absent from `/shift-intelligence/alerts` | CONFIRMED — present only in anomaly-alerts schema + one description note |
| FinancialValue `value.type: integer` | CONFIRMED (line 2338) |
| Stale Dollar-float / BRIDGE-001 wording removed from component | CONFIRMED |

WS2 gate (pending):
```bash
npx jest app/api/v1/players/\[playerId\]/recent-sessions/__tests__/route.test.ts \
          app/api/v1/visits/\[visitId\]/live-view/__tests__/route.test.ts \
          app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts \
          services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts \
  --no-coverage 2>&1 | tee /tmp/exec076-test-run.log
```

---

### What Remains Before Phase 1.3

1. **WS2 (qa-specialist):** 4 test files — expand recent-sessions, live-view, anomaly-alerts; birth alerts route test. Must exit green before WS3 final close.
2. **WS3 final close:** Replace `commit_sha_pending: true` in ROLLOUT-TRACKER.json with real SHAs from WS1 + WS2 commits. Close DEF-005. Run `npm run type-check`, `npm run lint`, `npm run build` and record results.
3. **Phase 1.3 entry gate:** Phase 1.2B-C complete (all `commit_sha_pending` resolved) + Phase 1.3 PRD drafted and approved.

### What Is Explicitly Deferred to Phase 1.3+

| Item | Phase |
|------|-------|
| `FinancialValue.tsx` UI component birth | 1.3 |
| `formatCents` / `AttributionRatio.tsx` / `CompletenessBadge.tsx` | 1.3 |
| `lib/format.ts` formatter consolidation | 1.3 |
| Component test births (DEF-006) | 1.3 |
| ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` | 1.4 |
| CI gate for OpenAPI envelope regression | 1.4 |
| Structured log events per deprecated-field usage | 1.4 |
| `shift-dashboards` route test families beyond DEF-005 routes | 1.4 |
| `hold_percent` FinancialValue wrapping | DEF-NEVER — all phases |
