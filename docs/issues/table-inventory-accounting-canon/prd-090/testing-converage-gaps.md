I have everything I need. Here's the honest status.

## Answer: Do integration tests exist for the TIA slice?

**Partially — and not the kind your stack calls "mandatory."** Two test files exist for the slice, but both are **mock-based**, not database-backed. The two surfaces that gate operator visibility (component render + browser E2E) have **no tests at all**. Here's the slice mapped against your recommended stack:

| #   | Your required tier                                                                         | Exists?              | What's actually there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **DB-backed service integration test** (mandatory)                                         | ❌ **No**            | `services/table-context/__tests__/table-inventory-accounting.test.ts` is a thorough **unit test against `makeSupabaseMock`** (in-memory fixtures). It never touches a real DB. Notably, the same directory already has the DB-backed pattern — `*.int.test.ts` files (`rpc-open-table-session.int.test.ts`, `session-close-lifecycle.int.test.ts`, etc.) — so the harness exists; TIA `derive()` just doesn't have one.                                                                                                 |
| 2   | **Route integration test** (mandatory)                                                     | ⚠️ **Contract-only** | `app/api/v1/.../accounting-projection/__tests__/route.test.ts` mocks `withServerAction`, the service, and the supabase client. It correctly asserts the role matrix (pit_boss/admin→200, dealer/cashier/unknown→403, derive not invoked), cross-casino→404, bigint-as-string, integrity_failure→200. **But the role guard and cross-casino 404 are asserted against a mocked ctx and a mocked service throw — real RLS/auth/DB are never exercised.**                                                                   |
| 3   | **Component test** (mandatory before mounting)                                             | ❌ **No**            | No render/mount test for `RundownSummaryPanel` (the three-state canonical exemplar) or `RundownReportCard`. The only "component" coverage is `__tests__/tia-static-analysis.test.ts` + `tia-suppression-gate.test.ts`, which are **grep-style static source analysis** (assert the panel "renders, not re-derives" by reading the file text; assert forbidden legacy labels are absent). That is a suppression/quarantine gate, **not** a behavioral render assertion of the green/red/AlertCircle three-state machine. |
| 4   | **Browser E2E** (`/pit → table → Inventory/Rundown → canonical state, no legacy win/loss`) | ❌ **No**            | No Playwright spec references `accounting-projection`, `RundownSummaryPanel`, or the TIA flow. And it *couldn't* pass yet — `RundownSummaryPanel` is **not mounted anywhere** (confirmed: only `RundownReportCard` is imported in `inventory-panel.tsx:217`; the canonical panel has no parent).                                                                                                                                                                                                                        |

### What this means for the status line

Your stated honest status is **confirmed, and slightly understated**. It's not just "step 4 hasn't landed" — **steps 1 and 3 are entirely missing, and step 2 is a mock contract test rather than a true integration test.** What *is* genuinely verified:

- The **derivation engine** is well-covered at the unit level (SRL enforcement IDs: source-authority shape, null-vs-zero, rated-adjustment exclusion, session-scope-only, integrity-failure suppression).
- **Legacy suppression is operator-visible and gated** — but enforced via static-analysis/type-level tests (`tia-suppression-gate`, `tia-static-analysis`), i.e. "the forbidden number can't be rendered," proven by reading source, not by mounting.
- The **API contract** (roles, 404 isolation, bigint serialization, integrity_failure=200) is asserted — but against mocks.

So the precise honest status:

> **TIA derivation and API are implemented and unit/contract-tested; legacy suppression is enforced and operator-visible (static-gate verified). The canonical Pit Terminal Rundown exemplar (`RundownSummaryPanel`) is not yet wired — it is unmounted, has no component test, no DB-backed service integration test, and no browser E2E. The slice is not "fully wired, until tested" — and three of your four mandatory tiers are absent.**

### Recommended order to close it

1. Add `table-inventory-accounting.int.test.ts` (DB-backed, follow the existing `.int.test.ts` pattern in the dir) — exercise real opener/closer snapshots, fills/credits, telemetry → all three `calculation_kind` states.
2. Promote the route test to a real integration test (real middleware/RLS) for the role matrix + cross-casino 404, or add one alongside the existing contract test.
3. Add component render tests for `RundownSummaryPanel` (three-state UI) **before** mounting it.
4. Mount `RundownSummaryPanel` on `/pit`, then add the thin E2E you described.

Want me to scaffold the missing tiers — starting with the DB-backed service integration test (tier 1), since the `.int.test.ts` harness already exists in that directory?