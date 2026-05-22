# ISSUE FPT-002: GAP-L2 Loyalty Accrual Trigger Misidentified as UNKNOWN

**Severity:** LOW — documentation error; no runtime defect. Accrual path is wired and functioning.
**Discovered:** 2026-04-29 (cross-reference audit of `FINANCIAL-PROVENANCE-TRACE.md` vs live codebase)
**Status:** INTERIM — filed pending full documentation analysis via GitNexus knowledge graph and exhaustive audit pass.
**Affects:** `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-L2

---

## Finding

`FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-L2 states the loyalty accrual caller is `UNKNOWN`, classifying it as a gap in the propagation chain from visit-close to `loyalty_ledger`.

**The finding was wrong at authoring (2026-04-22).** The caller was always an explicit, identifiable client call.

---

## Evidence

| Surface | Location | Confirms |
|---|---|---|
| Primary caller | `hooks/rating-slip-modal/use-close-with-financial.ts:134` — `accrueOnClose({...})` called as sequential step after `closeRatingSlip()` | Caller identified |
| Secondary caller | `hooks/rating-slip-modal/use-move-player.ts:289` | Second explicit call site on player move |
| API endpoint | `app/api/v1/loyalty/accrue/route.ts:49` | Downstream route confirmed |

The accrual is a **deliberate sequential step** post-close, not an implicit or orphaned trigger. The caller was deterministically identifiable via a single grep pass.

---

## Root Cause (Hypothesis)

The Explore agent that authored this section likely searched for a background trigger or database-level event (e.g., a Postgres trigger on `player_financial_transaction`) and found none, concluding the caller was unknown. The client-side hook call was outside the search scope.

---

## Required Action

- [ ] Correct `FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-L2: replace "UNKNOWN" with explicit caller documentation (`use-close-with-financial.ts:134`, `use-move-player.ts:289`).
- [ ] Assess whether GAP-L2 should be **closed entirely** or downgraded: the accrual caller is known, but the gap question may have been about reliability/atomicity (if `accrueOnClose` fails after `closeRatingSlip` succeeds, the `loyalty_ledger` row is never written). If that atomicity concern remains valid, the gap should be reframed — not closed.
- [ ] Add `[CORRECTED 2026-04-29]` inline marker.

---

## Open Sub-Question (Scope of Residual Gap)

The accrual is a **two-step client sequence** with no transaction boundary:
1. `closeRatingSlip()` → writes PFT / closes visit
2. `accrueOnClose()` → writes `loyalty_ledger`

If step 2 fails, the visit is closed and PFT is written, but loyalty is not accrued — with no retry, no outbox, no compensating transaction. This may represent a **real reliability gap** that the original GAP-L2 was trying to articulate. That question is separate from the "caller unknown" misclassification and should be evaluated independently.

---

## Interim Caveat

This issue addresses the misclassification only. Full GitNexus process-trace analysis (pending re-index) is needed to confirm whether any background trigger path exists that was not found by grep, and to fully characterize the accrual reliability gap.
