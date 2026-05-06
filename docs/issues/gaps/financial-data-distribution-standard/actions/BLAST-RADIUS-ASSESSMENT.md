# Blast Radius Assessment

## Scope at a glance

| Layer                                 | Files to touch                                               | Hidden couplings                                         | Wave |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ---- |
| Service DTOs + mappers                | 10 services, 9 mappers                                       | Arithmetic on bare numbers in 3 spots                    | 1    |
| API route handlers                    | 24 routes                                                    | All bare `number`; zero existing envelope                | 1    |
| UI components                         | 167+ render currency                                         | 30+ local `formatCurrency` helpers bypassing shared util | 1    |
| State/cache                           | 1 Zustand store, 5 query-key factories                       | `chipsTaken: string` in modal store                      | 1    |
| Jest unit tests                       | 51 red                                                       | `as unknown as` mocking hides breakage                   | 1    |
| Integration tests                     | 11 red (bridge-mtl, shift-metrics, finance-telemetry-bridge) | RPC signatures encoded in test                           | 1/2  |
| E2E tests                             | 12 touch financial flows; workflows mostly yellow            | Fixture factories red (2 files)                          | 1    |
| DB triggers                           | **3 cross-domain** (ban target under ADR-PROP D6)            | Two overlapping PFT→TBT bridges                          | 2    |
| SECURITY DEFINER RPCs writing PFT/TBT | 4                                                            | `rpc_create_financial_txn` is INVOKER, not DEFINER       | 2    |
| RLS policies                          | 5+ on PFT/TBT                                                | Depend on `set_rls_context_from_staff`                   | 2    |
| `types/database.types.ts`             | 1 file, 6,686 lines, clean regen                             | No hand-augmentations — good                             | both |

**Total Wave 1 code surface: ~250 files.** Wave 2 schema surface narrower but deeper (triggers + RPCs + projections).

---

## What the assessment changes in the roadmap

### 1. Three existing cross-domain triggers already violate ADR-PROP D6

The frozen ADR bans "hidden triggers that perform cross-domain propagation." The codebase currently has exactly this pattern in three places:

- `trg_bridge_finance_to_telemetry` — PFT → TBT
- `trg_bridge_rated_buyin_telemetry` — PFT → TBT (**overlapping duplicate** of the first; unclear which is authoritative)
- `trg_derive_mtl_from_finance` — PFT → MTL (Finance → Compliance domain)

This is not a risk — it's a concrete work item. Wave 2's "audit existing triggers" item in the roadmap should be upgraded from audit to **explicit deprecation of these three**, replaced by outbox emissions + idempotent consumers. The overlapping pair is a code smell that needs resolution on its own terms — one should supersede the other.

### 2. Regulatory logic runs on bare amounts

`services/mtl/mappers.ts:50-69` — MTL compliance badges (CTR, patron thresholds) are computed via `>` / `>=` on bare `amount`. Wave 1 envelope wrapping MUST unwrap before threshold comparison, or compliance logic silently misfires.

Not data risk (dev only), but correctness risk in tests. **Add Phase 1.1 acceptance criterion:** "MTL badge logic returns identical results pre- and post-envelope." Easy test, existential importance.

### 3. Shift-checkpoint does delta math on currency

`services/table-context/shift-checkpoint/mappers.ts:114-127` — subtracts `currentMetrics.win_loss_cents - checkpoint.win_loss_cents` inline. Envelope wrapping requires explicit unwrap pattern or the expression type-errors.

Phase 1.1 needs a small helper: `unwrap(fv: FinancialValue): number` with a mandatory comment stating it's a computation-only escape hatch. Don't let it spread beyond mappers.

### 4. Rating-slip modal has an active split-brain bug

`components/modals/rating-slip/rating-slip-modal.tsx:554-735` blends server cents with local Zustand dollars inline: `(totalChipsOut + pendingChipsTaken * 100) / 100`. Mixed units, no labels.

This is a **latent bug** that Wave 1's SRC lint rule will expose but also force you to fix. Scope Phase 1.3 to include the modal refactor — don't treat it as a separate ticket, or it'll be quarantined as "we'll get to it."

### 5. 30+ local `formatCurrency` implementations

Every dashboard, MTL table, rating-slip panel, and loyalty component defines its own formatter. Wave 1's `FinancialValue` component becomes the consolidation point, but the existing scatter is larger than the roadmap anticipated.

**Phase 1.3 scope expansion:** consolidate to `components/financial/FinancialValue.tsx` + `lib/format.ts`. Delete the 30+ duplicates. This is the single biggest churn beyond the envelope itself.

### 6. `rpc_create_financial_txn` is SECURITY INVOKER

This is structurally unusual — all other write RPCs in the ADR-024 regime are SECURITY DEFINER. Whether it's a latent risk depends on RLS tightness. Worth a line-item in Wave 2 prep: decide if it should be promoted to DEFINER as part of the shared write-path primitive, or if keeping it INVOKER is a deliberate choice that should be documented.

### 7. Tests that use `as unknown as` for mocking hide reshape breakage

51 Jest tests red on envelope reshape is the right number — **if those tests are honest about what they mock**. Several use `as unknown as { rpc: jest.Mock }` to bypass type safety. Those will pass with the old shape while real integrations break. **Add a type-check step in Phase 1.4 that catches any `as unknown as` near currency fields** — either eliminate the pattern or require an explicit envelope in the mock.

---

## Merge-conflict surface

Active worktrees per memory: `landing` + `visit-lifecycle-gap`. Wave 1 touches 167 UI components and every financial service. **Running Wave 1 against those branches without sequencing will create noisy merge conflicts in dashboards and shift-metrics surfaces.** Either (a) land the active branches first, or (b) schedule Wave 1 on a short-lived worktree with a strict window.

---

## Confidence

| Question                 | Confidence                                                                         | Why                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Service/mapper inventory | **Medium-high** — 78%                                                              | Grep-based, may miss RPC return types not in explicit DTOs           |
| API/UI inventory         | **High** on routes, **medium** on components                                       | UI count (167+) is likely floor, not ceiling                         |
| Schema + triggers + RLS  | **High** on structure, **medium-high** on runtime behavior of dual bridge triggers | One of the bridge pair is probably deprecated; resolve before Wave 2 |
| Test + CI blast          | **High**                                                                           | Clean numbers, predictable breakage pattern                          |

## Overall verdict

The refactor is **scope-large but risk-small** given the dev-only constraint. The frozen set's direction is sound; nothing the agents found invalidates an ADR. Three real adjustments to the roadmap:

1. **Phase 1.3 expands** to include rating-slip modal fix + formatCurrency consolidation (latent issues surfaced by Wave 1, not created by it)
2. **Wave 2 gains three named deprecation targets** (the cross-domain triggers) — upgrades the roadmap item from "audit" to "deprecate these three"
3. **Phase 1.4 adds a type-safety gate** to catch `as unknown as` currency escapes before they mask reshape bugs

No frozen docs need to be superseded. The open questions from `ADR-FACT-MODEL §5` remain the only real gate on Wave 2 design.

Confidence in proceeding with Wave 1 as currently planned, with the three adjustments above: **high**. Churn will be large but linear — no nasty surprises hidden in the couplings the agents uncovered.