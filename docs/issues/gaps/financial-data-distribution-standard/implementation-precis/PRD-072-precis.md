## PRD-072: Visit Surface Envelope Label — Delivery Précis

### What This Was (And Was Not)

PRD-072 is a **Phase 1.1 semantic labeling slice only** — a continuation of the deferred WS5/WS6/WS5_ROUTE/WS5_UI workstreams from PRD-070. It wraps existing numeric financial values in the `FinancialValue` envelope. It does **not** change units, remove `/100` conversions, or normalize to integer cents.

**Why PRD-070 halted:** It collapsed temporal sequencing — attempting Phase 1.1 labeling and Phase 1.2 canonicalization simultaneously. WS5 and WS6 introduced `dollarsToCents` removal and integer-cents enforcement inside what was scoped as a semantic-labeling slice. The pipeline correctly refused to proceed.

**One-line invariant enforced throughout:** *If a change makes the system more correct, it does not belong here. If it makes the system more interpretable, it does.*

---

### Critical Dollar-Float Warning (preserved for Phase 1.2 handoff)

`FinancialValue.value` in this implementation carries a **dollar float** (e.g. `500.00`, not `50000`). The `/100` conversion runs before the wrap — `value` is the *result* of that division. This is correct for Phase 1.1 and must not be treated as a bug.

- `financialValueSchema` declares `value: z.number().int()` — that constraint is aspirational, not enforced here. Outbound Zod validation was explicitly excluded.
- Phase 1.2 will remove `/100`, change `FinancialValue.value` to integer cents, and make `z.number().int()` applicable.
- UI renders via `formatDollars(field.value)` — unchanged output. `formatCents` was prohibited.

---

### Artifacts Delivered (11 files across 4 workstreams)

**WS1 — Visit Service DTO + Inline Wrap (`services/visit/`)**
- `dtos.ts` — `RecentSessionDTO.total_buy_in`, `total_cash_out`, `net`: `number → FinancialValue`
- `crud.ts` — `centsToDollars` closure updated: bare `/100` assignments replaced with inline `FinancialValue` objects. Closure, comment, and `/100` divisions preserved.
- `__tests__/visit-continuation.test.ts` — assertions updated to `FinancialValue` shape (value is still dollar float `-0.5`, not `-50`)

**WS2 — Rating-Slip LiveView Inline Wrap (`services/rating-slip/`)**
- `services/visit/dtos.ts` — `VisitLiveViewDTO.session_total_buy_in`, `session_total_cash_out`, `session_net`: `number → FinancialValue`
- `mappers.ts` — `toVisitLiveViewDTO`: three `/100` assignments replaced with inline `FinancialValue` objects. `dollarsToCents` import retained (used for `PitCashObservationDTO`). Null guard load-bearing: live-view path uses `narrowRpcJson` (type cast), so null can arrive at runtime.

**WS3 — Route Minimum Smoke Tests (new files)**
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` — 1 success case asserting `FinancialValue` shape on `total_buy_in` (type, source, completeness.status, typeof value === 'number')
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` — 1 success case asserting `FinancialValue` shape on `session_total_buy_in`
- Route handlers verified clean: no `/100`, no `dollarsToCents`, no `formatDollars` at the route boundary layer

**WS4 — UI Type Update (`components/player-sessions/`)**
- `start-from-previous.tsx` — `SessionData` local interface (with `number` financial fields) replaced by `export type SessionData = RecentSessionDTO`. Three `formatDollars(session.field)` calls updated to `formatDollars(session.field.value)`. Net comparison updated: `session.net >= 0 → session.net.value >= 0`. `ended_at` null guard added (forced by `RecentSessionDTO.ended_at: string | null`).
- `start-from-previous-modal.tsx` — `SessionData` type import changed to `RecentSessionDTO` from `@/services/visit/dtos`; all usages updated. No field access changes (modal passes sessions through without reading financial fields).

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `actions/fibs/FIB-H-FiNANCIAL-TELEMETRY-PHASE-1-1-SLICE.md` — scope authority |
| FIB-S | `actions/fibs/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-1-SLICE.json` — corrected (supersedes `intake/FIB-S-FIN-CENTS-001`) |
| PRD-072 | `docs/10-prd/PRD-072-...-v0.md` — rewritten to label-only scope |
| EXEC-072 | `docs/21-exec-spec/PRD-072/EXEC-072-...md` — manually scope-reset (accepted as generation artifact per team decision) |
| Postmortem | `failures/prd-070-pipeline-interruption-postmortem.md` |

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (exit 0) |
| `visit-continuation.test.ts` | 45/45 PASS |
| `rating-slip` test suite | 274/274 PASS |
| Route boundary smoke tests | 2/2 PASS |
| `/100` present in `crud.ts` | CONFIRMED (lines 526–528) |
| `/100` present in `mappers.ts` | CONFIRMED (session_total_* assignments) |
| `formatCents` in UI | ABSENT (grep CLEAN) |
| `centsToDollars` closure | INTACT |

---

### What Is Explicitly Deferred to Phase 1.2

- Removal of `/100` conversion from `services/visit/crud.ts` and `services/rating-slip/mappers.ts`
- Changing `FinancialValue.value` from dollar float to integer cents
- Migrating UI render calls from `formatDollars(field.value)` to `formatCents(field.value)`
- Applying `financialValueSchema` (`z.number().int()`) at DTO boundary
- DTO ownership clarification for `VisitLiveViewDTO` (cross-context: declared in `visit`, mapped in `rating-slip`)
- Full route test matrix (unauthorized, invalid-params, 404 cases)
