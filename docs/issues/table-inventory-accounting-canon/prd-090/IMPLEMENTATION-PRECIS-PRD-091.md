---
artifact_id: PRD-091-IMPLEMENTATION-PRECIS
type: implementation_précis
status: complete
prd: PRD-091
exec_spec: EXEC-091-tia-exemplar-acceptance-closure.md
fib_h: FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001.md
fib_s: none
branch: ref/TIA
delivered: 2026-06-14
complexity_path: streamlined
srl_binding: SRL-TIA-001
frozen_authorities: [ADR-059, ADR-060, ADR-061, PRD-090]
workstreams: [WS1, WS2, WS3a, WS3b, WS4]
new_test_count: 48
e2e_specs: 1
---

# PRD-091 Implementation Précis — TIA Exemplar Acceptance Closure

## What This Slice Did

PRD-090 *built* the canonical `TableInventoryAccounting` derivation, its BFF route,
and the suppression surface. It proved them with **mocked** unit tests. PRD-091 is
the **acceptance-closure** slice: it replaces the mocked proofs with real-execution
evidence and wires the canonical surface into the operator's actual screen so the
SRL-TIA-001 semantics are provably true end-to-end — from Postgres, through the
authenticated route, to a pixel a pit boss sees in the browser.

No new behavior, no new ADR/RFC/scaffold/semantic decision. This slice does not amend
ADR-059/060/061 or PRD-090; it closes the evidence and wiring gaps left open by them.

**Scope**: No migrations. No new tables, RPCs, or bounded contexts. No new public API
surfaces. One frozen-authority production file was hardened for identity-scoping
correctness (R-5, below) — non-formula. Everything else is tests + UI wiring.

---

## Delivered Files

### New Files

| File | WS | Purpose |
|---|---|---|
| `services/table-context/__tests__/table-inventory-accounting.int.test.ts` | WS1 | 22 **real-DB** integration tests — three-state machine against live Postgres semantics |
| `services/table-context/__tests__/fixtures/tia-seed.ts` | WS1 | Real-world seed/fixture helpers (company→casino→settings→staff→table, + 2nd casino/table for R-5 cross-identity negatives); `createRoleUser()` added for WS2 |
| `app/api/v1/.../accounting-projection/__tests__/route.int.test.ts` | WS2 | 8 route integration tests — real route + `withServerAction` (auth+RLS) + Supabase + service; only `next/headers` cookies harnessed |
| `components/table/__tests__/rundown-summary-panel.test.tsx` | WS3a | 11 unit tests (Appendix A.3 #1–#11) — bigint-safe rendering, label conformance, sentinel value |
| `components/pit-panels/__tests__/inventory-panel.test.tsx` | WS3b | 7 unit tests (A.3 #12–#14) — mount, projection-seam consumption, sole-result-statement, refresh invalidation |
| `e2e/table-context/tia-exemplar-acceptance.spec.ts` | WS4 | Mode B (real browser login) acceptance smoke for the frozen §6 operator journey |
| `e2e/table-context/fixtures/tia-inventory-only-seed.ts` | WS4 | Inventory-only E2E seed (R-2) + `createModeBConfirmPath()` magic-link harness (genuine Mode B, R-3) |

### Modified Files

| File | WS | Change |
|---|---|---|
| `services/table-context/table-inventory-accounting.ts` | WS1 | **R-5 identity hardening** (see below). PRD-090 frozen-authority file — owner-approved in-spec. |
| `services/table-context/__tests__/table-inventory-accounting.test.ts` | WS1 | Added `casino_id`/`table_id` to snapshot fixture factories so the existing 33-test mock suite stays green under the hardened identity scoping |
| `components/table/rundown-summary-panel.tsx` | WS3a | bigint-safe `ResultRow` (`parseCentsBigInt` + `formatWholeDollarsFromCents`, **no `Number()`**); fixes NFR-1 precision loss at the int64 sentinel |
| `hooks/table-context/use-table-rundown.ts` | WS3a | JSDoc correction on `useTableAccountingProjection` |
| `components/pit-panels/inventory-panel.tsx` | WS3b | Mounts `RundownSummaryPanel` as the **sole** table-result statement (FR-1) consuming the `useTableAccountingProjection` seam (FR-2); `handleRefresh` now also invalidates `tableRundownKeys.detail(currentSession.id)` |
| `components/table/rundown-report-card.tsx` | WS3b | Removed the `"Table win/loss data unavailable during TIA canon migration"` placeholder (FR-3); card now carries only Fills/Credits/Drop telemetry |
| `app/api/dev/otp/route.ts` | WS3b (incidental) | `:64` rpc args `as never` — clears a **pre-existing** out-of-scope dev-route type error (from `596e387f`) that blocked whole-branch type-check. Owner-approved. Not a TIA file. |

---

## Key Decisions & Findings

**R-5 identity hardening (WS1).** Writing real-DB tests exposed that the PRD-090
derivation scoped fills/credits and snapshot resolution by `session_id` alone. Against
live data this is insufficient: a row can carry the target `session_id` but a wrong
`casino_id`/`gaming_table_id`. EXEC-091 risk R-5 ("implementation must derive all
identity from the fetched `table_session`") authorized a **non-formula, identity-scoping
correctness fix** to the frozen file:
- Fills/credits now filter by the fetched `casino_id` + `gaming_table_id` (not session alone).
- `resolveSnapshot` now rejects FK rows with the wrong `snapshot_type`/casino/table and
  scopes the fallback query by casino + table.

Owner explicitly confirmed at the Phase 1 gate that this is accepted **in-spec as a
single change** — not split out, not reverted.

**NFR-1 int64 precision (WS3a/WS2).** `amount_cents` is `int8`; PostgREST returns it as a
**lossy JS number**, and `total_cents` is `int4`. The only lossless path to a 64-bit-max
value is BigInt aggregation of the chipset, with `String(bigint)` serialization at the
route boundary. The panel renders the sentinel `9223372036854775807` exactly as
`$92,233,720,368,547,758` with no `Number()` coercion anywhere on the path.

**Mode B authenticity (WS4, R-3).** The app's only login path is OTP/magic-link (no
password). `createModeBConfirmPath()` uses `admin.generateLink('magiclink')` as an
email-inbox substitute; the browser then runs the real `verifyOtp` confirm flow, which
sets **real** cookies. This is genuine Mode B — not dev-auth bypass (R-3) and not a
direct Mode C client. The prior blocker was `.env.local ENABLE_DEV_AUTH=true` forcing
`DEV_RLS_CONTEXT` (demo casino/admin) on every route; resolved by running the dev server
with the bypass disabled.

---

## Acceptance Evidence (the point of the slice)

| Layer | PRD-090 (built) | PRD-091 (proven) |
|---|---|---|
| Service derivation | mocked Supabase client | **22 real-DB tests** against live Postgres — chk constraints, telemetry catalog, null-vs-zero, cross-identity rejection |
| BFF route | mocked service + auth | **8 integration tests** — real `withServerAction` auth+RLS, role matrix (pit_boss/admin 200, dealer 403), cross-casino 404, int64 sentinel string serialization |
| UI render | placeholder / `Number()` coercion | **18 unit tests** — bigint-safe, label conformance, sole-result-statement, refresh invalidation |
| Operator journey | not wired to a screen | **Mode B E2E** — pit boss logs in, opens Inventory panel, sees "Partial Table Result" + value + missing-drop disclosure, zero legacy win/loss labels |

**Key DB facts surfaced by real execution:** `chk_amount_positive` forbids telemetry
rows summing to zero (so null-vs-zero reduces to *zero rows → null* vs *≥1 row →
present*); `chk_telemetry_kind` DB-rejects `RATED_ADJUSTMENT`; the event-type catalog is
`grind.observed` / `buyin.observed`; `staff_role` enum is `(dealer, pit_boss, admin)` —
no `cashier`/`unknown` is representable, so `dealer` is the canonical disallowed-role
proof.

---

## E2E Harness Notes (WS4)

Two findings during the resume run were fixed in the **test harness**, not app code:

1. **Responsive dual-render.** `pit-panels-client.tsx` mounts `PanelContainer` twice — a
   desktop layer (`hidden md:block`) and a mobile layer (`md:hidden`) — both present in
   the DOM with CSS-only visibility toggling. Every panel element therefore exists 2×.
   Positive assertions now scope to `.filter({ visible: true })`, which makes the FR-1
   "exactly one" count measure operator-**visible** statements (the requirement) rather
   than raw DOM nodes.
2. **`Ctrl+2` activation race.** The panel keyboard listener attaches in a
   post-hydration effect, so a single early press was lost (page stayed on the Tables
   panel). The press + visibility check is wrapped in Playwright `toPass` (20s) retry.
   Confirmed stable across 3 repeats.

Activation path: the sidebar tabs are collapsed icon-only with no accessible name, so
`Ctrl+2` (handled by the `panel-container.tsx` window keydown listener) is the
deterministic way to open the inventory panel. `/pit` auto-selects the single seeded
table, so no manual selection is needed.

---

## Validation / Gates

| Gate | Phase | Result |
|---|---|---|
| test-pass (integration) | 1 | 30/30 (WS1 22 + WS2 8) real-DB, node |
| test-pass (component/unit) | 1 | 44/44 (incl. 33 pre-existing mock suite kept green) |
| test-pass + type-check + lint | 2 | 18/18 new component; lint 0; type-check 0 |
| e2e-write-path | 3 | 3/3 (stability-confirmed via `--repeat-each=3`) |
| build | 3 | `next build` exit 0 |
| DoD | 4 | type-check (via build) · scoped lint 0 · 18/18 component · e2e · build |

---

## Residuals & Known Open Items

**ADR-034 lint on the WS1 fixture (resolved this slice).**
`services/table-context/__tests__/fixtures/tia-seed.ts` legitimately seeds Category-A
tables (`staff`/`company`) with the service client. The service-layer ESLint block
exempts `*.test.ts`/`*.spec.ts` but **not** `__tests__/**`, so this non-`.test.ts`
helper fell through while sibling `*.int.test.ts` files were exempt. Cleared with a
**justified file-level disable** (test-only seed against a local DB = the SEC-001
"allowed in tests" path, identical to existing `e2e/fixtures/*`) plus an import-order
fix — keeping ADR-034's production blast radius intact rather than widening the global
ignore. The e2e fixture/spec were already exempt (`e2e/**` + `*.spec.ts`).

**Incidental dev-route fix carried in the diff.** `app/api/dev/otp/route.ts:64`
(`as never`) is unrelated to TIA — it unblocks whole-branch type-check on a pre-existing
defect from `596e387f`. Owner-approved; flagged here so it is not mistaken for TIA scope.

**Pre-existing test-file `import/order` warnings.** The new component test files carry
non-blocking `import/order` warnings consistent with the repo-wide lint debt; lint exits 0.

**`docs/MVP-ROADMAP.md` absent in this tree** — the pipeline's roadmap-update step was a
no-op (no file to update).

**Uncommitted.** All PRD-091 deliverables are in the working tree, validated, ready for
review/commit; nothing has been committed by the pipeline.

---

## SRL-TIA-001 Conformance (carried from PRD-090, now end-to-end-proven)

- `inventory_only` → label **"Partial Table Result"** + missing-drop disclosure — proven
  in service (22), route (8), unit (18), and browser (Mode B).
- No competing legacy result: `"Win/Loss"` / `"Final Win/Loss"` exact-match count 0 and
  the `"win/loss unavailable"` placeholder absent on the live screen.
- int64 lossless boundary: BigInt aggregation → `String(bigint)` at the route → exact
  whole-dollar render in the panel.
- `final_table_win_loss_cents` remains `null`; `custody_status` remains
  `'non_custody_estimate'` (unchanged from PRD-090).
