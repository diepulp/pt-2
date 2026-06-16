---
id: PRD-091
title: Table Inventory Accounting Exemplar Acceptance Closure
owner: Product / Architecture
status: Accepted
affects: [PRD-090, ADR-059, ADR-060, ADR-061, SRL-TIA-001, FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001]
created: 2026-06-14
last_review: 2026-06-14
phase: Post-PRD-090 exemplar hardening
http_boundary: true
renders_financial_surface_values: true
---

# PRD-091 — Table Inventory Accounting Exemplar Acceptance Closure

## 1. Overview

- **Owner:** Product / Architecture
- **Status:** Draft
- **Summary:** PRD-090 delivered the canonical Table Inventory Accounting (TIA) derivation, DTO, API, and legacy suppression, but the operator-facing exemplar is not yet accepted: the canonical rundown component (`RundownSummaryPanel`) is unmounted, its runtime states are not behaviorally tested, and no real-database or browser-level proof confirms the operator receives the correct projected, partial, or integrity result under production-like conditions. This PRD closes those proof-and-wiring gaps and nothing else. It is a **delivery and acceptance closure**: all semantic and architectural decisions are already frozen (ADR-059/060/061, PRD-090, SRL-TIA-001). It introduces no new accounting behavior, no new ADR/RFC, and no amendments to the frozen decisions. The work is tightly derived from `FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001`.

## 2. Problem & Goals

### Problem

The system has an *implemented* accounting canon but not an *accepted* operator-facing exemplar. Today's coverage is mock-based (unit derivation tests against a mocked Supabase client; route tests that mock middleware, service, and client) and static (suppression/source-analysis gates). No test exercises the real database predicates, the real route/RLS boundary, the rendered component states, or the full operator workflow. The canonical `RundownSummaryPanel` is built but mounted nowhere, so the operator cannot reach the canonical projected/partial/integrity result at all.

### Goals

1. Prove the TIA derivation against a real local Supabase/Postgres database across all three calculation kinds and the canon's scope/boundary predicates.
2. Prove the accounting-projection route under real service execution through the route boundary (roles, cross-casino isolation, bigint-safe serialization, integrity-failure-as-200).
3. Prove every runtime render state of `RundownSummaryPanel` behaviorally, and mount it as the sole operator-visible table-result statement on the Pit Terminal Inventory / Rundown surface.
4. Prove the complete operator path with one thin browser acceptance test, with no competing legacy win/loss value and no win/loss-unavailable placeholder present.

### Non-Goals (frozen — see §7 and FIB §G)

This PRD does **not** change the TIA formula, `telemetry_derived_drop_estimate_cents`, telemetry-kind eligibility, or `RATED_ADJUSTMENT` exclusion; does **not** introduce gaming-day aggregation, custody/count-room integration, new accounting/calculation states, or population of `final_table_win_loss_cents`; does **not** add a persisted TIA projection store; does **not** propagate TIA to the shift dashboard or any secondary surface; does **not** replace the test framework, build a generic fixture platform, or redesign Playwright infrastructure; does **not** restore `rpc_compute_table_rundown` as an accounting authority; and does **not** introduce a new ADR, RFC, or scaffold, nor amend ADR-059/060/061.

## 3. Users & Use Cases

**Primary user — Pit boss / administrator.**

- Opens a table's Inventory / Rundown surface during active play, rundown, or closed-session review and needs to know whether the session has a **projected** result (telemetry-derived estimate present), a **partial** result (estimate absent, snapshots present), or an **integrity failure** (a required snapshot cannot be resolved).
- Must never see a competing legacy win/loss-like value, nor a stale "win/loss unavailable" placeholder once the canonical value renders.

**Secondary user — Engineering / QA.** Relies on the closure suites as the acceptance proof that gates any future propagation of `TableInventoryAccountingProjection` to additional surfaces.

## 4. Scope & Feature List

Four workstreams. Each freezes its **acceptance intent**; the EXEC owns mechanics (see §7).

```yaml
workstreams:
  - database_backed_tia_integration      # WS1 — FIB F.1
  - route_runtime_boundary_integration   # WS2 — FIB F.2
  - rundown_summary_component_and_mount   # WS3 — FIB F.3 + F.4 + F.4-A
  - browser_acceptance_smoke              # WS4 — FIB F.5
```

- **WS1** — A real-database integration suite for `TableInventoryAccounting` using the established local Supabase/Postgres `.int.test.ts` harness. Frozen cases in Appendix A.1.
- **WS2** — A narrow real-integration suite for `GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection` exercising the real route + service (no formula permutations). Frozen cases in Appendix A.2.
- **WS3** — Behavioral render tests for `RundownSummaryPanel` (all states) **plus** mounting it on the Inventory / Rundown surface with the legacy placeholder superseded. Frozen cases in Appendix A.3.
- **WS4** — One thin browser acceptance test (up to three seeded scenarios if inexpensive) proving the operator journey. Frozen journey in §6.
- Existing mock unit tests, mocked route-contract tests, static-analysis tests, and suppression gates remain in place and green (not replaced).

## 5. Requirements

### Functional (frozen)

**FR-1 — Mount location.** `RundownSummaryPanel` is mounted in the Pit Terminal Inventory / Rundown surface (`components/pit-panels/inventory-panel.tsx`), reached via `/pit` → select table → **Inventory** tab — the same surface that already mounts `RundownReportCard`. It is the **sole** operator-visible table-result statement on that surface. It is mounted on no other surface in this slice.

**FR-2 — Data path.** The mounted panel consumes the established accounting projection seam — the `useTableAccountingProjection` hook (`hooks/table-context/use-table-rundown.ts`) over `GET …/accounting-projection` — and renders **only** from `TableInventoryAccountingProjection`. It does not re-derive `calculation_kind`, completeness, or result values from raw fields.

**FR-3 — Placeholder supersession (FIB F.4-A).** The legacy "Table win/loss data unavailable during TIA canon migration" placeholder is absent from `RundownReportCard`, with **no replacement disclosure**. If implementation work finds the placeholder still present on the active branch, mounting the panel removes it. Acceptance asserts the placeholder remains absent. `RundownReportCard` is scoped to inventory-movement totals (Fills, Credits, Drop — PRD-038 path) and report-persistence actions (Save / Finalize). No table-result, projected-result, or win/loss language remains in `RundownReportCard`. The Fills/Credits/Drop rows are unchanged.

**FR-4 — Role + cross-casino expectations (frozen).** Through the real route boundary:
- `pit_boss` → **200**; `admin` → **200**.
- `dealer`, `cashier`, unknown role → **403**, with the derivation not invoked.
- A `sessionId` belonging to a different casino than the authenticated RLS context → **404** (canonical not-found posture), never a `200` with `integrity_failure`.
- A session whose required snapshots cannot be resolved → **200** with `calculation_kind: "integrity_failure"` (business-correct "valid result: insufficient data", not a 4xx/5xx).
- WS2 proves this without mocking `withServerAction`, `createTableInventoryAccountingService`, or the Supabase client. It must not use Mode A/dev-auth bypass as evidence for the real role/RLS boundary.

**FR-5 — Render states (frozen).** `RundownSummaryPanel` renders exactly: `telemetry_drop_formula` → **"Projected Win/Loss"** + canonical value; `inventory_only` → **"Partial Table Result"** + missing-drop disclosure; `integrity_failure` → integrity warning + no financial result. Bare **"Win/Loss"**, **"Final Win/Loss"**, and **"Total Drop"** do not render.

### Non-Functional (frozen)

- **NFR-1 — bigint safety.** `*_cents` values cross the API as strings and render without precision loss. The acceptance sentinel is signed 64-bit max (`9223372036854775807`) for route serialization and component rendering; the component must not silently coerce canonical cent strings through `Number()` in a way that changes the displayed value.
- **NFR-2 — Tier split (no duplication).** Formula/scope semantics are proven only in WS1 (DB integration); the route layer does not duplicate formula permutations; the browser layer does not prove formula permutations.
- **NFR-3 — Preserved coverage.** Existing unit, contract, static-analysis, and suppression tests remain green; `type-check`, `lint`, and production `build` pass.
- **NFR-4 — SRL conformance.** Surface labels conform to SRL-TIA-001; the consumer renders, it does not re-derive. (No new SRL admission required — SRL-TIA-001 is already canonical.)
- **NFR-5 — Surface governance inheritance.** This closure inherits the ADR-041 surface classification from EXEC-090 (Rendering Delivery: Client Shell; Data Aggregation: Simple Query; Rejected Patterns and Metric Provenance already declared). If an EXEC-091 is authored, it must restate or explicitly inherit those four mandatory fields; omission is a hard gate failure.

## 6. UX / Flow Overview

**Frozen browser acceptance journey (WS4):**

```text
authenticated pit boss
→ opens /pit
→ selects a seeded table / session
→ opens the Inventory / Rundown surface
→ sees the canonical TIA state and formatted value (Projected Win/Loss | Partial Table Result | integrity warning)
→ sees no competing legacy win/loss-like result
→ sees no "win/loss unavailable" placeholder when a canonical value renders
```

- The single mandatory browser scenario must reach a canonical render. **The seeded target state for the mandatory scenario is frozen by this PRD as `inventory_only` (Partial Table Result)** — it requires only opener + closer snapshots and no qualifying telemetry, the lowest-cost seed that still renders a financial value and exercises the missing-drop disclosure. Additional scenarios (`telemetry_drop_formula`, `integrity_failure`) may be added if inexpensive but are not required.
- Database integration proves formula/scope; component tests prove all render states; browser proves one complete workflow.

## 7. Dependencies & Risks

### Dependencies (present)

- PRD-090 implementation, `TableInventoryAccounting` service, `TableInventoryAccountingProjection`, the accounting-projection endpoint, and `useTableAccountingProjection` all exist.
- `RundownSummaryPanel` exists but is unmounted; `RundownReportCard` is already mounted on the target surface.
- Reusable `.int.test.ts` patterns exist in `services/table-context`; local Supabase/Postgres integration execution is available; canonical fixtures can be created without production data.

### EXEC owns (not frozen by this PRD)

Fixture construction; test filenames; helper reuse; workstream ordering; the exact implementation file changes; command-level validation; and any seed or migration mechanics. The EXEC also decides whether a scaffold is mechanically required.

### Risks / Open questions

- **R-1 (assumption, flag to owner):** "No replacement disclosure" in `RundownReportCard` assumes future custody/finality work will surface any settled number through `RundownSummaryPanel`'s states, not by reviving a `RundownReportCard` field. Consistent with the canon; recorded here so it is a conscious choice.
- **R-2:** The browser layer requires a deterministic seeded session in the frozen state; flakiness risk is mitigated by fixing the mandatory target to `inventory_only` (cheapest deterministic seed).
- **R-3:** The browser acceptance test is mandatory QA-006 **Mode B** (browser login). Mode A/dev-auth bypass and direct Mode C client verification cannot be reported as the WS4 browser acceptance proof.
- **R-4:** The route integration test may use a route-level harness or a browser-authenticated request context, but it must preserve the real Next route + middleware + Supabase + service execution path. Mocked route-contract tests remain useful but do not satisfy WS2.

## 8. Definition of Done (DoD)

The closure is **Done** when:

**Functionality**
- [ ] `RundownSummaryPanel` is mounted on the Pit Terminal Inventory / Rundown surface (FR-1) and consumes `TableInventoryAccountingProjection` (FR-2).
- [ ] The legacy win/loss-unavailable placeholder is absent from `RundownReportCard` with no replacement disclosure; no table-result language remains there (FR-3).

**Data & Integrity**
- [ ] WS1 real-database suite proves all three calculation kinds plus the frozen scope/boundary and input-identity predicates (Appendix A.1), all green.
- [ ] Projected / partial / final result fields remain mutually exclusive per canon; `final_table_win_loss_cents` remains null.

**Security & Access**
- [ ] WS2 real-route suite proves the FR-4 role matrix, cross-casino 404, and integrity_failure-as-200 under real service execution (Appendix A.2).
- [ ] WS2 does not mock `withServerAction`, `createTableInventoryAccountingService`, or the Supabase client, and does not use Mode A/dev-auth bypass as proof of the real role/RLS boundary.

**Testing**
- [ ] WS3 behavioral render tests prove all FR-5 states and forbidden-label absence (Appendix A.3).
- [ ] WS4 browser acceptance proves the frozen §6 journey using QA-006 Mode B, including absence of the placeholder when a canonical value renders.
- [ ] NFR-1 bigint-safe serialization and rendering are asserted with the signed 64-bit max sentinel (`9223372036854775807`) at route and component tiers.

**Operational Readiness**
- [ ] No new accounting state, store, or custody path is introduced; rollback = unmount panel + restore placeholder (mechanically trivial, no data migration).
- [ ] `integrity_failure` diagnostics remain verifiable for `session_id`, `casino_id`, `calculation_kind`, `integrity_issues`, and `request_id`, or the EXEC explicitly records diagnostic instrumentation as deferred outside this closure.

**Exemplar Proof**
- [ ] The exemplar is proven end-to-end under real execution (DB + route + component + browser); horizontal propagation to other surfaces remains explicitly deferred until this proof is frozen.

**Documentation**
- [ ] FIB acceptance gates (Appendix B) are all satisfied; the FIB completion definition is met.

**Surface Governance**
- [ ] `RundownSummaryPanel` surface classification inherits or restates EXEC-090 ADR-041 fields and SRL-TIA-001 label conformance (NFR-4/NFR-5) is confirmed; no new MEAS-ID introduced (no new truth-bearing metric — TIA derivation is unchanged).

**Preserved coverage**
- [ ] Existing unit, mocked-route-contract, static-analysis, and suppression tests remain green; `type-check`, `lint`, and `build` pass (NFR-3).

## 9. Related Documents

- **FIB:** `docs/issues/table-inventory-accounting-canon/prd-090/FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001.md` (scope authority)
- **PRD-090:** Table Inventory Accounting Canon Exemplar (parent implementation)
- **ADRs (frozen, not amended):** ADR-059 (ownership/formula), ADR-060 (drop naming), ADR-061 (session-scope aggregation boundary)
- **SRL:** `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` → SRL-TIA-001
- **Authority skill:** `tia-canon-authority`
- **Surfaces:** `components/table/rundown-summary-panel.tsx`, `components/table/rundown-report-card.tsx`, `components/pit-panels/inventory-panel.tsx`
- **Seam:** `hooks/table-context/use-table-rundown.ts` (`useTableAccountingProjection`), `app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts`

---

## Appendix A — Frozen In-Scope Test Cases

> These freeze the **what** (acceptance intent). The EXEC owns fixture construction, filenames, helper reuse, and ordering. No formula permutations are duplicated across tiers (NFR-2).

### A.1 WS1 — `database_backed_tia_integration` (real DB)

1. `telemetry_drop_formula` derived correctly from real rows.
2. `inventory_only` derived correctly from real rows.
3. `integrity_failure` when a required snapshot cannot be resolved.
4. Explicit **zero** opener and closer values are valid (not treated as missing).
5. **Zero qualifying telemetry rows** vs **qualifying rows summing to zero** remain distinct (null-vs-zero).
6. Telemetry **outside the session window** is excluded.
7. Telemetry from **another session at the same table** is excluded.
8. Telemetry from **another table** is excluded.
9. Lower timestamp boundary is **inclusive**.
10. Closed-session upper timestamp boundary is **exclusive**.
11. `RATED_ADJUSTMENT` is excluded.
12. Only canonically eligible fills and credits contribute (eligible states proven).
13. Table par / unrelated configuration changes do **not** change the result.
14. Projected / partial / final result fields are **mutually exclusive** per canon.
15. Fills and credits with the target `session_id` but mismatched `casino_id` or `table_id` do **not** contribute.
16. Fills and credits from the same casino/table but a different `session_id` do **not** contribute.
17. Snapshot FK rows with matching `session_id` but wrong `snapshot_type` are rejected as invalid for that side.
18. Snapshot FK or fallback rows with mismatched `casino_id` or `table_id` are rejected and cannot produce a financial result.
19. The implementation derives all input identity from the fetched `table_session`; no request-supplied casino/table/session surrogate can widen scope.
- Mock-based derivation unit tests remain in place.

### A.2 WS2 — `route_runtime_boundary_integration` (real route + service)

1. `pit_boss` → **200**.
2. `admin` → **200**.
3. `dealer` / `cashier` / unknown role → **403**, derivation not invoked.
4. Cross-casino session → **404** (not 200/integrity_failure).
5. Real service execution through the route (not mocked).
6. No mocked `withServerAction`, `createTableInventoryAccountingService`, or Supabase client in the real-route suite; no Mode A/dev-auth bypass as boundary proof.
7. bigint-safe response serialization (strings; signed 64-bit max sentinel without precision loss).
8. `integrity_failure` → **200**.
9. Missing / inaccessible session → canonical not-found posture.
- Mocked route-contract tests remain in place. Formula permutations are **not** re-proven here.

### A.3 WS3 — `rundown_summary_component_and_mount`

**Behavioral render (`RundownSummaryPanel`):**
1. `telemetry_drop_formula` → "Projected Win/Loss" + canonical value.
2. `inventory_only` → "Partial Table Result" + missing-drop disclosure.
3. `integrity_failure` → integrity warning, no financial result.
4. Positive values render correctly.
5. Negative values render correctly.
6. Zero values render correctly.
7. Signed 64-bit max cent string renders without precision loss or silent unsafe `Number()` coercion.
8. Bare "Win/Loss" does **not** render.
9. "Final Win/Loss" does **not** render.
10. "Total Drop" does **not** render.
11. Component does **not** reconstruct `calculation_kind` / completeness / values from raw fields.

**Mount + supersession (FR-1/FR-3, FIB F.4 / F.4-A):**
12. Panel mounted on the Inventory / Rundown surface, consuming the projection seam.
13. Legacy placeholder absent from `RundownReportCard`; no result-language remains; Fills/Credits/Drop unchanged.
14. Exactly one operator-visible table-result statement on the surface; no duplicate accounting value.
- Static-analysis and suppression tests remain active and do not substitute for render tests.

---

## Appendix B — Exit Criteria (FIB §J acceptance gates, inherited)

This PRD is **Accepted** only when every FIB gate group passes:

- `database_integration` — all Appendix A.1 cases.
- `route_integration` — all Appendix A.2 cases.
- `component_behavior` — all Appendix A.3 render cases.
- `exemplar_wiring` — panel mounted + consumes projection + no duplicate/competing result + **placeholder absent** + **no result-language in `RundownReportCard`** + **exactly one table-result statement**.
- `browser_acceptance` — QA-006 Mode B seeded pit-boss flow reaches canonical render + confirms legacy win/loss absence + **confirms placeholder absence when a canonical value renders**.
- `quality` — existing unit / contract / static-suppression tests green; `type-check`, `lint`, `build` pass.

**Completion definition (FIB §M):** The TIA exemplar is accepted only when the canonical accounting result is proven against the real database, protected through the real route boundary, behaviorally rendered by the canonical component, mounted in the Pit Terminal Inventory / Rundown flow, and exercised through one operator-level browser path. Unit tests, mocked route tests, static suppression gates, or a manual walkthrough alone do not satisfy acceptance.

---

## Appendix C — Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-14 | Product / Architecture | Initial draft — closure PRD derived from FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001; four workstreams frozen. |
| 0.2 | 2026-06-14 | Product / Architecture | Devil's Advocate remediation — froze Mode B browser acceptance, tightened real-route proof, reconciled gate counts, clarified bigint sentinel, updated placeholder wording, and bound ADR-041 inheritance. |
| 0.3 | 2026-06-14 | Product / Architecture | Devil's Advocate remediation — hardened WS1 input-identity predicates for fills, credits, snapshots, and fetched-session authority. |
